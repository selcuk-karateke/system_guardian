"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  updateAllowlistsAction,
  updateOpsAction,
  updateThresholdsAction,
  updateTrustedIpsAction,
} from "@/app/actions/runtime-config";
import type { AllowlistsConfig } from "@/lib/runtime-allowlists";
import type { OpsConfig } from "@/lib/runtime-ops";
import type { ThresholdsMap, TrustedConfig } from "@/lib/runtime-config";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/lib/ui/field";
import { notifyResult } from "@/lib/ui/notify";

const THRESHOLD_FIELDS: { key: keyof ThresholdsMap; label: string }[] = [
  { key: "CPU_WARNING", label: "CPU Warn %" },
  { key: "CPU_CRITICAL", label: "CPU Kritisch %" },
  { key: "RAM_WARNING", label: "RAM Warn %" },
  { key: "RAM_CRITICAL", label: "RAM Kritisch %" },
  { key: "DISK_WARNING", label: "Disk Warn %" },
  { key: "DISK_CRITICAL", label: "Disk Kritisch %" },
  { key: "PROCESS_CPU_WARNING", label: "Prozess-CPU Warn %" },
  { key: "DOCKER_CPU_WARNING", label: "Docker-CPU Warn %" },
  { key: "DOCKER_MEM_WARNING", label: "Docker-RAM Warn %" },
  { key: "EGRESS_MBPS_WARNING", label: "Egress Mbit/s Warn" },
  { key: "EGRESS_MBPS_CRITICAL", label: "Egress Mbit/s Kritisch" },
  { key: "EGRESS_MB_WARNING", label: "Egress MB/Fenster Warn" },
  { key: "EGRESS_MB_CRITICAL", label: "Egress MB/Fenster Kritisch" },
  { key: "BACKUP_MAX_AGE_DAYS", label: "Backup max. Alter (Tage)" },
  { key: "BACKUP_RUN_MAX_AGE_HOURS", label: "Backup-Run max. Alter (h)" },
  {
    key: "BACKUP_MIN_SIZE_WARNING_BYTES",
    label: "Backup min. Größe Warn (Bytes)",
  },
];

type Props = {
  thresholds: ThresholdsMap;
  trusted: TrustedConfig;
  allowlists: AllowlistsConfig;
  ops: OpsConfig;
};

export function RuntimeConfigPanel({
  thresholds,
  trusted,
  allowlists,
  ops,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function save(
    e: FormEvent<HTMLFormElement>,
    fn: (fd: FormData) => Promise<{ ok: boolean; message: string }>,
  ) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await fn(formData);
      notifyResult(result);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-6 text-sm">
      <form
        onSubmit={(e) => save(e, updateTrustedIpsAction)}
        className="grid gap-3 sm:grid-cols-2"
      >
        <p className="sm:col-span-2 text-xs font-medium text-zinc-300">
          Trusted IPs
        </p>
        <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
          Login (kommagetrennt) — kein Alert bei Root/SSH von diesen IPs
          <input
            name="loginIps"
            defaultValue={trusted.loginIps.join(",")}
            className={fieldClass + " font-mono text-xs"}
            placeholder="1.2.3.4,10.0.1.9"
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
          Outbound extra (kommagetrennt) — zusätzlich zu Login-IPs
          <input
            name="outboundIps"
            defaultValue={trusted.outboundIps.join(",")}
            className={fieldClass + " font-mono text-xs"}
            placeholder="10.0.1.24"
          />
        </label>
        <p className="sm:col-span-2 text-xs text-zinc-500">
          10.0.1.* gilt intern immer als vertrauenswürdig.
        </p>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={pending}>
            Trusted IPs speichern
          </Button>
        </div>
      </form>

      <form
        onSubmit={(e) => save(e, updateThresholdsAction)}
        className="grid gap-3 sm:grid-cols-2 border-t border-zinc-800 pt-4"
      >
        <p className="sm:col-span-2 text-xs font-medium text-zinc-300">
          Schwellen
        </p>
        {THRESHOLD_FIELDS.map(({ key, label }) => (
          <label key={key} className="space-y-1 text-xs text-zinc-400">
            {label}
            <input
              name={key}
              type="number"
              defaultValue={thresholds[key]}
              className={fieldClass}
            />
          </label>
        ))}
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={pending}>
            Schwellen speichern
          </Button>
        </div>
      </form>

      <form
        onSubmit={(e) => save(e, updateAllowlistsAction)}
        className="grid gap-3 sm:grid-cols-2 border-t border-zinc-800 pt-4"
      >
        <p className="sm:col-span-2 text-xs font-medium text-zinc-300">
          Allowlists &amp; Protect
        </p>
        <p className="sm:col-span-2 text-[11px] text-zinc-500">
          Kommagetrennt. Einmalig aus ENV geseedet, danach gilt nur die DB.
        </p>
        <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
          Erwartet gestoppte Container (Substring)
          <input
            name="expectedStoppedContainers"
            defaultValue={allowlists.expectedStoppedContainers.join(",")}
            className={fieldClass + " font-mono text-xs"}
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
          Erwartet failed Units
          <input
            name="expectedFailedUnits"
            defaultValue={allowlists.expectedFailedUnits.join(",")}
            className={fieldClass + " font-mono text-xs"}
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
          FIM-Pfade
          <input
            name="fimPaths"
            defaultValue={allowlists.fimPaths.join(",")}
            className={fieldClass + " font-mono text-xs"}
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
          Bekannte Ports
          <input
            name="knownPorts"
            defaultValue={allowlists.knownPorts.join(",")}
            className={fieldClass + " font-mono text-xs"}
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
          Docker Image-Prefixes
          <input
            name="knownDockerImagePrefixes"
            defaultValue={allowlists.knownDockerImagePrefixes.join(",")}
            className={fieldClass + " font-mono text-xs"}
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
          Blocked Remote IPs
          <input
            name="blockedRemoteIps"
            defaultValue={allowlists.blockedRemoteIps.join(",")}
            className={fieldClass + " font-mono text-xs"}
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
          IOC-Domains
          <input
            name="incidentIocDomains"
            defaultValue={allowlists.incidentIocDomains.join(",")}
            className={fieldClass + " font-mono text-xs"}
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
          Extra Outbound-Prozess-Regex
          <input
            name="trustedOutboundProcessesExtra"
            defaultValue={allowlists.trustedOutboundProcessesExtra.join(",")}
            className={fieldClass + " font-mono text-xs"}
            placeholder="my-agent"
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
          Extra Shell-Prozess-Regex
          <input
            name="trustedShellProcessPatternsExtra"
            defaultValue={allowlists.trustedShellProcessPatternsExtra.join(",")}
            className={fieldClass + " font-mono text-xs"}
            placeholder="my-start-script"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400 sm:col-span-2">
          <input
            type="checkbox"
            name="autoBlockEnabled"
            defaultChecked={allowlists.autoBlockEnabled}
          />
          Auto-Block (fail2ban) für Blocked IPs
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          fail2ban Jail
          <input
            name="autoBlockJail"
            defaultValue={allowlists.autoBlockJail}
            className={fieldClass + " font-mono text-xs"}
          />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={pending}>
            Allowlists speichern
          </Button>
        </div>
      </form>

      <form
        onSubmit={(e) => save(e, updateOpsAction)}
        className="grid gap-3 sm:grid-cols-2 border-t border-zinc-800 pt-4"
      >
        <p className="sm:col-span-2 text-xs font-medium text-zinc-300">
          Ops · Trivy · Monitor · Beobachtung
        </p>
        <p className="sm:col-span-2 text-[11px] text-zinc-500">
          Einmalig aus ENV geseedet, danach gilt nur die DB.
        </p>

        <label className="flex items-center gap-2 text-xs text-zinc-400 sm:col-span-2">
          <input
            type="checkbox"
            name="trivyCronEnabled"
            defaultChecked={ops.trivyCronEnabled}
          />
          Trivy im Security-Cron
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          Trivy Scan-Limit / Lauf
          <input
            name="trivyScanLimit"
            type="number"
            min={1}
            max={20}
            defaultValue={ops.trivyScanLimit}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          Trivy max. Cache-Alter (Tage)
          <input
            name="trivyMaxAgeDays"
            type="number"
            min={1}
            max={90}
            defaultValue={ops.trivyMaxAgeDays}
            className={fieldClass}
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-zinc-400 sm:col-span-2">
          <input
            type="checkbox"
            name="monitorNightMode"
            defaultChecked={ops.monitorNightMode}
          />
          Monitor Night Mode
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          Night Start (Stunde 0–23)
          <input
            name="monitorNightStart"
            type="number"
            min={0}
            max={23}
            defaultValue={ops.monitorNightStart}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          Night Ende (Stunde 0–23)
          <input
            name="monitorNightEnd"
            type="number"
            min={0}
            max={23}
            defaultValue={ops.monitorNightEnd}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          Pixel-Shift Intervall (Sek.)
          <input
            name="monitorPixelShiftSec"
            type="number"
            min={30}
            max={3600}
            defaultValue={ops.monitorPixelShiftSec}
            className={fieldClass}
          />
        </label>

        <label className="space-y-1 text-xs text-zinc-400">
          Beobachtungsfenster (Stunden)
          <input
            name="observationHours"
            type="number"
            min={1}
            max={168}
            defaultValue={ops.observationHours}
            className={fieldClass}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400 sm:col-span-2">
          <input
            type="checkbox"
            name="incidentUseFixedWindow"
            defaultChecked={ops.incidentUseFixedWindow}
          />
          Festes Incident-Fenster statt rollierend
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          Incident seit (ISO lokal)
          <input
            name="incidentLogSince"
            defaultValue={ops.incidentLogSince}
            className={fieldClass + " font-mono text-xs"}
            placeholder="2026-06-02T07:15:00"
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          Incident bis (ISO lokal)
          <input
            name="incidentLogUntil"
            defaultValue={ops.incidentLogUntil}
            className={fieldClass + " font-mono text-xs"}
            placeholder="2026-06-02T07:45:00"
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-zinc-400 sm:col-span-2">
          <input
            type="checkbox"
            name="raidCheckEnabled"
            defaultChecked={ops.raidCheckEnabled}
          />
          Software-RAID Check (/proc/mdstat)
        </label>

        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={pending}>
            Ops speichern
          </Button>
        </div>
      </form>
    </div>
  );
}
