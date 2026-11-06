CREATE TABLE IF NOT EXISTS "auth_users" (
  "username" varchar(64) PRIMARY KEY,
  "password_hash" text,
  "role" varchar(16) DEFAULT 'admin' NOT NULL,
  "totp_secret_enc" text,
  "totp_enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
