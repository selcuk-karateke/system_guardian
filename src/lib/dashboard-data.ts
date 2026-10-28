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
import { getCheckMode } from "@/lib/config";
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
 * Gesamtstatus = schlimmste offene Warnung/Critical.
 * Eine Quelle für Dashboard-Badge, Server-Karte und Monitor — kein Modul-Subset.
 */
export function overallStatusFromAlertLevels(
  levels: Iterable<string>,
): GlobalStatus {
  let worst: GlobalStatus = "healthy";
  for (const level of levels) {
    if (level === "critical") return "critical";
    if (level === "warning") worst = "warning";
  }
  return worst;
}

/**
 * Modul-Kachel: offene Alerts dieses Moduls.
 * Ohne offene Alerts → healthy (entschärft), auch wenn der letzte Check noch critical war.
 */
export function effectiveModuleStatus(
  _checkStatus: string,
  openAlerts: { level: string }[],
): CheckStatus {
  return statusFromOpenAlerts(openAlerts) ?? "healthy";
}

async function getOpenAlertsGroupedByModule(
  serverId?: string,
): Promise<Map<string, { level: string }[]>> {
  const conditions = [
    isNull(alerts.resolvedAt),
    ne(alerts.level, "info"),
  ];
  if (serverId) conditions.push(eq(alerts.serverId, serverId));

  const open = await db
    .select({ module: alerts.module, level: alerts.level })
    .from(alerts)
    .where(and(...conditions));
  const byModule = new Map<string, { level: string }[]>();
  for (const row of open) {
    const list = byModule.get(row.module) ?? [];
    list.push({ level: row.level });
    byModule.set(row.module, list);
  }
  return byModule;
}

function worseStatus(a: string, b: string): CheckStatus {
  const rank = (s: string) =>
    s === "critical" ? 3 : s === "warning" ? 2 : s === "healthy" ? 1 : 0;
  return (rank(a) >= rank(b) ? a : b) as CheckStatus;
}

/**
 * CVE-Funde (Modul trivy) gehören zur Docker-Lage — sonst ist Docker „ok“
 * während oben Critical steht.
 */
export function rollupRelatedModuleStatuses(
  statusByModule: Record<string, string>,
): Record<string, string> {
  const out = { ...statusByModule };
  const trivy = out.trivy;
  if (trivy === "critical" || trivy === "warning") {
    out.docker = worseStatus(out.docker ?? "unknown", trivy);
  }
  return out;
}

function applyEffectiveStatuses(
  rows: ModuleStatusRow[],
  openByModule: Map<string, { level: string }[]>,
): ModuleStatusRow[] {
  const effective = rows.map((row) => ({
    ...row,
    status: effectiveModuleStatus(
      row.status,
      openByModule.get(row.module) ?? [],
    ),
  }));

  const asMap = Object.fromEntries(
    effective.map((r) => [r.module, r.status]),
  );
  const rolled = rollupRelatedModuleStatuses(asMap);
  return effective.map((row) => ({
    ...row,
    status: rolled[row.module] ?? row.status,
  }));
}

/** Gesamtstatus aus offenen Alerts (identisch Dashboard / Server / Monitor / API). */
export async function getGlobalStatus(serverId?: string): Promise<GlobalStatus> {
  const conditions = [
    isNull(alerts.resolvedAt),
    ne(alerts.level, "info"),
  ];
  if (serverId) conditions.push(eq(alerts.serverId, serverId));

  const open = await db
    .select({ level: alerts.level })
    .from(alerts)
    .where(and(...conditions));

  return overallStatusFromAlertLevels(open.map((a) => a.level));
}

export async function getServerOverview(serverId?: string) {
  const server = serverId
    ? (
        await db
          .select()
          .from(servers)
          .where(eq(servers.id, serverId))
          .limit(1)
      )[0]
    : (
        await db
          .select()
          .from(servers)
          .where(eq(servers.isActive, true))
          .orderBy(desc(servers.createdAt))
          .limit(1)
      )[0];

  const [metrics] = server
    ? await db
        .select()
        .from(metricsSnapshots)
        .where(eq(metricsSnapshots.serverId, server.id))
        .orderBy(desc(metricsSnapshots.createdAt))
        .limit(1)
    : [];

  const runConditions = server
    ? eq(checkRuns.serverId, server.id)
    : undefined;

  const [recentModules, openByModule, status] = await Promise.all([
    server
      ? db
          .select()
          .from(checkRuns)
          .where(runConditions)
          .orderBy(desc(checkRuns.createdAt))
          .limit(40)
      : db.select().from(checkRuns).orderBy(desc(checkRuns.createdAt)).limit(20),
    getOpenAlertsGroupedByModule(server?.id),
    getGlobalStatus(server?.id),
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
  const rolled = rollupRelatedModuleStatuses(moduleStatus);

  return {
    server,
    metrics,
    status,
    checkMode: getCheckMode(),
    moduleStatus: rolled,
    docker: rolled.docker ?? "unknown",
    coolify: rolled.coolify ?? "unknown",
    backups: rolled.backups ?? "unknown",
    ssl: rolled.ssl ?? "unknown",
  };
}

/** Dashboard: one row per active server with aggregated status. */
export async function getServersWithStatus() {
  const rows = await db
    .select()
    .from(servers)
    .where(eq(servers.isActive, true))
    .orderBy(desc(servers.createdAt));

  const result: {
    id: string;
    name: string;
    host: string;
    ipv4: string | null;
    monitorProfile: string;
    status: GlobalStatus;
    cpuPercent: number | null;
    ramPercent: number | null;
    diskPercent: number | null;
    lastCheckAt: Date | null;
    openAlertCount: number;
  }[] = [];

  for (const server of rows) {
    const overview = await getServerOverview(server.id);
    const [lastCheck] = await db
      .select({ createdAt: checkRuns.createdAt })
      .from(checkRuns)
      .where(eq(checkRuns.serverId, server.id))
      .orderBy(desc(checkRuns.createdAt))
      .limit(1);
    const openAlertRows = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(
        and(
          eq(alerts.serverId, server.id),
          isNull(alerts.resolvedAt),
          ne(alerts.level, "info"),
        ),
      );

    result.push({
      id: server.id,
      name: server.name,
      host: server.host,
      ipv4: server.ipv4,
      monitorProfile: server.monitorProfile,
      status: overview.status,
      cpuPercent: overview.metrics?.cpuPercent ?? null,
      ramPercent: overview.metrics?.ramPercent ?? null,
      diskPercent: overview.metrics?.diskPercent ?? null,
      lastCheckAt: lastCheck?.createdAt ?? null,
      openAlertCount: openAlertRows.length,
    });
  }

  return result;
}

export async function getRecentAlerts(
  limit = 50,
  opts?: { includeInfo?: boolean; serverId?: string },
) {
  const conditions = [isNull(alerts.resolvedAt)];
  if (!opts?.includeInfo) {
    conditions.push(ne(alerts.level, "info"));
  }
  if (opts?.serverId) {
    conditions.push(eq(alerts.serverId, opts.serverId));
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

export async function getLatestCheckByModule(
  module: string,
  serverId?: string,
) {
  const conditions = [eq(checkRuns.module, module)];
  if (serverId) conditions.push(eq(checkRuns.serverId, serverId));
  const [row] = await db
    .select()
    .from(checkRuns)
    .where(and(...conditions))
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
export async function getAllModuleStatuses(
  serverId?: string,
): Promise<ModuleStatusRow[]> {
  const runs = serverId
    ? await db
        .select()
        .from(checkRuns)
        .where(eq(checkRuns.serverId, serverId))
        .orderBy(desc(checkRuns.createdAt))
        .limit(100)
    : await db
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

  const openByModule = await getOpenAlertsGroupedByModule(serverId);
  return applyEffectiveStatuses(raw, openByModule);
}

export async function getLastCheckTime(serverId?: string): Promise<Date | null> {
  const [row] = serverId
    ? await db
        .select()
        .from(checkRuns)
        .where(eq(checkRuns.serverId, serverId))
        .orderBy(desc(checkRuns.createdAt))
        .limit(1)
    : await db
        .select()
        .from(checkRuns)
        .orderBy(desc(checkRuns.createdAt))
        .limit(1);
  return row?.createdAt ?? null;
}
