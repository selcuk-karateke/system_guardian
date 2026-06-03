import { RealSshClient } from "./client";
import { MockSshClient } from "./mock";
import type { SshClient } from "./types";

let instance: SshClient | null = null;

export function getSshClient(): SshClient {
  if (!instance) {
    const mode = process.env.CHECK_MODE ?? "mock";
    instance = mode === "ssh" ? new RealSshClient() : new MockSshClient();
  }
  return instance;
}

export function resetSshClient(): void {
  instance = null;
}

export type { SshClient, SshExecResult } from "./types";
