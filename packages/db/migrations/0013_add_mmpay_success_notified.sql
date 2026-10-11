-- One-time success-notification claim flag for MMQR top-ups. Decouples the
-- "success card already announced" dedup from mmpay_qr_message_id so the
-- gateway webhook and the bot's manual Refresh never post two cards, and so
-- expiry (which clears the QR message id) cannot wipe the success claim.
ALTER TABLE "topup_requests" ADD COLUMN IF NOT EXISTS "mmpay_success_notified_at" timestamp with time zone;
