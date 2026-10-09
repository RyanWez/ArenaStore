ALTER TABLE "topup_requests" ADD COLUMN IF NOT EXISTS "mmpay_order_id" varchar(64);
ALTER TABLE "topup_requests" ADD COLUMN IF NOT EXISTS "mmpay_qr_string" varchar(1024);
ALTER TABLE "topup_requests" ADD COLUMN IF NOT EXISTS "mmpay_vendor_qr_ref" varchar(128);
ALTER TABLE "topup_requests" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "idx_topups_mmpay_order_id" ON "topup_requests" ("mmpay_order_id");
