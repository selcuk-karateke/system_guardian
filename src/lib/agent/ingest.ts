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
  sanitizeCmdline,
} from "@/lib/agent/talker-meta";
import type { AlertInput } from "@/lib/checks/types";
import { THRESHOLDS } from "@/lib/config";

export { formatTopTalkerLine, formatTopTalkerDetail } from "@/lib/agent/talker-meta";

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
  return {
    pid: numOrNull(o.pid),
    process,
    remoteIp: remoteIp.slice(0, 64),
    remotePort,
    state,
    txBps: Math.max(0, numOrNull(o.txBps) ?? 0),
    rxBps: Math.max(0, numOrNull(o.rxBps) ?? 0),
    txBytes: numOrNull(o.txBytes),
    rxBytes: numOrNull(o.rxBytes),
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

/**
 * Build egress-oriented alerts from a fresh agent sample (rate + talkers).
 * Volume thresholds are not used here — agent windows are short.
 */
export function alertsFromAgentLive(live: AgentLiveSnapshot): AlertInput[] {
  const egress = live.egress;
  if (!egress) return [];

  const mbpsWarning = THRESHOLDS.egressMbpsWarning();
  const mbpsCritical = THRESHOLDS.egressMbpsCritical();
  const talkerLine = formatTopTalkerLine(live.talkers);
  const talkerDetail = formatTopTalkerDetail(live.talkers);
  const ifaceHint = egress.iface ? ` · ${egress.iface}` : "";
  const talkerHint = talkerLine ? ` · ${talkerLine}` : "";

  if (egress.txMbps >= mbpsCritical) {
    return [
      {
        level: "critical",
        message: `Möglicher Datenabfluss: Egress ${egress.txMbps.toFixed(1)} Mbit/s (Agent)${ifaceHint}${talkerHint}`,
        recommendation: talkerDetail
          ? `Was geht raus: ${talkerDetail}. Unbekannt/unerwartet → Sessions prüfen, ggf. NIC/Route kappen, Meldepflicht prüfen. TLS/SSH = Inhalt nicht einsehbar.`
          : "DSGVO: Daten die weg sind, sind weg. Sofort wer/wohin? Unbekannt → NIC ziehen, Sessions killen, Meldepflicht prüfen",
      },
    ];
  }
  if (egress.txMbps >= mbpsWarning) {
    return [
      {
        level: "warning",
        message: `Hoher Egress: ${egress.txMbps.toFixed(1)} Mbit/s (Agent)${ifaceHint}${talkerHint}`,
        recommendation: talkerDetail
          ? `Backup/Deploy erwartet? Sonst — was geht raus: ${talkerDetail}`
          : "Backup/Deploy/CDN erwartet? Sonst Prozess + Remote-IP — kann Vorstufe zu Datenklau sein",
      },
    ];
  }
  return [];
}
