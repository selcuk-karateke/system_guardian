"use client";

import { CheckCircle2, Info, Loader2, X, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  NOTIFY_DISMISS_EVENT,
  NOTIFY_EVENT,
  type NotifyPayload,
  type NotifyTone,
} from "@/lib/ui/notify";
import { cn } from "@/lib/utils";

type Toast = NotifyPayload & { id: string };

const ICONS: Record<NotifyTone, typeof CheckCircle2> = {
  ok: CheckCircle2,
  error: XCircle,
  info: Info,
};

const MAX_TOASTS = 4;

export function ActionToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    function clearTimer(id: string) {
      const t = timers.current.get(id);
      if (t != null) {
        window.clearTimeout(t);
        timers.current.delete(id);
      }
    }

    function scheduleHide(id: string, ms: number) {
      clearTimer(id);
      const handle = window.setTimeout(() => {
        timers.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, ms);
      timers.current.set(id, handle);
    }

    function onNotify(e: Event) {
      const ce = e as CustomEvent<NotifyPayload>;
      const detail = ce.detail;
      if (!detail?.message) return;
      const id =
        detail.id?.trim() ||
        `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const sticky = Boolean(detail.sticky);
      const toast: Toast = {
        id,
        message: detail.message,
        tone: detail.tone ?? "info",
        ms: detail.ms ?? 3500,
        sticky,
      };

      setToasts((prev) => {
        const without = prev.filter((t) => t.id !== id);
        return [...without, toast].slice(-MAX_TOASTS);
      });

      if (sticky) {
        clearTimer(id);
      } else {
        scheduleHide(id, toast.ms ?? 3500);
      }
    }

    function onDismiss(e: Event) {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }

    window.addEventListener(NOTIFY_EVENT, onNotify);
    window.addEventListener(NOTIFY_DISMISS_EVENT, onDismiss);
    return () => {
      window.removeEventListener(NOTIFY_EVENT, onNotify);
      window.removeEventListener(NOTIFY_DISMISS_EVENT, onDismiss);
      for (const t of timers.current.values()) window.clearTimeout(t);
      timers.current.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="sg-toast-host" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => {
        const tone = t.tone ?? "info";
        const sticky = Boolean(t.sticky);
        const Icon = sticky ? Loader2 : ICONS[tone];
        return (
          <div
            key={t.id}
            className={cn("sg-toast", `sg-toast--${tone}`, sticky && "sg-toast--sticky")}
            role={tone === "error" ? "alert" : "status"}
          >
            <Icon
              className={cn("size-4 shrink-0", sticky && "animate-spin")}
              aria-hidden
            />
            <p className="sg-toast__msg">{t.message}</p>
            <button
              type="button"
              className="sg-toast__close"
              aria-label="Schließen"
              onClick={() =>
                setToasts((prev) => prev.filter((x) => x.id !== t.id))
              }
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
