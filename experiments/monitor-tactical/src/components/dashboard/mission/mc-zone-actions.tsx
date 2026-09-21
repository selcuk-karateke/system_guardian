"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  refreshMonitorView,
  settleAfterMaintenance,
} from "@/app/actions/monitor-quick";
import { triggerAllChecks } from "@/app/actions/trigger-checks";

type Zone = "core" | "security" | "network" | "docker" | "events";

const ZONE_ACTIONS: Record<
  Zone,
  { label: string; run?: "checks" | "settle" | "refresh" }[]
> = {
  core: [
    { label: "Checks", run: "checks" },
    { label: "Erledigt", run: "settle" },
    { label: "Refresh", run: "refresh" },
  ],
  security: [{ label: "Checks", run: "checks" }],
  network: [{ label: "Refresh", run: "refresh" }],
  docker: [{ label: "Checks", run: "checks" }],
  events: [{ label: "Refresh", run: "refresh" }],
};

export function McZoneActions({ zone }: { zone: Zone }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const actions = ZONE_ACTIONS[zone];

  function run(kind: "checks" | "settle" | "refresh") {
    startTransition(async () => {
      if (kind === "checks") await triggerAllChecks();
      else if (kind === "settle") await settleAfterMaintenance();
      else await refreshMonitorView();
      router.refresh();
    });
  }

  return (
    <div
      className="mc-zone-actions"
      role="group"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          className="mc-zone-btn"
          disabled={pending}
          onClick={() => a.run && run(a.run)}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
