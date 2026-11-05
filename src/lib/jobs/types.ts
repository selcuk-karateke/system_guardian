export type JobKind =
  | "checks_server"
  | "checks_security"
  | "checks_all"
  | "docker_refresh"
  | "trivy_scan"
  | "trivy_batch"
  | "backup"
  | "redeploy";

export type JobStatus = "queued" | "running" | "done" | "error";

export type BackgroundJob = {
  id: string;
  kind: JobKind;
  label: string;
  /** Optional scope — checks may cover all servers. */
  serverId?: string;
  detail?: string;
  status: JobStatus;
  message: string;
  startedAt: number;
  finishedAt?: number;
};

export type EnqueueResult = {
  ok: true;
  jobId: string;
  message: string;
  /** True when an identical job was already running. */
  reused?: boolean;
};
