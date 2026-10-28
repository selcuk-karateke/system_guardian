import type { SshClient } from "./types";

const cache = new Map<string, SshClient>();

export function getCachedSshClient(key: string): SshClient | undefined {
  return cache.get(key);
}

export function setCachedSshClient(key: string, client: SshClient): void {
  cache.set(key, client);
}

export function resetSshClient(serverId?: string): void {
  if (serverId) {
    cache.delete(serverId);
    return;
  }
  cache.clear();
}
