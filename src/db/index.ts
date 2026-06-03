import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { resolve } from "path";
import * as schema from "./schema";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is missing. Set it in .env.local (see .env.example).",
  );
}

const client = postgres(connectionString, { max: 10 });
export const db = drizzle(client, { schema });

export type Database = typeof db;
