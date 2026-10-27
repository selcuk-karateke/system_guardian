import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { AlertList } from "@/components/dashboard/alert-list";
import { TriggerChecks } from "@/components/dashboard/trigger-checks";
import { ServerStatusList } from "@/components/dashboard/server-status-list";
import {
  getGlobalStatus,
  getRecentAlerts,
  getServersWithStatus,
} from "@/lib/dashboard-data";
import { getCheckMode } from "@/lib/config";
import { MockDataBanner } from "@/components/dashboard/mock-data-banner";
import { getDefaultServerId } from "@/lib/servers";
import { syncTrivyAlertsFromStore } from "@/lib/trivy/alerts";

export default async function DashboardPage() {
  let globalStatus: "healthy" | "warning" | "critical" = "healthy";
  let serverList: Awaited<ReturnType<typeof getServersWithStatus>> = [];
  let recentAlerts: Awaited<ReturnType<typeof getRecentAlerts>> = [];
  let dbError: string | null = null;
  const checkMode = getCheckMode();

  try {
    // Bekannte Trivy-Funde sofort in Warnungen (ohne Docker-Klick)
    const sid = await getDefaultServerId().catch(() => null);
    if (sid) await syncTrivyAlertsFromStore(sid).catch(() => null);

    globalStatus = await getGlobalStatus();
    serverList = await getServersWithStatus();
    recentAlerts = await getRecentAlerts(10);
  } catch (e) {
    dbError = e instanceof Error ? e.message : "Database unavailable";
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-zinc-400 mt-1">
            Server mit Status — Detail per Klick
          </p>
          <div className="flex flex-wrap gap-4 mt-3 text-sm">
            <Link href="/monitor" className="sg-link hover:underline font-medium">
              Monitor (TV) →
            </Link>
            <Link href="/history" className="sg-link hover:underline font-medium">
              Historie & Zeitfilter →
            </Link>
          </div>
        </div>
        <div className="flex flex-col items-end gap-4">
          <StatusBadge status={globalStatus} />
          <TriggerChecks variant="compact" />
        </div>
      </div>

      {checkMode === "mock" && <MockDataBanner />}

      {dbError && (
        <Card className="border-amber-800">
          <CardContent className="pt-6 text-amber-300 space-y-2">
            <p>Datenbank nicht erreichbar: {dbError}</p>
            <p className="text-sm text-amber-200/90">
              Prüfe lokales PostgreSQL und{" "}
              <code className="text-amber-100">DATABASE_URL</code>.
            </p>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-100">Server</h2>
        <ServerStatusList servers={serverList} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Aktuelle Warnungen</CardTitle>
        </CardHeader>
        <CardContent>
          <AlertList
            compact
            items={recentAlerts.map((a) => ({
              id: a.id,
              level: a.level,
              module: a.module,
              message: a.message,
              recommendation: a.recommendation,
              createdAt: a.createdAt.toISOString(),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
