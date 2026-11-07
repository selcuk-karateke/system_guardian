import { getCheckMode } from "@/lib/config";
import { listActiveServers } from "@/lib/servers";

/** Resolve ?server= against active servers (newest first). */
export async function resolveSelectedServer(queryServer?: string) {
  const serverRows = await listActiveServers().catch(() => []);
  const selectedServerId =
    serverRows.find((s) => s.id === queryServer)?.id ??
    serverRows[0]?.id ??
    "";
  const selected = serverRows.find((s) => s.id === selectedServerId) ?? null;
  return { serverRows, selectedServerId, selected };
}

type DisplayServer = {
  name?: string | null;
  host?: string | null;
  ipv4?: string | null;
} | null | undefined;

/** Host label / IP for HUD + reports — always from DB server row, never ENV. */
export function displayHostFromServer(server: DisplayServer): {
  hostLabel: string;
  hostIp: string;
  homeIp: string | null;
} {
  const hostIp = server?.ipv4?.trim() || server?.host?.trim() || "—";
  const hostLabel = server?.name?.trim() || "Server";
  const ipv4 = server?.ipv4?.trim() || null;
  const host = server?.host?.trim() || null;
  const homeIp =
    ipv4 ||
    (host && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ? host : null);
  return { hostLabel, hostIp, homeIp };
}

/**
 * Legacy ENV SSH_HOST mismatch check — obsolete with per-server SSH in DB.
 * Kept for call sites; always reports no mismatch.
 */
export function sshTargetMismatch(_server: {
  host: string;
  ipv4: string | null;
}): { mismatch: boolean; sshHost: string | null; checkMode: string } {
  return {
    mismatch: false,
    sshHost: null,
    checkMode: getCheckMode(),
  };
}
