import Link from "next/link";
import { Server } from "lucide-react";
import { AddServerTile } from "@/components/dashboard/add-server-tile";
import { CrisisStageBadge } from "@/components/dashboard/crisis-stage-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GlobalStatus } from "@/lib/dashboard-data";
import type { CrisisStage } from "@/lib/crisis/stages";

export type ServerStatusItem = {
  id: string;
  name: string;
  host: string;
  ipv4: string | null;
  monitorProfile?: string;
  status: GlobalStatus;
  crisisStage: CrisisStage | null;
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

function ServerSeverityBadge({ stage }: { stage: CrisisStage | null }) {
  if (stage == null) {
    return (
      <Badge variant="healthy" className="text-sm px-3 py-1 font-medium">
        OK
      </Badge>
    );
  }
  return <CrisisStageBadge stage={stage} showName />;
}

export function ServerStatusList({
  servers,
}: {
  servers: ServerStatusItem[];
}) {
  if (servers.length === 0) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <EmptyState
          icon={Server}
          title="Noch kein Server"
          description="Leg den ersten Host an — danach laufen Checks und das Dashboard füllt sich."
          action={{ href: "/settings#servers", label: "Server anlegen" }}
        />
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
                <ServerSeverityBadge stage={s.crisisStage} />
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
