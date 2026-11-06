import { getSessionUser } from "@/lib/auth/session";
import {
  getUserRole,
  roleCanManageUsers,
  roleCanWriteSettings,
  type AuthRole,
} from "@/lib/auth/users";

export async function requireSessionUser(): Promise<
  { ok: true; username: string; role: AuthRole } | { ok: false; message: string }
> {
  const username = await getSessionUser();
  if (!username) return { ok: false, message: "Nicht angemeldet" };
  const role = await getUserRole(username);
  return { ok: true, username, role };
}

export async function requireSettingsWrite(): Promise<
  { ok: true; username: string; role: AuthRole } | { ok: false; message: string }
> {
  const session = await requireSessionUser();
  if (!session.ok) return session;
  if (!roleCanWriteSettings(session.role)) {
    return { ok: false, message: "Keine Berechtigung (viewer)" };
  }
  return session;
}

export async function requireUserAdmin(): Promise<
  { ok: true; username: string; role: AuthRole } | { ok: false; message: string }
> {
  const session = await requireSessionUser();
  if (!session.ok) return session;
  if (!roleCanManageUsers(session.role)) {
    return { ok: false, message: "Nur Admins" };
  }
  return session;
}
