import Link from "next/link";
import { AddServerTile } from "@/components/dashboard/add-server-tile";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import type { GlobalStatus } from "@/lib/dashboard-data";

export type ServerStatusItem = {
  id: string;
  name: string;
  host: string;
  ipv4: string | null;
  monitorProfile?: string;
  status: GlobalStatus;
  cpuPercent: number | null;
  ramPercent: number | null;
  diskPercent: number | null;
  lastCheckAt: Date | null;
  openAlertCount: number;
};

function formatWhen(at: Date | null): string {
  if (!at) return "noch kein Check";
  return at.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ServerStatusList({
  servers,
}: {
  servers: ServerStatusItem[];
}) {
  if (servers.length === 0) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardContent className="pt-6 text-sm text-zinc-500">
            Keine aktiven Server. Leg den ersten unter Einstellungen an.
          </CardContent>
        </Card>
        <AddServerTile />
      </div>
    );
  }

  return (
    <div className="sg-stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {servers.map((s) => (
        <Link
          key={s.id}
          href={`/servers/${s.id}`}
          className="sg-server-tile block rounded-lg border border-zinc-800 bg-zinc-900/40"
        >
          <Card className="sg-glass-card--flat border-0 bg-transparent shadow-none">
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-100 truncate">
                    {s.name}
                  </p>
                  <p className="text-xs text-zinc-500 font-mono truncate">
                    {s.ipv4 ?? s.host}
                    {s.monitorProfile && s.monitorProfile !== "host"
                      ? ` · ${s.monitorProfile}`
                      : ""}
                  </p>
                </div>
                <StatusBadge status={s.status} />
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs text-zinc-400">
                <div>
                  <dt className="text-zinc-600">CPU</dt>
                  <dd className="text-zinc-200 tabular-nums">
                    {s.cpuPercent != null ? `${s.cpuPercent}%` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-600">RAM</dt>
                  <dd className="text-zinc-200 tabular-nums">
                    {s.ramPercent != null ? `${s.ramPercent}%` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-600">Disk</dt>
                  <dd className="text-zinc-200 tabular-nums">
                    {s.diskPercent != null ? `${s.diskPercent}%` : "—"}
                  </dd>
                </div>
              </dl>
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Check: {formatWhen(s.lastCheckAt)}</span>
                <span>
                  {s.openAlertCount > 0
                    ? `${s.openAlertCount} offen`
                    : "keine Alerts"}
                </span>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
      <AddServerTile />
    </div>
  );
}
