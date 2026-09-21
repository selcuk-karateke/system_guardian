import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  alerts,
  changeEvents,
  checkRuns,
  metricsSnapshots,
} from "@/db/schema";

export type TimelineFilters = {
  from: Date;
  to: Date;
  module?: string;
};

export async function getCheckRunsInRange(filters: TimelineFilters) {
  const conditions = [
    gte(checkRuns.createdAt, filters.from),
    lte(checkRuns.createdAt, filters.to),
  ];
  if (filters.module) {
    conditions.push(eq(checkRuns.module, filters.module));
  }
  return db
    .select()
    .from(checkRuns)
    .where(and(...conditions))
    .orderBy(desc(checkRuns.createdAt))
    .limit(200);
}

export async function getChangeEventsInRange(filters: TimelineFilters) {
  const conditions = [
    gte(changeEvents.createdAt, filters.from),
    lte(changeEvents.createdAt, filters.to),
  ];
  return db
    .select()
    .from(changeEvents)
    .where(and(...conditions))
    .orderBy(desc(changeEvents.createdAt))
    .limit(200);
}

export async function getAlertsInRange(filters: TimelineFilters) {
  const conditions = [
    gte(alerts.createdAt, filters.from),
    lte(alerts.createdAt, filters.to),
  ];
  if (filters.module) {
    conditions.push(eq(alerts.module, filters.module));
  }
  return db
    .select()
    .from(alerts)
    .where(and(...conditions))
    .orderBy(desc(alerts.createdAt))
    .limit(200);
}

export async function getMetricsInRange(filters: TimelineFilters) {
  return db
    .select()
    .from(metricsSnapshots)
    .where(
      and(
        gte(metricsSnapshots.createdAt, filters.from),
        lte(metricsSnapshots.createdAt, filters.to),
      ),
    )
    .orderBy(desc(metricsSnapshots.createdAt))
    .limit(100);
}

/** Latest check result per module at or before `at` (point-in-time). */
export async function getPointInTimeChecks(at: Date) {
  const runs = await db
    .select()
    .from(checkRuns)
    .where(lte(checkRuns.createdAt, at))
    .orderBy(desc(checkRuns.createdAt))
    .limit(500);

  const byModule = new Map<string, (typeof runs)[0]>();
  for (const r of runs) {
    if (!byModule.has(r.module)) byModule.set(r.module, r);
  }
  return [...byModule.values()].sort((a, b) =>
    a.module.localeCompare(b.module),
  );
}

export async function getDistinctModulesInRange(filters: TimelineFilters) {
  const runs = await getCheckRunsInRange(filters);
  return [...new Set(runs.map((r) => r.module))].sort();
}
