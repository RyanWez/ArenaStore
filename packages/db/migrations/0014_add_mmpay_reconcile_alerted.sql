-- One-time admin-alert claim for an MMQR top-up the gateway reported as paid
-- but we refused to auto-credit (amount/currency mismatch, or a SUCCESS that
-- arrived beyond the late-success grace window). The webhook and the periodic
-- reconciliation sweep both set this from NULL with a guarded UPDATE so the
-- "needs manual reconcile" alert is posted to the admin group exactly once.
ALTER TABLE "topup_requests" ADD COLUMN IF NOT EXISTS "mmpay_reconcile_alerted_at" timestamp with time zone;
