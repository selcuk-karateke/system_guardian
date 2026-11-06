import { Suspense } from "react";
import { MonitorAutoRefresh } from "@/components/dashboard/monitor-auto-refresh";
import { MonitorGlobeStage } from "@/components/dashboard/monitor-globe-stage";
import { ServerSelect } from "@/components/dashboard/server-select";
import { loadMonitorGlobeView } from "@/lib/monitor-globe-data";

export default async function MonitorGlobePage({
  searchParams,
}: {
  searchParams: Promise<{ server?: string }>;
}) {
  const sp = await searchParams;
  const view = await loadMonitorGlobeView(sp.server);
  const multi = view.serverRows.length > 1;

  return (
    <MonitorAutoRefresh>
      {multi ? (
        <div className="pointer-events-none absolute right-4 top-3 z-20">
          <div className="pointer-events-auto">
            <Suspense fallback={null}>
              <ServerSelect
                servers={view.serverRows.map((s) => ({
                  id: s.id,
                  name: s.name,
                  host: s.host,
                }))}
                selectedId={view.selectedServerId}
                className="monitor-top-select monitor-top-select--quiet"
              />
            </Suspense>
          </div>
        </div>
      ) : null}
      <MonitorGlobeStage
        globalStatus={view.globalStatus}
        hostLabel={view.hostLabel}
        hostIp={view.hostIp}
        checkMode={view.checkMode}
        attackMarkers={view.attacks}
        sessionMarkers={view.sessions}
        webMarkers={view.web}
        homeMarker={view.home}
      />
    </MonitorAutoRefresh>
  );
}
