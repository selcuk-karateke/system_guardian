"use client";

import { useEffect, useState, type ReactNode } from "react";

type Props = {
  id: string;
  title: string;
  count?: number;
  storageKey?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
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

export function CollapsibleSection({
  id,
  title,
  count,
  storageKey = "sg-docker-sections",
  defaultOpen = true,
  children,
  className = "space-y-2",
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
    <section className={className}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 text-left text-sm font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-300"
        aria-expanded={open}
      >
        <span
          className={`inline-block text-[10px] text-zinc-600 transition-transform ${
            open ? "rotate-90" : ""
          }`}
          aria-hidden
        >
          ▶
        </span>
        <span>{title}</span>
        {typeof count === "number" && (
          <span className="font-normal normal-case text-zinc-600">{count}</span>
        )}
        <span className="ml-auto text-[10px] font-normal normal-case text-zinc-600">
          {hydrated ? (open ? "zuklappen" : "aufklappen") : null}
        </span>
      </button>
      {open ? children : null}
    </section>
  );
}
