import { Card, CardContent } from "@/components/ui/card";
import {
  HomeDashboardBuilder,
  type HomeServerRow,
} from "@/components/dashboard/home-dashboard-builder";
import {
  getGlobalCrisisStage,
  getRecentAlerts,
  getServersWithStatus,
} from "@/lib/dashboard-data";
import { getCheckMode } from "@/lib/config";
import { MockDataBanner } from "@/components/dashboard/mock-data-banner";
import { OnboardingNudge } from "@/components/dashboard/onboarding-nudge";
import { getDefaultServerId } from "@/lib/servers";
import { syncTrivyAlertsFromStore } from "@/lib/trivy/alerts";
import {
  resolveCrisisStage,
  type CrisisStage,
} from "@/lib/crisis/stages";
import { getSessionUser } from "@/lib/auth/session";
import { defaultUiLayout } from "@/lib/ui-layout";
import { getUiLayoutForUser } from "@/lib/ui-layout-store";

export default async function DashboardPage() {
  let crisisStage: CrisisStage | null = null;
  let serverList: Awaited<ReturnType<typeof getServersWithStatus>> = [];
  let recentAlerts: Awaited<ReturnType<typeof getRecentAlerts>> = [];
  let dbError: string | null = null;
  const checkMode = getCheckMode();
  const sessionUser = await getSessionUser().catch(() => null);
  const initialLayout = await getUiLayoutForUser(sessionUser).catch(() =>
    defaultUiLayout(),
  );

  try {
    const sid = await getDefaultServerId().catch(() => null);
    if (sid) await syncTrivyAlertsFromStore(sid).catch(() => null);

    crisisStage = await getGlobalCrisisStage();
    serverList = await getServersWithStatus();
    recentAlerts = await getRecentAlerts(10);
  } catch (e) {
    dbError = e instanceof Error ? e.message : "Database unavailable";
  }

  const servers: HomeServerRow[] = serverList.map((s) => ({
    ...s,
    lastCheckAt: s.lastCheckAt ? s.lastCheckAt.toISOString() : null,
  }));

  const alerts = recentAlerts.map((a) => ({
    id: a.id,
    level: a.level,
    module: a.module,
    message: a.message,
    recommendation: a.recommendation,
    createdAt: a.createdAt.toISOString(),
    crisisStage: resolveCrisisStage(a) ?? undefined,
  }));

  return (
    <div className="space-y-8">
      <OnboardingNudge
        hasServers={servers.length > 0}
        checkMode={checkMode}
      />

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

      <HomeDashboardBuilder
        initialLayout={initialLayout}
        canPersist={Boolean(sessionUser)}
        servers={servers}
        alerts={alerts}
        crisisStage={crisisStage}
      />
    </div>
  );
}
