import type { BackgroundJob, JobKind, JobStatus } from "./types";

const MAX_JOBS = 40;
const RETAIN_MS = 15 * 60_000;

const GLOBAL_KEY = "__sg_background_jobs__";

type JobsGlobal = typeof globalThis & {
  [GLOBAL_KEY]?: Map<string, BackgroundJob>;
};

/**
 * Must live on globalThis — Server Actions and Route Handlers can load
 * duplicate module instances in Next/Turbopack; a plain module Map then
 * makes enqueue write to one store while GET /api/jobs reads another.
 */
function jobsMap(): Map<string, BackgroundJob> {
  const g = globalThis as JobsGlobal;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map();
  return g[GLOBAL_KEY];
}

function prune() {
  const jobs = jobsMap();
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (!job.finishedAt) continue;
    if (now - job.finishedAt > RETAIN_MS) jobs.delete(id);
  }
  while (jobs.size > MAX_JOBS) {
    const oldest = [...jobs.values()].sort(
      (a, b) => a.startedAt - b.startedAt,
    )[0];
    if (!oldest?.finishedAt) break;
    jobs.delete(oldest.id);
  }
}

export function createJob(input: {
  kind: JobKind;
  label: string;
  serverId?: string;
  detail?: string;
}): BackgroundJob {
  prune();
  const job: BackgroundJob = {
    id: crypto.randomUUID(),
    kind: input.kind,
    label: input.label,
    serverId: input.serverId,
    detail: input.detail,
    status: "queued",
    message: "Warteschlange…",
    startedAt: Date.now(),
  };
  jobsMap().set(job.id, job);
  return job;
}

export function updateJob(
  id: string,
  patch: Partial<
    Pick<BackgroundJob, "status" | "message" | "finishedAt" | "detail">
  >,
): BackgroundJob | null {
  const jobs = jobsMap();
  const cur = jobs.get(id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  jobs.set(id, next);
  return next;
}

export function getJob(id: string): BackgroundJob | undefined {
  return jobsMap().get(id);
}

export function findActiveJob(
  kind: JobKind,
  serverId?: string,
  detail?: string,
): BackgroundJob | undefined {
  return [...jobsMap().values()].find(
    (j) =>
      (j.status === "queued" || j.status === "running") &&
      j.kind === kind &&
      (serverId == null || j.serverId === serverId) &&
      (detail == null || j.detail === detail),
  );
}

/** Active first, then recent finished — for the overlay poll. */
export function listJobs(): BackgroundJob[] {
  prune();
  return [...jobsMap().values()].sort((a, b) => {
    const aActive = a.status === "queued" || a.status === "running" ? 0 : 1;
    const bActive = b.status === "queued" || b.status === "running" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return b.startedAt - a.startedAt;
  });
}

export function hasActiveJobs(): boolean {
  return [...jobsMap().values()].some(
    (j) => j.status === "queued" || j.status === "running",
  );
}

/** Test helper */
export function resetJobsForTests(): void {
  jobsMap().clear();
}

export type { JobStatus };
