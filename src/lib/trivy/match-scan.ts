import { coolifyUuidFromContainerName } from "./resolve-container";
import type { TrivyScanRecord } from "./types";

/** Dedupe digest map that may also be keyed by imageRef. */
export function uniqueScanRecords(
  scansByKey: Record<string, TrivyScanRecord>,
): TrivyScanRecord[] {
  const byDigest = new Map<string, TrivyScanRecord>();
  for (const s of Object.values(scansByKey)) {
    byDigest.set(s.imageDigest, s);
  }
  return [...byDigest.values()];
}

/**
 * docker ps often shows a 12-char id (`96d56f7f57c6`) while Trivy stores
 * `postgres:18-alpine` + full `sha256:96d56f7f57c6…`.
 */
export function imageMatchesScan(
  scan: TrivyScanRecord,
  image: string,
): boolean {
  if (!image) return false;
  if (scan.imageRef === image) return true;
  const digest = scan.imageDigest.replace(/^sha256:/i, "");
  if (!digest) return false;
  // short id from docker ps / docker images
  if (/^[a-f0-9]{12,64}$/i.test(image)) {
    return digest.startsWith(image) || image.startsWith(digest.slice(0, 12));
  }
  return false;
}

/**
 * Find cached Trivy result for a docker-ps row.
 * Match: imageRef → short image id/digest → container name → Coolify UUID.
 */
export function findScanForContainer(
  scans: Iterable<TrivyScanRecord>,
  row: { name: string; image: string; coolifyUuid?: string },
): TrivyScanRecord | undefined {
  const list = [...scans];
  const byImage = list.find((s) => imageMatchesScan(s, row.image));
  if (byImage) return byImage;

  const byName = list.find((s) => s.containerName === row.name);
  if (byName) return byName;

  const uuid =
    row.coolifyUuid?.trim() ||
    coolifyUuidFromContainerName(row.name) ||
    null;
  if (!uuid) return undefined;

  return list.find((s) => {
    if (s.containerName === row.name) return true;
    if (s.containerName.startsWith(`${uuid}-`)) return true;
    if (s.containerName === uuid) return true;
    const scanUuid = coolifyUuidFromContainerName(s.containerName);
    return scanUuid === uuid;
  });
}

export function isContainerScanned(
  scans: Iterable<TrivyScanRecord>,
  row: { name: string; image: string; coolifyUuid?: string },
): boolean {
  return Boolean(findScanForContainer(scans, row));
}
