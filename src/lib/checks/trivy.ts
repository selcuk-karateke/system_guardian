import {
  getTrivyMaxAgeDays,
  getTrivyScanLimit,
  isTrivyCronEnabled,
} from "@/lib/config";
import { getSshClient } from "@/lib/ssh";
import {
  buildTrivyAlerts,
  filterLiveTrivyRecords,
} from "@/lib/trivy/alerts";
import { getCoolifyMetaMap } from "@/lib/trivy/coolify-context";
import { listLiveContainerNames } from "@/lib/trivy/live-containers";
import {
  getTrivyScansByDigest,
  pruneTrivyScansNotLive,
} from "@/lib/trivy/store";
import { findScanForContainer } from "@/lib/trivy/match-scan";
import { scanContainerImage } from "@/lib/trivy/scan";
import { isTrivyBatchTarget } from "@/lib/trivy/scan-targets";
import type { CoolifyMeta } from "@/lib/checks/coolify-meta";
import type { AlertInput, CheckResult } from "./types";

type ListedContainer = { name: string; image: string };

async function listRunningContainers(
  serverId: string,
): Promise<ListedContainer[]> {
  const ssh = await getSshClient(serverId);
  const { stdout } = await ssh.exec(
    "docker ps --format '{{.Names}}\\t{{.Image}}' 2>/dev/null | head -120",
  );
  const out: ListedContainer[] = [];
  for (const line of stdout.split("\n")) {
    const [name, image] = line.split("\t");
    if (!name?.trim() || !image?.trim()) continue;
    const n = name.trim();
    if (!isTrivyBatchTarget(n)) continue;
    out.push({ name: n, image: image.trim() });
  }
  return out;
}

function needsRescan(
  digestOrMissing: string | null,
  scannedAt: string | null,
  maxAgeDays: number,
): boolean {
  if (!digestOrMissing || !scannedAt) return true;
  const ageMs = Date.now() - new Date(scannedAt).getTime();
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}

export type TrivyCheckOptions = {
  /** Manual UI button: scan even if TRIVY_CRON_ENABLED=false */
  forceScan?: boolean;
  /** Override TRIVY_SCAN_LIMIT (capped at 20) */
  scanLimit?: number;
};

/**
 * Surfaces cached Trivy HIGH/CRITICAL as real alerts.
 * Optionally scans a small batch of running containers (cron / manual budget).
 */
export async function runTrivyCheck(
  serverId: string,
  options?: TrivyCheckOptions,
): Promise<CheckResult> {
  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";
  const limit = Math.min(
    20,
    Math.max(1, options?.scanLimit ?? getTrivyScanLimit()),
  );
  const maxAgeDays = getTrivyMaxAgeDays();
  const cronScan = isTrivyCronEnabled();
  const doScan = Boolean(options?.forceScan) || cronScan;

  let scanned = 0;
  let scanErrors: string[] = [];
  let pendingCandidates = 0;

  if (doScan) {
    try {
      const containers = await listRunningContainers(serverId);
      const cache = await getTrivyScansByDigest();
      const cacheList = Object.values(cache);

      const candidates = containers.filter((c) => {
        const hit = findScanForContainer(cacheList, {
          name: c.name,
          image: c.image,
        });
        return needsRescan(
          hit?.imageDigest ?? null,
          hit?.scannedAt ?? null,
          maxAgeDays,
        );
      });
      pendingCandidates = candidates.length;

      for (const c of candidates.slice(0, limit)) {
        const result = await scanContainerImage(c.name, {
          force: Boolean(options?.forceScan),
          serverId,
        });
        scanned++;
        if (!result.ok) {
          scanErrors.push(`${c.name}: ${result.message}`);
        }
      }
    } catch (e) {
      scanErrors.push(e instanceof Error ? e.message : "scan batch failed");
    }
  }

  let liveNames: Set<string> | undefined;
  let pruned = 0;
  try {
    liveNames = await listLiveContainerNames(serverId);
    pruned = await pruneTrivyScansNotLive(liveNames);
  } catch (e) {
    scanErrors.push(
      e instanceof Error ? `live list: ${e.message}` : "live list failed",
    );
    liveNames = undefined;
  }

  const cache = await getTrivyScansByDigest();
  const coolify = await getCoolifyMetaMap(serverId).catch(
    () => new Map<string, CoolifyMeta>(),
  );
  const liveRecords = filterLiveTrivyRecords(Object.values(cache), liveNames);
  alerts.push(...buildTrivyAlerts(liveRecords, coolify));

  if (alerts.some((a) => a.level === "critical")) status = "critical";
  else if (alerts.some((a) => a.level === "warning")) status = "warning";

  if (scanErrors.length > 0 && status === "healthy") {
    status = "warning";
    alerts.push({
      level: "warning",
      message: `Trivy-Scan-Fehler (${scanErrors.length})`,
      recommendation: scanErrors.slice(0, 2).join("; "),
    });
  }

  const withFindings = liveRecords.filter(
    (r) => r.criticalCount > 0 || r.highCount > 0,
  );

  return {
    module: "trivy",
    status,
    data: {
      cronScanEnabled: cronScan,
      scannedThisRun: scanned,
      scanLimit: limit,
      pendingBeforeScan: pendingCandidates,
      stillPending: Math.max(0, pendingCandidates - scanned),
      cachedImages: Object.keys(cache).length,
      liveImages: liveRecords.length,
      prunedStaleDigests: pruned,
      imagesWithFindings: withFindings.length,
      scanErrors: scanErrors.slice(0, 5),
    },
    alerts,
  };
}
