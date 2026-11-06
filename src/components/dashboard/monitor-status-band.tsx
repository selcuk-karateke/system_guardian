"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { BackgroundJob, JobKind } from "@/lib/jobs/types";
import {
  CRISIS_STAGE_META,
  type CrisisStage,
} from "@/lib/crisis/stages";
import { cn } from "@/lib/utils";
import { MonitorRefreshSelect } from "./monitor-auto-refresh";
import { GlyphTicker } from "./glyph-ticker";

const POLL_ACTIVE_MS = 2000;
const POLL_IDLE_MS = 12_000;

export type MonitorEgressInfo = {
  txMbps?: number;
  txBytes?: number;
  windowSec?: number;
  iface?: string | null;
  /** Agent top talker — answers "is the connection still active?" */
  topTalker?: string | null;
  topTalkerDetail?: string | null;
};

type Props = {
  wallTone: "healthy" | "warning" | "critical";
  crisisStage: CrisisStage | null;
  /** Fallback hero when no live job — e.g. "S4 · ROUTINE" */
  hero: string;
  counts: { ok: number; s4: number; s3: number; s2: number; s1: number };
  lastCheck: Date | null;
  /** From parent `/api/monitor/live` poll */
  egress?: MonitorEgressInfo | null;
  streamLive?: boolean;
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
 * Egress/streamLive from parent MonitorLivePanel poll.
 * memo: live metric sparklines must not re-render this band every sample.
 */
export const MonitorStatusBand = memo(function MonitorStatusBand({
  wallTone,
  crisisStage,
  hero,
  counts,
  lastCheck,
  egress = null,
  streamLive = false,
}: Props) {
  const jobs = useLiveJobs();
  const live = jobs[0] ?? null;
  const liveEgress = egress;

  const displayHero = live
    ? `${stageShort(crisisStage)} · ${jobActionWord(live.kind)}`
    : hero;

  // Stable ticker text (label only) — detail changes every ~2s would restart scramble.
  const displayBlurb = live
    ? `${live.label} · läuft`
    : crisisStage != null
      ? CRISIS_STAGE_META[crisisStage].blurb
      : null;
  const displayDetail =
    live?.detail && live.detail.trim() && live.detail !== live.label
      ? live.detail
      : null;

  const egressHot =
    liveEgress?.txMbps != null &&
    (liveEgress.txMbps >= 15 ||
      (liveEgress.txBytes != null &&
        liveEgress.txBytes >= 100 * 1024 * 1024));

  const rateLine =
    liveEgress?.txMbps != null && Number.isFinite(liveEgress.txMbps)
      ? [
          `↑ ${liveEgress.txMbps.toFixed(1)} Mbit/s`,
          liveEgress.iface,
          liveEgress.windowSec != null
            ? `${liveEgress.windowSec.toFixed(0)}s`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

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
            {live ? (
              <>
                <GlyphTicker
                  text={displayBlurb}
                  loop
                  loopDelayMs={2200}
                  cycleCount={4}
                />
                {displayDetail ? (
                  <span className="monitor-status-sub-detail">
                    {" "}
                    · {displayDetail}
                  </span>
                ) : null}
              </>
            ) : (
              displayBlurb
            )}
          </p>
        )}
        <div className="monitor-status-info">
          {rateLine ? (
            <p
              className={cn(
                "monitor-status-egress",
                egressHot && "monitor-status-egress--hot",
              )}
            >
              {streamLive ? (
                <span className="monitor-live-dot" title="Live-Poll aktiv" />
              ) : null}
              {rateLine}
            </p>
          ) : (
            <p className="monitor-status-egress monitor-status-egress--muted">
              ↑ Egress · warte auf Agent
            </p>
          )}
          {liveEgress?.topTalker ? (
            <p
              className={cn(
                "monitor-status-talker",
                egressHot && "monitor-status-egress--hot",
              )}
              title={
                liveEgress.topTalkerDetail ??
                "Top-Talker (Agent). TLS/SSH = Inhalt verschlüsselt."
              }
            >
              {liveEgress.topTalker}
            </p>
          ) : null}
        </div>
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
          <span>{lastCheck ? lastCheck.toLocaleString("en-US") : "—"}</span>
          <span className="monitor-status-meta-sep" aria-hidden>
            ·
          </span>
          <MonitorRefreshSelect className="monitor-status-refresh" />
        </p>
      </div>
    </section>
  );
});
