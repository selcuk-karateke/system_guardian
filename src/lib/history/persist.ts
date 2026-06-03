import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { changeEvents, checkRuns, snapshots } from "@/db/schema";
import type { CheckResult } from "@/lib/checks/types";
import type { DiffItem } from "./diff";

export async function persistCheckRun(
  serverId: string,
  result: CheckResult,
  durationMs: number,
): Promise<void> {
  await db.insert(checkRuns).values({
    serverId,
    module: result.module,
    status: result.status,
    data: result.data,
    durationMs,
  });
}

export async function getLatestSnapshot(
  serverId: string,
  category: string,
): Promise<Record<string, unknown> | null> {
  const rows = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.serverId, serverId))
    .orderBy(desc(snapshots.createdAt))
    .limit(200);

  const match = rows.find((r) => r.category === category);
  return match?.payload ?? null;
}

export async function saveSnapshot(
  serverId: string,
  category: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.insert(snapshots).values({ serverId, category, payload });
}

export async function persistDiffs(
  serverId: string,
  category: string,
  diffs: DiffItem[],
): Promise<void> {
  if (diffs.length === 0) return;
  await db.insert(changeEvents).values(
    diffs.map((d) => ({
      serverId,
      category,
      changeType: d.changeType,
      entityKey: d.entityKey,
      previousValue: d.previousValue ?? null,
      newValue: d.newValue ?? null,
    })),
  );
}

export async function diffAndStore(
  serverId: string,
  category: string,
  currentPayload: Record<string, unknown>,
  toDiff: (
    prev: Record<string, unknown> | null,
    curr: Record<string, unknown>,
  ) => DiffItem[],
): Promise<DiffItem[]> {
  const prev = await getLatestSnapshot(serverId, category);
  const diffs = toDiff(prev, currentPayload);
  await saveSnapshot(serverId, category, currentPayload);
  await persistDiffs(serverId, category, diffs);
  return diffs;
}
