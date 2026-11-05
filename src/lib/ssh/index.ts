import { getCheckMode } from "@/lib/config";
import { ensureRuntimeConfig } from "@/lib/runtime-config";
import { getServerById } from "@/lib/servers";
import {
  getCachedSshClient,
  resetSshClient,
  setCachedSshClient,
} from "./cache";
import { RealSshClient } from "./client";
import { MockSshClient } from "./mock";
import { resolveSshTarget } from "./target";
import type { SshClient } from "./types";

export { resetSshClient };

/**
 * SSH client for a monitored server.
 * Mock mode: shared mock. SSH mode: credentials from server row only.
 */
export async function getSshClient(serverId: string): Promise<SshClient> {
  await ensureRuntimeConfig().catch(() => null);

  if (getCheckMode() !== "ssh") {
    const key = "mock";
    let mock = getCachedSshClient(key);
    if (!mock) {
      mock = new MockSshClient();
      setCachedSshClient(key, mock);
    }
    return mock;
  }

  const cached = getCachedSshClient(serverId);
  if (cached) return cached;

  const server = await getServerById(serverId);
  if (!server || !server.isActive) {
    throw new Error(`Server ${serverId} nicht gefunden oder inaktiv`);
  }

  const client = new RealSshClient(resolveSshTarget(server));
  setCachedSshClient(serverId, client);
  return client;
}

export type { SshClient, SshExecResult } from "./types";
export type { SshTarget } from "./target";
