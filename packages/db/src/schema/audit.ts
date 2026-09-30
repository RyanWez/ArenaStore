import { pgTable, serial, integer, varchar, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id").references(() => users.id),
    action: varchar("action", { length: 64 }).notNull(), // e.g. "UPDATE_PRICE", "APPROVE_PAYMENT"
    entityType: varchar("entity_type", { length: 64 }).notNull(), // "ORDER", "PRODUCT", "SETTING"
    entityId: varchar("entity_id", { length: 128 }).notNull(),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_audit_actor_id").on(table.actorId),
    index("idx_audit_action").on(table.action),
    index("idx_audit_entity").on(table.entityType, table.entityId),
    index("idx_audit_created_at").on(table.createdAt),
  ]
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
