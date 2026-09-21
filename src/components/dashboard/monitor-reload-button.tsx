"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function MonitorReloadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      className="monitor-reload-btn"
      onClick={reload}
      disabled={pending}
      aria-label="Monitor neu laden"
      title="Daten neu laden"
    >
      <span
        className={`monitor-reload-icon${pending ? " monitor-reload-icon--spin" : ""}`}
        aria-hidden
      >
        ↻
      </span>
      {pending ? "Lädt…" : "Reload"}
    </button>
  );
}
