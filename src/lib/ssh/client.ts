import { Client } from "ssh2";
import type { SshTarget } from "./target";
import type { SshClient, SshExecResult } from "./types";

export class RealSshClient implements SshClient {
  private client: Client | null = null;
  private readonly target: SshTarget;

  constructor(target: SshTarget) {
    this.target = target;
  }

  private async connect(): Promise<Client> {
    if (this.client) return this.client;

    const { host, port, username, privateKey, password } = this.target;

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
              ? " – Prüfe Key/Passwort und authorized_keys auf dem Zielhost."
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
      const timer = setTimeout(
        () => reject(new Error(`SSH timeout: ${command}`)),
        timeoutMs,
      );
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
