import { saveSnapshot, getLatestSnapshotMeta } from "@/lib/history/persist";
import {
  AGENT_FRESH_MS,
  AGENT_LIVE_CATEGORY,
  type AgentIngestPayload,
  type AgentLiveSnapshot,
  type AgentTalker,
  type AgentTalkerKind,
} from "@/lib/agent/types";
import { touchAgentPresence } from "@/lib/agent/token";
import {
  classifyTalkerKind,
  formatTopTalkerDetail,
  formatTopTalkerLine,
  formatTopTalkerPeer,
  sanitizeCmdline,
  topTalkerRemoteIp,
} from "@/lib/agent/talker-meta";
import {
  isPrivateOrLocalIp,
  isTrustedOutboundProcess,
} from "@/lib/checks/connection-patterns";
import type { AlertInput } from "@/lib/checks/types";
import { THRESHOLDS } from "@/lib/config";

export { formatTopTalkerLine, formatTopTalkerDetail } from "@/lib/agent/talker-meta";

/** Open alerts from agent ingest (volatile Mbps must not create duplicates). */
export function isAgentEgressAlertMessage(message: string): boolean {
  return (
    /Möglicher Datenabfluss:.*\(Agent\)/i.test(message) ||
    /(?:Sehr )?hoher Host-Egress \(Agent\)/i.test(message) ||
    /Hoher Egress(?:\s|:).*?\(Agent\)/i.test(message)
  );
}

/** Host vitals for TV metric cards (agent push). */
export type MonitorLiveHost = {
  cpuPercent: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
  ramPercent: number | null;
  diskPercent: number | null;
  uptimeSec: number | null;
};

/** Wire payload for monitor status band + metric cards (JSON poll + SSR seed). */
export type MonitorLivePayload = {
  ok: true;
  online: boolean;
  agentVersion: string | null;
  receivedAt: number | null;
  egress: {
    txMbps: number;
    txBytes: number | null;
    windowSec: number;
    iface: string | null;
    topTalker: string | null;
    /** Hover / alert detail — cmdline & files */
    topTalkerDetail: string | null;
  } | null;
  host: MonitorLiveHost | null;
};

function bytesToPercent(
  used: number | null | undefined,
  total: number | null | undefined,
): number | null {
  if (used == null || total == null || total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((used / total) * 100)));
}

export function hostFromAgentLive(
  live: AgentLiveSnapshot | null,
): MonitorLiveHost | null {
  if (!live) return null;
  const hasAny =
    live.cpuPercent != null ||
    live.load1 != null ||
    live.memUsedBytes != null ||
    live.diskUsedBytes != null ||
    live.uptimeSec != null;
  if (!hasAny) return null;
  return {
    cpuPercent: live.cpuPercent,
    load1: live.load1,
    load5: live.load5,
    load15: live.load15,
    ramPercent: bytesToPercent(live.memUsedBytes, live.memTotalBytes),
    diskPercent: bytesToPercent(live.diskUsedBytes, live.diskTotalBytes),
    uptimeSec: live.uptimeSec,
  };
}

export function toMonitorLivePayload(
  live: AgentLiveSnapshot | null,
): MonitorLivePayload {
  const host = hostFromAgentLive(live);
  if (!live) {
    return {
      ok: true,
      online: false,
      agentVersion: null,
      receivedAt: null,
      egress: null,
      host: null,
    };
  }
  if (!live.egress) {
    return {
      ok: true,
      online: true,
      agentVersion: live.agentVersion,
      receivedAt: live.receivedAt,
      egress: null,
      host,
    };
  }
  const topTalker = formatTopTalkerLine(live.talkers);
  const topTalkerDetail = formatTopTalkerDetail(live.talkers);
  const top = [...live.talkers].sort(
    (a, b) =>
      Math.max(b.txBps, b.procIoWriteBps ?? 0) -
      Math.max(a.txBps, a.procIoWriteBps ?? 0),
  )[0];
  return {
    ok: true,
    online: true,
    agentVersion: live.agentVersion,
    receivedAt: live.receivedAt,
    egress: {
      txMbps: live.egress.txMbps,
      txBytes: top?.txBytes ?? null,
      windowSec: live.egress.windowSec,
      iface: live.egress.iface,
      topTalker,
      topTalkerDetail,
    },
    host,
  };
}

const KINDS = new Set<AgentTalkerKind>([
  "ssh",
  "https",
  "http",
  "rsync",
  "ftp",
  "smtp",
  "db",
  "smb",
  "nfs",
  "git",
  "dns",
  "other",
]);

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

function parseStringList(raw: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const s = item.trim().slice(0, maxLen);
    if (!s) continue;
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function parseTalker(raw: unknown): AgentTalker | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const remoteIp = typeof o.remoteIp === "string" ? o.remoteIp.trim() : "";
  if (!remoteIp) return null;
  const process =
    typeof o.process === "string" && o.process.trim()
      ? o.process.trim().slice(0, 128)
      : "unknown";
  const state = o.state === "established" ? "established" : "other";
  const remotePort = numOrNull(o.remotePort);
  const kindRaw = typeof o.kind === "string" ? o.kind.trim() : "";
  const kind = KINDS.has(kindRaw as AgentTalkerKind)
    ? (kindRaw as AgentTalkerKind)
    : classifyTalkerKind(process, remotePort);
  const cmdlineRaw =
    typeof o.cmdline === "string" ? o.cmdline : null;
  const cmdline = cmdlineRaw ? sanitizeCmdline(cmdlineRaw, 160) : null;
  const hasExplicitProcIo =
    o.procIoWriteBps != null ||
    o.procIoReadBps != null ||
    o.procIoWriteBytes != null ||
    o.procIoReadBytes != null;
  // Legacy agents stuffed /proc/<pid>/io into txBps/txBytes — remap to procIo*.
  const legacyWriteBps = Math.max(0, numOrNull(o.txBps) ?? 0);
  const legacyReadBps = Math.max(0, numOrNull(o.rxBps) ?? 0);
  return {
    pid: numOrNull(o.pid),
    process,
    remoteIp: remoteIp.slice(0, 64),
    remotePort,
    state,
    // No reliable per-socket network counters yet (ss has no bytes).
    txBps: 0,
    rxBps: 0,
    txBytes: null,
    rxBytes: null,
    procIoWriteBps: hasExplicitProcIo
      ? Math.max(0, numOrNull(o.procIoWriteBps) ?? 0)
      : legacyWriteBps,
    procIoReadBps: hasExplicitProcIo
      ? Math.max(0, numOrNull(o.procIoReadBps) ?? 0)
      : legacyReadBps,
    procIoWriteBytes: hasExplicitProcIo
      ? numOrNull(o.procIoWriteBytes)
      : numOrNull(o.txBytes),
    procIoReadBytes: hasExplicitProcIo
      ? numOrNull(o.procIoReadBytes)
      : numOrNull(o.rxBytes),
    stillActive: o.stillActive === true || o.stillActive === "true",
    kind,
    cmdline,
    openFiles: parseStringList(o.openFiles, 5, 160),
  };
}

/** Validate + normalize agent POST body. */
export function parseAgentIngestPayload(
  body: unknown,
): AgentIngestPayload | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const agentVersion =
    typeof o.agentVersion === "string" ? o.agentVersion.slice(0, 32) : "0";
  const hostname =
    typeof o.hostname === "string" ? o.hostname.slice(0, 128) : "unknown";

  const talkersRaw = Array.isArray(o.talkers) ? o.talkers : [];
  const talkers = talkersRaw
    .map(parseTalker)
    .filter((t): t is AgentTalker => t != null)
    .slice(0, 40);

  let egress: AgentIngestPayload["egress"] = null;
  if (o.egress && typeof o.egress === "object") {
    const e = o.egress as Record<string, unknown>;
    const txMbps = numOrNull(e.txMbps);
    const rxMbps = numOrNull(e.rxMbps);
    if (txMbps != null && rxMbps != null) {
      egress = {
        txMbps,
        rxMbps,
        iface: typeof e.iface === "string" ? e.iface.slice(0, 64) : null,
        windowSec: Math.max(1, numOrNull(e.windowSec) ?? 5),
      };
    }
  }

  return {
    agentVersion,
    hostname,
    collectedAt: numOrNull(o.collectedAt) ?? Date.now(),
    cpuPercent: numOrNull(o.cpuPercent),
    load1: numOrNull(o.load1),
    load5: numOrNull(o.load5),
    load15: numOrNull(o.load15),
    memUsedBytes: numOrNull(o.memUsedBytes),
    memTotalBytes: numOrNull(o.memTotalBytes),
    diskUsedBytes: numOrNull(o.diskUsedBytes),
    diskTotalBytes: numOrNull(o.diskTotalBytes),
    uptimeSec: numOrNull(o.uptimeSec),
    egress,
    talkers,
  };
}

export async function persistAgentIngest(
  serverId: string,
  payload: AgentIngestPayload,
): Promise<AgentLiveSnapshot> {
  const snap: AgentLiveSnapshot = {
    ...payload,
    serverId,
    receivedAt: Date.now(),
  };
  await saveSnapshot(
    serverId,
    AGENT_LIVE_CATEGORY,
    snap as unknown as Record<string, unknown>,
  );
  await touchAgentPresence(serverId, payload.agentVersion);
  return snap;
}

export async function getFreshAgentLive(
  serverId: string,
  maxAgeMs = AGENT_FRESH_MS,
): Promise<AgentLiveSnapshot | null> {
  const meta = await getLatestSnapshotMeta(serverId, AGENT_LIVE_CATEGORY);
  if (!meta) return null;
  const age = Date.now() - meta.createdAt.getTime();
  if (age > maxAgeMs) return null;
  const p = meta.payload as Partial<AgentLiveSnapshot>;
  if (!p || typeof p !== "object") return null;
  return {
    ...(p as AgentLiveSnapshot),
    serverId,
    receivedAt: meta.createdAt.getTime(),
  };
}

/** Discard counter-reset / garbage iface spikes on short agent windows. */
function isPlausibleAgentEgressMbps(txMbps: number, windowSec: number): boolean {
  if (!(txMbps > 0) || !(windowSec > 0)) return false;
  if (windowSec < 1) return false;
  // > ~5 Gbit/s on a 5s sample is almost always a counter glitch.
  if (txMbps > 5_000) return false;
  return true;
}

/**
 * Build egress-oriented alerts from a fresh agent sample (iface rate + talkers).
 *
 * Agent windows are short → never emit S1 "Datenabfluss" wording here.
 * Talker /proc/io is not network evidence. Trusted outbound processes
 * (e.g. hermes) and LAN peers are suppressed.
 */
export function alertsFromAgentLive(live: AgentLiveSnapshot): AlertInput[] {
  const egress = live.egress;
  if (!egress) return [];
  if (!isPlausibleAgentEgressMbps(egress.txMbps, egress.windowSec)) {
    return [];
  }

  const remoteIp = topTalkerRemoteIp(live.talkers);
  if (remoteIp && isPrivateOrLocalIp(remoteIp)) {
    return [];
  }

  const talkerPeer = formatTopTalkerPeer(live.talkers);
  const topProcess = talkerPeer?.split(/\s*→\s*/)[0]?.trim();
  if (topProcess && isTrustedOutboundProcess(topProcess)) {
    // Known integration (hermes/Telegram, traefik, …) — monitor only.
    return [];
  }

  const mbpsWarning = THRESHOLDS.egressMbpsWarning();
  const mbpsCritical = THRESHOLDS.egressMbpsCritical();
  const talkerDetail = formatTopTalkerDetail(live.talkers);
  const ifaceHint = egress.iface ? ` · ${egress.iface}` : "";
  const talkerHint = talkerPeer ? ` · ${talkerPeer}` : "";
  const rateNote = `Host-TX ${egress.txMbps.toFixed(1)} Mbit/s (${egress.windowSec}s Fenster, Interface-Summe — nicht pro Prozess)`;

  if (egress.txMbps >= mbpsCritical) {
    return [
      {
        // Technical critical → crisis S2 via server_health, not S1 (no Datenabfluss).
        level: "critical",
        dedupeKey: `agent-egress:critical:${egress.iface ?? "-"}:${talkerPeer ?? "-"}`,
        message: `Sehr hoher Host-Egress (Agent)${ifaceHint}${talkerHint}`,
        recommendation: talkerDetail
          ? `${rateNote}. Top-Socket (Identität via ss): ${talkerDetail}. Prozess-I/O ≠ Netzupload. Unerwarteter Prozess → Sessions prüfen.`
          : `${rateNote}. Kein Top-Talker. Backup/CDN/Deploy? Sonst ss/nethogs prüfen — Kurzfenster kann Spikes übertreiben.`,
      },
    ];
  }
  if (egress.txMbps >= mbpsWarning) {
    return [
      {
        level: "warning",
        dedupeKey: `agent-egress:warning:${egress.iface ?? "-"}:${talkerPeer ?? "-"}`,
        message: `Hoher Host-Egress (Agent)${ifaceHint}${talkerHint}`,
        recommendation: talkerDetail
          ? `${rateNote}. Kontext: ${talkerDetail}`
          : `${rateNote}. Backup/Deploy/CDN erwartet?`,
      },
    ];
  }
  return [];
}
