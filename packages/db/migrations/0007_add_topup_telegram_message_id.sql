ALTER TABLE "topup_requests" ADD COLUMN IF NOT EXISTS "telegram_chat_id" varchar(64);
ALTER TABLE "topup_requests" ADD COLUMN IF NOT EXISTS "telegram_message_id" integer;
