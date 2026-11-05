"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  updateThresholdsAction,
  updateTrustedIpsAction,
} from "@/app/actions/runtime-config";
import type { ThresholdsMap, TrustedConfig } from "@/lib/runtime-config";
import { Button } from "@/components/ui/button";

const fieldClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600";

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
};

export function RuntimeConfigPanel({ thresholds, trusted }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function save(
    e: FormEvent<HTMLFormElement>,
    fn: (fd: FormData) => Promise<{ ok: boolean; message: string }>,
  ) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setMessage(null);
    startTransition(async () => {
      const result = await fn(formData);
      setIsError(!result.ok);
      setMessage(result.message);
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

      {message && (
        <p
          className={`text-sm ${isError ? "text-amber-400" : "text-emerald-400"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
