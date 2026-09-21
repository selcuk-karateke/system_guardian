import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  alerts,
  changeEvents,
  checkRuns,
  metricsSnapshots,
  monitoredDomains,
  servers,
} from "@/db/schema";
import { getCheckMode, worstStatus } from "@/lib/config";
import {
  MONITOR_MODULE_ORDER,
  MONITOR_PLACEHOLDER_MODULES,
} from "@/lib/module-labels";
import type { CheckStatus } from "@/lib/checks/types";

export type GlobalStatus = "healthy" | "warning" | "critical";

type ModuleStatusRow = { module: string; status: string; at: Date | null };

/** Worst level from unresolved warning/critical alerts for one module. */
function statusFromOpenAlerts(
  rows: { level: string }[],
): CheckStatus | null {
  let worst: CheckStatus = "healthy";
  for (const a of rows) {
    if (a.level === "critical") return "critical";
    if (a.level === "warning") worst = "warning";
  }
  return worst === "healthy" ? null : worst;
}

/**
 * Check-Run-Status + offene Alerts zusammenführen.
 * Entschärfte Alerts senken den angezeigten Status — sonst bleibt WARNING hängen.
 */
export function effectiveModuleStatus(
  checkStatus: string,
  openAlerts: { level: string }[],
): CheckStatus {
  const fromAlerts = statusFromOpenAlerts(openAlerts);
  if (fromAlerts) return fromAlerts;
  if (checkStatus === "warning" || checkStatus === "critical") return "healthy";
  if (checkStatus === "healthy") return "healthy";
  return "healthy";
}

async function getOpenAlertsGroupedByModule(): Promise<
  Map<string, { level: string }[]>
> {
  const open = await db
    .select({ module: alerts.module, level: alerts.level })
    .from(alerts)
    .where(and(isNull(alerts.resolvedAt), ne(alerts.level, "info")));
  const byModule = new Map<string, { level: string }[]>();
  for (const row of open) {
    const list = byModule.get(row.module) ?? [];
    list.push({ level: row.level });
    byModule.set(row.module, list);
  }
  return byModule;
}

function applyEffectiveStatuses(
  rows: ModuleStatusRow[],
  openByModule: Map<string, { level: string }[]>,
): ModuleStatusRow[] {
  return rows.map((row) => ({
    ...row,
    status: effectiveModuleStatus(
      row.status,
      openByModule.get(row.module) ?? [],
    ),
  }));
}

/** TV-Banner: nur Monitor-Kacheln (ohne Platzhalter), nicht z. B. security_posture allein */
export async function getGlobalStatus(): Promise<GlobalStatus> {
  const [modules, openByModule] = await Promise.all([
    getAllModuleStatuses(),
    getOpenAlertsGroupedByModule(),
  ]);
  const effective = applyEffectiveStatuses(modules, openByModule);
  const placeholders = new Set<string>(MONITOR_PLACEHOLDER_MODULES);
  const statuses: CheckStatus[] = [];
  for (const mod of MONITOR_MODULE_ORDER) {
    if (placeholders.has(mod)) continue;
    const row = effective.find((m) => m.module === mod);
    if (row?.status) statuses.push(row.status as CheckStatus);
  }
  return worstStatus(statuses.length ? statuses : ["healthy"]);
}

export async function getServerOverview() {
  const [server] = await db.select().from(servers).limit(1);
  const [metrics] = server
    ? await db
        .select()
        .from(metricsSnapshots)
        .where(eq(metricsSnapshots.serverId, server.id))
        .orderBy(desc(metricsSnapshots.createdAt))
        .limit(1)
    : [];

  const [recentModules, openByModule] = await Promise.all([
    db.select().from(checkRuns).orderBy(desc(checkRuns.createdAt)).limit(20),
    getOpenAlertsGroupedByModule(),
  ]);

  const moduleStatus: Record<string, string> = {};
  for (const r of recentModules) {
    if (!moduleStatus[r.module]) {
      moduleStatus[r.module] = effectiveModuleStatus(
        r.status,
        openByModule.get(r.module) ?? [],
      );
    }
  }

  return {
    server,
    metrics,
    checkMode: getCheckMode(),
    moduleStatus,
    docker: moduleStatus.docker ?? "unknown",
    coolify: moduleStatus.coolify ?? "unknown",
    backups: moduleStatus.backups ?? "unknown",
    ssl: moduleStatus.ssl ?? "unknown",
  };
}

export async function getRecentAlerts(
  limit = 50,
  opts?: { includeInfo?: boolean },
) {
  const conditions = [isNull(alerts.resolvedAt)];
  if (!opts?.includeInfo) {
    conditions.push(ne(alerts.level, "info"));
  }
  return db
    .select()
    .from(alerts)
    .where(and(...conditions))
    .orderBy(desc(alerts.createdAt))
    .limit(limit);
}

export async function getAlertById(id: string) {
  const [row] = await db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
  return row ?? null;
}

export async function getLatestCheckByModule(module: string) {
  const [row] = await db
    .select()
    .from(checkRuns)
    .where(eq(checkRuns.module, module))
    .orderBy(desc(checkRuns.createdAt))
    .limit(1);
  return row;
}

export async function getChangeEvents(limit = 30) {
  return db
    .select()
    .from(changeEvents)
    .orderBy(desc(changeEvents.createdAt))
    .limit(limit);
}

export async function getDomains() {
  return db.select().from(monitoredDomains);
}

/** Latest status per module for monitor grid */
export async function getAllModuleStatuses(): Promise<ModuleStatusRow[]> {
  const runs = await db
    .select()
    .from(checkRuns)
    .orderBy(desc(checkRuns.createdAt))
    .limit(100);

  const seen = new Map<string, { status: string; at: Date }>();
  for (const r of runs) {
    if (!seen.has(r.module)) {
      seen.set(r.module, { status: r.status, at: r.createdAt });
    }
  }

  const raw = [...seen.entries()].map(([module, v]) => ({
    module,
    status: v.status,
    at: v.at,
  }));

  const openByModule = await getOpenAlertsGroupedByModule();
  return applyEffectiveStatuses(raw, openByModule);
}

export async function getLastCheckTime(): Promise<Date | null> {
  const [row] = await db
    .select()
    .from(checkRuns)
    .orderBy(desc(checkRuns.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}
