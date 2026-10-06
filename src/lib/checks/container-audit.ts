import { getTrustedShellProcessPatterns } from "@/lib/config";
import type { ContainerCategory } from "@/lib/checks/docker-inventory";

export type AppRole =
  | "coolify-app"
  | "web"
  | "worker"
  | "n8n"
  | "nextcloud"
  | "vaultwarden"
  | "gotenberg"
  | "unknown-app";

const N8N = /n8n/i;
const WEB = /nginx|node|next|php|apache|uvicorn|gunicorn|fastapi|rails/i;
const WORKER = /worker|queue|bull|sidekiq|celery|scheduler/i;

export function detectAppRole(name: string, image: string): AppRole {
  const combined = `${name} ${image}`;
  if (N8N.test(combined)) return "n8n";
  if (/nextcloud/i.test(combined)) return "nextcloud";
  if (/vaultwarden/i.test(combined)) return "vaultwarden";
  if (/gotenberg/i.test(combined)) return "gotenberg";
  if (/^[a-z0-9]{12,}-\d{10,}/.test(name) || /^[a-z0-9]{12,}:[a-f0-9]{12,}$/i.test(image)) {
    return "coolify-app";
  }
  if (WEB.test(combined)) return "web";
  if (WORKER.test(combined)) return "worker";
  return "unknown-app";
}

export function shouldAuditContainer(category: ContainerCategory): boolean {
  return category === "app" || category === "wordpress" || category === "other";
}

/** Log lines that may indicate outbound malware / C2 */
export const LOG_IOC_PATTERNS: RegExp[] = [
  /216\.218\.185\.162/,
  /xlgelllulyrhpbjmn\.org/i,
  /yxmvknylyxtt\.org/i,
  /\bcurl\s+https?:\/\//i,
  /\bwget\s+https?:\/\//i,
  /\b(nc|ncat)\s+/i,
  /curl\s[^\n|]*\|\s*(ba)?sh/i,
  /\/dev\/tcp\//,
  /stratum\+tcp/i,
  /\bxmrig\b/i,
];

export const PROCESS_IOC_PATTERNS: RegExp[] = [
  /\b(curl|wget|nc|ncat|python3?|perl|ruby)\b/i,
  /\b(sh|bash|dash)\b/i,
];

export function findIocLines(text: string): string[] {
  const hits: string[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (LOG_IOC_PATTERNS.some((re) => re.test(t))) hits.push(t.slice(0, 300));
  }
  return hits;
}

const NORMAL_STARTUP =
  /sh -c (next start|npm start|node dist|prisma migrate)|\/bin\/sh -c npm|next-server|node\s+.*\/node_modules/i;

/** Coolify/Node startup shells — not IOC (used by security_posture + processes). */
export function isBenignShellProcessLine(line: string): boolean {
  if (NORMAL_STARTUP.test(line)) return true;
  return getTrustedShellProcessPatterns().some((re) => re.test(line));
}

export function findSuspiciousProcesses(topStdout: string): string[] {
  const lines = topStdout.split("\n").slice(1);
  const hits: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (isBenignShellProcessLine(line)) continue;
    if (/postgres|mysqld|redis-server|nginx:|vaultwarden|gotenberg/i.test(line)) {
      continue;
    }
    if (PROCESS_IOC_PATTERNS.some((re) => re.test(line))) {
      hits.push(line.trim().slice(0, 200));
    }
  }
  return hits;
}
