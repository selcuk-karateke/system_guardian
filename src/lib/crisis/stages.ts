/**
 * Organisatorische Krisenstufen (1–4) vs. technische Alert-Levels.
 * Siehe docs/CRISIS.md — Guardian `critical` ≠ automatisch Stufe 1.
 */

export type CrisisStage = 1 | 2 | 3 | 4;

export type CrisisAlertLike = {
  module: string;
  level: string;
  message: string;
};

/** Single user-facing severity model (English). Technical warning/critical stay internal. */
export const CRISIS_STAGE_META: Record<
  CrisisStage,
  { name: string; short: string; blurb: string }
> = {
  1: {
    name: "Emergency",
    short: "S1",
    blurb: "Wake now · full response",
  },
  2: {
    name: "Severe",
    short: "S2",
    blurb: "Core systems · drop other work",
  },
  3: {
    name: "Degraded",
    short: "S3",
    blurb: "Elevated attention · fix within ~12h",
  },
  4: {
    name: "Routine",
    short: "S4",
    blurb: "Next business day · no night page",
  },
};

/** Business-critical names in alert messages (Coolify apps / host services). */
const CORE_SERVICE_RE =
  /\b(trading|nextcloud|coolify(?!-proxy-error)|postgres|postgresql|mysql-database|haupt-?app)\b/i;

const CORE_SITE_RE =
  /\b(app\.dachfabrik|nextcloud\.|trading\.|coolify\.)/i;

const STAGE1_MSG_RE =
  /ransomware|cryptolock|verschl(?:ü|ue)ssel|datenabfluss|exfiltrat|data\s*exfil/i;

const UNKNOWN_ROOT_RE =
  /(?:unbekannt|unknown).{0,40}root|root.{0,40}(?:unbekannt|unknown)|neuer\s+root-login/i;

/**
 * Map one open Guardian alert → crisis stage (lower = worse).
 * Order: explicit S1 → S2 → S3 → default S4.
 */
export function resolveCrisisStage(alert: CrisisAlertLike): CrisisStage {
  const module = alert.module.trim().toLowerCase();
  const level = alert.level.trim().toLowerCase();
  const message = alert.message;

  if (STAGE1_MSG_RE.test(message)) return 1;
  if (module === "logins" && UNKNOWN_ROOT_RE.test(message)) return 1;
  if (
    level === "critical" &&
    (module === "fim" ||
      module === "ssh_keys" ||
      module === "security_posture" ||
      module === "scanner")
  ) {
    return 1;
  }

  if (module === "database" && (level === "critical" || level === "warning")) {
    if (level === "critical" || /offline|unreachable|down|nicht erreichbar/i.test(message)) {
      return 2;
    }
  }
  if (module === "raid" && level === "critical") return 2;
  if (module === "backups" && level === "critical") return 2;
  if (module === "server_health" && level === "critical") return 2;
  if (module === "coolify" && level === "critical") return 2;

  // One-shot migrate jobs (Exit 0) must not look like a trading/core outage.
  const isMigrateNoise =
    /\bmigrate\b/i.test(message) &&
    (/stopped/i.test(message) || /migrate failed/i.test(message));

  if (
    !isMigrateNoise &&
    CORE_SERVICE_RE.test(message) &&
    (level === "critical" ||
      /unhealthy|\bstopped\b|exit|503|500\b/i.test(message))
  ) {
    return 2;
  }
  if (isMigrateNoise && /migrate failed/i.test(message)) {
    return 3;
  }

  if (
    module === "website" &&
    level === "critical" &&
    CORE_SITE_RE.test(message)
  ) {
    return 2;
  }

  if (module === "trivy" && level === "critical") return 3;
  if (module === "website") {
    if (level === "critical") return 3;
    if (
      /down|timeout|unreachable|timed?\s*out|5\d\d|does not redirect/i.test(
        message,
      )
    ) {
      return 3;
    }
    // HSTS / TLS-Kosmetik → S4
  }
  if (module === "server_health" && /\/tmp|tmpfs/i.test(message)) return 3;
  if (module === "backups" && level === "warning") return 3;
  if (module === "docker" && (level === "warning" || level === "critical")) {
    return 3;
  }
  if (level === "critical") return 3;

  return 4;
}

/** Worst (lowest number) stage; `null` if empty. */
export function worstCrisisStage(
  stages: Iterable<CrisisStage | null | undefined>,
): CrisisStage | null {
  let worst: CrisisStage | null = null;
  for (const s of stages) {
    if (s == null) continue;
    if (worst == null || s < worst) worst = s;
  }
  return worst;
}

export function worstCrisisStageFromAlerts(
  alerts: Iterable<CrisisAlertLike>,
): CrisisStage | null {
  return worstCrisisStage(
    [...alerts].map((a) => resolveCrisisStage(a)),
  );
}

/** Sort key: stage ascending (S1 first), stable for equal stages via tieBreak. */
export function compareCrisisAlerts(
  a: CrisisAlertLike & { lastSeenAt?: Date | null; createdAt?: Date | null },
  b: CrisisAlertLike & { lastSeenAt?: Date | null; createdAt?: Date | null },
): number {
  const sa = resolveCrisisStage(a);
  const sb = resolveCrisisStage(b);
  if (sa !== sb) return sa - sb;
  const ta = (a.lastSeenAt ?? a.createdAt)?.getTime() ?? 0;
  const tb = (b.lastSeenAt ?? b.createdAt)?.getTime() ?? 0;
  return tb - ta;
}

/**
 * Map S1–S4 → existing wall CSS tones (healthy / warning / critical).
 * S4 still uses warning so open routine alerts don't look "all green".
 */
export function crisisStageToWallTone(
  stage: CrisisStage | null,
): "healthy" | "warning" | "critical" {
  if (stage == null) return "healthy";
  if (stage <= 2) return "critical";
  return "warning";
}

export function crisisStageHeroLabel(stage: CrisisStage | null): string {
  if (stage == null) return "OK";
  const meta = CRISIS_STAGE_META[stage];
  return `${meta.short} · ${meta.name.toUpperCase()}`;
}

/** Worst stage among open alerts for one module (optional related modules). */
export function crisisStageForModule(
  module: string,
  alerts: Iterable<CrisisAlertLike>,
  related: readonly string[] = [],
): CrisisStage | null {
  const want = new Set([module, ...related]);
  return worstCrisisStageFromAlerts(
    [...alerts].filter((a) => want.has(a.module)),
  );
}
