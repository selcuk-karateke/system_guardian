import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { servers } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto/secret";

export type SshTarget = {
  host: string;
  port: number;
  username: string;
  privateKey?: string;
  password?: string;
};

type ServerRow = typeof servers.$inferSelect;

function normalizeKey(raw: string): string {
  let key = raw.replace(/\\n/g, "\n").trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key;
}

function envPrivateKey(): string | undefined {
  const keyPath = process.env.SSH_PRIVATE_KEY_PATH;
  if (keyPath) {
    const full = resolve(process.cwd(), keyPath);
    if (existsSync(full)) return normalizeKey(readFileSync(full, "utf8"));
  }
  const inline = process.env.SSH_PRIVATE_KEY?.trim();
  return inline ? normalizeKey(inline) : undefined;
}

/** Build SSH target from server row; fall back to global SSH_* if row has no secrets. */
export function resolveSshTarget(server: ServerRow): SshTarget {
  const host =
    (server.ipv4?.trim() || server.host.trim() || process.env.SSH_HOST || "").trim();
  const username =
    (server.sshUser?.trim() || process.env.SSH_USER || "root").trim();
  const port =
    server.sshPort && server.sshPort > 0 && server.sshPort < 65536
      ? server.sshPort
      : parseInt(process.env.SSH_PORT ?? "22", 10) || 22;

  let privateKey: string | undefined;
  let password: string | undefined;

  if (server.sshPrivateKeyEnc) {
    try {
      privateKey = normalizeKey(decryptSecret(server.sshPrivateKeyEnc));
    } catch (e) {
      throw new Error(
        `SSH-Key für Server ${server.name} konnte nicht entschlüsselt werden: ${
          e instanceof Error ? e.message : "Fehler"
        }`,
      );
    }
  }
  if (server.sshPasswordEnc) {
    try {
      password = decryptSecret(server.sshPasswordEnc);
    } catch (e) {
      throw new Error(
        `SSH-Passwort für Server ${server.name} konnte nicht entschlüsselt werden: ${
          e instanceof Error ? e.message : "Fehler"
        }`,
      );
    }
  }

  if (!privateKey && !password) {
    privateKey = envPrivateKey();
    password = process.env.SSH_PASSWORD || undefined;
  }

  if (!host || (!privateKey && !password)) {
    throw new Error(
      `SSH für „${server.name}“ unvollständig — in Einstellungen Key hinterlegen oder SSH_* Env setzen`,
    );
  }

  return { host, port, username, privateKey, password };
}

export function serverHasStoredSshSecret(server: ServerRow): boolean {
  return Boolean(server.sshPrivateKeyEnc || server.sshPasswordEnc);
}
