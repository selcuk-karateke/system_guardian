import { runCheckWithPersist } from "@/lib/alerts/pipeline";
import { runCoolifyCheck } from "@/lib/checks/coolify";
import { runDockerCheck } from "@/lib/checks/docker";

/** Max. Alter der Docker-Liste auf /docker bevor wir live nachziehen. */
export const DOCKER_PAGE_STALE_MS = 90_000;

export function isDockerCheckStale(checkedAt: Date | null | undefined): boolean {
  if (!checkedAt) return true;
  return Date.now() - checkedAt.getTime() > DOCKER_PAGE_STALE_MS;
}

/** Live docker ps + Coolify-Dienste für die Inventar-Seite. */
export async function refreshDockerInventory(serverId: string): Promise<void> {
  await runCheckWithPersist(serverId, runDockerCheck);
  await runCheckWithPersist(serverId, runCoolifyCheck);
}
