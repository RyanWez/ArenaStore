import { pgTable, serial, uuid, integer, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { orders } from "./orders";

export const orderDeliveries = pgTable(
  "order_deliveries",
  {
    id: serial("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    upstreamOrderId: integer("upstream_order_id"),
    deliveryType: varchar("delivery_type", { length: 32 }).notNull().default("CREDENTIALS"),
    encryptedPayload: text("encrypted_payload").notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }).defaultNow().notNull(),
    customerViewedAt: timestamp("customer_viewed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_deliveries_order_id").on(table.orderId),
    index("idx_deliveries_upstream_order_id").on(table.upstreamOrderId),
  ]
);

export type OrderDelivery = typeof orderDeliveries.$inferSelect;
export type NewOrderDelivery = typeof orderDeliveries.$inferInsert;
