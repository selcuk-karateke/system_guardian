import type { CoolifyMeta } from "@/lib/checks/coolify-meta";
import { formatContainerAlert, formatContainerDisplay } from "@/lib/checks/coolify-meta";

export type ContainerRow = {
  Names: string;
  Image?: string;
  State?: string;
  displayName?: string;
  coolify?: CoolifyMeta;
};

export function buildCoolifyLookup(
  containers?: ContainerRow[],
): Map<string, CoolifyMeta | undefined> {
  const map = new Map<string, CoolifyMeta | undefined>();
  for (const c of containers ?? []) {
    map.set(c.Names, c.coolify);
  }
  return map;
}

export function resolveContainerLabel(
  technicalName: string,
  lookup?: Map<string, CoolifyMeta | undefined>,
): string {
  const meta = lookup?.get(technicalName);
  return formatContainerDisplay(technicalName, meta);
}

export function resolveContainerAlertLabel(
  technicalName: string,
  lookup?: Map<string, CoolifyMeta | undefined>,
): string {
  const meta = lookup?.get(technicalName);
  return formatContainerAlert(technicalName, meta);
}

export function enrichDockerChangeKey(
  category: string,
  entityKey: string,
  lookup?: Map<string, CoolifyMeta | undefined>,
): string {
  if (category !== "docker_containers") return entityKey;
  return resolveContainerAlertLabel(entityKey, lookup);
}
