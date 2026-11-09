export type NotifyTone = "ok" | "error" | "info";

export type NotifyPayload = {
  message: string;
  tone?: NotifyTone;
  /** Auto-hide ms (default 3500). Ignored when sticky. */
  ms?: number;
  /** Stable id → replace existing toast (progress → result). */
  id?: string;
  /** Stay until replaced/dismissed (for long actions). */
  sticky?: boolean;
};

export const NOTIFY_EVENT = "sg:notify";
export const NOTIFY_DISMISS_EVENT = "sg:notify-dismiss";

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

/** Sticky progress toast — replace later with same `id` via notifyResult. */
export function notifyProgress(id: string, message: string): void {
  notify({ id, message, tone: "info", sticky: true });
}

export function notifyDismiss(id: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<{ id: string }>(NOTIFY_DISMISS_EVENT, {
      detail: { id },
    }),
  );
}

export function notifyResult(
  result: { ok: boolean; message: string },
  opts?: { id?: string; ms?: number },
): void {
  notify({
    id: opts?.id,
    message: result.message,
    tone: result.ok ? "ok" : "error",
    sticky: false,
    ms: opts?.ms ?? (result.ok ? 3500 : 6500),
  });
}
