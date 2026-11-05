"use client";

import { useEffect, useState } from "react";
import type { BackgroundJob, JobKind } from "@/lib/jobs/types";

function actionWord(kind: JobKind): string {
  if (kind === "trivy_scan" || kind === "trivy_batch") return "SCAN";
  if (kind === "backup") return "BACKUP";
  if (kind === "redeploy") return "DEPLOY";
  if (kind === "docker_refresh") return "INVENTORY";
  return "CHECK";
}

/** Compact “ · SCAN” suffix for globe/header — no badge. */
export function MonitorLiveActionSuffix() {
  const [job, setJob] = useState<BackgroundJob | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      let delay = 12_000;
      try {
        const res = await fetch("/api/jobs", { cache: "no-store" });
        if (res.ok && !cancelled) {
          const data = (await res.json()) as {
            ok: boolean;
            jobs: BackgroundJob[];
          };
          if (data.ok) {
            const live = data.jobs.find(
              (j) => j.status === "queued" || j.status === "running",
            );
            setJob(live ?? null);
            if (live) delay = 2000;
          }
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) timer = setTimeout(tick, delay);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!job) return null;
  return (
    <span className="monitor-live-action" title={job.label}>
      {" "}
      · {actionWord(job.kind)}
    </span>
  );
}
