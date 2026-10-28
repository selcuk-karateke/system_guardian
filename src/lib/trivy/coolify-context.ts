import type { CoolifyMeta } from "@/lib/checks/coolify-meta";
import { normalizeContainerName } from "@/lib/checks/coolify-meta";
import { getLatestCheckByModule } from "@/lib/dashboard-data";

/** Coolify-Labels aus dem letzten Docker-Check für einen Container. */
export async function getCoolifyMetaForContainer(
  serverId: string,
  containerName: string,
): Promise<CoolifyMeta | undefined> {
  const docker = await getLatestCheckByModule("docker", serverId);
  const containers =
    (
      docker?.data as {
        containers?: Array<{ Names: string; coolify?: CoolifyMeta }>;
      }
    )?.containers ?? [];
  const key = normalizeContainerName(containerName);
  const row = containers.find(
    (c) => normalizeContainerName(c.Names) === key,
  );
  return row?.coolify;
}

export async function getCoolifyMetaMap(
  serverId: string,
): Promise<Map<string, CoolifyMeta>> {
  const docker = await getLatestCheckByModule("docker", serverId);
  const containers =
    (
      docker?.data as {
        containers?: Array<{ Names: string; coolify?: CoolifyMeta }>;
      }
    )?.containers ?? [];
  const map = new Map<string, CoolifyMeta>();
  for (const c of containers) {
    if (c.coolify) {
      map.set(normalizeContainerName(c.Names), c.coolify);
    }
  }
  return map;
}
