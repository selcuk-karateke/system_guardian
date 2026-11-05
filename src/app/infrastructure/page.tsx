import { Suspense } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DiskTempsPanel } from "@/components/dashboard/disk-temps-panel";
import { FilesystemsPanel } from "@/components/dashboard/filesystems-panel";
import { LoadAveragePanel } from "@/components/dashboard/load-average-panel";
import { MetricSummaryCard } from "@/components/dashboard/metric-summary-card";
import { NetworkInterfacesPanel } from "@/components/dashboard/network-interfaces-panel";
import { ServerSelect } from "@/components/dashboard/server-select";
import { ServicesPanel } from "@/components/dashboard/services-panel";
import type { DfMount, DiskTemp } from "@/lib/checks/disk-storage";
import type { HostInterface } from "@/lib/checks/host-network";
import type { ServiceRow } from "@/lib/checks/services";
import {
  getLatestCheckByModule,
  getServerOverview,
} from "@/lib/dashboard-data";
import { SshTargetNote } from "@/components/dashboard/ssh-target-note";
import { resolveSelectedServer } from "@/lib/server-scope";
import { toneFromPct } from "@/components/dashboard/hud-ring";

function parseLoad(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export default async function InfrastructurePage({
  searchParams,
}: {
  searchParams: Promise<{ server?: string }>;
}) {
  const sp = await searchParams;
  const { serverRows, selectedServerId, selected } = await resolveSelectedServer(
    sp.server,
  );

  let overview: Awaited<ReturnType<typeof getServerOverview>> | null = null;
  let raid: Awaited<ReturnType<typeof getLatestCheckByModule>> | undefined;
  let servicesCheck:
    | Awaited<ReturnType<typeof getLatestCheckByModule>>
    | undefined;
  let healthCheck:
    | Awaited<ReturnType<typeof getLatestCheckByModule>>
    | undefined;
  let error: string | null = null;

  try {
    if (selectedServerId) {
      overview = await getServerOverview(selectedServerId);
      raid = await getLatestCheckByModule("raid", selectedServerId);
      servicesCheck = await getLatestCheckByModule(
        "services",
        selectedServerId,
      );
      healthCheck = await getLatestCheckByModule(
        "server_health",
        selectedServerId,
      );
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "DB error";
  }

  const m = overview?.metrics;
  const servicesData = (servicesCheck?.data ?? null) as {
    rows?: ServiceRow[];
    failedUnitNames?: string[];
    failedUnits?: string[];
  } | null;
  const serviceRows = servicesData?.rows ?? null;
  const failedUnits =
    servicesData?.failedUnitNames ?? servicesData?.failedUnits ?? [];
  const healthData = (healthCheck?.data ?? null) as {
    filesystems?: DfMount[];
    diskTemps?: DiskTemp[];
    interfaces?: HostInterface[];
  } | null;
  const filesystems = healthData?.filesystems ?? null;
  const diskTemps = healthData?.diskTemps ?? null;
  const interfaces = healthData?.interfaces ?? null;

  const load1 = parseLoad(m?.loadAvg1);
  const load5 = parseLoad(m?.loadAvg5);
  const load15 = parseLoad(m?.loadAvg15);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Infrastruktur</h1>
          <p className="text-sm text-zinc-500 mt-1">
            CPU, RAM, Disk, RAID und Dienste für{" "}
            <strong className="text-zinc-300">einen</strong> Host — Server oben
            wählen. Übersicht aller Hosts:{" "}
            <Link href="/" className="sg-link hover:underline">
              Dashboard
            </Link>
            .
          </p>
        </div>
        {serverRows.length > 0 && (
          <Suspense fallback={null}>
            <ServerSelect
              servers={serverRows.map((s) => ({
                id: s.id,
                name: s.name,
                host: s.host,
              }))}
              selectedId={selectedServerId}
            />
          </Suspense>
        )}
      </div>

      {selected && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 font-mono">
            Aktiv: {selected.name} · {selected.ipv4 ?? selected.host}
            {" · "}
            <Link
              href={`/servers/${selected.id}`}
              className="sg-link hover:underline"
            >
              Detailseite →
            </Link>
          </p>
          <SshTargetNote host={selected.host} ipv4={selected.ipv4} />
        </div>
      )}

      {error && <p className="text-amber-400">{error}</p>}

      {serverRows.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-zinc-500">
            Kein Server angelegt.{" "}
            <Link href="/settings#servers" className="sg-link hover:underline">
              Einstellungen → Server
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="sg-stagger grid md:grid-cols-3 gap-4">
        <MetricSummaryCard
          label="CPU"
          value={m?.cpuPercent ?? null}
          tone={toneFromPct(m?.cpuPercent, 80, 95)}
          lines={[
            `load ${m?.loadAvg1 ?? "—"} / ${m?.loadAvg5 ?? "—"} / ${m?.loadAvg15 ?? "—"}`,
            m?.cpuCores != null ? `${m.cpuCores} cores` : "",
          ].filter(Boolean)}
          href="#load"
        />
        <MetricSummaryCard
          label="RAM"
          value={m?.ramPercent ?? null}
          tone={toneFromPct(m?.ramPercent, 85, 95)}
          lines={[`swap ${m?.swapPercent ?? 0}%`]}
        />
        <MetricSummaryCard
          label="Disk"
          value={m?.diskPercent ?? null}
          tone={toneFromPct(m?.diskPercent, 85, 95)}
          lines={[
            filesystems?.length
              ? `${filesystems.length} mounts`
              : "max. Belegung",
            m?.temperatureCelsius != null
              ? `cpu ${m.temperatureCelsius}°C`
              : "",
          ].filter(Boolean)}
          href="#filesystems"
        />
      </div>

      <LoadAveragePanel
        load1={load1}
        load5={load5}
        load15={load15}
        cores={m?.cpuCores ?? null}
        checkedAt={healthCheck?.createdAt ?? null}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <FilesystemsPanel
          mounts={filesystems}
          checkedAt={healthCheck?.createdAt ?? null}
        />
        <DiskTempsPanel
          disks={diskTemps}
          checkedAt={healthCheck?.createdAt ?? null}
        />
      </div>

      <NetworkInterfacesPanel
        interfaces={interfaces}
        checkedAt={healthCheck?.createdAt ?? null}
      />

      <ServicesPanel
        rows={serviceRows}
        failedUnits={failedUnits}
        status={servicesCheck?.status ?? null}
        checkedAt={servicesCheck?.createdAt ?? null}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="tracking-wide">RAID</CardTitle>
          {raid && (
            <Badge
              variant={
                raid.status as "healthy" | "warning" | "critical"
              }
            >
              {raid.status}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {(raid?.data as { configured?: boolean })?.configured === false ? (
            <p className="text-sm text-zinc-400">
              {(raid?.data as { summary?: string })?.summary ??
                "Kein Linux Software-RAID erkannt (/proc/mdstat leer). Das ist normal, wenn du nur Hetzner-RAID oder normale SSDs ohne mdadm nutzt."}
            </p>
          ) : (raid?.data as { skipped?: boolean })?.skipped ? (
            <p className="text-sm text-zinc-500">
              RAID-Check in den Einstellungen deaktiviert.
            </p>
          ) : (
            <pre className="text-xs bg-zinc-900 p-4 rounded-lg overflow-auto max-h-48 font-mono">
              {(raid?.data as { mdstat?: string })?.mdstat ??
                JSON.stringify(raid?.data ?? {}, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
