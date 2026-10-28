import { desc, eq } from "drizzle-orm";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { db } from "@/db";
import { servers } from "@/db/schema";
import { encryptSecret } from "@/lib/crypto/secret";
import { resetSshClient } from "@/lib/ssh/cache";

function normalizeKey(raw: string): string {
  let key = raw.replace(/\\n/g, "\n").trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key;
}

function readEnvPrivateKey(): string | null {
  const keyPath = process.env.SSH_PRIVATE_KEY_PATH;
  if (keyPath) {
    const full = resolve(/* turbopackIgnore: true */ process.cwd(), keyPath);
    if (existsSync(full)) return normalizeKey(readFileSync(full, "utf8"));
  }
  const inline = process.env.SSH_PRIVATE_KEY?.trim();
  return inline ? normalizeKey(inline) : null;
}

let seeded = false;

/**
 * One-time: copy global SSH_* into the oldest active server if it has no stored key.
 */
export async function ensurePrimaryServerSshFromEnv(): Promise<void> {
  if (seeded) return;
  seeded = true;

  const envHost = process.env.SSH_HOST?.trim();
  const envKey = readEnvPrivateKey();
  const envPassword = process.env.SSH_PASSWORD?.trim() || null;
  if (!envKey && !envPassword) return;

  const [primary] = await db
    .select()
    .from(servers)
    .where(eq(servers.isActive, true))
    .orderBy(servers.createdAt)
    .limit(1);

  if (!primary) return;
  if (primary.sshPrivateKeyEnc || primary.sshPasswordEnc) return;

  const sshUser = (process.env.SSH_USER ?? "root").trim();
  const sshPort = parseInt(process.env.SSH_PORT ?? "22", 10) || 22;

  try {
    await db
      .update(servers)
      .set({
        host: envHost || primary.host,
        ipv4: envHost || primary.ipv4,
        sshUser,
        sshPort,
        sshPrivateKeyEnc: envKey ? encryptSecret(envKey) : null,
        sshPasswordEnc: envPassword ? encryptSecret(envPassword) : null,
      })
      .where(eq(servers.id, primary.id));
    resetSshClient(primary.id);
  } catch {
    seeded = false;
  }
}

export type UpdateServerSshInput = {
  sshUser?: string | null;
  sshPort?: number | null;
  /** Plain private key; omit = leave; empty/null after explicit clear */
  privateKey?: string | null;
  password?: string | null;
  clearPrivateKey?: boolean;
  clearPassword?: boolean;
  host?: string | null;
  ipv4?: string | null;
};

export async function updateServerSsh(
  serverId: string,
  input: UpdateServerSshInput,
) {
  const [existing] = await db
    .select()
    .from(servers)
    .where(eq(servers.id, serverId))
    .limit(1);
  if (!existing) return null;

  const patch: Partial<typeof servers.$inferInsert> = {};

  if (input.host != null && input.host.trim()) {
    patch.host = input.host.trim();
  }
  if (input.ipv4 !== undefined) {
    patch.ipv4 = input.ipv4?.trim() || null;
  }
  if (input.sshUser !== undefined) {
    patch.sshUser = input.sshUser?.trim() || null;
  }
  if (input.sshPort !== undefined) {
    const p = input.sshPort;
    patch.sshPort = p != null && p > 0 && p < 65536 ? p : null;
  }
  if (input.clearPrivateKey) {
    patch.sshPrivateKeyEnc = null;
  } else if (typeof input.privateKey === "string" && input.privateKey.trim()) {
    patch.sshPrivateKeyEnc = encryptSecret(normalizeKey(input.privateKey));
  }
  if (input.clearPassword) {
    patch.sshPasswordEnc = null;
  } else if (typeof input.password === "string" && input.password.trim()) {
    patch.sshPasswordEnc = encryptSecret(input.password.trim());
  }

  if (Object.keys(patch).length === 0) return existing;

  const [updated] = await db
    .update(servers)
    .set(patch)
    .where(eq(servers.id, serverId))
    .returning();

  resetSshClient(serverId);
  return updated;
}

export async function listServersSshStatus() {
  const rows = await db
    .select({
      id: servers.id,
      name: servers.name,
      host: servers.host,
      ipv4: servers.ipv4,
      monitorProfile: servers.monitorProfile,
      sshUser: servers.sshUser,
      sshPort: servers.sshPort,
      sshPrivateKeyEnc: servers.sshPrivateKeyEnc,
      sshPasswordEnc: servers.sshPasswordEnc,
    })
    .from(servers)
    .where(eq(servers.isActive, true))
    .orderBy(desc(servers.createdAt));

  return rows.map(({ sshPrivateKeyEnc, sshPasswordEnc, ...r }) => ({
    ...r,
    hasKey: Boolean(sshPrivateKeyEnc),
    hasPassword: Boolean(sshPasswordEnc),
  }));
}
