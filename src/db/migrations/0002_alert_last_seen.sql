ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp DEFAULT now() NOT NULL;
UPDATE