CREATE TABLE "wallet_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_id" integer NOT NULL,
	"amount_mmk" integer NOT NULL,
	"type" varchar(32) NOT NULL,
	"reference_id" varchar(128),
	"notes" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"balance_mmk" integer DEFAULT 0 NOT NULL,
	"total_deposited_mmk" integer DEFAULT 0 NOT NULL,
	"total_spent_mmk" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topup_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" varchar(64) NOT NULL,
	"user_id" integer NOT NULL,
	"amount_mmk" integer NOT NULL,
	"payment_method" varchar(32) NOT NULL,
	"transaction_ref" varchar(128),
	"slip_file_id" varchar(255),
	"status" varchar(32) DEFAULT 'SUBMITTED' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"reject_reason" varchar(255),
	"intended_product" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topup_requests_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "telegram_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topup_requests" ADD CONSTRAINT "topup_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topup_requests" ADD CONSTRAINT "topup_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_wallet_ledger_wallet_id" ON "wallet_ledger" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "idx_wallet_ledger_type" ON "wallet_ledger" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_wallets_user_id" ON "wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_topups_user_id" ON "topup_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_topups_reference" ON "topup_requests" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "idx_topups_status" ON "topup_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "product_supplier_snapshots" ADD CONSTRAINT "product_supplier_snapshots_product_id_unique" UNIQUE("product_id");