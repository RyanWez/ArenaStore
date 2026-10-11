/**
 * MMQR reconciliation sweep.
 *
 * The webhook is the fast path for confirming an MMQR payment, but it is a
 * single point of failure: a dropped/blocked/late callback would leave a paid
 * customer uncredited until the order expires. This periodic sweep is the
 * safety net — it pulls the real status of still-PENDING MMQR orders straight
 * from the gateway and credits any it reports as paid, with no user action
 * required. Crediting goes through the same `settleMmpaySuccess` path as the
 * webhook, so it is idempotent (the two can race and still credit once).
 *
 * Deliberately plain setInterval inside the API process, matching the catalog
 * and balance schedulers: each tick is a bounded, idempotent batch and the app
 * must keep working without Redis/BullMQ.
 */
import { and, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb, topUpRequests } from "@arena/db";
import { mmpayService, type MmpayPaymentStatus } from "./mmpay.service";
import { settleMmpaySuccess, MMPAY_LATE_SUCCESS_GRACE_MS } from "./mmpay-settlement.service";
import type { SchedulerLogger, CatalogSchedulerHandle } from "./catalog-scheduler";

const defaultLogger: SchedulerLogger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
};

/** Only poll orders young enough to still matter (window + grace + buffer). */
const CANDIDATE_MAX_AGE_MS = 15 * 60 * 1000 + MMPAY_LATE_SUCCESS_GRACE_MS + 10 * 60 * 1000;
/** Per gateway call ceiling so one slow request cannot wedge the whole sweep. */
const PER_CALL_TIMEOUT_MS = 10_000;

export interface MmpayReconcileResult {
  checked: number;
  credited: number;
  errors: number;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("gateway timeout")), ms)),
  ]);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One reconciliation pass. Selects still-live MMQR orders (PENDING, plus
 * in-grace EXPIRED so a late payment is still recovered) that have a gateway
 * order id, asks the gateway for each one's real status, and settles any paid
 * order. `getStatus` is injectable for tests; it defaults to the real gateway.
 */
export async function reconcilePendingMmpay(opts?: {
  getStatus?: (orderId: string) => Promise<MmpayPaymentStatus>;
  maxPerTick?: number;
  delayMs?: number;
  log?: SchedulerLogger;
}): Promise<MmpayReconcileResult> {
  const getStatus = opts?.getStatus ?? ((orderId: string) => mmpayService.getPaymentStatus(orderId));
  const maxPerTick = opts?.maxPerTick ?? 25;
  const delayMs = opts?.delayMs ?? 250;
  const log = opts?.log ?? defaultLogger;
  const db = getDb();

  const graceCutoff = new Date(Date.now() - MMPAY_LATE_SUCCESS_GRACE_MS);
  const ageCutoff = new Date(Date.now() - CANDIDATE_MAX_AGE_MS);

  const candidates = await db
    .select({
      id: topUpRequests.id,
      reference: topUpRequests.reference,
      mmpayOrderId: topUpRequests.mmpayOrderId,
      status: topUpRequests.status,
    })
    .from(topUpRequests)
    .where(
      and(
        eq(topUpRequests.paymentMethod, "MMPAY"),
        isNotNull(topUpRequests.mmpayOrderId),
        gt(topUpRequests.createdAt, ageCutoff),
        inArray(topUpRequests.status, ["PENDING", "EXPIRED"]),
        // PENDING is always eligible; an EXPIRED row only while still in grace.
        sql`(${topUpRequests.status} = 'PENDING' OR ${topUpRequests.expiresAt} > ${graceCutoff})`
      )
    )
    .orderBy(topUpRequests.createdAt)
    .limit(maxPerTick);

  const result: MmpayReconcileResult = { checked: 0, credited: 0, errors: 0 };

  // settleMmpaySuccess takes a structured logger; adapt it to the scheduler's
  // plain string logger.
  const settleLog = {
    info: (o: unknown, m?: string) => log.info(typeof o === "string" ? o : m ?? ""),
    warn: (o: unknown, m?: string) => log.warn(typeof o === "string" ? o : m ?? ""),
    error: (o: unknown, m?: string) => log.warn(typeof o === "string" ? o : m ?? ""),
  };

  for (const candidate of candidates) {
    const orderId = candidate.mmpayOrderId ?? candidate.reference;
    result.checked += 1;
    try {
      const gw = await withTimeout(getStatus(orderId), PER_CALL_TIMEOUT_MS);
      if (gw.status !== "SUCCESS") {
        // Non-SUCCESS: let the existing expiry paths (bot invoice sweep, lazy
        // status expiry) and the terminal webhook own those transitions. The
        // reconcile sweep's job is strictly to recover a paid-but-uncredited
        // order, which is the money-critical case.
        continue;
      }

      // Re-fetch the full row the settlement path needs (status may have
      // changed since the candidate snapshot).
      const [row] = await db
        .select()
        .from(topUpRequests)
        .where(eq(topUpRequests.id, candidate.id))
        .limit(1);
      if (!row) continue;

      const outcome = await settleMmpaySuccess({
        topUp: row,
        amount: gw.amount ?? row.amountMmk,
        currency: gw.currency,
        transactionRefId: gw.transactionRefId,
        vendorQrRefId: gw.vendorQrRefId,
        source: "reconcile",
        log: settleLog,
      });
      if (outcome.code === "CREDITED") {
        result.credited += 1;
        log.info(`[MmpayReconcile] Recovered a paid-but-uncredited top-up: ${row.reference}`);
      }
    } catch (err: any) {
      result.errors += 1;
      log.warn(`[MmpayReconcile] status pull failed for ${orderId}: ${err?.message ?? err}`);
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  return result;
}

export interface MmpayReconcileSchedulerOptions {
  /** Seconds between reconciliation sweeps; 0 (or less) disables scheduling. */
  intervalSeconds: number;
  log?: SchedulerLogger;
}

/**
 * Starts the periodic reconciliation sweep. First pass runs shortly after boot
 * (recovers anything stuck during downtime), then on the configured cadence.
 */
export function startMmpayReconcileScheduler(
  options: MmpayReconcileSchedulerOptions
): CatalogSchedulerHandle {
  const { intervalSeconds } = options;
  const log = options.log ?? defaultLogger;

  if (intervalSeconds <= 0) {
    log.info("[MmpayReconcile] Disabled (MMPAY_RECONCILE_INTERVAL_SECONDS=0).");
    return { stop: () => {} };
  }

  const intervalMs = intervalSeconds * 1000;
  let running = false;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let kickoff: ReturnType<typeof setTimeout> | null = null;

  const runSweep = async (trigger: "startup" | "scheduled") => {
    if (running || stopped) return;
    running = true;
    try {
      const r = await reconcilePendingMmpay({ log });
      if (r.credited > 0 || r.errors > 0) {
        log.info(
          `[MmpayReconcile] ${trigger} sweep: checked ${r.checked}, credited ${r.credited}, errors ${r.errors}.`
        );
      }
    } catch (err: any) {
      log.warn(`[MmpayReconcile] ${trigger} sweep failed: ${err?.message ?? err}`);
    } finally {
      running = false;
    }
  };

  const handle: CatalogSchedulerHandle = {
    stop: () => {
      stopped = true;
      if (kickoff) {
        clearTimeout(kickoff);
        kickoff = null;
      }
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };

  // Let the server finish booting before the first pass.
  kickoff = setTimeout(() => {
    void runSweep("startup");
  }, 10_000);
  timer = setInterval(() => {
    void runSweep("scheduled");
  }, intervalMs);

  log.info(`[MmpayReconcile] Started: reconciling pending MMQR every ${intervalSeconds}s.`);
  return handle;
}
