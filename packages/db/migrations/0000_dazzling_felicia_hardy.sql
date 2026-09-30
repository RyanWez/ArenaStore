CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" varchar(64) NOT NULL,
	"username" varchar(255),
	"first_name" varchar(255) NOT NULL,
	"last_name" varchar(255),
	"role" varchar(32) DEFAULT 'CUSTOMER' NOT NULL,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"upstream_category_id" integer,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"icon_emoji" varchar(32) DEFAULT '📁',
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_supplier_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"upstream_product_id" integer NOT NULL,
	"raw_name" varchar(255) NOT NULL,
	"raw_description" text,
	"delivery_type" varchar(32) DEFAULT 'CREDENTIALS' NOT NULL,
	"supplier_price_usd" varchar(32) NOT NULL,
	"supplier_stock" integer DEFAULT 0 NOT NULL,
	"in_stock" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"upstream_product_id" integer NOT NULL,
	"category_id" integer,
	"name_mmk" varchar(255) NOT NULL,
	"description_mmk" text,
	"retail_price_mmk" integer NOT NULL,
	"local_stock_limit" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_upstream_product_id_unique" UNIQUE("upstream_product_id")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" integer NOT NULL,
	"product_name_snapshot" varchar(255) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_mmk" integer NOT NULL,
	"unit_cost_usd" varchar(32) NOT NULL,
	"subtotal_mmk" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_order_no" varchar(64) NOT NULL,
	"external_order_id" varchar(128) NOT NULL,
	"customer_id" integer NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"total_amount_mmk" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_public_order_no_unique" UNIQUE("public_order_no"),
	CONSTRAINT "orders_external_order_id_unique" UNIQUE("external_order_id")
);
--> statement-breakpoint
CREATE TABLE "payment_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_method" varchar(32) NOT NULL,
	"slip_file_id" varchar(255) NOT NULL,
	"transaction_ref" varchar(128),
	"submitted_amount_mmk" integer NOT NULL,
	"status" varchar(32) DEFAULT 'SUBMITTED' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"reject_reason" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"upstream_order_id" integer,
	"delivery_type" varchar(32) DEFAULT 'CREDENTIALS' NOT NULL,
	"encrypted_payload" text NOT NULL,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"customer_viewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"order_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"action" varchar(64) NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" varchar(128) NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_supplier_snapshots" ADD CONSTRAINT "product_supplier_snapshots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_users_telegram_id" ON "users" USING btree ("telegram_id");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_categories_slug" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_categories_sort_order" ON "categories" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_snapshots_product_id" ON "product_supplier_snapshots" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_snapshots_upstream_id" ON "product_supplier_snapshots" USING btree ("upstream_product_id");--> statement-breakpoint
CREATE INDEX "idx_products_upstream_id" ON "products" USING btree ("upstream_product_id");--> statement-breakpoint
CREATE INDEX "idx_products_category_id" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_products_is_active" ON "products" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_order_items_order_id" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_product_id" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_orders_public_no" ON "orders" USING btree ("public_order_no");--> statement-breakpoint
CREATE INDEX "idx_orders_external_id" ON "orders" USING btree ("external_order_id");--> statement-breakpoint
CREATE INDEX "idx_orders_customer_id" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_orders_created_at" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_payments_order_id" ON "payment_submissions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_payments_status" ON "payment_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payments_tx_ref" ON "payment_submissions" USING btree ("transaction_ref");--> statement-breakpoint
CREATE INDEX "idx_deliveries_order_id" ON "order_deliveries" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_deliveries_upstream_order_id" ON "order_deliveries" USING btree ("upstream_order_id");--> statement-breakpoint
CREATE INDEX "idx_reservations_product_expires" ON "stock_reservations" USING btree ("product_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_reservations_order_id" ON "stock_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_audit_actor_id" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "idx_audit_action" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_created_at" ON "audit_logs" USING btree ("created_at");