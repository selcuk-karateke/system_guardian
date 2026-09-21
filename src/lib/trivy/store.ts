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
