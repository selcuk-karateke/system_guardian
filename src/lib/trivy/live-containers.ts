import { getSshClient } from "@/lib/ssh";

/** Running container names on the monitored host (`docker ps`). */
export async function listLiveContainerNames(
  serverId: string,
): Promise<Set<string>> {
  const ssh = await getSshClient(serverId);
  const { stdout } = await ssh.exec(
    "docker ps --format '{{.Names}}' 2>/dev/null",
    30_000,
  );
  const names = new Set<string>();
  for (const line of stdout.split("\n")) {
    const name = line.trim();
    if (name) names.add(name);
  }
  return names;
}
