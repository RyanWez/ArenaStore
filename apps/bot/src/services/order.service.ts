import crypto from "node:crypto";
import { botConfig } from "../config";
import { botCatalog } from "./catalog.service";
import { botSettingsService } from "./settings.service";
import { createSupplierClient, SupplierError, type SupplierId } from "@arena/suppliers";
import { escapeHtml, type TopUpStatus } from "@arena/shared";
import {
  encryptPayload,
  decryptPayload,
  formatCredentialsText,
  decryptDeliveryPayload,
  type DeliveryPayloadV2,
} from "./encryption";
import {
  getDb,
  users,
  wallets,
  walletLedger,
  topUpRequests,
  orders,
  orderItems,
  orderDeliveries,
} from "@arena/db";
import { eq, desc, or, and, sql, gte, ne, isNull, isNotNull } from "drizzle-orm";

async function sendAdminTelegramAlert(text: string): Promise<boolean> {
  try {
    const settings = await botSettingsService.getSettings();
    const chatId = settings.telegramGroupChatId || botConfig.TELEGRAM_GROUP_CHAT_ID;
    if (!chatId || !botConfig.TELEGRAM_BOT_TOKEN) return false;

    // Route bot alerts into the configured "Bot Alert" forum topic; empty
    // topic falls back to the group's General topic.
    const topicId = parseInt(settings.telegramBotAlertTopicId, 10);
    const url = `https://api.telegram.org/bot${botConfig.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        ...(Number.isFinite(topicId) && topicId > 0 ? { message_thread_id: topicId } : {}),
      }),
    });
    return res.ok;
  } catch (err: any) {
    console.error("[BotOrderService] Failed to send admin telegram alert:", err.message);
    return false;
  }
}

export interface CreateOrderResult {
  orderId: string;
  publicOrderNo: string;
  totalMmk: number;
}

export interface SubmitSlipResult {
  submissionId: number;
  status: string;
}

export interface OrderRecord {
  id: string;
  publicOrderNo: string;
  productId: number;
  productName: string;
  quantity: number;
  totalMmk: number;
  status: "PENDING_PAYMENT" | "PAYMENT_SUBMITTED" | "DELIVERED" | "CANCELLED" | "TIMEOUT_REFUNDED";
  createdAt: string;
  credentialsText?: string;
  viewUrl?: string;
}

export interface TopUpRecord {
  id: string;
  telegramId: string;
  amountMmk: number;
  reference: string;
  paymentMethod?: "KPAY" | "WAVEPAY" | "MMPAY";
  slipFileId?: string;
  status: TopUpStatus;
  createdAt: string;
}

/**
 * Collision-resistant top-up reference.
 *
 * The old form was `TOP-${Date.now().toString().slice(-6)}` — only the last 6
 * digits of the millisecond timestamp, which wraps every ~16.7 minutes and is
 * identical for two requests in the same millisecond. `topup_requests.reference`
 * is UNIQUE, so a collision made the insert throw, the catch swallowed it, and
 * the request silently fell back to the in-memory record the admin panel (which
 * reads the DB) can never show.
 *
 * Format: `TOP-` + base36 timestamp (monotonic-ish, ~8 chars) + 8 random hex
 * chars (32-bit) — unique with overwhelming probability while staying
 * short/readable (20 chars total, well within the 64-char column).
 */
export function generateTopUpReference(): string {
  const timePart = Date.now().toString(36).toUpperCase();
  const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `TOP-${timePart}${randomPart}`;
}

/**
 * Collision-resistant public order reference.
 *
 * Format: `ARN-` + base36 timestamp + 8 random hex chars (32-bit entropy).
 * Eliminates the millisecond-modulo wrap-around and collisions on concurrent orders.
 */
export function generateOrderReference(): string {
  const timePart = Date.now().toString(36).toUpperCase();
  const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `ARN-${timePart}${randomPart}`;
}

/**
 * Asynchronously notify the Fastify admin server over the internal token-secured
 * endpoint so connected SSE clients (e.g. orders.vue, payments.vue) receive live
 * updates immediately without waiting for background polling.
 */
async function emitAdminEvent(
  type: "ORDER_CREATED" | "DEPOSIT_SUBMITTED" | "ORDER_STATUS_CHANGED",
  payload?: Record<string, any>
): Promise<void> {
  if (!botConfig.INTERNAL_API_TOKEN || !botConfig.API_BASE_URL) return;
  try {
    const url = `${botConfig.API_BASE_URL.replace(/\/+$/, "")}/api/bot/events`;
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": botConfig.INTERNAL_API_TOKEN,
      },
      body: JSON.stringify({ type, payload }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Non-blocking fire-and-forget
  }
}

export class BotOrderService {
  // In-memory fallback caches if DB is briefly unreachable or during unit tests
  private memoryWallets = new Map<string, number>();
  private memoryOrders = new Map<string, OrderRecord[]>();
  private memoryTopUps = new Map<string, TopUpRecord>();
  private activePurchases = new Set<string>();

  /**
   * Finds or creates a customer user record and associated wallet in Neon DB.
   */
  async getOrCreateUser(params: {
    telegramId: string;
    firstName?: string;
    lastName?: string | null;
    username?: string | null;
  }) {
    try {
      const db = getDb();
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, params.telegramId))
        .limit(1);

      let user = existingUser;
      if (!user) {
        const now = new Date();
        const [newUser] = await db
          .insert(users)
          .values({
            telegramId: params.telegramId,
            firstName: params.firstName || "Customer",
            lastName: params.lastName || null,
            username: params.username || null,
            role: "CUSTOMER",
            status: "ACTIVE",
            lastActiveAt: now,
          })
          .onConflictDoUpdate({
            target: users.telegramId,
            set: {
              firstName: sql`COALESCE(EXCLUDED.first_name, ${users.firstName})`,
              lastName: sql`COALESCE(EXCLUDED.last_name, ${users.lastName})`,
              username: sql`COALESCE(EXCLUDED.username, ${users.username})`,
              lastActiveAt: now,
              updatedAt: now,
            },
          })
          .returning();
        user = newUser;
      } else {
        // Automatically sync latest Telegram profile (Name, Username) into DB
        const updates: Record<string, any> = {};
        if (params.firstName && params.firstName !== user.firstName) {
          updates.firstName = params.firstName;
        }
        if (params.lastName !== undefined && params.lastName !== user.lastName) {
          updates.lastName = params.lastName;
        }
        if (params.username !== undefined && params.username !== user.username) {
          updates.username = params.username;
        }

        if (Object.keys(updates).length > 0) {
          updates.updatedAt = new Date();
          const [updated] = await db
            .update(users)
            .set(updates)
            .where(eq(users.id, user.id))
            .returning();
          if (updated) {
            user = updated;
          }
        }
      }

      // Check or create wallet
      const [existingWallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, user.id))
        .limit(1);

      let wallet = existingWallet;
      if (!wallet) {
        const [newWallet] = await db
          .insert(wallets)
          .values({
            userId: user.id,
            balanceMmk: 0,
            totalDepositedMmk: 0,
            totalSpentMmk: 0,
          })
          .onConflictDoNothing({ target: wallets.userId })
          .returning();
        wallet = newWallet || (await db.select().from(wallets).where(eq(wallets.userId, user.id)).limit(1))[0];
      }

      return { user, wallet };
    } catch (err: any) {
      console.warn("[BotOrderService] DB getOrCreateUser error:", err.message);
      return null;
    }
  }

  private userProfileSyncCache = new Map<string, { key: string; expiresAt: number }>();
  private lastActiveThrottle = new Map<string, number>();
  private lastActiveCleanupTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * High-performance, throttled last-active tracker.
   * Only touches the database at most once every 5 minutes per user.
   * Runs non-blocking in the background to ensure 0ms delay to Telegram handlers.
   */
  touchLastActive(telegramId: string): void {
    if (!telegramId) return;

    if (!this.lastActiveCleanupTimer) {
      this.lastActiveCleanupTimer = setInterval(() => {
        const threshold = Date.now() - 60 * 60 * 1000;
        for (const [id, timestamp] of this.lastActiveThrottle.entries()) {
          if (timestamp < threshold) {
            this.lastActiveThrottle.delete(id);
          }
        }
        for (const [id, item] of this.userProfileSyncCache.entries()) {
          if (item.expiresAt < Date.now()) {
            this.userProfileSyncCache.delete(id);
          }
        }
      }, 30 * 60 * 1000);
      if (this.lastActiveCleanupTimer.unref) {
        this.lastActiveCleanupTimer.unref();
      }
    }

    const now = Date.now();
    const lastRecorded = this.lastActiveThrottle.get(telegramId);
    const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

    if (lastRecorded && now - lastRecorded < COOLDOWN_MS) {
      return; // Cooldown active, skip DB write completely
    }

    this.lastActiveThrottle.set(telegramId, now);

    // Non-blocking async DB update
    try {
      const db = getDb();
      db.update(users)
        .set({ lastActiveAt: new Date() })
        .where(eq(users.telegramId, telegramId))
        .catch((err) => {
          console.warn(`[BotOrderService] touchLastActive DB error for ${telegramId}:`, err.message);
        });
    } catch (err: any) {
      console.warn(`[BotOrderService] touchLastActive error for ${telegramId}:`, err.message);
    }
  }

  /**
   * Synchronizes latest Telegram user info (id, name, username) directly into DB.
   * Skips DB query if the user profile was already verified in the last 10 minutes.
   */
  async upsertTelegramUser(params: {
    telegramId: string;
    firstName: string;
    lastName?: string | null;
    username?: string | null;
  }) {
    const cacheKey = `${params.firstName}:${params.lastName || ""}:${params.username || ""}`;
    const cached = this.userProfileSyncCache.get(params.telegramId);
    if (cached && cached.key === cacheKey && cached.expiresAt > Date.now()) {
      return null;
    }

    const res = await this.getOrCreateUser(params);
    if (res?.user) {
      this.userProfileSyncCache.set(params.telegramId, {
        key: cacheKey,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      });
    }
    return res;
  }

  private userStatusCache = new Map<string, { status: string | null; expiresAt: number }>();

  /**
   * Returns the current status of a user ("ACTIVE", "DEACTIVATED", ...).
   * Cached in memory for 30s to eliminate redundant DB roundtrips on every bot action.
   * Returns null when the user is unknown or the DB is briefly unreachable —
   * callers treat null as "allow" and getOrCreateUser registers new users as ACTIVE.
   */
  async getUserStatus(telegramId: string): Promise<string | null> {
    const cached = this.userStatusCache.get(telegramId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.status;
    }

    try {
      const db = getDb();
      const [row] = await db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.telegramId, telegramId))
        .limit(1);
      const status = row?.status ?? null;
      this.userStatusCache.set(telegramId, { status, expiresAt: Date.now() + 30_000 });
      return status;
    } catch (err: any) {
      console.warn("[BotOrderService] getUserStatus DB error:", err.message);
      return cached?.status ?? null;
    }
  }

  async getUserRole(telegramId: string): Promise<string | null> {
    try {
      const db = getDb();
      const [row] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.telegramId, telegramId))
        .limit(1);
      return row?.role ?? null;
    } catch (err: any) {
      console.warn("[BotOrderService] getUserRole DB error:", err.message);
      return null;
    }
  }

  /**
   * Returns customer's live wallet balance in MMK from Neon DB.
   */
  async getWalletBalance(telegramId: string): Promise<number> {
    try {
      const record = await this.getOrCreateUser({ telegramId });
      if (record?.wallet) {
        // DB is authoritative. Never blend in the in-memory cache: an admin
        // debit from the Dashboard would otherwise keep showing phantom money.
        return record.wallet.balanceMmk;
      }
    } catch (err: any) {
      console.warn("[BotOrderService] getWalletBalance DB fallback:", err.message);
    }
    return this.memoryWallets.get(telegramId) || 0;
  }

  /**
   * Directly credits a wallet. Test/internal seeding only — no bot command or
   * route may expose this; wallet credits must go through the Dashboard
   * (admin adjust-balance / deposit review) exclusively.
   */
  async creditWallet(telegramId: string, amountMmk: number): Promise<number> {
    const memCurrent = this.memoryWallets.get(telegramId) || 0;
    const memNew = memCurrent + amountMmk;
    this.memoryWallets.set(telegramId, memNew);

    try {
      const record = await this.getOrCreateUser({ telegramId });
      if (record?.user && record.wallet) {
        const db = getDb();
        const [updatedWallet] = await db
          .update(wallets)
          .set({
            balanceMmk: sql`${wallets.balanceMmk} + ${amountMmk}`,
            totalDepositedMmk: sql`${wallets.totalDepositedMmk} + ${amountMmk}`,
            updatedAt: new Date(),
          })
          .where(eq(wallets.id, record.wallet.id))
          .returning();

        const newBalance = updatedWallet ? updatedWallet.balanceMmk : record.wallet.balanceMmk + amountMmk;

        await db.insert(walletLedger).values({
          walletId: record.wallet.id,
          amountMmk,
          type: "TOPUP_CREDIT",
          referenceId: `ADMIN-CREDIT-${Date.now()}`,
          notes: "Manual wallet credit by admin",
        });

        this.memoryWallets.set(telegramId, newBalance);
        return newBalance;
      }
    } catch (err: any) {
      console.warn("[BotOrderService] DB creditWallet error:", err.message);
    }

    return memNew;
  }

  /**
   * Creates a new top-up request with payment reference in Neon DB.
   */
  async createTopUpRequest(params: {
    telegramId: string;
    amountMmk: number;
    customerName?: string;
    telegramUsername?: string;
    intendedProduct?: string;
  }): Promise<TopUpRecord> {
    const reference = generateTopUpReference();
    const nowIso = new Date().toISOString();

    try {
      const userRecord = await this.getOrCreateUser({
        telegramId: params.telegramId,
        firstName: params.customerName,
        username: params.telegramUsername,
      });

      if (userRecord?.user) {
        const db = getDb();

        // Auto-cancel any previous unsubmitted PENDING *manual* top-up for this
        // user so abandoned "Awaiting Slip" invoices do not accumulate. Scoped
        // to non-MMPAY: an active MMQR (also PENDING) is a separate, gateway-
        // driven payment attempt and must not be cancelled by starting a manual
        // top-up — it has its own cancel/expire path.
        try {
          await db
            .update(topUpRequests)
            .set({ status: "CANCELLED" })
            .where(
              and(
                eq(topUpRequests.userId, userRecord.user.id),
                eq(topUpRequests.status, "PENDING"),
                ne(topUpRequests.paymentMethod, "MMPAY")
              )
            );
        } catch (cleanupErr: any) {
          console.warn("[BotOrderService] Warning cleaning up previous pending top-ups:", cleanupErr.message);
        }

        for (const [, mem] of this.memoryTopUps.entries()) {
          if (mem.telegramId === params.telegramId && mem.status === "PENDING") {
            mem.status = "CANCELLED";
          }
        }

        const [inserted] = await db
          .insert(topUpRequests)
          .values({
            reference,
            userId: userRecord.user.id,
            amountMmk: params.amountMmk,
            paymentMethod: "KPAY",
            status: "PENDING",
            intendedProduct: params.intendedProduct,
          })
          .returning();

        const record: TopUpRecord = {
          id: String(inserted.id),
          telegramId: params.telegramId,
          amountMmk: params.amountMmk,
          reference,
          status: "PENDING",
          createdAt: nowIso,
        };
        this.memoryTopUps.set(reference, record);
        this.memoryTopUps.set(String(inserted.id), record);
        return record;
      }
    } catch (err: any) {
      console.warn("[BotOrderService] DB createTopUpRequest error:", err.message);
    }

    for (const [, mem] of this.memoryTopUps.entries()) {
      if (mem.telegramId === params.telegramId && mem.status === "PENDING") {
        mem.status = "CANCELLED";
      }
    }

    const fallbackRecord: TopUpRecord = {
      id: `topup-${Date.now()}`,
      telegramId: params.telegramId,
      amountMmk: params.amountMmk,
      reference,
      status: "PENDING",
      createdAt: nowIso,
    };
    this.memoryTopUps.set(reference, fallbackRecord);
    this.memoryTopUps.set(fallbackRecord.id, fallbackRecord);
    return fallbackRecord;
  }

  /**
   * Cancels a pending top-up request in DB and memory.
   * Matches by reference ('TOP-XXXXXX') OR numeric database ID.
   * Only cancels requests that are currently in 'PENDING' status.
   */
  async cancelTopUpRequest(topUpId: string | number, telegramId?: string): Promise<boolean> {
    const idStr = String(topUpId);
    let cancelled = false;

    try {
      const db = getDb();
      const isNumeric = /^\d+$/.test(idStr);
      const condition = isNumeric
        ? and(
            or(
              eq(topUpRequests.reference, idStr),
              eq(topUpRequests.id, parseInt(idStr, 10))
            ),
            eq(topUpRequests.status, "PENDING")
          )
        : and(
            eq(topUpRequests.reference, idStr),
            eq(topUpRequests.status, "PENDING")
          );

      const [updated] = await db
        .update(topUpRequests)
        .set({ status: "CANCELLED" })
        .where(condition)
        .returning();

      if (updated) {
        cancelled = true;
      }
    } catch (err: any) {
      console.warn("[BotOrderService] DB cancelTopUpRequest error:", err.message);
    }

    // Update in-memory cache
    for (const [, mem] of this.memoryTopUps.entries()) {
      if ((mem.reference === idStr || mem.id === idStr) && mem.status === "PENDING") {
        mem.status = "CANCELLED";
        cancelled = true;
      }
    }

    return cancelled;
  }

  /**
   * Retrieves an active, unexpired MyanMyanPay top-up order for a given customer if one exists.
   * Complies with Single Active Order & Caching guidelines.
   */
  async getActiveMmpayTopUp(telegramId: string): Promise<{
    id: number;
    reference: string;
    amountMmk: number;
    qr: string;
    expiresAt: Date;
  } | null> {
    try {
      const userRecord = await this.getOrCreateUser({ telegramId });
      if (!userRecord?.user) return null;

      const db = getDb();
      const [active] = await db
        .select()
        .from(topUpRequests)
        .where(
          and(
            eq(topUpRequests.userId, userRecord.user.id),
            eq(topUpRequests.paymentMethod, "MMPAY"),
            eq(topUpRequests.status, "PENDING"),
            sql`${topUpRequests.expiresAt} > NOW()`
          )
        )
        .limit(1);

      if (active && active.mmpayQrString && active.expiresAt) {
        return {
          id: active.id,
          reference: active.reference,
          amountMmk: active.amountMmk,
          qr: active.mmpayQrString,
          expiresAt: new Date(active.expiresAt),
        };
      }
    } catch (err: any) {
      console.warn("[BotOrderService] Error fetching active MMPay topup:", err.message);
    }
    return null;
  }

  /**
   * Creates or returns an active MyanMyanPay MMQR instance by delegating to API service.
   */
  async createMmpayTopUp(params: {
    telegramId: string;
    amountMmk: number;
    intendedProduct?: string;
  }): Promise<{
    ok: boolean;
    isExisting?: boolean;
    reference?: string;
    amountMmk?: number;
    qr?: string;
    expiresAt?: Date;
    error?: string;
  }> {
    try {
      const res = await fetch(`${botConfig.API_BASE_URL}/api/payments/mmpay/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": botConfig.INTERNAL_API_TOKEN,
        },
        body: JSON.stringify(params),
      });

      const data = (await res.json()) as any;
      if (!res.ok || !data.ok) {
        return { ok: false, error: data?.error || `HTTP ${res.status}` };
      }

      return {
        ok: true,
        isExisting: Boolean(data.isExisting),
        reference: data.reference,
        amountMmk: data.amountMmk,
        qr: data.qr,
        expiresAt: new Date(data.expiresAt),
      };
    } catch (err: any) {
      console.error("[BotOrderService] createMmpayTopUp error:", err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Cancels an active MyanMyanPay MMQR payment request.
   */
  async cancelMmpayTopUp(
    reference: string,
    telegramId: string
  ): Promise<{ ok: boolean; cancelled: boolean; status?: string; amountMmk?: number }> {
    try {
      const res = await fetch(`${botConfig.API_BASE_URL}/api/payments/mmpay/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": botConfig.INTERNAL_API_TOKEN,
        },
        body: JSON.stringify({ reference, telegramId }),
      });
      const data = (await res.json()) as any;
      if (!res.ok || !data?.ok) {
        return { ok: false, cancelled: false };
      }
      // The API only reports cancelled:false when the order settled (e.g. a
      // SUCCESS webhook credited it) in the race window, so it was NOT
      // cancelled — the bot must tell the customer the real outcome.
      return {
        ok: true,
        cancelled: data.cancelled !== false,
        status: data.status,
        amountMmk: data.amountMmk,
      };
    } catch (err: any) {
      console.error("[BotOrderService] cancelMmpayTopUp error:", err.message);
      return { ok: false, cancelled: false };
    }
  }

  /**
   * Persists the Telegram message id of the customer's MMQR invoice photo so
   * the API webhook can delete it (and post a single success message) the
   * moment the gateway confirms payment — no manual "Refresh" needed.
   *
   * Returns the PREVIOUS message id (if any) so the caller can delete the now
   * untracked older QR photo — otherwise re-showing an invoice would leave a
   * stale QR card in the chat that nothing cleans up.
   */
  async attachMmpayQrMessage(reference: string, messageId: number): Promise<number | null> {
    try {
      const db = getDb();
      const [prev] = await db
        .select({ old: topUpRequests.mmpayQrMessageId })
        .from(topUpRequests)
        .where(eq(topUpRequests.reference, reference))
        .limit(1);
      await db
        .update(topUpRequests)
        .set({ mmpayQrMessageId: messageId })
        .where(eq(topUpRequests.reference, reference));
      const oldId = prev?.old ?? null;
      return oldId && oldId !== messageId ? oldId : null;
    } catch (err: any) {
      console.warn("[BotOrderService] attachMmpayQrMessage error:", err.message);
      return null;
    }
  }

  /**
   * Checks the status of an MMPay payment request.
   */
  async checkMmpayStatus(reference: string): Promise<{
    status: string;
    amountMmk: number;
    expiresAt?: Date;
  } | null> {
    try {
      const res = await fetch(
        `${botConfig.API_BASE_URL}/api/payments/mmpay/status/${encodeURIComponent(reference)}`,
        {
          headers: { "x-internal-token": botConfig.INTERNAL_API_TOKEN },
        }
      );
      const data = (await res.json()) as any;
      if (res.ok && data?.ok) {
        return {
          status: data.status,
          amountMmk: data.amountMmk,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        };
      }
    } catch (err: any) {
      console.error("[BotOrderService] checkMmpayStatus error:", err.message);
    }
    return null;
  }

  /**
   * Atomically claims the one-time MMQR success notification for a top-up.
   *
   * The webhook and this bot's manual "Refresh" button both race to announce a
   * completed MMQR payment. mmpay_success_notified_at is the dedup token: only
   * the caller whose guarded UPDATE flips it from NULL owns the single success
   * card; everyone else backs off. Returns true if this caller won the claim.
   */
  async claimMmpaySuccessNotification(reference: string): Promise<boolean> {
    try {
      const db = getDb();
      const claimed = await db
        .update(topUpRequests)
        .set({ mmpaySuccessNotifiedAt: new Date() })
        .where(
          and(
            eq(topUpRequests.reference, reference),
            isNull(topUpRequests.mmpaySuccessNotifiedAt)
          )
        )
        .returning({ id: topUpRequests.id });
      return claimed.length > 0;
    } catch (err: any) {
      console.warn("[BotOrderService] claimMmpaySuccessNotification error:", err.message);
      return false;
    }
  }

  /** Releases a claimed success notification so a later retry can re-announce. */
  async releaseMmpaySuccessNotification(reference: string): Promise<void> {
    try {
      const db = getDb();
      await db
        .update(topUpRequests)
        .set({ mmpaySuccessNotifiedAt: null })
        .where(eq(topUpRequests.reference, reference));
    } catch (err: any) {
      console.warn("[BotOrderService] releaseMmpaySuccessNotification error:", err.message);
    }
  }

  /**
   * Atomically claims the one-time cleanup of a live MMQR invoice message by
   * nulling mmpay_qr_message_id. Shared by the manual Refresh and the background
   * sweep so an expired/cancelled invoice's terminal notice is sent exactly once
   * (whoever nulls it first owns the user-facing message). Returns true if this
   * caller won the claim.
   */
  async claimMmpayInvoiceCleanup(reference: string): Promise<boolean> {
    try {
      const db = getDb();
      const claimed = await db
        .update(topUpRequests)
        .set({ mmpayQrMessageId: null })
        .where(
          and(
            eq(topUpRequests.reference, reference),
            isNotNull(topUpRequests.mmpayQrMessageId)
          )
        )
        .returning({ id: topUpRequests.id });
      return claimed.length > 0;
    } catch (err: any) {
      console.warn("[BotOrderService] claimMmpayInvoiceCleanup error:", err.message);
      return false;
    }
  }


  /**
   * Submits a top-up payment slip screenshot proof to Neon DB.
   * Matches by reference ('TOP-XXXXXX') OR numeric database ID.
   */
  async submitTopUpSlip(params: {
    topUpId: string;
    telegramId: string;
    fileId: string;
    amountMmk: number;
    paymentMethod: "KPAY" | "WAVEPAY";
  }): Promise<{ submissionId: number; status: string }> {
    try {
      const db = getDb();
      const isNumeric = /^\d+$/.test(params.topUpId);
      const condition = isNumeric
        ? or(
            eq(topUpRequests.reference, params.topUpId),
            eq(topUpRequests.id, parseInt(params.topUpId, 10))
          )
        : eq(topUpRequests.reference, params.topUpId);

      const [updated] = await db
        .update(topUpRequests)
        .set({
          slipFileId: params.fileId,
          paymentMethod: params.paymentMethod,
          status: "SUBMITTED",
        })
        .where(condition)
        .returning();

      if (updated) {
        const mem = this.memoryTopUps.get(params.topUpId) || this.memoryTopUps.get(updated.reference);
        if (mem) {
          mem.status = "SUBMITTED";
          mem.slipFileId = params.fileId;
          mem.paymentMethod = params.paymentMethod;
        }
        void emitAdminEvent("DEPOSIT_SUBMITTED", {
          depositId: updated.id,
          reference: updated.reference,
          amountMmk: updated.amountMmk,
        });
        return {
          submissionId: updated.id,
          status: "SUBMITTED",
        };
      }
    } catch (err: any) {
      console.warn("[BotOrderService] DB submitTopUpSlip error:", err.message);
    }

    const mem = this.memoryTopUps.get(params.topUpId);
    if (mem) {
      mem.status = "SUBMITTED";
      mem.slipFileId = params.fileId;
      mem.paymentMethod = params.paymentMethod;
      void emitAdminEvent("DEPOSIT_SUBMITTED", {
        depositId: mem.id,
        reference: mem.reference,
        amountMmk: mem.amountMmk,
      });
    }

    return {
      submissionId: Date.now(),
      status: "SUBMITTED",
    };
  }

  /**
   * Retrieves the latest pending top-up request for a user.
   * Useful when user submits a slip photo even after bot restart or session reset.
   */
  async getLatestPendingTopUp(telegramId: string): Promise<TopUpRecord | null> {
    try {
      const db = getDb();
      const userRecord = await this.getOrCreateUser({ telegramId });
      if (userRecord?.user) {
        const [latest] = await db
          .select()
          .from(topUpRequests)
          .where(
            and(
              eq(topUpRequests.userId, userRecord.user.id),
              eq(topUpRequests.status, "PENDING")
            )
          )
          .orderBy(desc(topUpRequests.createdAt))
          .limit(1);

        if (latest) {
          return {
            id: String(latest.id),
            telegramId,
            amountMmk: latest.amountMmk,
            reference: latest.reference,
            status: latest.status as any,
            createdAt: latest.createdAt ? new Date(latest.createdAt).toISOString() : new Date().toISOString(),
            slipFileId: latest.slipFileId || undefined,
          };
        }
      }
    } catch (err: any) {
      console.warn("[BotOrderService] DB getLatestPendingTopUp error:", err.message);
    }

    // Memory fallback
    for (const record of Array.from(this.memoryTopUps.values()).reverse()) {
      if (record.telegramId === telegramId && record.status === "PENDING") {
        return record;
      }
    }

    return null;
  }

  /**
   * Approves top-up request (credits wallet in DB & memory).
   */
  async approveTopUp(topUpId: string): Promise<{ newBalance: number; telegramId: string; amountMmk: number } | null> {
    try {
      const db = getDb();
      const [topUp] = await db
        .select()
        .from(topUpRequests)
        .where(eq(topUpRequests.reference, topUpId))
        .limit(1);

      if (topUp) {
        await db
          .update(topUpRequests)
          .set({ status: "COMPLETED", reviewedAt: new Date() })
          .where(eq(topUpRequests.id, topUp.id));

        const [wallet] = await db
          .select()
          .from(wallets)
          .where(eq(wallets.userId, topUp.userId))
          .limit(1);

        if (wallet) {
          const [updatedWallet] = await db
            .update(wallets)
            .set({
              balanceMmk: sql`${wallets.balanceMmk} + ${topUp.amountMmk}`,
              totalDepositedMmk: sql`${wallets.totalDepositedMmk} + ${topUp.amountMmk}`,
              updatedAt: new Date(),
            })
            .where(eq(wallets.id, wallet.id))
            .returning();

          const newBal = updatedWallet ? updatedWallet.balanceMmk : wallet.balanceMmk + topUp.amountMmk;
          return { newBalance: newBal, telegramId: "", amountMmk: topUp.amountMmk };
        }
      }
    } catch {
      // fallback
    }

    const mem = this.memoryTopUps.get(topUpId);
    if (!mem) return null;
    mem.status = "APPROVED";
    const current = this.memoryWallets.get(mem.telegramId) || 0;
    const newBalance = current + mem.amountMmk;
    this.memoryWallets.set(mem.telegramId, newBalance);
    return {
      newBalance,
      telegramId: mem.telegramId,
      amountMmk: mem.amountMmk,
    };
  }

  /**
   * Instant purchase with Wallet funds — atomic balance deduction & immediate credentials delivery!
   * Calls real Upstream XPro Partner API (POST /orders) with strict idempotency and AES-256 encryption.
   */
  async purchaseWithWallet(params: {
    telegramId: string;
    customerName: string;
    telegramUsername?: string;
    productId: number;
    quantity: number;
  }): Promise<{
    success: boolean;
    orderId?: string;
    publicOrderNo?: string;
    productName?: string;
    quantity?: number;
    totalMmk?: number;
    credentialsText?: string;
    viewUrl?: string;
    remainingBalance?: number;
    error?: string;
    errorMessage?: string;
  }> {
    // 0. Prevent concurrent multi-clicks from the same user (in-flight mutex)
    if (this.activePurchases.has(params.telegramId)) {
      return {
        success: false,
        error: "OPERATION_IN_PROGRESS",
        errorMessage: "⚠️ ယခင် အော်ဒါ ဆောင်ရွက်နေဆဲ ဖြစ်ပါသည်ခင်ဗျာ။ ခေတ္တစောင့်ပေးပါ။",
      };
    }

    this.activePurchases.add(params.telegramId);

    try {
      const product = await botCatalog.getProductById(params.productId);
      if (!product) {
        return {
          success: false,
          error: "PRODUCT_NOT_FOUND",
          errorMessage: "⚠️ ပစ္စည်း ရှာမတွေ့ပါခင်ဗျာ။",
        };
      }

      if (product.stock < params.quantity) {
        return {
          success: false,
          error: "OUT_OF_STOCK",
          errorMessage: "⚠️ ပစ္စည်းလက်ကျန် မလုံလောက်တော့ပါခင်ဗျာ။",
        };
      }

      if (!product.upstreamProductId) {
        return {
          success: false,
          error: "PRODUCT_NOT_FOUND",
          errorMessage: "⚠️ ပစ္စည်း အချက်အလက် မပြည့်စုံပါသဖြင့် အော်ဒါတင်၍ မရသေးပါခင်ဗျာ။",
        };
      }
      const totalMmk = product.retailPriceMmk * params.quantity;
      const publicOrderNo = generateOrderReference();
      const externalOrderId = publicOrderNo;
      const targetUpstreamId = product.upstreamProductId;

      // 1. Fetch user & wallet records
      const memCurrent = this.memoryWallets.get(params.telegramId) || 0;
      const userRecord = await this.getOrCreateUser({
        telegramId: params.telegramId,
        firstName: params.customerName,
        username: params.telegramUsername,
      });

      const user = userRecord?.user;
      const wallet = userRecord?.wallet;
      // DB balance decides; the guarded atomic debit below enforces it anyway.
      const availableBalance = wallet ? wallet.balanceMmk : memCurrent;

      if (availableBalance < totalMmk) {
        return {
          success: false,
          error: "INSUFFICIENT_FUNDS",
          errorMessage: "⚠️ ပိုက်ဆံအိတ် လက်ကျန်ငွေ မလုံလောက်ပါခင်ဗျာ။ ကျေးဇူးပြု၍ ငွေအရင်ဖြည့်ပေးပါ။",
        };
      }

      // 2. Atomic PostgreSQL Conditional Debit: Debit wallet BEFORE upstream order!
      let remainingBalance = 0;
      let debitedWalletId: number | null = null;

      if (user && wallet) {
        try {
          const db = getDb();
          const debitResult = await db.transaction(async (tx) => {
            // Transaction-level PostgreSQL Advisory Lock for multi-instance cluster concurrency
            // hashtext converts the user namespace string to a 32-bit integer for pg advisory lock
            try {
              const lockRes: any = await tx.execute(
                sql`SELECT pg_try_advisory_xact_lock(hashtext(${'user:' + params.telegramId})) as acquired`
              );
              const acquired = lockRes?.rows?.[0]?.acquired ?? lockRes?.[0]?.acquired;
              if (acquired === false) {
                return { lockFailed: true } as const;
              }
            } catch {
              // Ignore in environments where advisory lock is unsupported
            }

            const [updated] = await tx
              .update(wallets)
              .set({
                balanceMmk: sql`${wallets.balanceMmk} - ${totalMmk}`,
                totalSpentMmk: sql`${wallets.totalSpentMmk} + ${totalMmk}`,
                updatedAt: new Date(),
              })
              .where(and(eq(wallets.id, wallet.id), gte(wallets.balanceMmk, totalMmk)))
              .returning();

            // Record the debit in the ledger atomically with the balance
            // decrement. Pairing them in one transaction keeps the wallet
            // balance and the ledger sum from ever diverging — even if the
            // later order-record transaction (step 5) fails after upstream
            // delivery, the money leaving the wallet is always accounted for.
            if (updated) {
              await tx.insert(walletLedger).values({
                walletId: updated.id,
                amountMmk: -totalMmk,
                type: "ORDER_DEBIT",
                referenceId: publicOrderNo,
                notes: `Purchase: ${product.cleanName} x ${params.quantity}`,
              });
            }

            return { updated } as const;
          });

          if ("lockFailed" in debitResult && debitResult.lockFailed) {
            return {
              success: false,
              error: "OPERATION_IN_PROGRESS",
              errorMessage: "⚠️ ယခင် အော်ဒါ ဆောင်ရွက်နေဆဲ ဖြစ်ပါသည်ခင်ဗျာ။ ခေတ္တစောင့်ပေးပါ။",
            };
          }

          const updated = (debitResult as any).updated;
          if (!updated) {
            return {
              success: false,
              error: "INSUFFICIENT_FUNDS",
              errorMessage: "⚠️ ပိုက်ဆံအိတ် လက်ကျန်ငွေ မလုံလောက်ပါခင်ဗျာ။ ကျေးဇူးပြု၍ ငွေအရင်ဖြည့်ပေးပါ။",
            };
          }

          debitedWalletId = updated.id;
          remainingBalance = updated.balanceMmk;
        } catch (dbErr: any) {
          console.error("[BotOrderService] Atomic wallet debit failed:", dbErr.message);
          return {
            success: false,
            error: "DATABASE_ERROR",
            errorMessage: "⚠️ ငွေစာရင်း စစ်ဆေးမှု မအောင်မြင်ပါခင်ဗျာ။ ခေတ္တစောင့်ပြီး ပြန်လည်ကြိုးစားပေးပါ။",
          };
        }
      } else {
        // Fallback in-memory wallet debit
        if (memCurrent < totalMmk) {
          return {
            success: false,
            error: "INSUFFICIENT_FUNDS",
            errorMessage: "⚠️ ပိုက်ဆံအိတ် လက်ကျန်ငွေ မလုံလောက်ပါခင်ဗျာ။ ကျေးဇူးပြု၍ ငွေအရင်ဖြည့်ပေးပါ။",
          };
        }
        remainingBalance = memCurrent - totalMmk;
      }

      // 3. Call Upstream Supplier API (XPro or DigitalCore) with strict error handling & atomic refund
      let deliveryLines: string[] = [];
      let deliveryType = product.deliveryType || "CREDENTIALS";
      let upstreamOrderId: string | null = null;
      let upstreamViewUrl: string | undefined = undefined;
      let upstreamUnitPrice = product.supplierPriceUsd;

      const isTest = process.env.NODE_ENV === "test" || process.env.VITEST !== undefined;
      const supplierId: SupplierId = product.supplier === "DIGITALCORE" ? "DIGITALCORE" : "XPRO";

      if (!isTest) {
        const apiKey = supplierId === "DIGITALCORE" ? botConfig.DIGITALCORE_API_KEY : botConfig.UPSTREAM_API_KEY;
        const baseUrl = supplierId === "DIGITALCORE" ? botConfig.DIGITALCORE_BASE_URL : botConfig.UPSTREAM_BASE_URL;

        if (!apiKey) {
          // FOOTGUN PREVENTED: Never fake deliveries in production when API key is missing!
          if (debitedWalletId !== null) {
            const refundWalletId = debitedWalletId;
            try {
              const db = getDb();
              await db.transaction(async (tx) => {
                await tx
                  .update(wallets)
                  .set({
                    balanceMmk: sql`${wallets.balanceMmk} + ${totalMmk}`,
                    totalSpentMmk: sql`GREATEST(0, ${wallets.totalSpentMmk} - ${totalMmk})`,
                    updatedAt: new Date(),
                  })
                  .where(eq(wallets.id, refundWalletId));
                // Mirror the refund in the ledger so it nets off the ORDER_DEBIT
                // written at debit time; balance and ledger sum stay in step.
                await tx.insert(walletLedger).values({
                  walletId: refundWalletId,
                  amountMmk: totalMmk,
                  type: "REFUND_CREDIT",
                  referenceId: publicOrderNo,
                  notes: `Auto-refund: supplier ${supplierId} API key not configured`,
                });
              });
            } catch (refundErr: any) {
              console.error("[BotOrderService] Critical: Wallet refund failed on unconfigured supplier:", refundErr.message);
            }
          }

          void sendAdminTelegramAlert(
            `🚨 <b>CRITICAL CONFIG ERROR: Missing Supplier API Key</b>\n\n` +
            `• <b>Supplier:</b> <code>${supplierId}</code>\n` +
            `• <b>Product:</b> ${escapeHtml(product.cleanName)} (ID: ${product.id})\n` +
            `• <b>Customer:</b> @${params.telegramUsername || params.customerName} (TG: <code>${params.telegramId}</code>)\n` +
            `• <b>Action:</b> Wallet debited was automatically refunded to customer.\n` +
            `⚠️ Please configure <code>${supplierId === "DIGITALCORE" ? "DIGITALCORE_API_KEY" : "UPSTREAM_API_KEY"}</code> in environment!`
          );

          return {
            success: false,
            error: "SUPPLIER_CONFIG_ERROR",
            errorMessage: "⚠️ ဆာဗာ စနစ် ပြင်ဆင်နေဆဲ ဖြစ်ပါသဖြင့် ဤပစ္စည်းအား ခေတ္တ ဝယ်ယူ၍ မရနိုင်သေးပါခင်ဗျာ။ သင့် Wallet မှ ငွေကို ပြန်လည် ထည့်သွင်းပေးထားပါသည်။",
          };
        }

        try {
          const client = createSupplierClient(supplierId, {
            baseUrl,
            apiKey,
            timeoutMs: 15000,
          });

          const upstreamRes = await client.createOrder({
            upstreamProductId: String(targetUpstreamId),
            quantity: params.quantity,
            externalOrderId,
            pricingTiers: product.pricingTiers,
          });

          upstreamOrderId = upstreamRes.upstreamOrderId ? String(upstreamRes.upstreamOrderId) : null;
          upstreamViewUrl = upstreamRes.viewUrl;
          deliveryType = (upstreamRes.raw as any)?.delivery?.type || product.deliveryType || "CREDENTIALS";
          if (upstreamRes.items && upstreamRes.items.length > 0) {
            deliveryLines = upstreamRes.items;
          } else if (upstreamRes.viewUrl) {
            deliveryLines = [upstreamRes.viewUrl];
          } else {
            deliveryLines = [];
          }
          upstreamUnitPrice = String(
            (upstreamRes.raw as any)?.order?.unitPrice || product.supplierPriceUsd
          );
        } catch (err: any) {
          console.error(`[BotOrderService] Upstream purchase failed (${supplierId}):`, err.message);

          // ATOMIC REFUND: Rollback the debited balance immediately on upstream failure!
          if (debitedWalletId !== null) {
            const refundWalletId = debitedWalletId;
            try {
              const db = getDb();
              await db.transaction(async (tx) => {
                await tx
                  .update(wallets)
                  .set({
                    balanceMmk: sql`${wallets.balanceMmk} + ${totalMmk}`,
                    totalSpentMmk: sql`GREATEST(0, ${wallets.totalSpentMmk} - ${totalMmk})`,
                    updatedAt: new Date(),
                  })
                  .where(eq(wallets.id, refundWalletId));
                // Mirror the refund in the ledger so it nets off the ORDER_DEBIT
                // written at debit time; balance and ledger sum stay in step.
                await tx.insert(walletLedger).values({
                  walletId: refundWalletId,
                  amountMmk: totalMmk,
                  type: "REFUND_CREDIT",
                  referenceId: publicOrderNo,
                  notes: `Auto-refund: upstream ${supplierId} order failed`,
                });
              });
            } catch (refundErr: any) {
              console.error("[BotOrderService] Critical: Wallet refund failed after upstream error:", refundErr.message);
            }
          }

          if (err instanceof SupplierError) {
            if (err.code === "INSUFFICIENT_BALANCE") {
              return {
                success: false,
                error: "SUPPLIER_OUTAGE",
                errorMessage: "⚠️ ပစ္စည်းလက်ကျန် ပြတ်လပ်နေပါသည်ခင်ဗျာ။ သင့် Wallet မှ ငွေကို နုတ်ယူခြင်း မရှိပါ။",
              };
            }
            if (err.code === "OUT_OF_STOCK") {
              return {
                success: false,
                error: "OUT_OF_STOCK",
                errorMessage: "⚠️ ပစ္စည်းလက်ကျန် ပြတ်လပ်သွားပါပြီခင်ဗျာ။ သင့် Wallet မှ ငွေကို နုတ်ယူခြင်း မရှိပါ။",
              };
            }
            if (err.code === "PRODUCT_NOT_FOUND") {
              return {
                success: false,
                error: "PRODUCT_NOT_FOUND",
                errorMessage: "⚠️ ဤပစ္စည်း ရောင်းချခြင်း ယာယီရပ်ဆိုင်းထားပါသည်ခင်ဗျာ။",
              };
            }
            if (err.code === "AMBIGUOUS_TIMEOUT") {
              // Persist trace order for reconciliation (safeguard against upstream order fulfillment)
              if (user) {
                try {
                  const db = getDb();
                  await db.transaction(async (tx) => {
                    const [insertedOrder] = await tx
                      .insert(orders)
                      .values({
                        publicOrderNo,
                        externalOrderId: upstreamOrderId ? `${supplierId}-${upstreamOrderId}` : externalOrderId,
                        supplier: supplierId,
                        customerId: user.id,
                        status: "TIMEOUT_REFUNDED",
                        totalAmountMmk: totalMmk,
                        notes: `AMBIGUOUS_TIMEOUT: Upstream timeout. Customer refunded. External ref: ${externalOrderId}`,
                      })
                      .returning();

                    if (insertedOrder) {
                      await tx.insert(orderItems).values({
                        orderId: insertedOrder.id,
                        productId: product.id,
                        productNameSnapshot: product.cleanName,
                        quantity: params.quantity,
                        unitPriceMmk: product.retailPriceMmk,
                        unitCostUsd: upstreamUnitPrice || "0.00",
                        subtotalMmk: totalMmk,
                      });
                    }
                  });
                } catch (traceErr: any) {
                  console.error("[BotOrderService] Failed to persist timeout trace order:", traceErr.message);
                }
                void emitAdminEvent("ORDER_CREATED", {
                  publicOrderNo,
                  status: "TIMEOUT_REFUNDED",
                });
              }

              void sendAdminTelegramAlert(
                `⚠️ <b>UPSTREAM TIMEOUT ALERT (Manual Reconcile Needed)</b>\n\n` +
                `• <b>Order No:</b> <code>${publicOrderNo}</code>\n` +
                `• <b>External Ref:</b> <code>${externalOrderId}</code>\n` +
                `• <b>Supplier:</b> <code>${supplierId}</code>\n` +
                `• <b>Product:</b> ${escapeHtml(product.cleanName)} x ${params.quantity}\n` +
                `• <b>Customer:</b> @${params.telegramUsername || params.customerName} (TG: <code>${params.telegramId}</code>)\n` +
                `• <b>Status:</b> Customer was refunded in wallet. Check supplier dashboard to see if order executed upstream!`
              );

              return {
                success: false,
                error: "SUPPLIER_TIMEOUT",
                errorMessage: "⚠️ ဆာဗာမှ တုံ့ပြန်မှု နှောင့်နှေးနေပါသည်။ သင့် ငွေစာရင်းကို စစ်ဆေးပြီး လိုအပ်ပါက Admin မှ ဆက်သွယ်ပေးပါမည်။",
              };
            }
          }

          return {
            success: false,
            error: "UPSTREAM_ERROR",
            errorMessage: `⚠️ ပစ္စည်း ပေးပို့မှု မအောင်မြင်ပါ (${err.message || "Network Error"})။ သင့် Wallet မှ ငွေကို နုတ်ယူခြင်း မရှိပါ။`,
          };
        }
      } else {
        // Mock fallback ONLY in test mode
        deliveryLines = [
          product.deliveryType === "LINK"
            ? `https://partner.arena.store/invite/claim?order=${publicOrderNo}&token=arena_${Date.now()}`
            : product.deliveryType === "LICENSE"
            ? `ARN-${Date.now().toString().slice(-4)}-TEST-LICENSE-KEY`
            : `user.${params.telegramId.slice(-4)}@arenastore.mm:ArenaPass#${Date.now().toString().slice(-4)}`,
        ];
      }

      // 4. Format delivered credentials for Telegram chat display
      const rawDeliveryText = deliveryLines.length > 1
        ? deliveryLines.map((line, idx) => `#${idx + 1}: ${line}`).join("\n")
        : deliveryLines[0] || "အကောင့်အချက်အလက်ကို ရယူပြီးပါပြီ။";
      const credentialsText = formatCredentialsText(rawDeliveryText);
      const deliveryPayloadV2: DeliveryPayloadV2 = {
        v: 2,
        lines: deliveryLines,
        viewUrl: upstreamViewUrl,
        supplier: supplierId,
      };
      const encryptedPayload = encryptPayload(deliveryPayloadV2);

      // 5. Record the order, item and encrypted delivery in an atomic
      // transaction. The ORDER_DEBIT ledger entry was already written with the
      // wallet debit (step 2), so a failure here can no longer desync the
      // balance from the ledger — it can only lose the order *metadata*. We
      // retry once for a transient blip, then alert an admin for manual
      // backfill. We never swallow silently: the customer has been charged and
      // the product was already delivered upstream, so they keep the
      // credentials shown in chat while an admin recreates the order record.
      if (user && debitedWalletId !== null) {
        const orderUserId = user.id;
        const persistOrderRecord = async () => {
          const db = getDb();
          await db.transaction(async (tx) => {
            // A. Insert order
            const [insertedOrder] = await tx
              .insert(orders)
              .values({
                publicOrderNo,
                externalOrderId: upstreamOrderId ? `${supplierId}-${upstreamOrderId}` : publicOrderNo,
                supplier: supplierId,
                customerId: orderUserId,
                status: "DELIVERED",
                totalAmountMmk: totalMmk,
                notes: `Telegram purchase by @${params.telegramUsername || params.customerName}`,
              })
              .returning();

            // B. Insert order item
            await tx.insert(orderItems).values({
              orderId: insertedOrder.id,
              productId: product.id,
              productNameSnapshot: product.cleanName,
              quantity: params.quantity,
              unitPriceMmk: product.retailPriceMmk,
              unitCostUsd: upstreamUnitPrice,
              subtotalMmk: totalMmk,
            });

            // C. Insert encrypted delivery payload
            await tx.insert(orderDeliveries).values({
              orderId: insertedOrder.id,
              upstreamOrderId: upstreamOrderId || null,
              deliveryType,
              encryptedPayload,
              deliveredAt: new Date(),
            });
          });
        };

        try {
          await persistOrderRecord();
        } catch (firstErr: any) {
          console.error(
            "[BotOrderService] Order-record transaction failed; retrying once:",
            firstErr?.message
          );
          try {
            await persistOrderRecord();
          } catch (dbErr: any) {
            console.error(
              "[BotOrderService] CRITICAL: order record persist failed after retry:",
              dbErr?.message
            );
            void sendAdminTelegramAlert(
              `🚨 <b>ORDER RECORD PERSIST FAILED (Manual Backfill Needed)</b>\n\n` +
                `• <b>Order No:</b> <code>${publicOrderNo}</code>\n` +
                `• <b>Customer:</b> @${params.telegramUsername || params.customerName} (TG: <code>${params.telegramId}</code>)\n` +
                `• <b>Product:</b> ${escapeHtml(product.cleanName)} x ${params.quantity}\n` +
                `• <b>Amount:</b> ${totalMmk.toLocaleString()} MMK (already debited)\n` +
                `• <b>Supplier:</b> <code>${supplierId}</code> #${upstreamOrderId || "direct"}\n` +
                `• <b>Status:</b> Customer WAS charged and the product WAS delivered. The ORDER_DEBIT ledger entry exists, but the order/delivery row failed to save. Recreate the order + delivery record manually.`
            );
            void emitAdminEvent("ORDER_CREATED", {
              orderId: publicOrderNo,
              publicOrderNo,
              productId: params.productId,
              totalMmk,
              status: "RECORD_FAILED",
            });
          }
        }
      }

      // Do not expose wholesale supplier tracking link (like digitalcore.top) to customer
      const customerViewUrl =
        upstreamViewUrl &&
        !upstreamViewUrl.includes("digitalcore.top") &&
        (!deliveryLines || deliveryLines.length === 0)
          ? upstreamViewUrl
          : undefined;

      // 6. Update In-Memory Cache
      const orderRecord: OrderRecord = {
        id: publicOrderNo,
        publicOrderNo,
        productId: params.productId,
        productName: product.cleanName,
        quantity: params.quantity,
        totalMmk,
        status: "DELIVERED",
        createdAt: new Date().toISOString(),
        credentialsText,
        viewUrl: customerViewUrl,
      };

      const list = this.memoryOrders.get(params.telegramId) || [];
      list.unshift(orderRecord);
      this.memoryOrders.set(params.telegramId, list);
      this.memoryWallets.set(params.telegramId, remainingBalance);

      void emitAdminEvent("ORDER_CREATED", {
        orderId: publicOrderNo,
        publicOrderNo,
        productId: params.productId,
        totalMmk,
        status: "DELIVERED",
      });

      return {
        success: true,
        orderId: publicOrderNo,
        publicOrderNo,
        productName: product.cleanName,
        quantity: params.quantity,
        totalMmk,
        credentialsText,
        viewUrl: customerViewUrl,
        remainingBalance,
      };
    } finally {
      this.activePurchases.delete(params.telegramId);
    }
  }

  /**
   * Fetches customer purchasing stats and profile details from Neon DB.
   */
  async getUserProfile(telegramId: string): Promise<{
    joinedDate: string;
    ordersCount: number;
    totalSpentMmk: number;
    walletBalanceMmk: number;
    totalDepositsMmk: number;
  }> {
    try {
      const userRecord = await this.getOrCreateUser({ telegramId });
      if (userRecord?.user && userRecord.wallet) {
        const { user, wallet } = userRecord;
        const db = getDb();
        const [stats] = await db
          .select({ ordersCount: sql<number>`COUNT(*)::integer` })
          .from(orders)
          .where(eq(orders.customerId, user.id));

        return {
          joinedDate: user.createdAt.toISOString().split("T")[0],
          ordersCount: stats?.ordersCount ?? 0,
          totalSpentMmk: wallet.totalSpentMmk,
          walletBalanceMmk: wallet.balanceMmk,
          totalDepositsMmk: wallet.totalDepositedMmk,
        };
      }
    } catch (err: any) {
      console.warn("[BotOrderService] DB getUserProfile error:", err.message);
    }

    const localBalance = this.memoryWallets.get(telegramId) || 0;
    const localOrders = this.memoryOrders.get(telegramId) || [];
    const localSpent = localOrders.reduce(
      (sum, o) => sum + (o.status === "DELIVERED" ? o.totalMmk : 0),
      0
    );

    return {
      joinedDate: new Date().toISOString().split("T")[0],
      ordersCount: localOrders.length,
      totalSpentMmk: localSpent,
      walletBalanceMmk: localBalance,
      totalDepositsMmk: localBalance + localSpent,
    };
  }

  /**
   * Retrieves user orders list.
   */
  async getUserOrders(telegramId: string): Promise<OrderRecord[]> {
    try {
      const userRecord = await this.getOrCreateUser({ telegramId });
      if (userRecord?.user) {
        const db = getDb();
        const dbOrders = await db
          .select({
            order: orders,
            item: orderItems,
          })
          .from(orders)
          .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
          .where(eq(orders.customerId, userRecord.user.id))
          .orderBy(desc(orders.createdAt))
          .limit(50);

        if (dbOrders.length > 0) {
          return dbOrders.map(({ order: o, item }) => ({
            id: o.publicOrderNo,
            publicOrderNo: o.publicOrderNo,
            productId: item?.productId || 0,
            productName: item?.productNameSnapshot || "Digital Product",
            quantity: item?.quantity || 1,
            totalMmk: o.totalAmountMmk,
            status: o.status as any,
            createdAt: o.createdAt.toISOString(),
          }));
        }
      }
    } catch (err: any) {
      console.warn("[BotOrderService] DB getUserOrders error:", err.message);
    }

    return this.memoryOrders.get(telegramId) || [];
  }

  /**
   * Retrieves a single order by public order number or ID, decrypting credentials.
   * Scoped to the requesting customer — one account can never read another's order.
   */
  async getOrderById(orderId: string, requesterTelegramId: string): Promise<OrderRecord | null> {
    try {
      const userRecord = await this.getOrCreateUser({ telegramId: requesterTelegramId });
      if (!userRecord?.user) return null;

      const db = getDb();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
      const condition = and(
        isUuid ? eq(orders.id, orderId) : eq(orders.publicOrderNo, orderId),
        eq(orders.customerId, userRecord.user.id)
      );

      const [orderRow] = await db
        .select()
        .from(orders)
        .where(condition)
        .limit(1);

      if (orderRow) {
        const [deliv] = await db
          .select()
          .from(orderDeliveries)
          .where(eq(orderDeliveries.orderId, orderRow.id))
          .limit(1);

        const [item] = await db
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, orderRow.id))
          .limit(1);

        let credentialsText: string | undefined = undefined;
        let viewUrl: string | undefined = undefined;
        if (deliv?.encryptedPayload) {
          try {
            const dec = decryptDeliveryPayload(deliv.encryptedPayload);
            credentialsText = formatCredentialsText(dec.lines);
            if (
              dec.viewUrl &&
              !dec.viewUrl.includes("digitalcore.top") &&
              (!dec.lines || dec.lines.length === 0)
            ) {
              viewUrl = dec.viewUrl;
            }
          } catch (err: any) {
            console.warn(`[BotOrderService] Decryption failed for order ${orderRow.publicOrderNo}:`, err.message);
            credentialsText = deliv.encryptedPayload;
          }
        }

        return {
          id: orderRow.publicOrderNo,
          publicOrderNo: orderRow.publicOrderNo,
          productId: item?.productId || 0,
          productName: item?.productNameSnapshot || "Digital Product",
          quantity: item?.quantity || 1,
          totalMmk: orderRow.totalAmountMmk,
          status: orderRow.status as any,
          createdAt: orderRow.createdAt.toISOString(),
          credentialsText,
          viewUrl,
        };
      }
    } catch (err: any) {
      console.warn("[BotOrderService] DB getOrderById error:", err.message);
    }

    const ownOrders = this.memoryOrders.get(requesterTelegramId) || [];
    const found = ownOrders.find((o) => o.id === orderId || o.publicOrderNo === orderId);
    return found || null;
  }
}

export const botOrderService = new BotOrderService();
