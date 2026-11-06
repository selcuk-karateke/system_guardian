"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import {
  createDbUser,
  deleteDbUser,
  getUserRole,
  listAuthUsers,
  roleCanManageUsers,
  setUserRole,
  type AuthRole,
} from "@/lib/auth/users";

export type UserActionResult = { ok: boolean; message: string };

async function requireAdmin(): Promise<
  { ok: true; username: string } | { ok: false; message: string }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Nicht angemeldet" };
  const role = await getUserRole(user);
  if (!roleCanManageUsers(role)) {
    return { ok: false, message: "Nur Admins dürfen Benutzer verwalten" };
  }
  return { ok: true, username: user };
}

export async function listUsersAction() {
  return listAuthUsers();
}

export async function createUserAction(
  formData: FormData,
): Promise<UserActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const result = await createDbUser({
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    role: (String(formData.get("role") ?? "viewer") as AuthRole) || "viewer",
  });
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function setRoleAction(
  formData: FormData,
): Promise<UserActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const username = String(formData.get("username") ?? "").trim();
  const role = String(formData.get("role") ?? "viewer") as AuthRole;
  if (!username) return { ok: false, message: "Username fehlt" };
  if (username === gate.username && role !== "admin") {
    return { ok: false, message: "Eigenen Admin-Status nicht entziehen" };
  }
  await setUserRole(username, role);
  revalidatePath("/settings");
  return { ok: true, message: `Rolle für „${username}“ → ${role}` };
}

export async function deleteUserAction(
  formData: FormData,
): Promise<UserActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const username = String(formData.get("username") ?? "").trim();
  if (username === gate.username) {
    return { ok: false, message: "Eigenen Account nicht löschen" };
  }
  const result = await deleteDbUser(username);
  if (result.ok) revalidatePath("/settings");
  return result;
}
