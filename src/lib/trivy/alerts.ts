import {
  processAlerts,
  reconcileOpenAlerts,
} from "@/lib/alerts/pipeline";
import type { CoolifyMeta } from "@/lib/checks/coolify-meta";
import {
  formatContainerDisplay,
  normalizeContainerName,
} from "@/lib/checks/coolify-meta";
import type { AlertInput, AlertLevel } from "@/lib/checks/types";
import { getCoolifyMetaMap } from "./coolify-context";
import {
  bucketFinding,
  buildTrivyRecommendation,
} from "./remediation";
import type { TrivyFinding, TrivyScanRecord } from "./types";
import { listLiveContainerNames } from "./live-containers";
import {
  getTrivyScansByDigest,
  pruneTrivyScansNotLive,
} from "./store";

const NON_PROD_ENV =
  /^(staging|development|dev|test|preview|local)$/i;

/** Compose sidecars under the same Coolify project — keep separate from the app. */
const SIDECAR_NAME =
  /^(redis|postgres|postgresql|db|mysql|mariadb|meilisearch|typesense|minio|mailpit|gotenberg|collabora|richdocumentscode)$/i;

/** Strip Coolify UUID / deploy-id suffixes for fallback grouping. */
export function stripCoolifyContainerSuffix(name: string): string {
  const n = normalizeContainerName(name);
  const parts = n.split("-");
  if (parts.length >= 3 && /^[a-z0-9]{16,}$/i.test(parts[parts.length - 2]!)) {
    return parts.slice(0, -2).join("-");
  }
  if (parts.length >= 2 && /^[a-z0-9]{16,}$/i.test(parts[parts.length - 1]!)) {
    return parts.slice(0, -1).join("-");
  }
  // Pure Coolify id prefix: uuid-timestamp → short id
  if (/^[a-z0-9]{20,}-\d{8,}/i.test(n)) {
    return n.slice(0, 12);
  }
  return n;
}

function trivyKind(meta?: CoolifyMeta): string {
  if (meta?.type === "database") {
    return `db:${(meta.databaseSubType ?? meta.serviceName ?? "db").toLowerCase()}`;
  }
  const svc = (meta?.serviceName ?? "").trim();
  if (svc && SIDECAR_NAME.test(svc)) {
    return `sidecar:${svc.toLowerCase()}`;
  }
  // All app/web containers of the same project+env share one alert.
  return "app";
}

/** Coolify PR/preview containers (e.g. `uuid-pr-2`) — never drive prod CRITICAL. */
export function isCoolifyPreviewContainer(name: string): boolean {
  return /(?:^|-)pr-\d+$/i.test(normalizeContainerName(name));
}

/**
 * Alert input only from live containers.
 * - `liveNames` set → must be running now
 * - `liveNames` undefined → SSH/list failed; keep cache but still drop previews
 */
export function filterLiveTrivyRecords(
  records: TrivyScanRecord[],
  liveNames: ReadonlySet<string> | undefined,
): TrivyScanRecord[] {
  return records.filter((r) => {
    if (isCoolifyPreviewContainer(r.containerName)) return false;
    if (liveNames === undefined) return true;
    return liveNames.has(r.containerName);
  });
}

export function trivyGroupKey(
  record: TrivyScanRecord,
  meta?: CoolifyMeta,
): string {
  const project = meta?.projectName?.trim();
  if (project) {
    const env = (meta?.environmentName ?? "").trim().toLowerCase() || "_";
    return `proj:${project.toLowerCase()}|env:${env}|${trivyKind(meta)}`;
  }
  return `name:${stripCoolifyContainerSuffix(record.containerName).toLowerCase()}`;
}

export function formatTrivyAlertLabel(
  record: TrivyScanRecord,
  meta?: CoolifyMeta,
): string {
  // Prefer compact App + Env (skip PR-branch / FQDN noise on dashboard).
  if (meta?.type === "database") {
    return formatContainerDisplay(record.containerName, meta);
  }
  const project = meta?.projectName?.trim();
  const env = meta?.environmentName?.trim();
  const svc = meta?.serviceName?.trim();
  if (project && svc && SIDECAR_NAME.test(svc)) {
    return env ? `${project}/${svc} (${env})` : `${project}/${svc}`;
  }
  if (project) {
    return env ? `${project} (${env})` : project;
  }
  if (svc) {
    return env ? `${svc} (${env})` : svc;
  }
  const display = formatContainerDisplay(record.containerName, meta);
  if (display !== record.containerName) return display;
  return stripCoolifyContainerSuffix(record.containerName);
}

/** CRITICAL findings that are actionable App deps (not OS/stdlib/residual). */
export function appCriticalCount(findings: TrivyFinding[]): number {
  return findings.filter(
    (f) => f.severity === "CRITICAL" && bucketFinding(f) === "app",
  ).length;
}

export function isNonProdEnvironment(meta?: CoolifyMeta): boolean {
  const env = meta?.environmentName?.trim() ?? "";
  return NON_PROD_ENV.test(env);
}

/**
 * Dashboard level rules:
 * - staging/dev → warning (never critical)
 * - CRITICAL only from App-bucket → critical on production
 * - residual / OS / stdlib CRITICAL → warning
 */
export function trivyAlertLevel(
  findings: TrivyFinding[],
  criticalCount: number,
  highCount: number,
  meta?: CoolifyMeta,
): AlertLevel {
  if (criticalCount <= 0 && highCount <= 0) return "info";
  if (isNonProdEnvironment(meta)) return "warning";
  if (appCriticalCount(findings) > 0) return "critical";
  if (criticalCount > 0) return "warning";
  return "warning";
}

function pickWorst(records: TrivyScanRecord[]): TrivyScanRecord {
  return records.reduce((best, r) => {
    if (r.criticalCount !== best.criticalCount) {
      return r.criticalCount > best.criticalCount ? r : best;
    }
    return r.highCount > best.highCount ? r : best;
  });
}

/** Stable human message for dedup (grouped by app/env). */
export function trivyAlertMessage(
  label: string,
  criticalCount: number,
  highCount: number,
  imageCount = 1,
): string {
  let msg = `Trivy ${label}: ${criticalCount} crit / ${highCount} high`;
  if (imageCount > 1) msg += ` · ${imageCount} images`;
  return msg;
}

export function alertInputFromTrivyRecord(
  record: TrivyScanRecord,
  meta?: CoolifyMeta,
): AlertInput | null {
  return buildTrivyAlerts([record], meta ? new Map([[normalizeContainerName(record.containerName), meta]]) : new Map())[0] ?? null;
}

/** Group cached scans → one alert per app/env. */
export function buildTrivyAlerts(
  records: TrivyScanRecord[],
  coolify: Map<string, CoolifyMeta>,
): AlertInput[] {
  type Group = {
    key: string;
    label: string;
    meta?: CoolifyMeta;
    records: TrivyScanRecord[];
  };
  const groups = new Map<string, Group>();

  for (const record of records) {
    if (record.criticalCount <= 0 && record.highCount <= 0) continue;
    const meta = coolify.get(normalizeContainerName(record.containerName));
    const key = trivyGroupKey(record, meta);
    const label = formatTrivyAlertLabel(record, meta);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { key, label, meta, records: [record] });
      continue;
    }
    existing.records.push(record);
    if (!existing.meta?.projectName && meta?.projectName) {
      existing.meta = meta;
      existing.label = label;
    }
  }

  const alerts: AlertInput[] = [];
  for (const g of groups.values()) {
    const criticalCount = Math.max(...g.records.map((r) => r.criticalCount));
    const highCount = Math.max(...g.records.map((r) => r.highCount));
    if (criticalCount <= 0 && highCount <= 0) continue;

    const worst = pickWorst(g.records);
    const mergedFindings = g.records.flatMap((r) => r.findings);
    const level = trivyAlertLevel(
      mergedFindings,
      criticalCount,
      highCount,
      g.meta,
    );

    let recommendation = buildTrivyRecommendation(worst, g.meta);
    if (g.records.length > 1) {
      recommendation += ` — ${g.records.length} Images gruppiert`;
    }
    if (isNonProdEnvironment(g.meta)) {
      recommendation += " — Non-Prod: Dashboard nur WARNING";
    } else if (
      criticalCount > 0 &&
      appCriticalCount(mergedFindings) === 0
    ) {
      recommendation +=
        " — Crit nur OS/Residual/stdlib (kein App-Dep) → WARNING";
    }

    alerts.push({
      level,
      message: trivyAlertMessage(
        g.label,
        criticalCount,
        highCount,
        g.records.length,
      ),
      recommendation,
    });
  }

  // Stable order for reconcile diffs
  alerts.sort((a, b) => a.message.localeCompare(b.message));
  return alerts;
}

/** Open alerts from live cached scans with HIGH/CRITICAL; reconcile stale. */
export async function syncTrivyAlertsFromStore(
  serverId: string,
): Promise<AlertInput[]> {
  let liveNames: Set<string> | undefined;
  try {
    liveNames = await listLiveContainerNames(serverId);
    await pruneTrivyScansNotLive(liveNames);
  } catch {
    liveNames = undefined;
  }

  const map = await getTrivyScansByDigest();
  const coolify = await getCoolifyMetaMap(serverId).catch(
    () => new Map<string, CoolifyMeta>(),
  );
  const records = filterLiveTrivyRecords(Object.values(map), liveNames);
  const alerts = buildTrivyAlerts(records, coolify);

  await processAlerts(serverId, "trivy", alerts);
  await reconcileOpenAlerts(serverId, "trivy", alerts);
  return alerts;
}
