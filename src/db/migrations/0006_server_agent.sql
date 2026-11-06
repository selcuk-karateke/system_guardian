ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "agent_token_hash" text;
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "agent_last_seen_at" timestamp;
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "agent_version" varchar(32);
