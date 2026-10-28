import {
  getTrivyMaxAgeDays,
  getTrivyScanLimit,
  isTrivyCronEnabled,
} from "@/lib/config";
import { getSshClient } from "@/lib/ssh";
import { alertInputFromTrivyRecord } from "@/lib/trivy/alerts";
import { getTrivyScansByDigest } from "@/lib/trivy/store";
import { scanContainerImage } from "@/lib/trivy/scan";
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

  const cache = await getTrivyScansByDigest();
  for (const record of Object.values(cache)) {
    const alert = alertInputFromTrivyRecord(record);
    if (alert) alerts.push(alert);
  }

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

  const withFindings = Object.values(cache).filter(
    (r) => r.criticalCount > 0 || r.highCount > 0,
  );

  return {
    module: "trivy",
    status,
    data: {
      cronScanEnabled: cronScan,
      scannedThisRun: scanned,
      cachedImages: Object.keys(cache).length,
      imagesWithFindings: withFindings.length,
      scanErrors: scanErrors.slice(0, 5),
    },
    alerts,
  };
}
