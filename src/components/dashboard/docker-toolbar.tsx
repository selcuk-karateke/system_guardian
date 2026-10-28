"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  runTrivyBatchNowAction,
  syncTrivyAlertsAction,
} from "@/app/actions/docker-trivy";
import { triggerDockerRefresh } from "@/app/actions/trigger-checks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = {
  serverId?: string;
  checkedAt: string | null;
  autoRefreshed?: boolean;
  running: number;
  total: number;
  imagesWithFindings: number;
  unscannedRunning: number;
  checkMode: string;
  onlyCoolifyStack?: boolean;
  foreignCount?: number;
};

function ageLabel(iso: string | null): string {
  if (!iso) return "kein Stand";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min`;
  return `vor ${Math.floor(min / 60)} Std`;
}

export function DockerToolbar({
  serverId,
  checkedAt,
  autoRefreshed,
  running,
  total,
  imagesWithFindings,
  unscannedRunning,
  checkMode,
  onlyCoolifyStack,
  foreignCount = 0,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(
    autoRefreshed ? "Inventar vom Host geladen" : null,
  );

  const stale =
    !checkedAt || Date.now() - new Date(checkedAt).getTime() > 3 * 60_000;

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 space-y-2 ${
        stale
          ? "border-amber-900/50 bg-amber-950/15"
          : "border-zinc-800 bg-zinc-950/40"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="text-zinc-200 font-medium">
          {running}/{total} running
        </span>
        <span className="text-zinc-600">·</span>
        <span className="text-zinc-500">
          Liste {ageLabel(checkedAt)}
        </span>
        {onlyCoolifyStack != null && (
          <Badge variant={onlyCoolifyStack ? "healthy" : "warning"}>
            {onlyCoolifyStack ? "nur Coolify" : "fremde Images"}
          </Badge>
        )}
        {foreignCount > 0 && (
          <Badge variant="critical">{foreignCount} fremd</Badge>
        )}
        {imagesWithFindings > 0 ? (
          <Badge variant="warning">{imagesWithFindings} mit HIGH/CRIT</Badge>
        ) : (
          <Badge variant="healthy">Trivy clean</Badge>
        )}
        {unscannedRunning > 0 && (
          <Badge variant="warning">{unscannedRunning} unscanned</Badge>
        )}
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={stale ? "default" : "outline"}
            disabled={pending || !serverId}
            onClick={() => {
              setNote(null);
              startTransition(async () => {
                const r = await triggerDockerRefresh(serverId);
                setNote(r.message);
                if (r.ok) router.refresh();
              });
            }}
          >
            {pending ? "…" : "Neu laden"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || checkMode !== "ssh"}
            title={
              checkMode !== "ssh" ? "Braucht CHECK_MODE=ssh" : undefined
            }
            onClick={() => {
              setNote(null);
              startTransition(async () => {
                const r = await runTrivyBatchNowAction(serverId);
                setNote(r.message);
                if (r.ok) router.refresh();
              });
            }}
          >
            Batch-Scan
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setNote(null);
              startTransition(async () => {
                const r = await syncTrivyAlertsAction(serverId);
                setNote(r.message);
              });
            }}
          >
            Warnungen
          </Button>
        </div>
      </div>
      {note && <p className="text-xs text-zinc-500">{note}</p>}
    </div>
  );
}
