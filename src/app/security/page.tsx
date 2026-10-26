import { Suspense } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ServerSelect } from "@/components/dashboard/server-select";
import { SshTargetNote } from "@/components/dashboard/ssh-target-note";
import {
  getChangeEvents,
  getLatestCheckByModule,
} from "@/lib/dashboard-data";
import { CronBreakdown } from "@/components/security/cron-breakdown";
import {
  Fail2banSummary,
  type Fail2banData,
} from "@/components/security/fail2ban-summary";
import { IncidentClearanceCard } from "@/components/security/incident-clearance-card";
import { SshPresenceCard } from "@/components/security/ssh-presence-card";
import { WebPresenceCard } from "@/components/security/web-presence-card";
import { SECURITY_CONCEPTS } from "@/lib/security/concepts";
import { getOpenControlIssues } from "@/lib/control-summary";
import type { CoolifyMeta } from "@/lib/checks/coolify-meta";
import { buildCoolifyLookup, enrichDockerChangeKey } from "@/lib/docker-display";
import { resolveSelectedServer } from "@/lib/server-scope";

const MODULES = [
  "fim",
  "ssh_keys",
  "users",
  "logins",
  "web_presence",
  "cron",
  "processes",
  "network",
  "scanner",
  "docker",
  "security_posture",
  "services",
];

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ server?: string }>;
}) {
  const sp = await searchParams;
  const { serverRows, selectedServerId, selected } = await resolveSelectedServer(
    sp.server,
  );

  const checks: Record<string, Awaited<ReturnType<typeof getLatestCheckByModule>>> = {};
  let changes: Awaited<ReturnType<typeof getChangeEvents>> = [];
  let openIssues: Awaited<ReturnType<typeof getOpenControlIssues>> = [];
  let coolifyLookup = new Map<string, CoolifyMeta | undefined>();

  try {
    if (selectedServerId) {
      for (const mod of MODULES) {
        const c = await getLatestCheckByModule(mod, selectedServerId);
        if (c) checks[mod] = c;
      }
    }
    changes = await getChangeEvents(20);
    openIssues = await getOpenControlIssues(selectedServerId || undefined);
    coolifyLookup = buildCoolifyLookup(
      (checks.docker?.data as { containers?: Parameters<typeof buildCoolifyLookup>[0] })
        ?.containers,
    );
  } catch {
    /* empty */
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Sicherheit</h1>
          <p className="text-zinc-400 mt-2 text-sm max-w-3xl">
            System Guardian baut SIEM-Funktionen schrittweise ein – schlank per SSH,
            ohne Wazuh/Kibana. Ausführlich:{" "}
            <Link href="/docs/security" className="text-sky-400 underline">
              Security-Doku
            </Link>{" "}
            oder{" "}
            <code className="text-zinc-300">docs/SECURITY-FEATURES.md</code> im Repo.
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

      {openIssues.length > 0 && (
        <Card className="border-amber-900/50">
          <CardHeader>
            <CardTitle>Offene Punkte (Früherkennung)</CardTitle>
          </CardHeader>
          <CardContent className="sg-stagger text-sm space-y-2 max-h-64 overflow-auto">
            {openIssues.map((issue, i) => (
              <p
                key={`${issue.source}-${i}`}
                className={
                  issue.severity === "critical"
                    ? "text-red-300"
                    : issue.severity === "warning"
                      ? "text-amber-300"
                      : "text-zinc-400"
                }
              >
                [{issue.source}] {issue.message}
              </p>
            ))}
            <Link href="/history" className="text-sky-400 text-xs underline block mt-2">
              Historie filtern →
            </Link>
          </CardContent>
        </Card>
      )}

      <IncidentClearanceCard
        status={
          checks.security_posture?.status ?? checks.incident_clearance?.status
        }
        data={
          (checks.security_posture ?? checks.incident_clearance)?.data as {
            allPass?: boolean;
            items?: import("@/lib/checks/incident-clearance").ClearanceItem[];
            window?: { logSince: string; logUntil: string };
            summaryLine?: string;
          }
        }
      />

      <div className="sg-stagger grid lg:grid-cols-2 gap-4">
        <SshPresenceCard
          data={
            checks.logins?.data as import("@/components/security/ssh-presence-card").LoginsPresenceData
          }
        />
        <WebPresenceCard
          data={
            checks.web_presence?.data as import("@/lib/checks/web-presence").WebPresenceData
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Was ist was – und warum so?</CardTitle>
        </CardHeader>
        <CardContent className="sg-stagger space-y-6">
          {SECURITY_CONCEPTS.map((c) => (
            <div
              key={c.id}
              className="border-b border-zinc-800 pb-5 last:border-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h3 className="font-semibold text-zinc-100">{c.title}</h3>
                <span
                  className={
                    c.status === "active"
                      ? "text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800"
                      : "text-xs px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-400 border border-zinc-700"
                  }
                >
                  {c.status === "active" ? "Aktiv" : "Geplant"}
                </span>
                {c.cron !== "—" && (
                  <span className="text-xs text-zinc-500">Cron: {c.cron}</span>
                )}
              </div>
              <p className="text-sm text-zinc-500">
                <span className="text-zinc-400">Klassisch (SIEM):</span> {c.siem}
              </p>
              <p className="text-sm text-zinc-300 mt-1">
                <span className="text-zinc-400">Bei uns:</span> {c.guardian}
              </p>
              <p className="text-sm text-sky-400/90 mt-2 italic">{c.why}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="sg-stagger grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODULES.map((mod) => (
          <Card key={mod}>
            <CardHeader>
              <CardTitle className="capitalize text-base">
                {mod.replace("_", " ")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                Status:{" "}
                <span
                  className={
                    checks[mod]?.status === "critical"
                      ? "text-red-400"
                      : checks[mod]?.status === "warning"
                        ? "text-amber-400"
                        : "text-emerald-400"
                  }
                >
                  {checks[mod]?.status ?? "—"}
                </span>
              </p>
              {(checks[mod]?.data as { isBaseline?: boolean })?.isBaseline && (
                <p className="text-xs text-zinc-500 mt-2">
                  Letzter Lauf: Baseline (keine Diff-Alerts)
                </p>
              )}
              {mod === "network" &&
                (
                  checks.network?.data as {
                    outboundCount?: number;
                    suspiciousConnections?: string[];
                  }
                )?.outboundCount != null && (
                  <p className="text-xs text-zinc-500 mt-2">
                    {(
                      checks.network?.data as { outboundCount?: number }
                    ).outboundCount}{" "}
                    outbound ESTAB
                    {(
                      checks.network?.data as {
                        suspiciousConnections?: string[];
                      }
                    ).suspiciousConnections?.length
                      ? ` · ${(checks.network?.data as { suspiciousConnections?: string[] }).suspiciousConnections!.length} verdächtig`
                      : ""}
                  </p>
                )}
              {mod === "docker" &&
                (
                  checks.docker?.data as {
                    inventory?: { onlyCoolifyStack?: boolean };
                  }
                )?.inventory && (
                  <p className="text-xs text-zinc-500 mt-2">
                    Nur Coolify:{" "}
                    {(
                      checks.docker?.data as {
                        inventory?: { onlyCoolifyStack?: boolean };
                      }
                    ).inventory!.onlyCoolifyStack
                      ? "ja"
                      : "nein — Inventar prüfen"}
                  </p>
                )}
              {mod === "cron" && (
                <CronBreakdown
                  data={
                    checks.cron?.data as {
                      systemCount?: number;
                      humanCount?: number;
                      systemBuckets?: Record<string, number>;
                      humanJobs?: Record<string, string>;
                      jobCount?: number;
                    }
                  }
                />
              )}
              {mod === "logins" && (
                <Fail2banSummary
                  data={
                    (checks.logins?.data as { fail2ban?: Fail2banData })
                      ?.fail2ban
                  }
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Änderungshistorie</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="sg-stagger text-sm space-y-2">
            {changes.map((c) => (
              <li key={c.id} className="text-zinc-400">
                <span className="text-zinc-200">{c.category}</span> –{" "}
                {c.changeType}:{" "}
                {enrichDockerChangeKey(c.category, c.entityKey, coolifyLookup)}
              </li>
            ))}
            {changes.length === 0 && (
              <li className="text-zinc-500">Keine Änderungen erfasst.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
