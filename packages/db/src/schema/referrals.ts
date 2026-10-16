import { pgTable, serial, uuid, integer, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { orders } from "./orders";

export const referrals = pgTable(
  "referrals",
  {
    id: serial("id").primaryKey(),
    referrerId: integer("referrer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referredUserId: integer("referred_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"), // PENDING (welcome bonus), QUALIFIED (first purchase made)
    welcomeRewardMmk: integer("welcome_reward_mmk").notNull().default(200),
    referrerBonusMmk: integer("referrer_bonus_mmk").notNull().default(200),
    totalCommissionMmk: integer("total_commission_mmk").notNull().default(0),
    firstPurchaseAt: timestamp("first_purchase_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_referrals_referrer_id").on(table.referrerId),
    uniqueIndex("idx_referrals_referred_user_id").on(table.referredUserId),
    index("idx_referrals_status").on(table.status),
  ]
);

export const referralRewards = pgTable(
  "referral_rewards",
  {
    id: serial("id").primaryKey(),
    referrerId: integer("referrer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referredUserId: integer("referred_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "set null" }),
    rewardType: varchar("reward_type", { length: 32 }).notNull(), // FIRST_PURCHASE_BONUS, ORDER_COMMISSION
    amountMmk: integer("amount_mmk").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_referral_rewards_referrer_id").on(table.referrerId),
    index("idx_referral_rewards_order_id").on(table.orderId),
  ]
);

export type Referral = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;
export type ReferralReward = typeof referralRewards.$inferSelect;
export type NewReferralReward = typeof referralRewards.$inferInsert;
