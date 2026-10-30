import Link from "next/link";
import { Globe2, History, Monitor } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertList } from "@/components/dashboard/alert-list";
import { TriggerChecks } from "@/components/dashboard/trigger-checks";
import { ServerStatusList } from "@/components/dashboard/server-status-list";
import {
  getGlobalCrisisStage,
  getRecentAlerts,
  getServersWithStatus,
} from "@/lib/dashboard-data";
import { getCheckMode } from "@/lib/config";
import { MockDataBanner } from "@/components/dashboard/mock-data-banner";
import { getDefaultServerId } from "@/lib/servers";
import { syncTrivyAlertsFromStore } from "@/lib/trivy/alerts";
import { CrisisStageBadge } from "@/components/dashboard/crisis-stage-badge";
import { Badge } from "@/components/ui/badge";
import {
  resolveCrisisStage,
  type CrisisStage,
} from "@/lib/crisis/stages";

export default async function DashboardPage() {
  let crisisStage: CrisisStage | null = null;
  let serverList: Awaited<ReturnType<typeof getServersWithStatus>> = [];
  let recentAlerts: Awaited<ReturnType<typeof getRecentAlerts>> = [];
  let dbError: string | null = null;
  const checkMode = getCheckMode();

  try {
    // Bekannte Trivy-Funde sofort in Warnungen (ohne Docker-Klick)
    const sid = await getDefaultServerId().catch(() => null);
    if (sid) await syncTrivyAlertsFromStore(sid).catch(() => null);

    crisisStage = await getGlobalCrisisStage();
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
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link
              href="/monitor"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700/80 bg-zinc-900/60 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:border-cyan-500/40 hover:text-white"
              title="Screensaver"
            >
              <Monitor className="size-4 text-cyan-400" aria-hidden />
              Screensaver
            </Link>
            <Link
              href="/monitor/globe"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700/80 bg-zinc-900/60 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:border-cyan-500/40 hover:text-white"
              title="Globus"
            >
              <Globe2 className="size-4 text-amber-300" aria-hidden />
              Globus
            </Link>
            <Link
              href="/history"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-transparent px-3 py-2 text-sm text-zinc-400 transition hover:text-zinc-200"
            >
              <History className="size-4" aria-hidden />
              Historie
            </Link>
          </div>
        </div>
        <div className="flex flex-col items-end gap-4">
          <Link href="/docs" title="Krisenstufen S1–S4 — docs/CRISIS.md">
            {crisisStage != null ? (
              <CrisisStageBadge stage={crisisStage} showName />
            ) : (
              <Badge variant="healthy" className="text-sm px-3 py-1 font-medium">
                OK
              </Badge>
            )}
          </Link>
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
          <CardTitle className="flex flex-wrap items-baseline gap-2">
            Aktuelle Warnungen
            <span className="text-xs font-normal text-zinc-500">
              nur S1–S4 ·{" "}
              <Link href="/docs" className="sg-link hover:underline">
                Matrix
              </Link>
            </span>
          </CardTitle>
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
              crisisStage: resolveCrisisStage(a),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
