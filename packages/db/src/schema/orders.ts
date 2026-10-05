import { pgTable, uuid, serial, integer, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { products } from "./products";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    publicOrderNo: varchar("public_order_no", { length: 64 }).notNull().unique(),
    externalOrderId: varchar("external_order_id", { length: 128 }).notNull().unique(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => users.id),
    status: varchar("status", { length: 32 }).notNull().default("PENDING_PAYMENT"),
    totalAmountMmk: integer("total_amount_mmk").notNull(),
    supplier: varchar("supplier", { length: 16 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_orders_public_no").on(table.publicOrderNo),
    index("idx_orders_external_id").on(table.externalOrderId),
    index("idx_orders_customer_id").on(table.customerId),
    index("idx_orders_supplier").on(table.supplier),
    index("idx_orders_status").on(table.status),
    index("idx_orders_created_at").on(table.createdAt),
  ]
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    productNameSnapshot: varchar("product_name_snapshot", { length: 255 }).notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceMmk: integer("unit_price_mmk").notNull(),
    unitCostUsd: varchar("unit_cost_usd", { length: 32 }).notNull(),
    subtotalMmk: integer("subtotal_mmk").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_order_items_order_id").on(table.orderId),
    index("idx_order_items_product_id").on(table.productId),
  ]
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
