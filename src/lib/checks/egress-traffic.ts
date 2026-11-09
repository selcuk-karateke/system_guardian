import { THRESHOLDS } from "@/lib/config";
import {
  getLatestSnapshotMeta,
  saveSnapshot,
} from "@/lib/history/persist";
import type { SshClient } from "@/lib/ssh/types";
import { formatBytes } from "@/lib/utils";
import type { AlertInput } from "./types";

/** Skip bridge/veth/loopback — count host uplink-ish interfaces. */
const SKIP_IFACE =
  /^(lo|veth|br-|docker|virbr|fwbr|cali|flannel|cni|tun|tap)/i;

export type IfaceCounters = { rx: number; tx: number };

export type EgressSnapshot = {
  at: number;
  totalRx: number;
  totalTx: number;
  byIface: Record<string, IfaceCounters>;
};

export type EgressEvaluation = {
  snapshot: EgressSnapshot;
  /** null on first sample / too-short window */
  delta: {
    seconds: number;
    rxBytes: number;
    txBytes: number;
    txMbps: number;
    rxMbps: number;
    topTxIface: string | null;
  } | null;
  alerts: AlertInput[];
};

/**
 * Parse `/proc/net/dev` — columns: iface rx_bytes … tx_bytes …
 */
export function parseProcNetDev(stdout: string): EgressSnapshot {
  const byIface: Record<string, IfaceCounters> = {};
  let totalRx = 0;
  let totalTx = 0;

  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (!line || line.includes("|") || line.startsWith("Inter")) continue;
    const m = line.match(/^([^:]+):\s*(.+)$/);
    if (!m) continue;
    const iface = m[1]!.trim();
    if (SKIP_IFACE.test(iface)) continue;
    const nums = m[2]!.trim().split(/\s+/).map((n) => Number(n));
    if (nums.length < 9) continue;
    const rx = nums[0] ?? 0;
    const tx = nums[8] ?? 0;
    if (!Number.isFinite(rx) || !Number.isFinite(tx)) continue;
    byIface[iface] = { rx, tx };
    totalRx += rx;
    totalTx += tx;
  }

  return { at: Date.now(), totalRx, totalTx, byIface };
}

export function topTxInterface(
  prev: EgressSnapshot,
  curr: EgressSnapshot,
): string | null {
  let best: string | null = null;
  let bestDelta = 0;
  for (const [iface, cur] of Object.entries(curr.byIface)) {
    const p = prev.byIface[iface];
    const d = cur.tx - (p?.tx ?? cur.tx);
    if (d > bestDelta) {
      bestDelta = d;
      best = iface;
    }
  }
  return best;
}

export type EgressThresholds = {
  mbpsWarning: number;
  mbpsCritical: number;
  mbWarning: number;
  mbCritical: number;
  /** Ignore windows shorter than this (seconds). */
  minWindowSec: number;
  /**
   * Volume (MB) thresholds only apply when the sample window is ≤ this.
   * Longer gaps (e.g. 14h after cron pause) use rate (Mbit/s) only —
   * otherwise normal overnight traffic trips "Datenabfluss" S1.
   */
  maxVolumeWindowSec: number;
};

export const DEFAULT_EGRESS_THRESHOLDS: EgressThresholds = {
  mbpsWarning: 40,
  mbpsCritical: 150,
  mbWarning: 400,
  mbCritical: 2048,
  minWindowSec: 60,
  maxVolumeWindowSec: 20 * 60,
};

/**
 * Compare two counter snapshots → rate + volume alerts (exfil-oriented).
 */
export function evaluateEgressDelta(
  prev: EgressSnapshot | null,
  curr: EgressSnapshot,
  thresholds: EgressThresholds = DEFAULT_EGRESS_THRESHOLDS,
): EgressEvaluation {
  if (!prev) {
    return { snapshot: curr, delta: null, alerts: [] };
  }

  const seconds = Math.max(0, (curr.at - prev.at) / 1000);
  if (seconds < thresholds.minWindowSec) {
    return { snapshot: curr, delta: null, alerts: [] };
  }

  const rxBytes = Math.max(0, curr.totalRx - prev.totalRx);
  const txBytes = Math.max(0, curr.totalTx - prev.totalTx);
  const txMbps = (txBytes * 8) / seconds / 1e6;
  const rxMbps = (rxBytes * 8) / seconds / 1e6;
  const txMb = txBytes / (1024 * 1024);
  const topTxIface = topTxInterface(prev, curr);
  const useVolume = seconds <= thresholds.maxVolumeWindowSec;

  const alerts: AlertInput[] = [];
  const windowLabel =
    seconds >= 3600
      ? `${Math.round(seconds / 3600)} Std`
      : `${Math.max(1, Math.round(seconds / 60))} Min`;
  const ifaceHint = topTxIface ? ` · ${topTxIface}` : "";

  const critical =
    txMbps >= thresholds.mbpsCritical ||
    (useVolume && txMb >= thresholds.mbCritical);
  const warning =
    !critical &&
    (txMbps >= thresholds.mbpsWarning ||
      (useVolume && txMb >= thresholds.mbWarning));

  if (critical) {
    alerts.push({
      level: "critical",
      dedupeKey: `ssh-egress:critical:${topTxIface ?? "-"}`,
      message: `Möglicher Datenabfluss: Egress kritisch${ifaceHint}`,
      recommendation: `Aktuell ${txMbps.toFixed(1)} Mbit/s · ${formatBytes(txBytes)} in ${windowLabel}. DSGVO: Daten die weg sind, sind weg. Sofort wer/wohin (nethogs/ss)? Unbekannt → NIC ziehen, Sessions killen, Meldepflicht prüfen`,
    });
  } else if (warning) {
    alerts.push({
      level: "warning",
      dedupeKey: `ssh-egress:warning:${topTxIface ?? "-"}`,
      message: `Hoher Egress${ifaceHint}`,
      recommendation: `Aktuell ${txMbps.toFixed(1)} Mbit/s · ${formatBytes(txBytes)} in ${windowLabel}. Backup/Deploy/CDN erwartet? Sonst Prozess + Remote-IP — kann Vorstufe zu Datenklau sein`,
    });
  }

  return {
    snapshot: curr,
    delta: { seconds, rxBytes, txBytes, txMbps, rxMbps, topTxIface },
    alerts,
  };
}

export function egressThresholdsFromEnv(): EgressThresholds {
  return {
    mbpsWarning: THRESHOLDS.egressMbpsWarning(),
    mbpsCritical: THRESHOLDS.egressMbpsCritical(),
    mbWarning: THRESHOLDS.egressMbWarning(),
    mbCritical: THRESHOLDS.egressMbCritical(),
    minWindowSec: 60,
    maxVolumeWindowSec: DEFAULT_EGRESS_THRESHOLDS.maxVolumeWindowSec,
  };
}

/**
 * Read `/proc/net/dev`, compare to last `host_egress` snapshot, persist current.
 * Safe to call from server_health (15m) and network (60m).
 */
export async function sampleHostEgress(
  serverId: string,
  ssh: SshClient,
): Promise<EgressEvaluation> {
  const { stdout } = await ssh.exec("cat /proc/net/dev 2>/dev/null || true");
  const curr = parseProcNetDev(stdout);
  const prevMeta = await getLatestSnapshotMeta(serverId, "host_egress");
  const raw = prevMeta?.payload as Partial<EgressSnapshot> | undefined;
  const prev: EgressSnapshot | null =
    raw &&
    typeof raw.totalTx === "number" &&
    typeof raw.totalRx === "number" &&
    typeof raw.at === "number"
      ? {
          at: raw.at,
          totalRx: raw.totalRx,
          totalTx: raw.totalTx,
          byIface: (raw.byIface as Record<string, IfaceCounters>) ?? {},
        }
      : null;

  const evaluation = evaluateEgressDelta(
    prev,
    curr,
    egressThresholdsFromEnv(),
  );
  await saveSnapshot(
    serverId,
    "host_egress",
    evaluation.snapshot as unknown as Record<string, unknown>,
  );
  return evaluation;
}
