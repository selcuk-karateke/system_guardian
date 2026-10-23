ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "monitor_profile" varchar(32) DEFAULT 'host' NOT NULL;
