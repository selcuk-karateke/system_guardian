import {
  processAlerts,
  reconcileOpenAlerts,
} from "@/lib/alerts/pipeline";
import type { AlertInput } from "@/lib/checks/types";
import type { TrivyScanRecord } from "./types";
import { getTrivyScansByDigest } from "./store";

function shortDigest(digest: string): string {
  return digest.replace(/^sha256:/, "").slice(0, 12);
}

/** Stable message for dedup (keyed by image digest). */
export function trivyAlertMessage(record: TrivyScanRecord): string {
  const d = shortDigest(record.imageDigest);
  return `Trivy ${record.containerName}: ${record.criticalCount} crit / ${record.highCount} high (digest ${d})`;
}

export function alertInputFromTrivyRecord(
  record: TrivyScanRecord,
): AlertInput | null {
  if (record.criticalCount <= 0 && record.highCount <= 0) return null;
  const top = record.findings
    .slice(0, 3)
    .map((f) => f.vulnerabilityId)
    .join(", ");
  return {
    level: record.criticalCount > 0 ? "critical" : "warning",
    message: trivyAlertMessage(record),
    recommendation: [
      "In Coolify Image neu bauen / Base aktualisieren und redeployen",
      "Docker → Scan Neu nach Deploy",
      top ? `Top-CVEs: ${top}` : null,
    ]
      .filter(Boolean)
      .join(" — "),
  };
}

/** Open alerts from all cached scans with HIGH/CRITICAL; reconcile stale. */
export async function syncTrivyAlertsFromStore(
  serverId: string,
): Promise<AlertInput[]> {
  const map = await getTrivyScansByDigest();
  const alerts = Object.values(map)
    .map(alertInputFromTrivyRecord)
    .filter((a): a is AlertInput => a != null);

  await processAlerts(serverId, "trivy", alerts);
  await reconcileOpenAlerts(serverId, "trivy", alerts);
  return alerts;
}
