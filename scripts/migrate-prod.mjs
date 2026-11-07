/**
 * Production migrate for Docker entrypoint (no drizzle-kit CLI).
 * Uses the same SQL folder as `npm run db:migrate`.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("migrate-prod: DATABASE_URL is required");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsFolder = resolve(root, "src/db/migrations");

const client = postgres(url, { max: 1 });
try {
  await migrate(drizzle(client), { migrationsFolder });
  console.log("migrate-prod: ok");
} finally {
  await client.end({ timeout: 5 });
}
