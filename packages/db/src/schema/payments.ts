import { pgTable, serial, uuid, integer, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { orders } from "./orders";
import { users } from "./users";

export const paymentSubmissions = pgTable(
  "payment_submissions",
  {
    id: serial("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    paymentMethod: varchar("payment_method", { length: 32 }).notNull(),
    slipFileId: varchar("slip_file_id", { length: 255 }).notNull(),
    transactionRef: varchar("transaction_ref", { length: 128 }),
    submittedAmountMmk: integer("submitted_amount_mmk").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("SUBMITTED"),
    reviewedBy: integer("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectReason: varchar("reject_reason", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_payments_order_id").on(table.orderId),
    index("idx_payments_status").on(table.status),
    index("idx_payments_tx_ref").on(table.transactionRef),
  ]
);

export type PaymentSubmission = typeof paymentSubmissions.$inferSelect;
export type NewPaymentSubmission = typeof paymentSubmissions.$inferInsert;
