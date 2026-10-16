CREATE TABLE "referral_rewards" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrer_id" integer NOT NULL,
	"referred_user_id" integer NOT NULL,
	"order_id" uuid,
	"reward_type" varchar(32) NOT NULL,
	"amount_mmk" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrer_id" integer NOT NULL,
	"referred_user_id" integer NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"welcome_reward_mmk" integer DEFAULT 200 NOT NULL,
	"referrer_bonus_mmk" integer DEFAULT 200 NOT NULL,
	"total_commission_mmk" integer DEFAULT 0 NOT NULL,
	"first_purchase_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referred_by" integer;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "total_referral_earnings_mmk" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "topup_requests" ADD COLUMN IF NOT EXISTS "mmpay_reconcile_alerted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_referral_rewards_referrer_id" ON "referral_rewards" USING btree ("referrer_id");--> statement-breakpoint
CREATE INDEX "idx_referral_rewards_order_id" ON "referral_rewards" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_referrals_referrer_id" ON "referrals" USING btree ("referrer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_referrals_referred_user_id" ON "referrals" USING btree ("referred_user_id");--> statement-breakpoint
CREATE INDEX "idx_referrals_status" ON "referrals" USING btree ("status");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_users_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_users_referred_by" ON "users" USING btree ("referred_by");