import { Client } from "ssh2";
import type { SshClient, SshExecResult } from "./types";

function getPrivateKey(): string | undefined {
  if (process.env.SSH_PRIVATE_KEY) {
    return process.env.SSH_PRIVATE_KEY.replace(/\\n/g, "\n");
  }
  return undefined;
}

export class RealSshClient implements SshClient {
  private client: Client | null = null;

  private async connect(): Promise<Client> {
    if (this.client) return this.client;

    const host = process.env.SSH_HOST;
    const username = process.env.SSH_USER ?? "root";
    const privateKey = getPrivateKey();
    const port = parseInt(process.env.SSH_PORT ?? "22", 10);

    if (!host || !privateKey) {
      throw new Error("SSH_HOST and SSH_PRIVATE_KEY required for CHECK_MODE=ssh");
    }

    return new Promise((resolve, reject) => {
      const client = new Client();
      client
        .on("ready", () => {
          this.client = client;
          resolve(client);
        })
        .on("error", reject)
        .connect({ host, port, username, privateKey });
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
