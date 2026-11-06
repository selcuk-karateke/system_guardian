"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isAuthEnabled } from "@/lib/auth/config";
import {
  createMfaPendingToken,
  MFA_PENDING_COOKIE,
  mfaPendingCookieOptions,
  verifyMfaPendingToken,
} from "@/lib/auth/mfa-pending";
import {
  createSessionToken,
  getSessionUser,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";
import {
  disableTotp,
  enableTotp,
  getTotpSecretPlain,
  isTotpRequired,
  setTotpPendingSecret,
  verifyUserPassword,
} from "@/lib/auth/users";
import {
  generateTotpSecret,
  totpQrDataUrl,
  totpUri,
  verifyTotpCode,
} from "@/lib/auth/totp";

export type LoginState = {
  error?: string;
  mfaRequired?: boolean;
  username?: string;
};

async function setSessionCookie(username: string) {
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
  jar.delete(MFA_PENDING_COOKIE);
}

function safeNext(raw: string): string {
  const next = raw.trim();
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function loginAction(
  _prev: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  if (!isAuthEnabled()) {
    return { error: "Auth not configured (AUTH_SECRET + user required)" };
  }

  const step = String(formData.get("step") ?? "password");
  const next = safeNext(String(formData.get("next") ?? "/"));

  if (step === "totp") {
    const jar = await cookies();
    const pendingUser = await verifyMfaPendingToken(
      jar.get(MFA_PENDING_COOKIE)?.value,
    );
    const username = pendingUser ?? String(formData.get("username") ?? "").trim();
    const code = String(formData.get("totp") ?? "").trim();
    if (!username) {
      return { error: "Session abgelaufen — erneut anmelden", mfaRequired: false };
    }
    const secret = await getTotpSecretPlain(username);
    if (!secret || !(await isTotpRequired(username))) {
      return { error: "2FA nicht aktiv — erneut anmelden" };
    }
    if (!verifyTotpCode(secret, username, code)) {
      return {
        error: "Ungültiger Authenticator-Code",
        mfaRequired: true,
        username,
      };
    }
    await setSessionCookie(username);
    redirect(next);
  }

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!(await verifyUserPassword(username, password))) {
    return { error: "Invalid username or password" };
  }

  if (await isTotpRequired(username)) {
    const pending = await createMfaPendingToken(username);
    const jar = await cookies();
    const opts = mfaPendingCookieOptions(pending);
    jar.set(opts.name, opts.value, {
      httpOnly: opts.httpOnly,
      secure: opts.secure,
      sameSite: opts.sameSite,
      path: opts.path,
      maxAge: opts.maxAge,
    });
    return { mfaRequired: true, username };
  }

  await setSessionCookie(username);
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(MFA_PENDING_COOKIE);
  redirect("/login");
}

export type TotpSetupState = {
  error?: string;
  ok?: string;
  qrDataUrl?: string;
  secret?: string;
  otpauthUrl?: string;
};

/** Start 2FA enrollment — returns QR; not enabled until confirm. */
export async function startTotpSetupAction(): Promise<TotpSetupState> {
  const user = await getSessionUser();
  if (!user) return { error: "Nicht angemeldet" };
  if (await isTotpRequired(user)) {
    return { error: "2FA ist bereits aktiv" };
  }
  const secret = generateTotpSecret();
  await setTotpPendingSecret(user, secret);
  const qrDataUrl = await totpQrDataUrl(secret, user);
  return {
    qrDataUrl,
    secret,
    otpauthUrl: totpUri(secret, user),
    ok: "QR mit Authenticator scannen, dann Code bestätigen",
  };
}

export async function confirmTotpSetupAction(
  formData: FormData,
): Promise<TotpSetupState> {
  const user = await getSessionUser();
  if (!user) return { error: "Nicht angemeldet" };
  const code = String(formData.get("totp") ?? "").trim();
  const secret = await getTotpSecretPlain(user);
  if (!secret) {
    return { error: "Kein Setup gestartet — zuerst QR erzeugen" };
  }
  if (!verifyTotpCode(secret, user, code)) {
    const qrDataUrl = await totpQrDataUrl(secret, user);
    return {
      error: "Code ungültig — erneut versuchen",
      qrDataUrl,
      secret,
      otpauthUrl: totpUri(secret, user),
    };
  }
  await enableTotp(user);
  return { ok: "2FA aktiv — Login verlangt ab jetzt den Code" };
}

export async function disableTotpAction(
  formData: FormData,
): Promise<TotpSetupState> {
  const user = await getSessionUser();
  if (!user) return { error: "Nicht angemeldet" };
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("totp") ?? "").trim();
  if (!(await verifyUserPassword(user, password))) {
    return { error: "Passwort falsch" };
  }
  if (await isTotpRequired(user)) {
    const secret = await getTotpSecretPlain(user);
    if (!secret || !verifyTotpCode(secret, user, code)) {
      return { error: "Authenticator-Code ungültig" };
    }
  }
  await disableTotp(user);
  return { ok: "2FA deaktiviert" };
}
