import { getAuthSecret } from "./config";

export const MFA_PENDING_COOKIE = "sg_mfa_pending";
const MAX_AGE_SEC = 5 * 60;

type PendingPayload = { u: string; exp: number };

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return Buffer.from(sig).toString("base64url");
}

export async function createMfaPendingToken(username: string): Promise<string> {
  const secret = getAuthSecret();
  if (!secret) throw new Error("AUTH_SECRET not configured");
  const payload: PendingPayload = {
    u: username,
    exp: Date.now() + MAX_AGE_SEC * 1000,
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = await hmacSign(b64, secret);
  return `${b64}.${sig}`;
}

export async function verifyMfaPendingToken(
  token: string | undefined,
): Promise<string | null> {
  if (!token) return null;
  const secret = getAuthSecret();
  if (!secret) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacSign(b64, secret);
  if (sig.length !== expected.length) return null;
  let match = 0;
  for (let i = 0; i < sig.length; i++) {
    match |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (match !== 0) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(b64, "base64url").toString("utf8"),
    ) as PendingPayload;
    if (!payload.u || payload.exp < Date.now()) return null;
    return payload.u;
  } catch {
    return null;
  }
}

export function mfaPendingCookieOptions(token: string) {
  return {
    name: MFA_PENDING_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SEC,
  };
}
