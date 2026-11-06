"use client";

import { useEffect, useRef, useState } from "react";
import type { BackgroundJob, JobKind } from "@/lib/jobs/types";
import {
  CRISIS_STAGE_META,
  type CrisisStage,
} from "@/lib/crisis/stages";
import { cn } from "@/lib/utils";
import { GlyphTicker } from "./glyph-ticker";

const POLL_ACTIVE_MS = 2000;
const POLL_IDLE_MS = 12_000;
/** Egress/talker only — agent pushes ~5s; keep UI near that without full wall refresh. */
const EGRESS_POLL_MS = 8000;

export type MonitorEgressInfo = {
  txMbps?: number;
  txBytes?: number;
  windowSec?: number;
  iface?: string | null;
  /** Agent top talker — answers "is the connection still active?" */
  topTalker?: string | null;
};

type Props = {
  wallTone: "healthy" | "warning" | "critical";
  crisisStage: CrisisStage | null;
  /** Fallback hero when no live job — e.g. "S4 · ROUTINE" */
  hero: string;
  counts: { ok: number; s4: number; s3: number; s2: number; s1: number };
  lastCheck: Date | null;
  egress?: MonitorEgressInfo | null;
  /** When set, status band polls /api/monitor/live for near-realtime egress. */
  serverId?: string | null;
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

function egressKey(e: MonitorEgressInfo | null | undefined): string {
  if (!e) return "";
  return [
    e.txMbps?.toFixed(2) ?? "",
    e.txBytes ?? "",
    e.windowSec ?? "",
    e.iface ?? "",
    e.topTalker ?? "",
  ].join("|");
}

function useLiveEgress(
  serverId: string | null | undefined,
  initial: MonitorEgressInfo | null | undefined,
): MonitorEgressInfo | null {
  const [egress, setEgress] = useState<MonitorEgressInfo | null>(
    initial ?? null,
  );
  const keyRef = useRef(egressKey(initial));

  const initialKey = egressKey(initial);
  useEffect(() => {
    setEgress(initial ?? null);
    keyRef.current = initialKey;
  }, [initial, initialKey]);

  useEffect(() => {
    if (!serverId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(
          `/api/monitor/live?serverId=${encodeURIComponent(serverId)}`,
          { cache: "no-store" },
        );
        if (res.ok && !cancelled) {
          const data = (await res.json()) as {
            ok: boolean;
            egress: MonitorEgressInfo | null;
          };
          if (data.ok) {
            const next = data.egress;
            const nextKey = egressKey(next);
            if (nextKey !== keyRef.current) {
              keyRef.current = nextKey;
              setEgress(next);
            } else if (!next && keyRef.current) {
              /* keep last SSR/poll sample if agent briefly stale */
            }
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) {
          timer = setTimeout(tick, EGRESS_POLL_MS);
        }
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [serverId]);

  return egress;
}

/**
 * Monitor hero band: crisis stage integrates live job (S4 · SCAN) — no extra badge.
 * Egress line polls agent snapshot (~8s) without refreshing the whole wall.
 */
export function MonitorStatusBand({
  wallTone,
  crisisStage,
  hero,
  counts,
  lastCheck,
  egress,
  serverId,
}: Props) {
  const jobs = useLiveJobs();
  const live = jobs[0] ?? null;
  const liveEgress = useLiveEgress(serverId, egress);

  const displayHero = live
    ? `${stageShort(crisisStage)} · ${jobActionWord(live.kind)}`
    : hero;

  const displayBlurb = live
    ? `${live.label}${live.detail ? ` · ${live.detail}` : ""} · läuft`
    : crisisStage != null
      ? CRISIS_STAGE_META[crisisStage].blurb
      : null;

  // Visual hint only (backup uploads) — alerts use higher THRESHOLD_EGRESS_*
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
            ? `${liveEgress.windowSec.toFixed(0)}s Fenster`
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
              <GlyphTicker text={displayBlurb} loop={false} />
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
              title="Top-Talker (Agent): Prozess/Art → Ziel · Rate · aktiv · Datei/cmdline. TLS/SSH = Inhalt verschlüsselt."
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
          {lastCheck ? lastCheck.toLocaleString("en-US") : "—"}
          {serverId ? " · live 8s" : " · 60s"}
        </p>
      </div>
    </section>
  );
}
