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

/** Build SSH target from server row only (no ENV fallback). */
export function resolveSshTarget(server: ServerRow): SshTarget {
  const host = (server.ipv4?.trim() || server.host.trim() || "").trim();
  const username = (server.sshUser?.trim() || "root").trim();
  const port =
    server.sshPort && server.sshPort > 0 && server.sshPort < 65536
      ? server.sshPort
      : 22;

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

  if (!host || (!privateKey && !password)) {
    throw new Error(
      `SSH für „${server.name}“ unvollständig — unter Einstellungen → Server Key/Passwort hinterlegen`,
    );
  }

  return { host, port, username, privateKey, password };
}

export function serverHasStoredSshSecret(server: ServerRow): boolean {
  return Boolean(server.sshPrivateKeyEnc || server.sshPasswordEnc);
}
