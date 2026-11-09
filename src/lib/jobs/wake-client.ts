import { notify } from "@/lib/ui/notify";

export type JobsWakeDetail = {
  label: string;
  detail?: string;
};

/** Browser-only — notify overlay so it polls immediately + shows a slim pill. */
export function wakeBackgroundJobsOverlay(hint?: JobsWakeDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("sg:jobs-wake", { detail: hint ?? null }),
  );
}

/**
 * Long-running enqueue: Jobs-Overlay owns progress (no sticky toast spam).
 * Toast only when enqueue/start fails.
 */
export async function runEnqueuedJob(
  hint: JobsWakeDetail,
  action: () => Promise<{ ok: boolean; message: string }>,
): Promise<{ ok: boolean; message: string }> {
  wakeBackgroundJobsOverlay(hint);
  const result = await action();
  if (!result.ok) {
    notify({ message: result.message, tone: "error", ms: 6500 });
  }
  return result;
}
