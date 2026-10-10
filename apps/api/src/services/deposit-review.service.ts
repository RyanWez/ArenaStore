import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, topUpRequests, users, wallets, walletLedger } from "@arena/db";
import {
  notifyTopUpApproved,
  notifyTopUpRejected,
  syncTelegramDepositReviewOutcome,
} from "./telegram-notifier";
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
      reviewedByLabel?: string;
    }
  | {
      ok: true;
      action: "REJECTED";
      reference: string;
      amountMmk: number;
      rejectReason: string;
      customerLabel: string;
      telegramId: string | null;
      reviewedByLabel?: string;
    }
  | { ok: false; code: "NOT_FOUND" }
  | {
      ok: false;
      code: "MMPAY_AUTO_ONLY";
      reference: string;
      amountMmk: number;
      customerLabel: string;
      telegramId: string | null;
    }
  | {
      ok: false;
      code: "ALREADY_REVIEWED";
      status: string;
      reference: string;
      amountMmk: number;
      customerLabel: string;
      telegramId: string | null;
      reviewedByLabel?: string;
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

/** Resolves the human-readable reviewer label for audit and Telegram notifications. */
export async function resolveActorLabel(
  actor: DepositReviewActor,
  db: ReturnType<typeof getDb>
): Promise<string> {
  if (actor.kind === "ADMIN" && actor.adminUserId) {
    try {
      const [staff] = await db
        .select({
          firstName: users.firstName,
          lastName: users.lastName,
          username: users.username,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, actor.adminUserId))
        .limit(1);

      if (staff) {
        const fullName = [staff.firstName, staff.lastName].filter(Boolean).join(" ").trim();
        const baseName = fullName || (staff.username ? `@${staff.username}` : staff.email || "Admin");
        return `${baseName} (Dashboard)`;
      }
    } catch {
      // fallback
    }
    return "Admin (Dashboard)";
  }

  if (actor.kind === "TELEGRAM") {
    return actor.telegramUsername ? `@${actor.telegramUsername}` : "Admin (Telegram)";
  }

  return "Admin";
}

/** Resolves the past reviewer label when deposit was already reviewed. */
export async function resolvePastReviewerLabel(
  reviewedBy: number | null | undefined,
  db: ReturnType<typeof getDb>
): Promise<string> {
  if (!reviewedBy) return "Admin";
  try {
    const [staff] = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, reviewedBy))
      .limit(1);

    if (staff) {
      const fullName = [staff.firstName, staff.lastName].filter(Boolean).join(" ").trim();
      return `${fullName || (staff.username ? `@${staff.username}` : staff.email || "Admin")} (Dashboard)`;
    }
  } catch {
    // fallback
  }
  return "Admin";
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
  /**
   * True only for the MyanMyanPay gateway webhook. It allows crediting a
   * PENDING MMPay request (the gateway callback is the sole legitimate
   * approver). Human reviews leave this unset, so they can never approve a
   * PENDING MMPay top-up the customer may not have paid for yet.
   */
  viaGatewayWebhook?: boolean;
  /**
   * Customer / admin-group Telegram notifications default on. The MMPay webhook
   * turns both off and sends its own single MMQR success message (clearing the
   * live QR invoice), so there is no duplicate notification and the gateway ack
   * is never blocked on Telegram latency.
   */
  notifyCustomer?: boolean;
  notifyGroup?: boolean;
}): Promise<DepositReviewOutcome> {
  const { depositId, action, actor } = params;
  const notifyCustomer = params.notifyCustomer !== false;
  const notifyGroup = params.notifyGroup !== false;
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
  const actorLabel = await resolveActorLabel(actor, db);

  // MMPay top-ups are auto-confirmed by the payment gateway webhook. A human
  // (panel or Telegram group) must never manually approve/reject one while it
  // is still PENDING — the customer may not have paid the MMQR yet, so a manual
  // approval would credit money that never arrived.
  if (
    !params.viaGatewayWebhook &&
    topUp.paymentMethod === "MMPAY" &&
    topUp.status === "PENDING"
  ) {
    return {
      ok: false,
      code: "MMPAY_AUTO_ONLY",
      reference: topUp.reference,
      amountMmk: topUp.amountMmk,
      customerLabel,
      telegramId: user.telegramId,
    };
  }

  if (topUp.status !== "SUBMITTED" && topUp.status !== "PENDING") {
    const reviewedByLabel = await resolvePastReviewerLabel(topUp.reviewedBy, db);
    return {
      ok: false,
      code: "ALREADY_REVIEWED",
      status: topUp.status,
      reference: topUp.reference,
      amountMmk: topUp.amountMmk,
      customerLabel,
      telegramId: user.telegramId,
      reviewedByLabel,
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
        const reviewedByLabel = await resolvePastReviewerLabel(topUp.reviewedBy, db);
        return {
          ok: false,
          code: "ALREADY_REVIEWED",
          status: "COMPLETED",
          reference: topUp.reference,
          amountMmk: topUp.amountMmk,
          customerLabel,
          telegramId: user.telegramId,
          reviewedByLabel,
        };
      }
      throw err;
    }

    // Send celebration Telegram notification to customer
    if (notifyCustomer && user.telegramId) {
      await notifyTopUpApproved({
        telegramId: user.telegramId,
        reference: topUp.reference,
        amountMmk: topUp.amountMmk,
        newBalanceMmk: newBalance,
      });
    }

    // Sync review outcome to Telegram admin group
    if (notifyGroup) {
      await syncTelegramDepositReviewOutcome({
        outcome: "APPROVED",
        actorLabel,
        reference: topUp.reference,
        amountMmk: topUp.amountMmk,
        customerLabel,
        telegramId: user.telegramId,
        postedAt: topUp.createdAt,
        chatId: topUp.telegramChatId,
        messageId: topUp.telegramMessageId,
      }).catch((err: any) => {
        console.warn("[DepositReview] Failed to sync approval to Telegram group:", err?.message);
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
      reviewedByLabel: actorLabel,
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
    const reviewedByLabel = await resolvePastReviewerLabel(topUp.reviewedBy, db);
    return {
      ok: false,
      code: "ALREADY_REVIEWED",
      status: "REJECTED",
      reference: topUp.reference,
      amountMmk: topUp.amountMmk,
      customerLabel,
      telegramId: user.telegramId,
      reviewedByLabel,
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

  // Sync review outcome to Telegram admin group
  await syncTelegramDepositReviewOutcome({
    outcome: "REJECTED",
    actorLabel,
    reference: topUp.reference,
    amountMmk: topUp.amountMmk,
    customerLabel,
    telegramId: user.telegramId,
    postedAt: topUp.createdAt,
    chatId: topUp.telegramChatId,
    messageId: topUp.telegramMessageId,
    rejectReason: reason,
  }).catch((err: any) => {
    console.warn("[DepositReview] Failed to sync rejection to Telegram group:", err?.message);
  });

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
    reviewedByLabel: actorLabel,
  };
}
