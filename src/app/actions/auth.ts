"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isAuthEnabled, verifyCredentials } from "@/lib/auth/config";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";

export async function loginAction(formData: FormData): Promise<{ error?: string }> {
  if (!isAuthEnabled()) {
    return { error: "Auth not configured (AUTH_SECRET + user required)" };
  }

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!verifyCredentials(username, password)) {
    return { error: "Invalid username or password" };
  }

  const token = await createSessionToken(username);
  const jar = await cookies();
  const opts = sessionCookieOptions(token);
  jar.set(opts.name, opts.value, {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path,
    maxAge: opts.maxAge,
  });

  const next = String(formData.get("next") ?? "/").trim();
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  redirect(safeNext);
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
