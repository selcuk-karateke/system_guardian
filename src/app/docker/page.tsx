import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DockerInventoryPanel } from "@/components/dashboard/docker-inventory-panel";
import { ServerSelect } from "@/components/dashboard/server-select";
import { SshTargetNote } from "@/components/dashboard/ssh-target-note";
import { buildDockerInventoryGroups } from "@/lib/docker/inventory";
import { getLatestCheckByModule } from "@/lib/dashboard-data";
import { resolveSelectedServer } from "@/lib/server-scope";
import { getTrivyScansByDigest } from "@/lib/trivy/store";
import type { TrivyScanRecord } from "@/lib/trivy/types";

function indexScans(scans: Record<string, TrivyScanRecord>) {
  const byKey: Record<string, TrivyScanRecord> = {};
  for (const record of Object.values(scans)) {
    byKey[record.imageDigest] = record;
    byKey[record.imageRef] = record;
  }
  return byKey;
}

export default async function DockerPage({
  searchParams,
}: {
  searchParams: Promise<{ server?: string }>;
}) {
  const sp = await searchParams;
  const { serverRows, selectedServerId, selected } = await resolveSelectedServer(
    sp.server,
  );

  let docker: Awaited<ReturnType<typeof getLatestCheckByModule>> | undefined;
  let coolify: Awaited<ReturnType<typeof getLatestCheckByModule>> | undefined;
  let scansByKey: Record<string, TrivyScanRecord> = {};

  try {
    if (selectedServerId) {
      [docker, coolify] = await Promise.all([
        getLatestCheckByModule("docker", selectedServerId),
        getLatestCheckByModule("coolify", selectedServerId),
      ]);
    }
    scansByKey = indexScans(await getTrivyScansByDigest());
  } catch {
    /* empty */
  }

  const containers =
    (docker?.data as {
      containers?: Array<{
        Names: string;
        Image?: string;
        Status: string;
        State: string;
        displayName?: string;
        coolify?: {
          projectName?: string;
          environmentName?: string;
          fqdn?: string;
          type?: string;
        };
      }>;
    })?.containers ?? [];

  const inventory = (
    docker?.data as {
      inventory?: {
        onlyCoolifyStack?: boolean;
        foreignRunning?: { name: string; image: string }[];
        wordpressRunning?: string[];
        monitoringRunning?: { name: string; image: string }[];
      };
    }
  )?.inventory;

  const checkMode = (docker?.data as { checkMode?: string })?.checkMode ?? "mock";
  const isMock = checkMode === "mock";
  const groups = buildDockerInventoryGroups(containers);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Docker</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Running: {(docker?.data as { running?: number })?.running ?? 0} /
            Total: {(docker?.data as { total?: number })?.total ?? 0}
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
        <SshTargetNote host={selected.host} ipv4={selected.ipv4} />
      )}

      {isMock && (
        <div className="rounded-lg border border-sky-900/50 bg-sky-950/30 px-4 py-3 text-sm text-sky-200">
          <strong>CHECK_MODE=mock</strong> – Testdaten. Trivy-Button speichert
          Mock-Ergebnisse. Für echte Scans:{" "}
          <code className="text-sky-100">CHECK_MODE=ssh</code> + Trivy auf dem
          Host.
        </div>
      )}

      {(docker?.data as { dockerAvailable?: boolean })?.dockerAvailable === false && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          Docker auf dem überwachten Host ist nicht erreichbar (
          {(docker?.data as { error?: string })?.error ?? "unbekannter Fehler"}).
        </div>
      )}

      {inventory && (
        <Card>
          <CardHeader>
            <CardTitle>Kurzüberblick</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-zinc-300">
            <p>
              Nur Coolify-Stack:{" "}
              <Badge variant={inventory.onlyCoolifyStack ? "healthy" : "warning"}>
                {inventory.onlyCoolifyStack ? "ja" : "nein"}
              </Badge>
            </p>
            {inventory.foreignRunning && inventory.foreignRunning.length > 0 && (
              <p className="text-red-300">
                Fremde Images (running):{" "}
                {inventory.foreignRunning
                  .map((f) => `${f.name} → ${f.image}`)
                  .join("; ")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <DockerInventoryPanel
        groups={groups}
        checkMode={checkMode}
        scansByImage={scansByKey}
      />

      <Card>
        <CardHeader>
          <CardTitle>Coolify-Dienste</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(
            (coolify?.data as { services?: Record<string, string> })?.services ??
              {},
          ).map(([name, state]) => (
            <div key={name} className="flex justify-between gap-2">
              <span className="text-zinc-300">{name}</span>
              <Badge variant={state === "running" ? "healthy" : "critical"}>
                {state}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
