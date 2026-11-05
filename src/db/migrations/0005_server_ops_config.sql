ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "coolify_api_url" varchar(512);
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "coolify_api_token_enc" text;
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "backup_paths" text;
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "backup_monitoring_dir" varchar(512);
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "backup_trigger_command" text;
