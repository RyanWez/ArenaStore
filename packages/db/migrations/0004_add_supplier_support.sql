ALTER TABLE "products" ADD COLUMN "supplier" varchar(16) DEFAULT 'XPRO' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "upstream_product_id" SET DATA TYPE varchar(64) USING "upstream_product_id"::text;--> statement-breakpoint
ALTER TABLE "product_supplier_snapshots" ADD COLUMN "supplier" varchar(16) DEFAULT 'XPRO' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_supplier_snapshots" ALTER COLUMN "upstream_product_id" SET DATA TYPE varchar(64) USING "upstream_product_id"::text;--> statement-breakpoint
ALTER TABLE "product_supplier_snapshots" ADD COLUMN "pricing_tiers" jsonb;--> statement-breakpoint
ALTER TABLE "order_deliveries" ALTER COLUMN "upstream_order_id" SET DATA TYPE varchar(64) USING "upstream_order_id"::text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "supplier" varchar(16);--> statement-breakpoint
UPDATE "orders" o SET "supplier" = p."supplier"
  FROM "order_items" oi JOIN "products" p ON p."id" = oi."product_id"
  WHERE oi."order_id" = o."id" AND o."supplier" IS NULL;--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_upstream_product_id_unique";--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_upstream_id_unique" UNIQUE ("supplier", "upstream_product_id");--> statement-breakpoint
ALTER TABLE "product_supplier_snapshots" DROP CONSTRAINT IF EXISTS "product_supplier_snapshots_product_id_unique";--> statement-breakpoint
ALTER TABLE "product_supplier_snapshots" ADD CONSTRAINT "product_supplier_snapshots_product_supplier_unique" UNIQUE ("product_id", "supplier");--> statement-breakpoint
DROP INDEX IF EXISTS "idx_products_upstream_id";--> statement-breakpoint
CREATE INDEX "idx_products_supplier_upstream_id" ON "products" USING btree ("supplier", "upstream_product_id");--> statement-breakpoint
DROP INDEX IF EXISTS "idx_snapshots_product_id";--> statement-breakpoint
CREATE INDEX "idx_snapshots_product_supplier" ON "product_supplier_snapshots" USING btree ("product_id", "supplier");--> statement-breakpoint
DROP INDEX IF EXISTS "idx_snapshots_upstream_id";--> statement-breakpoint
CREATE INDEX "idx_snapshots_supplier_upstream_id" ON "product_supplier_snapshots" USING btree ("supplier", "upstream_product_id");--> statement-breakpoint
CREATE INDEX "idx_orders_supplier" ON "orders" USING btree ("supplier");
