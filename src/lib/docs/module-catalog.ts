/**
 * Single source of truth for check-module docs (summaries + batch).
 * `npm run docs:check` fails if this drifts from registered checks / labels / OpenAPI.
 */
export type CheckBatch = "server" | "security";

export type ModuleCatalogEntry = {
  id: string;
  batch: CheckBatch;
  /** Short ops-facing summary shown in /docs/sysadmin */
  summary: string;
};

export const MODULE_CATALOG: readonly ModuleCatalogEntry[] = [
  { id: "server_health", batch: "server", summary: "CPU, RAM, Disk, Load" },
  { id: "raid", batch: "server", summary: "/proc/mdstat (RAID_CHECK_ENABLED)" },
  { id: "docker", batch: "server", summary: "Container-Status, Images, Restarts" },
  { id: "coolify", batch: "server", summary: "Coolify-Dienste / Meta" },
  { id: "database", batch: "server", summary: "DB-Erreichbarkeit" },
  { id: "ssl", batch: "server", summary: "Zertifikat-Ablauf" },
  {
    id: "website",
    batch: "server",
    summary: "HTTP(S)-Erreichbarkeit, Redirect zu HTTPS, HSTS",
  },
  { id: "ports", batch: "server", summary: "Listening vs. Baseline + KNOWN_PORTS" },
  { id: "backups", batch: "server", summary: "Alter/Größe unter BACKUP_PATHS" },
  { id: "logs", batch: "server", summary: "journal ERROR/FATAL/OOM" },
  { id: "fim", batch: "security", summary: "Datei-Hashes unter FIM_PATHS" },
  { id: "ssh_keys", batch: "security", summary: "authorized_keys Änderungen" },
  { id: "users", batch: "security", summary: "neue User / UID 0" },
  {
    id: "logins",
    batch: "security",
    summary: "SSH Who's Online, Root-Login, Failed Auth, fail2ban",
  },
  {
    id: "web_presence",
    batch: "security",
    summary: "Coolify/Traefik Access-Logs (Unique-IPs, Bots, Top-Pfade)",
  },
  { id: "cron", batch: "security", summary: "Crontab-Änderungen" },
  { id: "processes", batch: "security", summary: "hohe CPU / verdächtige Muster" },
  { id: "network", batch: "security", summary: "Outbound ss-Peers vs. Baseline" },
  { id: "scanner", batch: "security", summary: "nmap/masscan o.ä." },
  { id: "services", batch: "security", summary: "systemd failed units" },
  {
    id: "security_posture",
    batch: "security",
    summary: "IOC-light / Blocklist / verdächtige Connections",
  },
  {
    id: "trivy",
    batch: "security",
    summary: "Image-CVEs (HIGH/CRITICAL) → Alerts; Batch-Scan per Cron",
  },
] as const;

export function modulesForBatch(batch: CheckBatch): ModuleCatalogEntry[] {
  return MODULE_CATALOG.filter((m) => m.batch === batch);
}

export function catalogModuleIds(): string[] {
  return MODULE_CATALOG.map((m) => m.id);
}
