import { config } from "dotenv";
import { resolve } from "path";
import postgres from "postgres";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const before = await sql`
      select column_name
      from information_schema.columns
      where table_name = 'servers' and column_name like 'ssh%'
      order by 1
    `;
    console.log(
      "before",
      before.map((c) => c.column_name),
    );

    await sql.unsafe(`
      ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "ssh_user" varchar(64);
      ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "ssh_port" integer;
      ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "ssh_private_key_enc" text;
      ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "ssh_password_enc" text;
    `);

    const after = await sql`
      select column_name
      from information_schema.columns
      where table_name = 'servers' and column_name like 'ssh%'
      order by 1
    `;
    console.log(
      "after",
      after.map((c) => c.column_name),
    );

    const mig = await sql`
      select id, created_at
      from drizzle.__drizzle_migrations
      order by created_at
    `;
    console.log(
      "migrations",
      mig.map((m) => ({ id: m.id, at: m.created_at })),
    );
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
