CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "idx_users_username_trgm" ON "users" USING gin ("username" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_users_telegram_id_trgm" ON "users" USING gin ("telegram_id" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_users_name_trgm" ON "users" USING gin ((coalesce("first_name", '') || ' ' || coalesce("last_name", '')) gin_trgm_ops);
