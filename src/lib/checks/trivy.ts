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
import { scanContainerImage } from "@/lib/trivy/scan";
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
    // Skip obvious infra noise for cron budget; apps first.
    if (/coolify-proxy|coolify-db|coolify-realtime|traefik/i.test(name)) {
      continue;
    }
    out.push({ name: name.trim(), image: image.trim() });
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

/**
 * Surfaces cached Trivy HIGH/CRITICAL as real alerts.
 * Optionally scans a small batch of running containers (cron budget).
 */
export async function runTrivyCheck(serverId: string): Promise<CheckResult> {
  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";
  const limit = getTrivyScanLimit();
  const maxAgeDays = getTrivyMaxAgeDays();
  const cronScan = isTrivyCronEnabled();

  let scanned = 0;
  let scanErrors: string[] = [];

  if (cronScan) {
    try {
      const containers = await listRunningContainers(serverId);
      const cache = await getTrivyScansByDigest();
      const byRef = new Map(
        Object.values(cache).map((r) => [r.imageRef, r] as const),
      );

      const candidates = containers.filter((c) => {
        const hit =
          byRef.get(c.image) ??
          Object.values(cache).find((r) => r.containerName === c.name);
        return needsRescan(
          hit?.imageDigest ?? null,
          hit?.scannedAt ?? null,
          maxAgeDays,
        );
      });

      for (const c of candidates.slice(0, limit)) {
        const result = await scanContainerImage(c.name, {
          force: false,
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
      cachedImages: Object.keys(cache).length,
      liveImages: liveRecords.length,
      prunedStaleDigests: pruned,
      imagesWithFindings: withFindings.length,
      scanErrors: scanErrors.slice(0, 5),
    },
    alerts,
  };
}
