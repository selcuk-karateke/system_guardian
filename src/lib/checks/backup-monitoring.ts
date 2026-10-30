import type { AlertInput } from "./types";

/** `/backups/monitoring/status.json` (schema 1). */
export type BackupStatusJson = {
  schema?: number;
  state?: string;
  exit_code?: number;
  started_at?: string;
  finished_at?: string;
  run_id?: string;
  log_file?: string;
  mode?: string;
  message?: string;
};

/** `/backups/monitoring/backup-health.json` (schema 1). */
export type BackupHealthJson = {
  schema?: number;
  backup_complete?: boolean;
  checksum_valid?: boolean;
  applications_expected?: number;
  applications_backed_up?: number;
  applications_failed?: number;
  unattached_volumes_found?: number;
  unattached_volumes_backed_up?: number;
  overall_status?: string;
  restore_tested?: boolean;
  last_run_successful?: boolean;
  backup_path?: string;
  generated_at?: string;
  run_id?: string;
  errors?: string[];
  warnings?: string[];
  note?: string;
};

export type BackupMonitoringEval = {
  status: BackupStatusJson | null;
  health: BackupHealthJson | null;
  alerts: AlertInput[];
  /** Hours since finished_at / generated_at when parseable */
  ageHours: number | null;
  summaryLine: string | null;
};

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const t = raw.trim();
  if (!t || t[0] !== "{") return null;
  try {
    const v = JSON.parse(t) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function parseBackupStatusJson(raw: string): BackupStatusJson | null {
  const o = parseJsonObject(raw);
  if (!o) return null;
  return {
    schema: typeof o.schema === "number" ? o.schema : undefined,
    state: typeof o.state === "string" ? o.state : undefined,
    exit_code: typeof o.exit_code === "number" ? o.exit_code : undefined,
    started_at: typeof o.started_at === "string" ? o.started_at : undefined,
    finished_at: typeof o.finished_at === "string" ? o.finished_at : undefined,
    run_id: typeof o.run_id === "string" ? o.run_id : undefined,
    log_file: typeof o.log_file === "string" ? o.log_file : undefined,
    mode: typeof o.mode === "string" ? o.mode : undefined,
    message: typeof o.message === "string" ? o.message : undefined,
  };
}

export function parseBackupHealthJson(raw: string): BackupHealthJson | null {
  const o = parseJsonObject(raw);
  if (!o) return null;
  const strArr = (v: unknown): string[] | undefined =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : undefined;
  return {
    schema: typeof o.schema === "number" ? o.schema : undefined,
    backup_complete:
      typeof o.backup_complete === "boolean" ? o.backup_complete : undefined,
    checksum_valid:
      typeof o.checksum_valid === "boolean" ? o.checksum_valid : undefined,
    applications_expected:
      typeof o.applications_expected === "number"
        ? o.applications_expected
        : undefined,
    applications_backed_up:
      typeof o.applications_backed_up === "number"
        ? o.applications_backed_up
        : undefined,
    applications_failed:
      typeof o.applications_failed === "number"
        ? o.applications_failed
        : undefined,
    unattached_volumes_found:
      typeof o.unattached_volumes_found === "number"
        ? o.unattached_volumes_found
        : undefined,
    unattached_volumes_backed_up:
      typeof o.unattached_volumes_backed_up === "number"
        ? o.unattached_volumes_backed_up
        : undefined,
    overall_status:
      typeof o.overall_status === "string" ? o.overall_status : undefined,
    restore_tested:
      typeof o.restore_tested === "boolean" ? o.restore_tested : undefined,
    last_run_successful:
      typeof o.last_run_successful === "boolean"
        ? o.last_run_successful
        : undefined,
    backup_path: typeof o.backup_path === "string" ? o.backup_path : undefined,
    generated_at:
      typeof o.generated_at === "string" ? o.generated_at : undefined,
    run_id: typeof o.run_id === "string" ? o.run_id : undefined,
    errors: strArr(o.errors),
    warnings: strArr(o.warnings),
    note: typeof o.note === "string" ? o.note : undefined,
  };
}

function ageHoursFromIso(iso: string | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 3_600_000;
}

/**
 * Alert rules from Monitoring_Dokumentation_kawai (30.10.2026).
 * `overall_status=warning` alone is NOT a run failure (restore/consistency caveat).
 */
export function evaluateBackupMonitoring(opts: {
  statusRaw: string;
  healthRaw: string;
  /** Max age of finished_at / generated_at before CRITICAL (daily cron). */
  maxRunAgeHours: number;
  nowMs?: number;
}): BackupMonitoringEval {
  const nowMs = opts.nowMs ?? Date.now();
  const status = parseBackupStatusJson(opts.statusRaw);
  const health = parseBackupHealthJson(opts.healthRaw);
  const alerts: AlertInput[] = [];

  if (!status && !health) {
    return {
      status: null,
      health: null,
      alerts: [
        {
          level: "warning",
          message: "Backup-Monitoring-JSON fehlt (/backups/monitoring)",
          recommendation:
            "hetzner_backup.sh prüfen — status.json / backup-health.json nach Lauf",
        },
      ],
      ageHours: null,
      summaryLine: null,
    };
  }

  const logHint = status?.log_file
    ? `Log: ${status.log_file}`
    : "Log unter /backups/logs prüfen";

  if (status) {
    const state = (status.state ?? "").toLowerCase();
    const exit = status.exit_code;
    if (state && state !== "success") {
      alerts.push({
        level: "critical",
        message: `Backup-Lauf state=${status.state}${status.run_id ? ` (${status.run_id})` : ""}`,
        recommendation: logHint,
      });
    }
    if (exit != null && exit !== 0) {
      alerts.push({
        level: "critical",
        message: `Backup-Lauf exit_code=${exit}`,
        recommendation: logHint,
      });
    }
  }

  if (health) {
    if (health.backup_complete === false) {
      alerts.push({
        level: "critical",
        message: "Backup nicht als complete markiert (backup_complete=false)",
        recommendation: logHint,
      });
    }
    if (health.checksum_valid === false) {
      alerts.push({
        level: "critical",
        message: "Backup-Prüfsumme ungültig (checksum_valid=false)",
        recommendation: logHint,
      });
    }
    const failed = health.applications_failed ?? 0;
    const expected = health.applications_expected;
    const backed = health.applications_backed_up;
    if (failed > 0) {
      alerts.push({
        level: "critical",
        message: `Backup: ${failed} Anwendung(en) fehlgeschlagen`,
        recommendation: `${logHint}; App-health unter /backups/monitoring/<App>/`,
      });
    }
    if (
      expected != null &&
      backed != null &&
      backed < expected &&
      failed === 0
    ) {
      alerts.push({
        level: "critical",
        message: `Backup-Abdeckung ${backed}/${expected} Anwendungen`,
        recommendation: logHint,
      });
    }
    if (health.errors && health.errors.length > 0) {
      alerts.push({
        level: "critical",
        message: `Backup-errors: ${health.errors[0]!.slice(0, 120)}`,
        recommendation: logHint,
      });
    }
  }

  const ageHours =
    ageHoursFromIso(status?.finished_at, nowMs) ??
    ageHoursFromIso(health?.generated_at, nowMs);

  if (ageHours != null && ageHours > opts.maxRunAgeHours) {
    alerts.push({
      level: "critical",
      message: `Letzter Backup-Lauf zu alt (${Math.round(ageHours)}h, Limit ${opts.maxRunAgeHours}h)`,
      recommendation:
        "Cron 01:00 / journalctl -u cron und status.json prüfen — alter success ist keine Entwarnung",
    });
  }

  // overall_status=warning is expected (restore_tested=false etc.) — no alert.

  const apps =
    health?.applications_backed_up != null &&
    health?.applications_expected != null
      ? `${health.applications_backed_up}/${health.applications_expected} apps`
      : null;
  const stateLabel =
    status?.state ??
    (health?.last_run_successful === true ? "success" : "?");
  const ageLabel =
    ageHours != null
      ? ageHours < 48
        ? `${Math.round(ageHours)}h`
        : `${Math.round(ageHours / 24)}d`
      : null;
  const summaryLine = [
    `run ${stateLabel}`,
    apps,
    ageLabel ? `${ageLabel} ago` : null,
    health?.checksum_valid === true ? "checksum ok" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    status,
    health,
    alerts,
    ageHours,
    summaryLine: summaryLine || null,
  };
}
