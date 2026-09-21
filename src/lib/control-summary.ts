import type { ClearanceItem } from "@/lib/checks/incident-clearance";
import {
  effectiveModuleStatus,
  getChangeEvents,
  getLatestCheckByModule,
  getRecentAlerts,
} from "@/lib/dashboard-data";
import { buildCoolifyLookup, resolveContainerAlertLabel } from "@/lib/docker-display";

export interface OpenIssue {
  severity: "critical" | "warning" | "info";
  source: string;
  message: string;
}

export async function getOpenControlIssues(): Promise<OpenIssue[]> {
  const issues: OpenIssue[] = [];
  const modules = [
    "security_posture",
    "incident_clearance",
    "services",
    "docker",
    "network",
    "processes",
    "cron",
  ] as const;

  const openAlerts = await getRecentAlerts(50);
  const alertsByModule = new Map<string, typeof openAlerts>();
  for (const a of openAlerts) {
    const list = alertsByModule.get(a.module) ?? [];
    list.push(a);
    alertsByModule.set(a.module, list);
  }

  for (const mod of modules) {
    const check = await getLatestCheckByModule(mod);
    if (!check) continue;
    const effective = effectiveModuleStatus(
      check.status,
      alertsByModule.get(mod) ?? [],
    );
    if (effective === "critical" || effective === "warning") {
      issues.push({
        severity: effective,
        source: mod,
        message: `${mod}: Status ${effective}`,
      });
    }
    if (mod === "security_posture" || mod === "incident_clearance") {
      const data = check.data as {
        iocItems?: ClearanceItem[];
        sshItems?: ClearanceItem[];
        failCount?: number;
      };
      for (const item of data.iocItems ?? []) {
        if (item.status === "fail") {
          issues.push({
            severity: "critical",
            source: "security_posture",
            message: item.label,
          });
        }
      }
      for (const item of data.sshItems ?? []) {
        if (item.status === "warn" || item.status === "fail") {
          issues.push({
            severity: "warning",
            source: "security_posture",
            message: `${item.label}: ${item.detail}`,
          });
        }
      }
    }
    if (mod === "docker") {
      const inv = (check.data as { inventory?: { foreignRunning?: unknown[] } })
        ?.inventory;
      if (inv?.foreignRunning?.length) {
        issues.push({
          severity: "warning",
          source: "docker",
          message: `${inv.foreignRunning.length} Container mit unklarer Image-ID`,
        });
      }
    }
  }

  const dockerCheck = await getLatestCheckByModule("docker");
  const coolifyLookup = buildCoolifyLookup(
    (dockerCheck?.data as { containers?: Parameters<typeof buildCoolifyLookup>[0] })
      ?.containers,
  );

  const changes = await getChangeEvents(15);
  for (const c of changes) {
    if (c.changeType === "removed" && c.category === "docker_containers") {
      issues.push({
        severity: "info",
        source: "change",
        message: `Container entfernt: ${resolveContainerAlertLabel(c.entityKey, coolifyLookup)}`,
      });
    }
    if (c.changeType === "added" && c.category === "outbound_connections") {
      issues.push({
        severity: "warning",
        source: "network",
        message: `Neue Outbound-Verbindung: ${c.entityKey.slice(0, 80)}`,
      });
    }
  }

  for (const a of openAlerts) {
    if (a.level === "critical" || a.level === "warning") {
      issues.push({
        severity: a.level,
        source: a.module,
        message: a.message,
      });
    }
  }

  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.source}:${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
