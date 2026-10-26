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

/** True when inventory host/IP does not match the global SSH check target. */
export function sshTargetMismatch(server: {
  host: string;
  ipv4: string | null;
}): { mismatch: boolean; sshHost: string | null; checkMode: string } {
  const checkMode = process.env.CHECK_MODE ?? "mock";
  const sshHost = process.env.SSH_HOST?.trim() || null;
  if (checkMode !== "ssh" || !sshHost) {
    return { mismatch: false, sshHost, checkMode };
  }
  const hosts = new Set(
    [server.host, server.ipv4].filter(Boolean).map((h) => h!.toLowerCase()),
  );
  return {
    mismatch: !hosts.has(sshHost.toLowerCase()),
    sshHost,
    checkMode,
  };
}
