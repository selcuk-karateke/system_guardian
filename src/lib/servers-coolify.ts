import { eq } from "drizzle-orm";
import { db } from "@/db";
import { servers } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret";
import { getServerById } from "@/lib/servers";

export type CoolifyApiCreds = {
  url: string;
  token: string;
};

function normalizeCoolifyUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return trimmed;
  } catch {
    return null;
  }
}

/** Resolve Coolify API for a server from DB only. */
export async function resolveCoolifyApi(
  serverId: string,
): Promise<CoolifyApiCreds | null> {
  const server = await getServerById(serverId);
  if (!server?.coolifyApiUrl || !server.coolifyApiTokenEnc) return null;
  try {
    const url = normalizeCoolifyUrl(server.coolifyApiUrl);
    const token = decryptSecret(server.coolifyApiTokenEnc).trim();
    if (url && token) return { url, token };
  } catch {
    return null;
  }
  return null;
}

export async function isCoolifyRedeployConfiguredForServer(
  serverId: string,
): Promise<boolean> {
  return Boolean(await resolveCoolifyApi(serverId));
}

export type UpdateServerCoolifyInput = {
  apiUrl?: string | null;
  apiToken?: string | null;
  clearToken?: boolean;
};

export async function updateServerCoolify(
  serverId: string,
  input: UpdateServerCoolifyInput,
) {
  const [existing] = await db
    .select()
    .from(servers)
    .where(eq(servers.id, serverId))
    .limit(1);
  if (!existing) return null;

  const patch: Partial<typeof servers.$inferInsert> = {};

  if (input.apiUrl !== undefined) {
    const url = input.apiUrl?.trim()
      ? normalizeCoolifyUrl(input.apiUrl)
      : null;
    if (input.apiUrl?.trim() && !url) {
      throw new Error("Coolify-URL ungültig (http/https nötig)");
    }
    patch.coolifyApiUrl = url;
  }
  if (input.clearToken) {
    patch.coolifyApiTokenEnc = null;
  } else if (typeof input.apiToken === "string" && input.apiToken.trim()) {
    patch.coolifyApiTokenEnc = encryptSecret(input.apiToken.trim());
  }

  if (Object.keys(patch).length === 0) return existing;

  const [updated] = await db
    .update(servers)
    .set(patch)
    .where(eq(servers.id, serverId))
    .returning();
  return updated;
}
