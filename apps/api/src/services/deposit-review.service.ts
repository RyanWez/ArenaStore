import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, topUpRequests, users, wallets, walletLedger } from "@arena/db";
import { notifyTopUpApproved, notifyTopUpRejected } from "./telegram-notifier";
import { writeAudit } from "./audit.service";

export type DepositReviewAction = "APPROVE" | "REJECT";

/**
 * Who performed the review. Panel reviews carry the staff user id (written to
 * topup_requests.reviewed_by); Telegram group reviews carry the admin's
 * Telegram identity (recorded in the audit details — reviewed_by stays NULL
 * because it is an FK to users.id and group admins are not staff rows).
 */
export interface DepositReviewActor {
  kind: "ADMIN" | "TELEGRAM";
  adminUserId?: number | null;
  telegramId?: string;
  telegramUsername?: string;
}

export type DepositReviewOutcome =
  | {
      ok: true;
      action: "APPROVED";
      reference: string;
      amountMmk: number;
      newBalanceMmk: number;
      customerLabel: string;
      telegramId: string | null;
    }
  | {
      ok: true;
      action: "REJECTED";
      reference: string;
      amountMmk: number;
      rejectReason: string;
      customerLabel: string;
      telegramId: string | null;
    }
  | { ok: false; code: "NOT_FOUND" }
  | {
      ok: false;
      code: "ALREADY_REVIEWED";
      status: string;
      reference: string;
      amountMmk: number;
      customerLabel: string;
      telegramId: string | null;
    };

/** Statuses a deposit can still be reviewed from. */
const REVIEWABLE_DEPOSIT_STATUSES = ["SUBMITTED", "PENDING"] as const;

/**
 * Thrown inside the deposit-review transaction when the guarded status claim
 * (UPDATE ... WHERE status IN ('SUBMITTED','PENDING')) matches no rows — i.e.
 * another admin reviewed the deposit first. Signals the transaction to roll
 * back so the wallet is never credited twice.
 */
class DepositAlreadyReviewedError extends Error {
  constructor() {
    super("DEPOSIT_ALREADY_REVIEWED");
    this.name = "DepositAlreadyReviewedError";
  }
}

/** Customer-facing display name used in audit details and responses. */
export function buildCustomerDisplayName(u: {
  id: number;
  telegramId: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  if (fullName && fullName !== "Customer") return fullName;
  if (u.username) return `@${u.username}`;
  if (u.telegramId) return `User ${u.telegramId}`;
  return `Customer #${u.id}`;
}

/**
 * Approves or rejects a customer deposit — the single implementation shared by
 * the admin panel route (POST /api/admin/deposits/:id/review) and the internal
 * bot route (POST /api/bot/deposits/:id/review) so both surfaces behave
 * identically and write one audit trail.
 */
export async function reviewDeposit(params: {
  depositId: number;
  action: DepositReviewAction;
  rejectReason?: string;
  actor: DepositReviewActor;
}): Promise<DepositReviewOutcome> {
  const { depositId, action, actor } = params;
  const db = getDb();

  // 1. Fetch deposit request with user
  const [depositRow] = await db
    .select({ topUp: topUpRequests, user: users })
    .from(topUpRequests)
    .innerJoin(users, eq(topUpRequests.userId, users.id))
    .where(eq(topUpRequests.id, depositId))
    .limit(1);

  if (!depositRow) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const { topUp, user } = depositRow;
  const customerLabel = buildCustomerDisplayName(user);
  const reviewerId = actor.kind === "ADMIN" ? (actor.adminUserId ?? null) : null;

  if (topUp.status !== "SUBMITTED" && topUp.status !== "PENDING") {
    return {
      ok: false,
      code: "ALREADY_REVIEWED",
      status: topUp.status,
      reference: topUp.reference,
      amountMmk: topUp.amountMmk,
      customerLabel,
      telegramId: user.telegramId,
    };
  }

  if (action === "APPROVE") {
    // Atomic wallet credit + ledger entry
    let newBalance = 0;
    try {
      await db.transaction(async (tx) => {
        // Claim the deposit INSIDE the transaction with a status guard. This
        // guarded UPDATE is the single source of truth for the review: of two
        // concurrent reviews only one can flip SUBMITTED/PENDING → COMPLETED;
        // the loser matches zero rows, throws, and rolls the whole
        // transaction back — so the wallet can never be credited twice.
        const [claimed] = await tx
          .update(topUpRequests)
          .set({
            status: "COMPLETED",
            reviewedAt: new Date(),
            reviewedBy: reviewerId,
          })
          .where(
            and(
              eq(topUpRequests.id, depositId),
              inArray(topUpRequests.status, [...REVIEWABLE_DEPOSIT_STATUSES])
            )
          )
          .returning({ id: topUpRequests.id });

        if (!claimed) {
          throw new DepositAlreadyReviewedError();
        }

        // Find or create wallet
        const [existingWallet] = await tx
          .select()
          .from(wallets)
          .where(eq(wallets.userId, topUp.userId))
          .limit(1);

        if (existingWallet) {
          const [updatedWallet] = await tx
            .update(wallets)
            .set({
              balanceMmk: sql`${wallets.balanceMmk} + ${topUp.amountMmk}`,
              totalDepositedMmk: sql`${wallets.totalDepositedMmk} + ${topUp.amountMmk}`,
              updatedAt: new Date(),
            })
            .where(eq(wallets.id, existingWallet.id))
            .returning();

          newBalance = updatedWallet ? updatedWallet.balanceMmk : existingWallet.balanceMmk + topUp.amountMmk;

          await tx.insert(walletLedger).values({
            walletId: existingWallet.id,
            amountMmk: topUp.amountMmk,
            type: "TOPUP_CREDIT",
            referenceId: topUp.reference,
            notes: `Wallet deposit approved by admin`,
          });
        } else {
          newBalance = topUp.amountMmk;
          const [newWallet] = await tx
            .insert(wallets)
            .values({
              userId: topUp.userId,
              balanceMmk: topUp.amountMmk,
              totalDepositedMmk: topUp.amountMmk,
              totalSpentMmk: 0,
            })
            .returning();

          await tx.insert(walletLedger).values({
            walletId: newWallet.id,
            amountMmk: topUp.amountMmk,
            type: "TOPUP_CREDIT",
            referenceId: topUp.reference,
            notes: `Initial wallet deposit approved by admin`,
          });
        }
      });
    } catch (err) {
      if (err instanceof DepositAlreadyReviewedError) {
        return {
          ok: false,
          code: "ALREADY_REVIEWED",
          status: "COMPLETED",
          reference: topUp.reference,
          amountMmk: topUp.amountMmk,
          customerLabel,
          telegramId: user.telegramId,
        };
      }
      throw err;
    }

    // Send celebration Telegram notification to customer
    if (user.telegramId) {
      await notifyTopUpApproved({
        telegramId: user.telegramId,
        reference: topUp.reference,
        amountMmk: topUp.amountMmk,
        newBalanceMmk: newBalance,
      });
    }

    await writeAudit({
      actorId: reviewerId,
      action: "DEPOSIT_REVIEW",
      entityType: "DEPOSIT",
      entityId: depositId,
      details: {
        action: "APPROVE",
        reference: topUp.reference,
        amountMmk: topUp.amountMmk,
        newBalanceMmk: newBalance,
        ...(actor.kind === "TELEGRAM"
          ? { actorKind: "TELEGRAM", actorTelegramId: actor.telegramId, actorUsername: actor.telegramUsername ?? null }
          : {}),
      },
    });

    return {
      ok: true,
      action: "APPROVED",
      reference: topUp.reference,
      amountMmk: topUp.amountMmk,
      newBalanceMmk: newBalance,
      customerLabel,
      telegramId: user.telegramId,
    };
  }

  // REJECT — same guarded claim as approve: a stale reject can never
  // overwrite a deposit that was already approved or rejected (the
  // single guarded UPDATE is atomic on its own, no transaction needed).
  const reason = params.rejectReason || "Deposit slip verification failed.";
  const [rejected] = await db
    .update(topUpRequests)
    .set({
      status: "REJECTED",
      rejectReason: reason,
      reviewedAt: new Date(),
      reviewedBy: reviewerId,
    })
    .where(
      and(
        eq(topUpRequests.id, depositId),
        inArray(topUpRequests.status, [...REVIEWABLE_DEPOSIT_STATUSES])
      )
    )
    .returning({ id: topUpRequests.id });

  if (!rejected) {
    return {
      ok: false,
      code: "ALREADY_REVIEWED",
      status: "REJECTED",
      reference: topUp.reference,
      amountMmk: topUp.amountMmk,
      customerLabel,
      telegramId: user.telegramId,
    };
  }

  // Send rejection Telegram notification
  if (user.telegramId) {
    await notifyTopUpRejected({
      telegramId: user.telegramId,
      reference: topUp.reference,
      amountMmk: topUp.amountMmk,
      reason,
    });
  }

  await writeAudit({
    actorId: reviewerId,
    action: "DEPOSIT_REVIEW",
    entityType: "DEPOSIT",
    entityId: depositId,
    details: {
      action: "REJECT",
      reference: topUp.reference,
      amountMmk: topUp.amountMmk,
      rejectReason: reason,
      ...(actor.kind === "TELEGRAM"
        ? { actorKind: "TELEGRAM", actorTelegramId: actor.telegramId, actorUsername: actor.telegramUsername ?? null }
        : {}),
    },
  });

  return {
    ok: true,
    action: "REJECTED",
    reference: topUp.reference,
    amountMmk: topUp.amountMmk,
    rejectReason: reason,
    customerLabel,
    telegramId: user.telegramId,
  };
}
