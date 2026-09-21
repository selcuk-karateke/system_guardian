/**
 * Monitoring-Daten zurücksetzen (Alerts, Checks, Diffs, Snapshots).
 * Server + Domains bleiben. Nächster Cron legt neue Baselines an.
 *
 * npx tsx scripts/db-reset.ts
 * npm run db:reset
 */
import { config } from "dotenv";
import { resolve } from "path";
import { sql } from "drizzle-orm";
import { db } from "../src/db";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const TABLES = [
  "alerts",
  "change_events",
  "check_runs",
  "metrics_snapshots",
  "snapshots",
  "daily_reports",
] as const;

async function main() {
  console.log("Reset monitoring data (servers/domains unchanged)…\n");
  for (const table of TABLES) {
    await db.execute(sql.raw(`TRUNCATE TABLE ${table} CASCADE`));
    console.log(`  truncated ${table}`);
  }
  console.log("\nDone. Run checks once — new baselines, no deploy spam if Coolify-managed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
