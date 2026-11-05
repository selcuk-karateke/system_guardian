"use client";

import { useEffect, useRef, useState } from "react";
import type { BackgroundJob, JobKind } from "@/lib/jobs/types";
import {
  CRISIS_STAGE_META,
  type CrisisStage,
} from "@/lib/crisis/stages";
import { cn, formatBytes } from "@/lib/utils";
import { GlyphTicker } from "./glyph-ticker";

const POLL_ACTIVE_MS = 2000;
const POLL_IDLE_MS = 12_000;

export type MonitorEgressInfo = {
  txMbps?: number;
  txBytes?: number;
  windowSec?: number;
  iface?: string | null;
};

type Props = {
  wallTone: "healthy" | "warning" | "critical";
  crisisStage: CrisisStage | null;
  /** Fallback hero when no live job — e.g. "S4 · ROUTINE" */
  hero: string;
  counts: { ok: number; s4: number; s3: number; s2: number; s1: number };
  lastCheck: Date | null;
  egress?: MonitorEgressInfo | null;
};

function stageShort(stage: CrisisStage | null): string {
  if (stage == null) return "OK";
  return CRISIS_STAGE_META[stage].short;
}

function jobActionWord(kind: JobKind): string {
  if (kind === "trivy_scan" || kind === "trivy_batch") return "SCAN";
  if (kind === "backup") return "BACKUP";
  if (kind === "redeploy") return "DEPLOY";
  if (kind === "docker_refresh") return "INVENTORY";
  return "CHECK";
}

function formatEgressLine(e: MonitorEgressInfo): string | null {
  if (e.txMbps == null || !Number.isFinite(e.txMbps)) return null;
  const parts = [`↑ ${e.txMbps.toFixed(1)} Mbit/s`];
  if (e.txBytes != null && e.txBytes > 0) {
    const win =
      e.windowSec != null && e.windowSec >= 60
        ? e.windowSec >= 3600
          ? `${Math.round(e.windowSec / 3600)}h`
          : `${Math.max(1, Math.round(e.windowSec / 60))}m`
        : null;
    parts.push(
      win
        ? `${formatBytes(e.txBytes)} / ${win}`
        : formatBytes(e.txBytes),
    );
  }
  if (e.iface) parts.push(e.iface);
  return parts.join(" · ");
}

function jobsKey(jobs: BackgroundJob[]): string {
  return jobs.map((j) => `${j.id}:${j.status}:${j.detail ?? ""}`).join("|");
}

function useLiveJobs(): BackgroundJob[] {
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const keyRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      let active = false;
      try {
        const res = await fetch("/api/jobs", { cache: "no-store" });
        if (res.ok && !cancelled) {
          const data = (await res.json()) as {
            ok: boolean;
            active?: boolean;
            jobs: BackgroundJob[];
          };
          if (data.ok) {
            const live = data.jobs.filter(
              (j) => j.status === "queued" || j.status === "running",
            );
            active = live.length > 0 || Boolean(data.active);
            const nextKey = jobsKey(live);
            if (nextKey !== keyRef.current) {
              keyRef.current = nextKey;
              setJobs(live);
            }
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) {
          timer = setTimeout(tick, active ? POLL_ACTIVE_MS : POLL_IDLE_MS);
        }
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return jobs;
}

/**
 * Monitor hero band: crisis stage integrates live job (S4 · SCAN) — no extra badge.
 * Egress line shows last measured uplink (backup / possible exfil).
 */
export function MonitorStatusBand({
  wallTone,
  crisisStage,
  hero,
  counts,
  lastCheck,
  egress,
}: Props) {
  const jobs = useLiveJobs();
  const live = jobs[0] ?? null;

  const displayHero = live
    ? `${stageShort(crisisStage)} · ${jobActionWord(live.kind)}`
    : hero;

  const displayBlurb = live
    ? `${live.label}${live.detail ? ` · ${live.detail}` : ""} · läuft`
    : crisisStage != null
      ? CRISIS_STAGE_META[crisisStage].blurb
      : null;

  const egressLine = egress ? formatEgressLine(egress) : null;
  // Visual hint only (backup uploads) — alerts use higher THRESHOLD_EGRESS_*
  const egressHot =
    egress?.txMbps != null &&
    (egress.txMbps >= 15 ||
      (egress.txBytes != null && egress.txBytes >= 100 * 1024 * 1024));

  return (
    <section
      className={cn(
        "monitor-glass monitor-status-band",
        `monitor-status-band--${wallTone}`,
        live && "monitor-status-band--busy",
        egressHot && "monitor-status-band--egress-hot",
      )}
    >
      <div className="monitor-status-main">
        <p
          className={cn(
            "monitor-display",
            `monitor-display--${wallTone}`,
            live && "monitor-display--busy",
          )}
        >
          {displayHero}
        </p>
        {displayBlurb && (
          <p className="monitor-status-sub">
            {live ? <GlyphTicker text={displayBlurb} /> : displayBlurb}
          </p>
        )}
      </div>
      <div className="monitor-status-side">
        <div className="monitor-badges">
          <span className="monitor-badge monitor-badge--ok">
            {counts.ok} OK
          </span>
          <span className="monitor-badge monitor-badge--warn">
            {counts.s4 + counts.s3} S3–4
          </span>
          <span className="monitor-badge monitor-badge--crit">
            {counts.s2 + counts.s1} S1–2
          </span>
        </div>
        <p className="monitor-status-meta">
          {lastCheck ? lastCheck.toLocaleString("en-US") : "—"} · 30s
        </p>
        {egressLine ? (
          <p
            className={cn(
              "monitor-status-egress",
              egressHot && "monitor-status-egress--hot",
            )}
            title="Host uplink (TX) seit letztem Sample — Backup ok, unerwartet = DSGVO-Risiko"
          >
            {egressLine}
          </p>
        ) : (
          <p className="monitor-status-egress monitor-status-egress--muted">
            ↑ Egress · warte auf Sample
          </p>
        )}
      </div>
    </section>
  );
}
