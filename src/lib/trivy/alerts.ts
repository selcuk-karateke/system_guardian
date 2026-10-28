import {
  processAlerts,
  reconcileOpenAlerts,
} from "@/lib/alerts/pipeline";
import type { CoolifyMeta } from "@/lib/checks/coolify-meta";
import { normalizeContainerName } from "@/lib/checks/coolify-meta";
import type { AlertInput } from "@/lib/checks/types";
import { getCoolifyMetaMap } from "./coolify-context";
import { buildTrivyRecommendation, formatCoolifyTarget } from "./remediation";
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
  meta?: CoolifyMeta,
): AlertInput | null {
  if (record.criticalCount <= 0 && record.highCount <= 0) return null;
  const target = formatCoolifyTarget(meta);
  const msg = target
    ? `${trivyAlertMessage(record)} · ${target}`
    : trivyAlertMessage(record);
  return {
    level: record.criticalCount > 0 ? "critical" : "warning",
    message: msg,
    recommendation: buildTrivyRecommendation(record, meta),
  };
}

/** Open alerts from all cached scans with HIGH/CRITICAL; reconcile stale. */
export async function syncTrivyAlertsFromStore(
  serverId: string,
): Promise<AlertInput[]> {
  const map = await getTrivyScansByDigest();
  const coolify = await getCoolifyMetaMap(serverId).catch(
    () => new Map<string, CoolifyMeta>(),
  );
  const alerts = Object.values(map)
    .map((record) => {
      const meta = coolify.get(normalizeContainerName(record.containerName));
      return alertInputFromTrivyRecord(record, meta);
    })
    .filter((a): a is AlertInput => a != null);

  await processAlerts(serverId, "trivy", alerts);
  await reconcileOpenAlerts(serverId, "trivy", alerts);
  return alerts;
}
