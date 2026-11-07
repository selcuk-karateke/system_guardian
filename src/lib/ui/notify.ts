export type NotifyTone = "ok" | "error" | "info";

export type NotifyPayload = {
  message: string;
  tone?: NotifyTone;
  /** Auto-hide ms (default 3500). */
  ms?: number;
};

export const NOTIFY_EVENT = "sg:notify";

/** Fire a short global toast (client-only). */
export function notify(input: NotifyPayload | string): void {
  if (typeof window === "undefined") return;
  const detail: NotifyPayload =
    typeof input === "string" ? { message: input, tone: "info" } : input;
  if (!detail.message.trim()) return;
  window.dispatchEvent(
    new CustomEvent<NotifyPayload>(NOTIFY_EVENT, { detail }),
  );
}

export function notifyResult(result: {
  ok: boolean;
  message: string;
}): void {
  notify({
    message: result.message,
    tone: result.ok ? "ok" : "error",
  });
}
