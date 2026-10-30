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

  return (
    <MonitorAutoRefresh intervalSec={30}>
      <div className="px-4 pt-3 flex justify-end">
        <Suspense fallback={null}>
          <ServerSelect
            servers={view.serverRows.map((s) => ({
              id: s.id,
              name: s.name,
              host: s.host,
            }))}
            selectedId={view.selectedServerId}
          />
        </Suspense>
      </div>
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
