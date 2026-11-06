import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { servers } from "@/db/schema";

export function hashAgentToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function mintAgentTokenPlain(): string {
  return `sga_${randomBytes(32).toString("base64url")}`;
}

function hashesEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Issue a new agent token for a server. Returns plaintext once; stores SHA-256 hash.
 * Prefer `commitAgentToken` after a successful host deploy — rotating first causes 401 loops.
 */
export async function rotateAgentToken(
  serverId: string,
): Promise<{ token: string } | null> {
  const plain = mintAgentTokenPlain();
  const ok = await commitAgentToken(serverId, plain);
  if (!ok) return null;
  return { token: plain };
}

/** Persist hash only — call after the host already has `plain` in its env. */
export async function commitAgentToken(
  serverId: string,
  plain: string,
): Promise<boolean> {
  const hash = hashAgentToken(plain);
  const [row] = await db
    .update(servers)
    .set({ agentTokenHash: hash })
    .where(eq(servers.id, serverId))
    .returning({ id: servers.id });
  return Boolean(row);
}

export async function resolveServerByAgentToken(
  token: string,
): Promise<{ id: string; name: string } | null> {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length < 16) return null;
  const want = hashAgentToken(trimmed);
  const rows = await db
    .select({
      id: servers.id,
      name: servers.name,
      agentTokenHash: servers.agentTokenHash,
      isActive: servers.isActive,
    })
    .from(servers)
    .where(eq(servers.isActive, true));

  for (const row of rows) {
    if (!row.agentTokenHash) continue;
    if (hashesEqual(row.agentTokenHash, want)) {
      return { id: row.id, name: row.name };
    }
  }
  return null;
}

export async function touchAgentPresence(
  serverId: string,
  agentVersion: string | null,
): Promise<void> {
  await db
    .update(servers)
    .set({
      agentLastSeenAt: new Date(),
      agentVersion: agentVersion?.slice(0, 32) || null,
    })
    .where(eq(servers.id, serverId));
}
