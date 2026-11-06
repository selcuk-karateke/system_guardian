import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";

const ISSUER = "System Guardian";

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function buildTotp(secretBase32: string, username: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
}

export function totpUri(secretBase32: string, username: string): string {
  return buildTotp(secretBase32, username).toString();
}

export async function totpQrDataUrl(
  secretBase32: string,
  username: string,
): Promise<string> {
  return QRCode.toDataURL(totpUri(secretBase32, username), {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 240,
    color: { dark: "#09090b", light: "#fafafa" },
  });
}

/** Window ±1 step (~30s). */
export function verifyTotpCode(
  secretBase32: string,
  username: string,
  token: string,
): boolean {
  const code = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return false;
  const delta = buildTotp(secretBase32, username).validate({
    token: code,
    window: 1,
  });
  return delta !== null;
}
