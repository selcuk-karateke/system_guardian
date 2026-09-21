export type ContainerCategory =
  | "coolify"
  | "wordpress"
  | "monitoring"
  | "database"
  | "app"
  | "other";

import { isCoolifyManagedMeta, type CoolifyMeta } from "./coolify-meta";

export interface ClassifiedContainer {
  name: string;
  image: string;
  state: string;
  category: ContainerCategory;
  foreignImage: boolean;
  displayName?: string;
  coolify?: CoolifyMeta;
}

const COOLIFY_IMAGE_PREFIXES = [
  "coolifyio/",
  "ghcr.io/coolify",
  "traefik",
  "coolify/",
];

const COOLIFY_NAME_PATTERNS = /coolify|traefik|realtime/i;

const WORDPRESS_PATTERNS =
  /wordpress|wp-nginx|wpcli|woo-commerce|wordpress:/i;

const MONITORING_PATTERNS =
  /prometheus|grafana|netdata|datadog|wazuh|falco|elastic|kibana|zabbix|nagios|uptime-kuma|beszel/i;

/** Coolify deploy: <id>-<timestamp> + image <id>:<git-sha> */
const COOLIFY_APP_NAME = /^[a-z0-9]{12,}-\d{10,}/;
const COOLIFY_APP_IMAGE = /^[a-z0-9]{12,}:[a-f0-9]{12,}$/i;
/** Coolify PR/preview: <id>:pr-2 oder Name …-pr-2 */
const COOLIFY_PREVIEW_IMAGE = /^[a-z0-9]{12,}:(pr-\d+|[\w.-]+)$/i;
const COOLIFY_PREVIEW_NAME = /-pr-\d+$/;

const KNOWN_APP_IMAGES =
  /vaultwarden|gotenberg|linuxserver\/nextcloud|nextcloud-releases|traefik/i;

/** Nur Image-ID ohne Registry/Tag-Struktur – oft manuell gestartet */
const BARE_IMAGE_ID = /^[a-f0-9]{12}$/i;

function isCoolifyDeployedApp(name: string, image: string): boolean {
  return (
    COOLIFY_APP_NAME.test(name) ||
    COOLIFY_APP_IMAGE.test(image) ||
    COOLIFY_PREVIEW_IMAGE.test(image) ||
    COOLIFY_PREVIEW_NAME.test(name)
  );
}

function matchesAny(text: string, patterns: (string | RegExp)[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) =>
    typeof p === "string" ? lower.includes(p.toLowerCase()) : p.test(text),
  );
}

export function classifyContainer(
  name: string,
  image: string,
  knownImagePrefixes: string[],
  coolify?: CoolifyMeta,
): ClassifiedContainer {
  const combined = `${name} ${image}`;
  let category: ContainerCategory = "other";

  if (isCoolifyManagedMeta(coolify) && coolify?.type === "database") {
    category = "database";
  } else if (
    matchesAny(combined, COOLIFY_IMAGE_PREFIXES) ||
    COOLIFY_NAME_PATTERNS.test(name)
  ) {
    category = "coolify";
  } else if (WORDPRESS_PATTERNS.test(combined)) {
    category = "wordpress";
  } else if (MONITORING_PATTERNS.test(combined)) {
    category = "monitoring";
  } else if (/postgres:|mysql:|mariadb:|redis:/i.test(image)) {
    category = "database";
  } else if (name && name !== image) {
    category = "app";
  }

  let foreignImage = false;
  if (isCoolifyManagedMeta(coolify)) {
    foreignImage = false;
  } else if (category === "other") {
    foreignImage = true;
  } else if (BARE_IMAGE_ID.test(image.split("/").pop() ?? image)) {
    foreignImage = true;
  } else if (
    category === "app" &&
    !isCoolifyDeployedApp(name, image) &&
    !KNOWN_APP_IMAGES.test(image) &&
    !knownImagePrefixes.some((prefix) =>
      image.toLowerCase().startsWith(prefix.toLowerCase()),
    )
  ) {
    foreignImage = true;
  }

  return {
    name,
    image,
    state: "running",
    category,
    foreignImage,
    coolify,
  };
}

export function summarizeInventory(containers: ClassifiedContainer[]): {
  byCategory: Record<ContainerCategory, string[]>;
  foreignRunning: ClassifiedContainer[];
  wordpressRunning: ClassifiedContainer[];
  monitoringRunning: ClassifiedContainer[];
  onlyCoolifyStack: boolean;
} {
  const byCategory: Record<ContainerCategory, string[]> = {
    coolify: [],
    wordpress: [],
    monitoring: [],
    database: [],
    app: [],
    other: [],
  };

  const running = containers.filter((c) => c.state === "running");

  for (const c of running) {
    byCategory[c.category].push(c.name);
  }

  const foreignRunning = running.filter((c) => c.foreignImage);
  const wordpressRunning = running.filter((c) => c.category === "wordpress");
  const monitoringRunning = running.filter((c) => c.category === "monitoring");

  const onlyCoolifyStack =
    running.length > 0 &&
    foreignRunning.length === 0 &&
    wordpressRunning.length === 0 &&
    byCategory.other.length === 0 &&
    monitoringRunning.length === 0;

  return {
    byCategory,
    foreignRunning,
    wordpressRunning,
    monitoringRunning,
    onlyCoolifyStack,
  };
}
