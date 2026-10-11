-- Resolve any pre-existing duplicate active MMPay orders before enforcing the
-- single-active-order invariant: keep the most recent PENDING MMPay row per
-- user and expire the rest, so the unique index below can be created safely.
UPDATE "topup_requests" t
SET "status" = 'EXPIRED'
WHERE t."payment_method" = 'MMPAY'
  AND t."status" = 'PENDING'
  AND t."id" <> (
    SELECT t2."id"
    FROM "topup_requests" t2
    WHERE t2."user_id" = t."user_id"
      AND t2."payment_method" = 'MMPAY'
      AND t2."status" = 'PENDING'
    ORDER BY t2."created_at" DESC, t2."id" DESC
    LIMIT 1
  );
--> statement-breakpoint
-- Enforce at most one active (PENDING) MMPay top-up per user at the database
-- level, closing the create-flow check-then-insert (TOCTOU) race.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_topups_user_active_mmpay"
  ON "topup_requests" ("user_id")
  WHERE "payment_method" = 'MMPAY' AND "status" = 'PENDING';
