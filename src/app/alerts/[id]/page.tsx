import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertDetailActions } from "@/components/dashboard/alert-detail-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getModulePageForAlert } from "@/lib/alert-routes";
import { getAlertById, getLatestCheckByModule } from "@/lib/dashboard-data";
import { MODULE_LABELS } from "@/lib/module-labels";
import { formatModuleDetailLines } from "@/lib/monitor-details";

function levelBadgeVariant(level: string) {
  if (level === "critical") return "critical" as const;
  if (level === "warning") return "warning" as const;
  return "default" as const;
}

function checkStatusClass(status: string) {
  if (status === "critical") return "text-red-400";
  if (status === "warning") return "text-amber-400";
  return "text-emerald-400";
}

export default async function AlertDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let alert: Awaited<ReturnType<typeof getAlertById>> = null;
  let check: Awaited<ReturnType<typeof getLatestCheckByModule>> | undefined;

  try {
    alert = await getAlertById(id);
    if (alert) {
      check = (await getLatestCheckByModule(alert.module)) ?? undefined;
    }
  } catch {
    /* empty */
  }

  if (!alert) notFound();

  const modulePage = getModulePageForAlert(alert.module);
  const moduleLabel = MODULE_LABELS[alert.module] ?? alert.module;
  const resolved = alert.resolvedAt != null;

  const detailLines = check
    ? formatModuleDetailLines(
        alert.module,
        check.data as Record<string, unknown>,
        {
          status: check.status,
          checkedAt: check.createdAt,
          metrics: null,
        },
      )
    : [];

  const logData = check?.data as
    | { criticalLines?: string[]; warningLines?: string[] }
    | undefined;

  return (
    <div className="space-y-6 max-w-3xl">
      <AlertDetailActions alertId={alert.id} resolved={resolved} />

      {resolved && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-400">
          Geschlossen am{" "}
          {alert.resolvedAt!.toLocaleString("de-DE", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={levelBadgeVariant(alert.level)}>{alert.level}</Badge>
          <span className="text-zinc-500 text-sm">{moduleLabel}</span>
          {alert.notificationSent && (
            <span className="text-xs text-zinc-600">Benachrichtigung gesendet</span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-zinc-100 leading-snug">
          {alert.message}
        </h1>
        <p className="text-sm text-zinc-500">
          Erstellt:{" "}
          {alert.createdAt.toLocaleString("de-DE", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      </div>

      {alert.recommendation && (
        <Card className="border-sky-900/40 bg-sky-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-sky-200">Empfehlung</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-sky-100/90 leading-relaxed">
            {alert.recommendation}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Modul-Kontext</CardTitle>
          <Link
            href={modulePage.href}
            className="text-sm text-sky-400 hover:text-sky-300 shrink-0"
          >
            {modulePage.label} →
          </Link>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {check ? (
            <>
              <p>
                Check-Status:{" "}
                <span className={checkStatusClass(check.status)}>
                  {check.status}
                </span>
                <span className="text-zinc-500">
                  {" "}
                  · zuletzt{" "}
                  {check.createdAt.toLocaleString("de-DE", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </p>
              {detailLines.length > 0 && (
                <ul className="space-y-1 text-zinc-300 font-mono text-xs">
                  {detailLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              {(logData?.criticalLines?.length ?? 0) > 0 && (
                <div>
                  <p className="text-red-400/90 text-xs font-semibold uppercase mb-1">
                    Log-Zeilen (critical)
                  </p>
                  <ul className="space-y-1 font-mono text-xs text-red-200/80">
                    {logData!.criticalLines!.map((line) => (
                      <li key={line} className="break-all">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(logData?.warningLines?.length ?? 0) > 0 && (
                <div>
                  <p className="text-amber-400/90 text-xs font-semibold uppercase mb-1">
                    Log-Zeilen (warning)
                  </p>
                  <ul className="space-y-1 font-mono text-xs text-amber-200/80">
                    {logData!.warningLines!.map((line) => (
                      <li key={line} className="break-all">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-zinc-500">
              Noch kein Check-Lauf für dieses Modul gespeichert.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
