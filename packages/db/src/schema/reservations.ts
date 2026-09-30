import { pgTable, serial, uuid, integer, timestamp, index } from "drizzle-orm/pg-core";
import { products } from "./products";
import { orders } from "./orders";

export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_reservations_product_expires").on(table.productId, table.expiresAt),
    index("idx_reservations_order_id").on(table.orderId),
  ]
);

export type StockReservation = typeof stockReservations.$inferSelect;
export type NewStockReservation = typeof stockReservations.$inferInsert;
