import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import type { TrivyScanRecord } from "./types";

const SETTINGS_KEY = "trivy_image_scans";

type ScanMap = Record<string, TrivyScanRecord>;

async function readMap(): Promise<ScanMap> {
  const rows = await db
    .select()
    .from(settings)
    .where(eq(settings.key, SETTINGS_KEY))
    .limit(1);
  const row = rows[0];
  if (!row?.value || typeof row.value !== "object") return {};
  return row.value as ScanMap;
}

export async function getTrivyScansByDigest(): Promise<ScanMap> {
  return readMap();
}

export async function getTrivyScanForDigest(
  digest: string,
): Promise<TrivyScanRecord | null> {
  const map = await readMap();
  return map[digest] ?? null;
}

export async function saveTrivyScan(record: TrivyScanRecord): Promise<void> {
  const map = await readMap();
  map[record.imageDigest] = record;
  await db
    .insert(settings)
    .values({ key: SETTINGS_KEY, value: map })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: map, updatedAt: new Date() },
    });
}

/**
 * Drop cached scans whose container is not currently running.
 * Keeps the digest store aligned with live docker ps (no ghost alerts).
 */
export async function pruneTrivyScansNotLive(
  liveNames: ReadonlySet<string>,
): Promise<number> {
  const map = await readMap();
  let removed = 0;
  for (const [digest, rec] of Object.entries(map)) {
    if (liveNames.has(rec.containerName)) continue;
    delete map[digest];
    removed += 1;
  }
  if (removed === 0) return 0;
  await db
    .insert(settings)
    .values({ key: SETTINGS_KEY, value: map })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: map, updatedAt: new Date() },
    });
  return removed;
}

/** Wipe all cached Trivy scans (digest map). Alerts must be re-synced after. */
export async function clearAllTrivyScans(): Promise<number> {
  const map = await readMap();
  const count = Object.keys(map).length;
  if (count === 0) return 0;
  await db
    .insert(settings)
    .values({ key: SETTINGS_KEY, value: {} })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: {}, updatedAt: new Date() },
    });
  return count;
}
