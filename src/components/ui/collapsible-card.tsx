"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  title: ReactNode;
  /** Optional line under the title (visible when open). */
  description?: ReactNode;
  /** Compact hint next to title when collapsed (e.g. counts). */
  summary?: ReactNode;
  count?: number;
  storageKey?: string;
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
  titleClassName?: string;
  children: ReactNode;
};

function readOpen(
  storageKey: string | undefined,
  id: string,
  defaultOpen: boolean,
): boolean {
  if (!storageKey || typeof window === "undefined") return defaultOpen;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultOpen;
    const map = JSON.parse(raw) as Record<string, boolean>;
    if (typeof map[id] === "boolean") return map[id];
  } catch {
    /* ignore */
  }
  return defaultOpen;
}

function writeOpen(storageKey: string | undefined, id: string, open: boolean) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(storageKey);
    const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    map[id] = open;
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function CollapsibleCard({
  id,
  title,
  description,
  summary,
  count,
  storageKey = "sg-cards",
  defaultOpen = false,
  className,
  contentClassName,
  titleClassName,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOpen(readOpen(storageKey, id, defaultOpen));
    setHydrated(true);
  }, [storageKey, id, defaultOpen]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      writeOpen(storageKey, id, next);
      return next;
    });
  }

  return (
    <Card className={className}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-start gap-2 p-6 pb-4 text-left hover:bg-zinc-900/40 rounded-t-xl"
        aria-expanded={open}
      >
        <span
          className={cn(
            "mt-1 inline-block shrink-0 text-[10px] text-zinc-600 transition-transform",
            open && "rotate-90",
          )}
          aria-hidden
        >
          ▶
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={cn(
                "text-lg font-semibold leading-none text-zinc-100",
                titleClassName,
              )}
            >
              {title}
            </h3>
            {typeof count === "number" && (
              <span className="text-xs tabular-nums text-zinc-500">{count}</span>
            )}
            {!open && summary ? (
              <span className="text-xs text-zinc-500">{summary}</span>
            ) : null}
          </div>
          {open && description ? (
            <div className="text-xs text-zinc-500">{description}</div>
          ) : null}
        </div>
        <span className="shrink-0 pt-0.5 text-[10px] text-zinc-600">
          {hydrated ? (open ? "zuklappen" : "aufklappen") : null}
        </span>
      </button>
      {open ? (
        <CardContent className={cn("pt-0", contentClassName)}>
          {children}
        </CardContent>
      ) : null}
    </Card>
  );
}
