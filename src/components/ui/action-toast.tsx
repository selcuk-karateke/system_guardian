"use client";

import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
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

export function ActionToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function onNotify(e: Event) {
      const ce = e as CustomEvent<NotifyPayload>;
      const detail = ce.detail;
      if (!detail?.message) return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const toast: Toast = {
        id,
        message: detail.message,
        tone: detail.tone ?? "info",
        ms: detail.ms ?? 3500,
      };
      setToasts((prev) => [...prev.slice(-3), toast]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, toast.ms);
    }
    window.addEventListener(NOTIFY_EVENT, onNotify);
    return () => window.removeEventListener(NOTIFY_EVENT, onNotify);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="sg-toast-host" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => {
        const tone = t.tone ?? "info";
        const Icon = ICONS[tone];
        return (
          <div
            key={t.id}
            className={cn("sg-toast", `sg-toast--${tone}`)}
            role={tone === "error" ? "alert" : "status"}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
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
