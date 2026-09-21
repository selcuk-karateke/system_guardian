import { config } from "dotenv";
import { resolve } from "path";
import postgres from "postgres";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("DATABASE_URL fehlt in .env.local");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  try {
    const max = await sql`SHOW max_connections`;
    const n = await sql`
      SELECT count(*)::int as n
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    const ok = await sql`SELECT 1 as ok`;
    console.log("OK:", ok[0].ok);
    console.log("Verbindungen zu dieser DB:", n[0].n);
    console.log("max_connections:", max[0].max_connections);
  } catch (e) {
    console.error("Fehler:", e);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
