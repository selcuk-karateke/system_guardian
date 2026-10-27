"use client";

import { useState, useTransition } from "react";
import {
  runTrivyBatchNowAction,
  syncTrivyAlertsAction,
} from "@/app/actions/docker-trivy";
import { Button } from "@/components/ui/button";

type Props = {
  serverId?: string;
  imagesWithFindings: number;
  unscannedRunning: number;
  checkMode: string;
};

export function TrivyBatchBar({
  serverId,
  imagesWithFindings,
  unscannedRunning,
  checkMode,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-4 py-3 space-y-3">
      <p className="text-sm text-amber-100/90">
        CVE-Lage:{" "}
        <strong className="text-amber-50">{imagesWithFindings}</strong> Image(s)
        mit HIGH/CRIT
        {unscannedRunning > 0 && (
          <>
            {" · "}
            <strong className="text-amber-50">{unscannedRunning}</strong> running
            noch nicht gescannt
          </>
        )}
        . State „running“ heißt nur Prozess lebt — nicht „sicher“.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || checkMode !== "ssh"}
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              const r = await runTrivyBatchNowAction(serverId);
              setMessage(r.message);
            });
          }}
        >
          Jetzt Batch scannen
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              const r = await syncTrivyAlertsAction(serverId);
              setMessage(r.message);
            });
          }}
        >
          Warnungen aktualisieren
        </Button>
      </div>
      {message && <p className="text-xs text-zinc-400">{message}</p>}
      {checkMode !== "ssh" && (
        <p className="text-xs text-zinc-500">Batch-Scan braucht CHECK_MODE=ssh</p>
      )}
    </div>
  );
}
