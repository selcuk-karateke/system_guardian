import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authUsers } from "@/db/schema";
import { getAuthUsers } from "@/lib/auth/config";
import { hashPassword, verifyPasswordHash } from "@/lib/auth/password";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret";

export type AuthRole = "admin" | "operator" | "viewer";

export type AuthUserRow = {
  username: string;
  role: AuthRole;
  totpEnabled: boolean;
  hasDbPassword: boolean;
  source: "env" | "db" | "both";
};

function parseRole(raw: string | null | undefined): AuthRole {
  if (raw === "viewer" || raw === "operator" || raw === "admin") return raw;
  return "admin";
}

export async function ensureAuthUserRow(
  username: string,
  role: AuthRole = "admin",
): Promise<void> {
  const [existing] = await db
    .select()
    .from(authUsers)
    .where(eq(authUsers.username, username))
    .limit(1);
  if (existing) return;
  await db.insert(authUsers).values({
    username,
    role,
    totpEnabled: false,
  });
}

/** Sync ENV usernames into auth_users (role admin, no overwrite). */
export async function syncEnvUsersToDb(): Promise<void> {
  for (const username of getAuthUsers().keys()) {
    await ensureAuthUserRow(username, "admin");
  }
}

export async function listAuthUsers(): Promise<AuthUserRow[]> {
  await syncEnvUsersToDb().catch(() => null);
  const envMap = getAuthUsers();
  const rows = await db.select().from(authUsers);
  const byName = new Map(rows.map((r) => [r.username, r]));

  const names = new Set([...envMap.keys(), ...byName.keys()]);
  const out: AuthUserRow[] = [];
  for (const username of [...names].sort()) {
    const row = byName.get(username);
    const inEnv = envMap.has(username);
    out.push({
      username,
      role: parseRole(row?.role),
      totpEnabled: Boolean(row?.totpEnabled && row.totpSecretEnc),
      hasDbPassword: Boolean(row?.passwordHash),
      source: inEnv && row?.passwordHash ? "both" : inEnv ? "env" : "db",
    });
  }
  return out;
}

export async function getAuthUser(username: string) {
  const [row] = await db
    .select()
    .from(authUsers)
    .where(eq(authUsers.username, username))
    .limit(1);
  return row ?? null;
}

export async function verifyUserPassword(
  username: string,
  password: string,
): Promise<boolean> {
  const envPass = getAuthUsers().get(username);
  if (envPass != null && envPass === password) return true;

  const row = await getAuthUser(username);
  if (row?.passwordHash) {
    return verifyPasswordHash(password, row.passwordHash);
  }
  return false;
}

export async function isTotpRequired(username: string): Promise<boolean> {
  const row = await getAuthUser(username);
  return Boolean(row?.totpEnabled && row.totpSecretEnc);
}

export async function getTotpSecretPlain(
  username: string,
): Promise<string | null> {
  const row = await getAuthUser(username);
  if (!row?.totpSecretEnc) return null;
  try {
    return decryptSecret(row.totpSecretEnc);
  } catch {
    return null;
  }
}

export async function setTotpPendingSecret(
  username: string,
  secretBase32: string,
): Promise<void> {
  await ensureAuthUserRow(username);
  await db
    .update(authUsers)
    .set({
      totpSecretEnc: encryptSecret(secretBase32),
      totpEnabled: false,
      updatedAt: new Date(),
    })
    .where(eq(authUsers.username, username));
}

export async function enableTotp(username: string): Promise<void> {
  await db
    .update(authUsers)
    .set({ totpEnabled: true, updatedAt: new Date() })
    .where(eq(authUsers.username, username));
}

export async function disableTotp(username: string): Promise<void> {
  await db
    .update(authUsers)
    .set({
      totpEnabled: false,
      totpSecretEnc: null,
      updatedAt: new Date(),
    })
    .where(eq(authUsers.username, username));
}

export async function createDbUser(input: {
  username: string;
  password: string;
  role: AuthRole;
}): Promise<{ ok: boolean; message: string }> {
  const username = input.username.trim();
  if (!/^[a-zA-Z0-9._-]{2,64}$/.test(username)) {
    return { ok: false, message: "Ungültiger Username" };
  }
  if (input.password.length < 10) {
    return { ok: false, message: "Passwort mind. 10 Zeichen" };
  }
  const existing = await getAuthUser(username);
  if (existing?.passwordHash || getAuthUsers().has(username)) {
    return { ok: false, message: "User existiert bereits" };
  }
  if (existing) {
    await db
      .update(authUsers)
      .set({
        passwordHash: hashPassword(input.password),
        role: input.role,
        updatedAt: new Date(),
      })
      .where(eq(authUsers.username, username));
  } else {
    await db.insert(authUsers).values({
      username,
      passwordHash: hashPassword(input.password),
      role: input.role,
      totpEnabled: false,
    });
  }
  return { ok: true, message: `User „${username}“ angelegt` };
}

export async function setUserRole(
  username: string,
  role: AuthRole,
): Promise<void> {
  await ensureAuthUserRow(username, role);
  await db
    .update(authUsers)
    .set({ role, updatedAt: new Date() })
    .where(eq(authUsers.username, username));
}

export async function deleteDbUser(username: string): Promise<{
  ok: boolean;
  message: string;
}> {
  if (getAuthUsers().has(username)) {
    return {
      ok: false,
      message: "ENV-User nicht löschbar — aus AUTH_USERS / AUTH_USERNAME entfernen",
    };
  }
  await db.delete(authUsers).where(eq(authUsers.username, username));
  return { ok: true, message: `User „${username}“ gelöscht` };
}

export async function getUserRole(username: string): Promise<AuthRole> {
  const row = await getAuthUser(username);
  return parseRole(row?.role);
}

export function roleCanWriteSettings(role: AuthRole): boolean {
  return role === "admin" || role === "operator";
}

export function roleCanManageUsers(role: AuthRole): boolean {
  return role === "admin";
}
