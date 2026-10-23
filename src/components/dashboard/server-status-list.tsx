import Link from "next/link";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import type { GlobalStatus } from "@/lib/dashboard-data";

export type ServerStatusItem = {
  id: string;
  name: string;
  host: string;
  ipv4: string | null;
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
      <Card>
        <CardContent className="pt-6 text-sm text-zinc-500">
          Keine aktiven Server. Seed/Cron anlegen, dann erscheint die Liste
          hier.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {servers.map((s) => (
        <Link
          key={s.id}
          href={`/servers/${s.id}`}
          className="block rounded-lg border border-zinc-800 bg-zinc-900/40 hover:border-zinc-600 transition-colors"
        >
          <Card className="border-0 bg-transparent shadow-none">
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-100 truncate">
                    {s.name}
                  </p>
                  <p className="text-xs text-zinc-500 font-mono truncate">
                    {s.ipv4 ?? s.host}
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
    </div>
  );
}
