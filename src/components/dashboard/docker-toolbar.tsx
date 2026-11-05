"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  resetTrivyStateAction,
  runTrivyBatchNowAction,
  syncTrivyAlertsAction,
} from "@/app/actions/docker-trivy";
import { triggerDockerRefresh } from "@/app/actions/trigger-checks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { wakeBackgroundJobsOverlay } from "@/lib/jobs/wake-client";

type Props = {
  serverId?: string;
  checkedAt: string | null;
  autoRefreshed?: boolean;
  running: number;
  total: number;
  imagesWithFindings: number;
  unscannedRunning: number;
  /** App-Targets only (Coolify-Infra zählt nicht). */
  scanProgress?: { scanned: number; total: number };
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
  unscannedRunning: _unscannedRunning,
  scanProgress,
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
  const sshOk = checkMode === "ssh";

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
        <span className="text-zinc-500">Liste {ageLabel(checkedAt)}</span>
        {onlyCoolifyStack != null && (
          <Badge variant={onlyCoolifyStack ? "healthy" : "warning"}>
            {onlyCoolifyStack ? "nur Coolify" : "fremde Images"}
          </Badge>
        )}
        {foreignCount > 0 && (
          <Badge variant="critical">{foreignCount} fremd</Badge>
        )}
        {scanProgress && scanProgress.total > 0 && (
          <Badge
            variant={
              scanProgress.scanned >= scanProgress.total ? "healthy" : "warning"
            }
            title="Nur App-Container. Coolify-DB/Proxy/Redis zählen nicht."
          >
            Scan {scanProgress.scanned}/{scanProgress.total}
          </Badge>
        )}
        {imagesWithFindings > 0 ? (
          <Badge
            variant="warning"
            title="Nur App-Abhängigkeiten (nicht OS/Residual)"
          >
            {imagesWithFindings} mit App-Findings
          </Badge>
        ) : scanProgress &&
          scanProgress.scanned >= scanProgress.total &&
          scanProgress.total > 0 ? (
          <Badge variant="healthy">keine App-Findings</Badge>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={stale ? "default" : "outline"}
            disabled={pending || !serverId}
            title="Nur Container-Liste vom Server holen (docker ps). Kein Security-Scan."
            onClick={() => {
              setNote(null);
              startTransition(async () => {
                const r = await triggerDockerRefresh(serverId);
                setNote(r.message);
                if (r.ok) {
                  wakeBackgroundJobsOverlay({ label: "Docker-Inventar" });
                }
              });
            }}
          >
            {pending ? "…" : "1 · Liste"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || !sshOk}
            title={
              !sshOk
                ? "Braucht CHECK_MODE=ssh"
                : "Bis zu 20 Images ohne Scan. Läuft im Hintergrund — Overlay unten rechts."
            }
            onClick={() => {
              setNote(null);
              startTransition(async () => {
                const r = await runTrivyBatchNowAction(serverId);
                setNote(r.message);
                if (r.ok) {
                  wakeBackgroundJobsOverlay({ label: "Trivy Batch-Scan" });
                }
              });
            }}
          >
            2 · Scannen
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending || !serverId}
            title="Gespeicherte Scan-Ergebnisse → Dashboard-Warnungen. Kein neuer Scan."
            onClick={() => {
              setNote(null);
              startTransition(async () => {
                const r = await syncTrivyAlertsAction(serverId);
                setNote(r.message);
                if (r.ok) router.refresh();
              });
            }}
          >
            3 · Alerts
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || !serverId}
            title="Löscht alle gespeicherten Trivy-Zahlen und schließt Trivy-Alerts. Zeilen werden leer („—“), nicht 0."
            onClick={() => {
              if (
                !window.confirm(
                  "Alle gespeicherten Trivy-Ergebnisse und Trivy-Alerts löschen?\n\nDie Liste zeigt danach „—“ (nicht gescannt).\nAlte Crit/High-Zahlen verschwinden — sie kommen erst nach „2 · Scannen“ neu.",
                )
              ) {
                return;
              }
              setNote(null);
              startTransition(async () => {
                const r = await resetTrivyStateAction(serverId);
                setNote(r.message);
                if (r.ok) router.refresh();
              });
            }}
          >
            Reset
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-zinc-500 leading-snug">
        <span className="text-zinc-400">1 Liste</span> = Container ·{" "}
        <span className="text-zinc-400">2 Scannen</span> = Sicherheitscheck
        (Trivy) · <span className="text-zinc-400">3 Alerts</span> = Warnungen
        aus Cache · <span className="text-zinc-400">Reset</span> = Cache weg,
        neu anfangen
      </p>
      {note && <p className="text-xs text-zinc-400">{note}</p>}
    </div>
  );
}
