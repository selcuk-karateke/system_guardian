"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { BackgroundJob } from "@/lib/jobs/types";
import type { JobsWakeDetail } from "@/lib/jobs/wake-client";
import { cn } from "@/lib/utils";

const POLL_ACTIVE_MS = 2000;
const POLL_IDLE_MS = 20_000;
const DONE_HIDE_MS = 14_000;
/** Absolute floor — survives HMR / remounts via globalThis. */
const REFRESH_COOLDOWN_MS = 60_000;
/** Ignore completions older than this (remount false-positives). */
const FRESH_DONE_MS = 8_000;
export const JOBS_WAKE_EVENT = "sg:jobs-wake";

type JobsGuard = {
  refreshedIds: Set<string>;
  lastRefreshAt: number;
};

function jobsGuard(): JobsGuard {
  const g = globalThis as typeof globalThis & { __sg_jobs_guard__?: JobsGuard };
  if (!g.__sg_jobs_guard__) {
    g.__sg_jobs_guard__ = {
      refreshedIds: new Set(),
      lastRefreshAt: 0,
    };
  }
  return g.__sg_jobs_guard__;
}

function statusLabel(status: BackgroundJob["status"]): string {
  if (status === "queued") return "Warteschlange";
  if (status === "running") return "Läuft";
  if (status === "done") return "Fertig";
  return "Fehler";
}

function jobsFingerprint(jobs: BackgroundJob[]): string {
  return jobs
    .map((j) => `${j.id}:${j.status}:${j.message}:${j.finishedAt ?? 0}`)
    .join("|");
}

function optimisticJob(hint: JobsWakeDetail): BackgroundJob {
  return {
    id: `local-${hint.label}-${hint.detail ?? ""}-${Date.now()}`,
    kind: "trivy_batch",
    label: hint.label,
    detail: hint.detail,
    status: "running",
    message: "Gestartet…",
    startedAt: Date.now(),
  };
}

function sameJobHint(job: BackgroundJob, hint: JobsWakeDetail): boolean {
  if (job.label !== hint.label) return false;
  if (hint.detail) return job.detail === hint.detail;
  return true;
}

export function BackgroundJobsOverlay() {
  const pathname = usePathname();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const fingerprintRef = useRef("");
  /** Previous poll statuses — refresh only on queued/running → done/error. */
  const prevStatusRef = useRef<Map<string, BackgroundJob["status"]>>(new Map());
  const wakeRef = useRef(false);

  // Monitor wall has its own status-band chip (cross-tab). Skip floating pill there.
  const hidden =
    pathname.startsWith("/login") || pathname.startsWith("/monitor");

  useEffect(() => {
    if (hidden) return;

    const guard = jobsGuard();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (ms: number) => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void tick();
      }, ms);
    };

    const onWake = (ev: Event) => {
      wakeRef.current = true;
      const hint = (ev as CustomEvent<JobsWakeDetail | null>).detail;
      if (hint?.label) {
        setJobs((prev) => {
          const alreadyLive = prev.some(
            (j) =>
              (j.status === "queued" || j.status === "running") &&
              sameJobHint(j, hint),
          );
          if (alreadyLive) return prev;
          // Drop stale local placeholders for this label; keep other live jobs.
          const kept = prev.filter(
            (j) => !(j.id.startsWith("local-") && sameJobHint(j, hint)),
          );
          const next = [optimisticJob(hint), ...kept];
          fingerprintRef.current = jobsFingerprint(next);
          return next;
        });
        setCollapsed(false);
      }
      schedule(0);
    };
    window.addEventListener(JOBS_WAKE_EVENT, onWake);

    const tick = async () => {
      try {
        const res = await fetch("/api/jobs", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          ok: boolean;
          active: boolean;
          jobs: BackgroundJob[];
        };
        if (!data.ok || cancelled) return;

        const now = Date.now();
        const visible = data.jobs.filter((j) => {
          if (j.status === "queued" || j.status === "running") return true;
          if (!j.finishedAt) return false;
          return now - j.finishedAt < DONE_HIDE_MS;
        });

        // Keep optimistic local rows only until the server lists a matching live job.
        setJobs((prev) => {
          const locals = prev.filter((j) => j.id.startsWith("local-"));
          const stillWaiting = locals.filter(
            (local) =>
              !visible.some(
                (j) =>
                  (j.status === "queued" || j.status === "running") &&
                  sameJobHint(j, {
                    label: local.label,
                    detail: local.detail,
                  }),
              ),
          );
          const merged = [...stillWaiting, ...visible];
          const nextFp = jobsFingerprint(merged);
          if (nextFp === fingerprintRef.current) return prev;
          fingerprintRef.current = nextFp;
          return merged;
        });

        let shouldRefresh = false;
        for (const j of data.jobs) {
          const prev = prevStatusRef.current.get(j.id);
          prevStatusRef.current.set(j.id, j.status);

          if (j.status !== "done" && j.status !== "error") continue;
          // First sighting after mount/restart: do NOT refresh (prevents loops).
          if (prev !== "queued" && prev !== "running") continue;
          if (j.finishedAt && now - j.finishedAt > FRESH_DONE_MS) continue;
          if (guard.refreshedIds.has(j.id)) continue;
          guard.refreshedIds.add(j.id);
          shouldRefresh = true;
        }

        // Never refresh the monitor wall from the jobs pill (it has its own cadence).
        const onMonitor = pathname.startsWith("/monitor");
        if (
          shouldRefresh &&
          !onMonitor &&
          now - guard.lastRefreshAt >= REFRESH_COOLDOWN_MS
        ) {
          guard.lastRefreshAt = now;
          routerRef.current.refresh();
        }

        const woken = wakeRef.current;
        wakeRef.current = false;
        // Fast poll only while work is running — finished pills use idle cadence.
        schedule(data.active || woken ? POLL_ACTIVE_MS : POLL_IDLE_MS);
      } catch {
        schedule(POLL_IDLE_MS);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener(JOBS_WAKE_EVENT, onWake);
    };
  }, [hidden, pathname]);

  if (hidden || jobs.length === 0) return null;

  const activeCount = jobs.filter(
    (j) => j.status === "queued" || j.status === "running",
  ).length;
  const primary =
    jobs.find((j) => j.status === "queued" || j.status === "running") ??
    jobs[0]!;

  return (
    <div
      className={cn(
        "fixed z-[90] max-w-[min(20rem,calc(100vw-1.25rem))]",
        "bottom-4 right-4",
        pathname.startsWith("/monitor") && "bottom-5 right-5",
      )}
      role="status"
      aria-live="polite"
      aria-label="Hintergrund-Aufgaben"
    >
      <div className="overflow-hidden rounded-md border border-cyan-500/30 bg-zinc-950 shadow-lg shadow-black/60 backdrop-blur-sm">
        <button
          type="button"
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
          onClick={() => setCollapsed((c) => !c)}
        >
          {activeCount > 0 ? (
            <span
              className="size-1.5 shrink-0 rounded-full bg-cyan-400 animate-pulse"
              aria-hidden
            />
          ) : (
            <span
              className="size-1.5 shrink-0 rounded-full bg-emerald-500/80"
              aria-hidden
            />
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">
            {activeCount > 0 ? (
              <>
                <span className="text-cyan-300/90">
                  {activeCount === 1 ? "Läuft" : `${activeCount} aktiv`}
                </span>
                <span className="text-zinc-500"> · </span>
                <span className="text-zinc-300">
                  {primary.detail
                    ? `${primary.label}: ${primary.detail}`
                    : primary.label}
                </span>
              </>
            ) : (
              <>
                <span className="text-emerald-400/90">Fertig</span>
                <span className="text-zinc-500"> · </span>
                <span className="text-zinc-400">{primary.label}</span>
              </>
            )}
          </span>
          <span className="shrink-0 text-[10px] text-zinc-600">
            {collapsed ? "+" : "–"}
          </span>
        </button>
        {!collapsed && jobs.length > 0 && (
          <ul className="max-h-52 space-y-1.5 overflow-y-auto border-t border-zinc-800/80 px-3 py-2">
            {jobs.map((j) => (
              <li key={j.id} className="text-[11px] leading-snug">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-zinc-300">
                    {j.label}
                    {j.detail ? (
                      <span className="font-normal text-zinc-500">
                        {" "}
                        · {j.detail}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      j.status === "running" && "text-cyan-400",
                      j.status === "queued" && "text-zinc-500",
                      j.status === "done" && "text-emerald-400",
                      j.status === "error" && "text-amber-400",
                    )}
                  >
                    {statusLabel(j.status)}
                  </span>
                </div>
                <p
                  className={cn(
                    "mt-0.5 text-zinc-500",
                    j.status === "error" && "text-amber-300/90",
                  )}
                >
                  {j.message}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
