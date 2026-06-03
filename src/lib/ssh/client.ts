import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { Client } from "ssh2";
import type { SshClient, SshExecResult } from "./types";

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

function getPrivateKey(): string | undefined {
  const keyPath = process.env.SSH_PRIVATE_KEY_PATH;
  if (keyPath) {
    const full = resolve(process.cwd(), keyPath);
    if (existsSync(full)) {
      return readFileSync(full, "utf8");
    }
    // Datei fehlt – Fallback auf SSH_PRIVATE_KEY in .env.local
    const inline = process.env.SSH_PRIVATE_KEY?.trim();
    if (inline) {
      console.warn(
        `[ssh] SSH_PRIVATE_KEY_PATH not found (${full}), using SSH_PRIVATE_KEY from env. Run: pnpm setup:ssh-key`,
      );
      return normalizeKey(inline);
    }
    throw new Error(
      `SSH_PRIVATE_KEY_PATH not found: ${full}. Create the file or run: pnpm setup:ssh-key`,
    );
  }

  const inline = process.env.SSH_PRIVATE_KEY?.trim();
  if (!inline) return undefined;
  return normalizeKey(inline);
}

export class RealSshClient implements SshClient {
  private client: Client | null = null;

  private async connect(): Promise<Client> {
    if (this.client) return this.client;

    const host = process.env.SSH_HOST;
    const username = process.env.SSH_USER ?? "root";
    const privateKey = getPrivateKey();
    const port = parseInt(process.env.SSH_PORT ?? "22", 10);

    const password = process.env.SSH_PASSWORD;

    if (!host || (!privateKey && !password)) {
      throw new Error(
        "SSH_HOST and SSH_PRIVATE_KEY_PATH (or SSH_PRIVATE_KEY / SSH_PASSWORD) required for CHECK_MODE=ssh",
      );
    }

    return new Promise((resolve, reject) => {
      const client = new Client();
      client
        .on("ready", () => {
          this.client = client;
          resolve(client);
        })
        .on("error", (err) => {
          this.client = null;
          const hint =
            err.message.includes("authentication methods failed")
              ? " – Prüfe Key-Datei (SSH_PRIVATE_KEY_PATH), Passwort oder ob der Public Key auf dem Server in ~/.ssh/authorized_keys liegt."
              : "";
          reject(new Error(`${err.message}${hint}`));
        })
        .connect({
          host,
          port,
          username,
          privateKey: privateKey || undefined,
          password: password || undefined,
          readyTimeout: 20000,
          tryKeyboard: false,
        });
    });
  }

  async exec(command: string, timeoutMs = 30000): Promise<SshExecResult> {
    const client = await this.connect();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`SSH timeout: ${command}`)), timeoutMs);
      client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          reject(err);
          return;
        }
        let stdout = "";
        let stderr = "";
        stream
          .on("close", (code: number) => {
            clearTimeout(timer);
            resolve({ stdout, stderr, code: code ?? 0 });
          })
          .on("data", (d: Buffer) => {
            stdout += d.toString();
          });
        stream.stderr?.on("data", (d: Buffer) => {
          stderr += d.toString();
        });
      });
    });
  }
}
