import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { servers } from "@/db/schema";
import {
  parseMonitorProfile,
  type MonitorProfile,
} from "@/lib/monitor-profiles";

export type CreateServerInput = {
  name: string;
  host: string;
  ipv4?: string | null;
  ipv6?: string | null;
  monitorProfile?: MonitorProfile | string;
};

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

export async function createServer(input: CreateServerInput) {
  const name = input.name.trim();
  const host = input.host.trim();
  if (!name || !host) {
    throw new Error("Name und Host sind Pflicht");
  }
  const profile = parseMonitorProfile(input.monitorProfile);
  const ipv4 = input.ipv4?.trim() || null;
  const ipv6 = input.ipv6?.trim() || null;

  const [created] = await db
    .insert(servers)
    .values({
      name,
      host,
      ipv4,
      ipv6,
      monitorProfile: profile,
      isActive: true,
    })
    .returning();

  return created;
}

export async function deactivateServer(id: string) {
  const [row] = await db
    .update(servers)
    .set({ isActive: false })
    .where(eq(servers.id, id))
    .returning();
  return row ?? null;
}
