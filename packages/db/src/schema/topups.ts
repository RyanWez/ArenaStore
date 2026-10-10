import { pgTable, serial, integer, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const topUpRequests = pgTable(
  "topup_requests",
  {
    id: serial("id").primaryKey(),
    reference: varchar("reference", { length: 64 }).notNull().unique(), // e.g. TOP-2026-84920
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountMmk: integer("amount_mmk").notNull(),
    paymentMethod: varchar("payment_method", { length: 32 }).notNull(), // KPAY, WAVEPAY
    transactionRef: varchar("transaction_ref", { length: 128 }),
    slipFileId: varchar("slip_file_id", { length: 255 }),
    telegramChatId: varchar("telegram_chat_id", { length: 64 }),
    telegramMessageId: integer("telegram_message_id"),
    status: varchar("status", { length: 32 }).notNull().default("SUBMITTED"), // SUBMITTED, APPROVED, REJECTED
    reviewedBy: integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectReason: varchar("reject_reason", { length: 255 }),
    intendedProduct: varchar("intended_product", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    mmpayOrderId: varchar("mmpay_order_id", { length: 64 }),
    mmpayQrString: varchar("mmpay_qr_string", { length: 1024 }),
    mmpayVendorQrRef: varchar("mmpay_vendor_qr_ref", { length: 128 }),
    // Telegram message id of the customer-facing MMQR invoice photo, so the
    // webhook can remove it and post a single success message once paid.
    mmpayQrMessageId: integer("mmpay_qr_message_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_topups_user_id").on(table.userId),
    index("idx_topups_reference").on(table.reference),
    index("idx_topups_status").on(table.status),
    index("idx_topups_mmpay_order_id").on(table.mmpayOrderId),
    // At most one active (PENDING) MMPay top-up per user — enforces the
    // single-active-order rule at the DB level (migration 0011).
    uniqueIndex("uq_topups_user_active_mmpay")
      .on(table.userId)
      .where(sql`${table.paymentMethod} = 'MMPAY' AND ${table.status} = 'PENDING'`),
  ]
);

export type TopUpRequest = typeof topUpRequests.$inferSelect;
export type NewTopUpRequest = typeof topUpRequests.$inferInsert;
