import { after } from "next/server";
import {
  createJob,
  findActiveJob,
  updateJob,
} from "./store";
import type { EnqueueResult, JobKind } from "./types";

/**
 * Start work after the server action returns so the UI can navigate away.
 * Dedupes identical in-flight jobs (same kind + server + detail).
 */
export function enqueueBackgroundJob(
  input: {
    kind: JobKind;
    label: string;
    serverId?: string;
    detail?: string;
  },
  work: () => Promise<string>,
): EnqueueResult {
  const existing = findActiveJob(input.kind, input.serverId, input.detail);
  if (existing) {
    return {
      ok: true,
      jobId: existing.id,
      reused: true,
      message: `${existing.label} läuft bereits`,
    };
  }

  const job = createJob(input);

  const run = async () => {
    updateJob(job.id, { status: "running", message: "Läuft…" });
    try {
      const message = await work();
      updateJob(job.id, {
        status: "done",
        message: message.slice(0, 400),
        finishedAt: Date.now(),
      });
    } catch (e) {
      updateJob(job.id, {
        status: "error",
        message: (e instanceof Error ? e.message : "Fehler").slice(0, 400),
        finishedAt: Date.now(),
      });
    }
  };

  // Prefer after() so the action can return immediately; fall back to
  // fire-and-forget if after() is unavailable outside a request scope.
  try {
    after(run);
  } catch {
    void run();
  }

  return {
    ok: true,
    jobId: job.id,
    message: `${input.label} gestartet — läuft im Hintergrund`,
  };
}
