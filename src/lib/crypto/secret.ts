import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "sg1";

function encryptionKey(): Buffer {
  const secret =
    process.env.SERVER_SECRET_KEY?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "";
  if (!secret || secret.length < 16) {
    throw new Error(
      "SERVER_SECRET_KEY oder AUTH_SECRET (min. 16 Zeichen) nötig zum Speichern von SSH-Secrets",
    );
  }
  return createHash("sha256").update(secret).digest();
}

/** Encrypt for DB storage. Format: sg1:<iv_b64>:<tag_b64>:<ct_b64> */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ct.toString("base64url"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Ungültiges Secret-Format");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function looksEncrypted(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(`${PREFIX}:`));
}
