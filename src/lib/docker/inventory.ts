import {
  classifyContainer,
  type ContainerCategory,
} from "@/lib/checks/docker-inventory";
import { formatContainerDisplay } from "@/lib/checks/coolify-meta";
import { getKnownDockerImagePrefixes } from "@/lib/config";
import type { CoolifyMeta } from "@/lib/checks/coolify-meta";

export const INVENTORY_CATEGORY_ORDER: ContainerCategory[] = [
  "app",
  "wordpress",
  "database",
  "coolify",
  "monitoring",
  "other",
];

export const INVENTORY_CATEGORY_LABELS: Record<ContainerCategory, string> = {
  app: "Apps",
  wordpress: "WordPress",
  database: "Datenbanken",
  coolify: "Coolify / Proxy",
  monitoring: "Monitoring",
  other: "Sonstige",
};

export type DockerInventoryRow = {
  name: string;
  displayName: string;
  image: string;
  state: string;
  status: string;
  category: ContainerCategory;
  foreignImage: boolean;
  fqdn?: string;
  environmentName?: string;
  coolifyType?: string;
};

export type DockerInventoryGroup = {
  category: ContainerCategory;
  label: string;
  rows: DockerInventoryRow[];
};

type RawContainer = {
  Names: string;
  Image?: string;
  Status: string;
  State: string;
  displayName?: string;
  coolify?: CoolifyMeta;
};

export function buildDockerInventoryGroups(
  containers: RawContainer[],
): DockerInventoryGroup[] {
  const prefixes = getKnownDockerImagePrefixes();
  const rows: DockerInventoryRow[] = containers.map((c) => {
    const classified = classifyContainer(
      c.Names,
      c.Image ?? "",
      prefixes,
      c.coolify,
    );
    return {
      name: c.Names,
      displayName:
        c.displayName ?? formatContainerDisplay(c.Names, c.coolify),
      image: c.Image ?? "—",
      state: c.State,
      status: c.Status,
      category: classified.category,
      foreignImage: classified.foreignImage,
      fqdn: c.coolify?.fqdn,
      environmentName: c.coolify?.environmentName,
      coolifyType: c.coolify?.type,
    };
  });

  rows.sort((a, b) => {
    const cat =
      INVENTORY_CATEGORY_ORDER.indexOf(a.category) -
      INVENTORY_CATEGORY_ORDER.indexOf(b.category);
    if (cat !== 0) return cat;
    return a.displayName.localeCompare(b.displayName);
  });

  const groups: DockerInventoryGroup[] = [];
  for (const category of INVENTORY_CATEGORY_ORDER) {
    const groupRows = rows.filter((r) => r.category === category);
    if (groupRows.length === 0) continue;
    groups.push({
      category,
      label: INVENTORY_CATEGORY_LABELS[category],
      rows: groupRows,
    });
  }
  return groups;
}
