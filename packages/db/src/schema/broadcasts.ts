import { pgTable, serial, integer, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const broadcasts = pgTable(
  "broadcasts",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id").references(() => users.id),
    title: varchar("title", { length: 255 }),
    message: text("message").notNull(),
    imageUrl: text("image_url"),
    buttonText: varchar("button_text", { length: 128 }),
    buttonUrl: text("button_url"),
    targetAudience: varchar("target_audience", { length: 64 }).notNull().default("ALL"),
    totalRecipients: integer("total_recipients").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    blockedCount: integer("blocked_count").notNull().default(0),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"), // PENDING, SENDING, COMPLETED, FAILED
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_broadcasts_actor_id").on(table.actorId),
    index("idx_broadcasts_status").on(table.status),
    index("idx_broadcasts_created_at").on(table.createdAt),
  ]
);

export type Broadcast = typeof broadcasts.$inferSelect;
export type NewBroadcast = typeof broadcasts.$inferInsert;
