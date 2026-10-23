import type { AlertInput } from "@/lib/checks/types";
import type {
  ConnectionSeverity,
  ParsedConnection,
} from "@/lib/checks/connection-patterns";
import {
  enrichReasonWithContainer,
  parsePidFromSsProcess,
  type ContainerProcessInfo,
} from "@/lib/checks/container-process";
import { formatSinceLastCheck } from "@/lib/checks/fail2ban-metrics";

export type SecuritySeverity = "critical" | "warning" | "info";

/**
 * Minimal normalisiertes Security-Signal (noch ohne Persistenz).
 * Rohsignal → SecurityEvent → AlertInput
 */
export type SecurityEvent = {
  ruleId: string;
  source: string;
  severity: SecuritySeverity;
  raw: string;
  entity: string;
  metadata: Record<string, unknown>;
  serverId: string;
  occurredAt: Date;
};

type SsHit = { reason: string; severity: ConnectionSeverity };

export type SsHitEventContext = {
  serverId: string;
  rawLine?: string;
  /** Defaults to now when the event is created */
  occurredAt?: Date;
  /** Optional PID→Docker mapping from /proc cgroup */
  container?: ContainerProcessInfo | null;
};

function ruleIdForSsHit(hit: SsHit): string {
  if (/BSI\/incident IP/i.test(hit.reason)) return "ss.blocked_ip";
  if (/Connection to port/i.test(hit.reason)) return "ss.suspicious_port";
  if (/temp path/i.test(hit.reason)) return "ss.temp_path_outbound";
  if (/^Outbound (80|443)/i.test(hit.reason)) return "ss.untrusted_http_outbound";
  return "ss.suspicious_outbound";
}

/** suspicious `ss`-Hit (isSuspiciousConnection) → SecurityEvent */
export function suspiciousSsHitToSecurityEvent(
  conn: ParsedConnection,
  hit: SsHit,
  ctx: SsHitEventContext,
): SecurityEvent {
  const rawLine = ctx.rawLine ?? "";
  const pid =
    ctx.container?.pid ?? parsePidFromSsProcess(conn.process) ?? undefined;
  const reason = enrichReasonWithContainer(hit.reason, ctx.container);
  return {
    ruleId: ruleIdForSsHit(hit),
    source: "ss.tunap",
    severity: hit.severity,
    raw:
      rawLine.trim() ||
      `${conn.proto} ${conn.state} ${conn.local} ${conn.remote} ${conn.process}`.trim(),
    entity: `${conn.remoteIp}:${conn.remotePort || "?"}`,
    metadata: {
      reason,
      proto: conn.proto,
      state: conn.state,
      local: conn.local,
      remote: conn.remote,
      remoteIp: conn.remoteIp,
      remotePort: conn.remotePort,
      process: conn.process.slice(0, 200),
      ...(pid != null ? { pid } : {}),
      ...(ctx.container?.containerId
        ? { containerId: ctx.container.containerId }
        : {}),
      ...(ctx.container?.containerName
        ? { containerName: ctx.container.containerName }
        : {}),
      ...(ctx.container?.image ? { containerImage: ctx.container.image } : {}),
    },
    serverId: ctx.serverId,
    occurredAt: ctx.occurredAt ?? new Date(),
  };
}

/**
 * Aggregiert SS-Events zum bisherigen connections_other-Alert
 * (gleiches Label/Detail/Level wie vor der Event-Schicht).
 */
export function alertInputFromSsSecurityEvents(
  events: SecurityEvent[],
): AlertInput | null {
  if (events.length === 0) return null;

  const anyCritical = events.some((e) => e.severity === "critical");
  const label = anyCritical
    ? "Verdächtige ausgehende Verbindungen"
    : "Unbekannte ausgehende Verbindungen";
  const detail = events
    .slice(0, 3)
    .map((e) => String(e.metadata.reason ?? e.raw))
    .join("; ");

  const hasContainer = events.some(
    (e) => e.metadata.containerId || e.metadata.containerName,
  );

  return {
    level: anyCritical ? "critical" : "warning",
    message: `${label}: ${detail}`,
    ...(hasContainer
      ? {
          recommendation:
            "Prozess gehört zu einem Container (cgroup) — docker inspect / Logs prüfen; kein pkill -u Host-User (UID-Mapping).",
        }
      : {}),
  };
}

export function clearanceFieldsFromSsSecurityEvents(events: SecurityEvent[]): {
  label: string;
  status: "fail" | "warn";
  detail: string;
} | null {
  if (events.length === 0) return null;
  const anyCritical = events.some((e) => e.severity === "critical");
  return {
    label: anyCritical
      ? "Verdächtige ausgehende Verbindungen"
      : "Unbekannte ausgehende Verbindungen",
    status: anyCritical ? "fail" : "warn",
    detail: events
      .slice(0, 3)
      .map((e) => String(e.metadata.reason ?? e.raw))
      .join("; "),
  };
}

export type Fail2banBanSpikeInput = {
  serverId: string;
  prevTotal: number;
  currTotal: number;
  currentlyBanned: number;
  hoursSince: number;
  delta: number;
  jail?: string;
  raw?: string;
  occurredAt?: Date;
};

/** Fail2ban Ban-Spike (nach isBanSpike) → SecurityEvent */
export function fail2banBanSpikeToSecurityEvent(
  input: Fail2banBanSpikeInput,
): SecurityEvent {
  const sinceLabel = formatSinceLastCheck(input.hoursSince);
  const reason = `fail2ban Ban-Spike: +${input.delta} Ereignisse in ${sinceLabel} (Total ${input.prevTotal}→${input.currTotal}, ${input.currentlyBanned} aktiv)`;

  return {
    ruleId: "fail2ban.ban_spike",
    source: "fail2ban.sshd",
    severity: "warning",
    raw: input.raw?.trim() || reason,
    entity: input.jail ?? "sshd",
    metadata: {
      reason,
      prevTotal: input.prevTotal,
      currTotal: input.currTotal,
      delta: input.delta,
      currentlyBanned: input.currentlyBanned,
      hoursSince: input.hoursSince,
      sinceLabel,
      jail: input.jail ?? "sshd",
    },
    serverId: input.serverId,
    occurredAt: input.occurredAt ?? new Date(),
  };
}

/** SecurityEvent → bisheriger Ban-Spike-AlertInput */
export function alertInputFromFail2banBanSpikeEvent(
  event: SecurityEvent,
): AlertInput {
  return {
    level: "warning",
    message: String(event.metadata.reason ?? event.raw),
    recommendation: "Review auth.log for coordinated SSH attack",
  };
}

// ---------------------------------------------------------------------------
// Alert rules: fertige SecurityEvents → AlertInput | null (noch keine Detection)
// ---------------------------------------------------------------------------

export type SecurityAlertRule = {
  id: string;
  evaluate: (event: SecurityEvent) => AlertInput | null;
};

function isSsConnectionRuleId(ruleId: string): boolean {
  return ruleId.startsWith("ss.") || ruleId === "network.suspicious_connection";
}

const networkSuspiciousConnectionRule: SecurityAlertRule = {
  id: "network.suspicious_connection",
  evaluate(event) {
    if (!isSsConnectionRuleId(event.ruleId)) return null;
    return alertInputFromSsSecurityEvents([event]);
  },
};

const fail2banBanSpikeRule: SecurityAlertRule = {
  id: "fail2ban.ban_spike",
  evaluate(event) {
    if (event.ruleId !== "fail2ban.ban_spike") return null;
    return alertInputFromFail2banBanSpikeEvent(event);
  },
};

/** Registry: SecurityEvent → Alert (nicht Detection). */
export const SECURITY_ALERT_RULES: readonly SecurityAlertRule[] = [
  networkSuspiciousConnectionRule,
  fail2banBanSpikeRule,
];

export function findSecurityRule(event: SecurityEvent): SecurityAlertRule | null {
  if (isSsConnectionRuleId(event.ruleId)) return networkSuspiciousConnectionRule;
  return SECURITY_ALERT_RULES.find((r) => r.id === event.ruleId) ?? null;
}

/** SecurityEvent → AlertInput | null (Alert-Rule, keine Detection). */
export function alertFromSecurityEvent(event: SecurityEvent): AlertInput | null {
  return findSecurityRule(event)?.evaluate(event) ?? null;
}
