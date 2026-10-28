ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "ssh_user" varchar(64);
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "ssh_port" integer;
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "ssh_private_key_enc" text;
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "ssh_password_enc" text;
