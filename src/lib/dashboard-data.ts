import { desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  alerts,
  changeEvents,
  checkRuns,
  metricsSnapshots,
  monitoredDomains,
  servers,
} from "@/db/schema";
import { worstStatus } from "@/lib/config";
import type { CheckStatus } from "@/lib/checks/types";

export type GlobalStatus = "healthy" | "warning" | "critical";

export async function getGlobalStatus(): Promise<GlobalStatus> {
  const recent = await db
    .select()
    .from(checkRuns)
    .orderBy(desc(checkRuns.createdAt))
    .limit(30);

  const statuses = recent.map((r) => r.status as CheckStatus);
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

  const recentModules = await db
    .select()
    .from(checkRuns)
    .orderBy(desc(checkRuns.createdAt))
    .limit(20);

  const moduleStatus: Record<string, string> = {};
  for (const r of recentModules) {
    if (!moduleStatus[r.module]) moduleStatus[r.module] = r.status;
  }

  return {
    server,
    metrics,
    moduleStatus,
    docker: moduleStatus.docker ?? "unknown",
    coolify: moduleStatus.coolify ?? "unknown",
    backups: moduleStatus.backups ?? "unknown",
    ssl: moduleStatus.ssl ?? "unknown",
  };
}

export async function getRecentAlerts(limit = 50) {
  return db
    .select()
    .from(alerts)
    .where(isNull(alerts.resolvedAt))
    .orderBy(desc(alerts.createdAt))
    .limit(limit);
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
