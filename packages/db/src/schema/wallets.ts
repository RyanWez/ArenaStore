import { pgTable, serial, integer, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const wallets = pgTable(
  "wallets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    balanceMmk: integer("balance_mmk").notNull().default(0),
    totalDepositedMmk: integer("total_deposited_mmk").notNull().default(0),
    totalSpentMmk: integer("total_spent_mmk").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_wallets_user_id").on(table.userId),
  ]
);

export const walletLedger = pgTable(
  "wallet_ledger",
  {
    id: serial("id").primaryKey(),
    walletId: integer("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    amountMmk: integer("amount_mmk").notNull(),
    type: varchar("type", { length: 32 }).notNull(), // TOPUP_CREDIT, ORDER_DEBIT, REFUND_CREDIT
    referenceId: varchar("reference_id", { length: 128 }),
    notes: varchar("notes", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_wallet_ledger_wallet_id").on(table.walletId),
    index("idx_wallet_ledger_type").on(table.type),
  ]
);

export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
export type WalletLedgerEntry = typeof walletLedger.$inferSelect;
export type NewWalletLedgerEntry = typeof walletLedger.$inferInsert;
