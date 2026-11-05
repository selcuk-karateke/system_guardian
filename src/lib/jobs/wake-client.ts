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
