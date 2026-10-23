import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { servers } from "@/db/schema";

export async function getDefaultServerId(): Promise<string> {
  const rows = await db
    .select()
    .from(servers)
    .where(eq(servers.isActive, true))
    .limit(1);

  if (rows[0]) return rows[0].id;

  const [created] = await db
    .insert(servers)
    .values({
      name: process.env.SSH_HOST ?? "Primary Server",
      host: process.env.SSH_HOST ?? "localhost",
      ipv4: process.env.SSH_HOST,
    })
    .returning();

  return created.id;
}

export async function listActiveServers() {
  return db
    .select()
    .from(servers)
    .where(eq(servers.isActive, true))
    .orderBy(desc(servers.createdAt));
}

export async function getServerById(id: string) {
  const [row] = await db
    .select()
    .from(servers)
    .where(eq(servers.id, id))
    .limit(1);
  return row ?? null;
}
