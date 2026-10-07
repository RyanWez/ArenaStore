CREATE TABLE IF NOT EXISTS "broadcasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"title" varchar(255),
	"message" text NOT NULL,
	"image_url" text,
	"button_text" varchar(128),
	"button_url" text,
	"target_audience" varchar(64) DEFAULT 'ALL' NOT NULL,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"blocked_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_broadcasts_actor_id" ON "broadcasts" ("actor_id");
CREATE INDEX IF NOT EXISTS "idx_broadcasts_status" ON "broadcasts" ("status");
CREATE INDEX IF NOT EXISTS "idx_broadcasts_created_at" ON "broadcasts" ("created_at");
