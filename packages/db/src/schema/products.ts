import { pgTable, serial, integer, varchar, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { categories } from "./categories";

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    upstreamProductId: integer("upstream_product_id").notNull().unique(),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    nameMmk: varchar("name_mmk", { length: 255 }).notNull(),
    descriptionMmk: text("description_mmk"),
    retailPriceMmk: integer("retail_price_mmk").notNull(), // Integer Kyats
    localStockLimit: integer("local_stock_limit"), // null = no local cap
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_products_upstream_id").on(table.upstreamProductId),
    index("idx_products_category_id").on(table.categoryId),
    index("idx_products_is_active").on(table.isActive),
  ]
);

export const productSupplierSnapshots = pgTable(
  "product_supplier_snapshots",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    upstreamProductId: integer("upstream_product_id").notNull(),
    rawName: varchar("raw_name", { length: 255 }).notNull(),
    rawDescription: text("raw_description"),
    deliveryType: varchar("delivery_type", { length: 32 }).notNull().default("CREDENTIALS"),
    supplierPriceUsd: varchar("supplier_price_usd", { length: 32 }).notNull(), // e.g. "0.69"
    supplierStock: integer("supplier_stock").notNull().default(0),
    inStock: boolean("in_stock").notNull().default(false),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_snapshots_product_id").on(table.productId),
    index("idx_snapshots_upstream_id").on(table.upstreamProductId),
  ]
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductSupplierSnapshot = typeof productSupplierSnapshots.$inferSelect;
export type NewProductSupplierSnapshot = typeof productSupplierSnapshots.$inferInsert;
