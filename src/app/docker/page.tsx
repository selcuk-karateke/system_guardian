import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { DockerInventoryPanel } from "@/components/dashboard/docker-inventory-panel";
import { DockerToolbar } from "@/components/dashboard/docker-toolbar";
import { ServerSelect } from "@/components/dashboard/server-select";
import { SshTargetNote } from "@/components/dashboard/ssh-target-note";
import { buildDockerInventoryGroups } from "@/lib/docker/inventory";
import {
  isDockerCheckStale,
  refreshDockerInventory,
} from "@/lib/docker/refresh";
import { isCoolifyRedeployConfigured } from "@/lib/config";
import { getLatestCheckByModule } from "@/lib/dashboard-data";
import { resolveSelectedServer } from "@/lib/server-scope";
import { syncTrivyAlertsFromStore } from "@/lib/trivy/alerts";
import { getTrivyScansByDigest } from "@/lib/trivy/store";
import type { TrivyScanRecord } from "@/lib/trivy/types";

export const dynamic = "force-dynamic";

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
  let autoRefreshed = false;

  try {
    if (selectedServerId) {
      docker = await getLatestCheckByModule("docker", selectedServerId);
      if (isDockerCheckStale(docker?.createdAt ?? null)) {
        await refreshDockerInventory(selectedServerId).catch(() => null);
        autoRefreshed = true;
      }
      [docker, coolify] = await Promise.all([
        getLatestCheckByModule("docker", selectedServerId),
        getLatestCheckByModule("coolify", selectedServerId),
      ]);
    }
    scansByKey = indexScans(await getTrivyScansByDigest());
    if (selectedServerId) {
      await syncTrivyAlertsFromStore(selectedServerId).catch(() => null);
    }
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
      };
    }
  )?.inventory;

  const checkMode = (docker?.data as { checkMode?: string })?.checkMode ?? "mock";
  const isMock = checkMode === "mock";
  const groups = buildDockerInventoryGroups(containers);

  const scanList = Object.values(
    Object.fromEntries(
      Object.values(scansByKey).map((s) => [s.imageDigest, s]),
    ),
  );
  const imagesWithFindings = scanList.filter(
    (s) => s.criticalCount > 0 || s.highCount > 0,
  ).length;
  const scannedNames = new Set(scanList.map((s) => s.containerName));
  const scannedRefs = new Set(scanList.map((s) => s.imageRef));
  const unscannedRunning = containers.filter(
    (c) =>
      c.State === "running" &&
      !scannedNames.has(c.Names) &&
      !(c.Image && scannedRefs.has(c.Image)),
  ).length;

  const checkedAt = docker?.createdAt
    ? new Date(docker.createdAt).toISOString()
    : null;

  const coolifyServices =
    (coolify?.data as { services?: Record<string, string> })?.services ?? {};

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Docker</h1>
          {selected && (
            <div className="mt-1">
              <SshTargetNote host={selected.host} ipv4={selected.ipv4} />
            </div>
          )}
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

      {isMock && (
        <div className="rounded-lg border border-sky-900/50 bg-sky-950/30 px-3 py-2 text-xs text-sky-200">
          CHECK_MODE=mock — Trivy-Scans sind simuliert.
        </div>
      )}

      {(docker?.data as { dockerAvailable?: boolean })?.dockerAvailable ===
        false && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-200">
          Docker auf dem Host nicht erreichbar
          {(docker?.data as { error?: string })?.error
            ? `: ${(docker?.data as { error?: string }).error}`
            : ""}
        </div>
      )}

      <DockerToolbar
        serverId={selectedServerId || undefined}
        checkedAt={checkedAt}
        autoRefreshed={autoRefreshed}
        running={(docker?.data as { running?: number })?.running ?? 0}
        total={(docker?.data as { total?: number })?.total ?? 0}
        imagesWithFindings={imagesWithFindings}
        unscannedRunning={unscannedRunning}
        checkMode={checkMode}
        onlyCoolifyStack={inventory?.onlyCoolifyStack}
        foreignCount={inventory?.foreignRunning?.length ?? 0}
      />

      <DockerInventoryPanel
        groups={groups}
        checkMode={checkMode}
        scansByImage={scansByKey}
        serverId={selectedServerId || undefined}
        coolifyRedeployReady={isCoolifyRedeployConfigured()}
      />

      {Object.keys(coolifyServices).length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            Coolify-Stack
          </h2>
          <div className="grid gap-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(coolifyServices).map(([name, state]) => (
              <div
                key={name}
                className="flex items-center justify-between gap-2 rounded border border-zinc-800/80 px-2.5 py-1.5"
              >
                <span className="text-zinc-300 truncate">{name}</span>
                <Badge variant={state === "running" ? "healthy" : "critical"}>
                  {state}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-[11px] text-zinc-600">
        <a
          className="underline hover:text-zinc-400"
          href="https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Cyber-Sicherheitslage/Reaktion/CERT-Bund-Abteilung/cert-bund_node.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          CERT-Bund
        </a>
        {" · "}
        <a
          className="underline hover:text-zinc-400"
          href="https://status.hetzner.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Hetzner Status
        </a>
      </p>
    </div>
  );
}
