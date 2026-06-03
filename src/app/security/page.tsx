import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getChangeEvents,
  getLatestCheckByModule,
} from "@/lib/dashboard-data";
import { SECURITY_CONCEPTS } from "@/lib/security/concepts";

const MODULES = [
  "fim",
  "ssh_keys",
  "users",
  "logins",
  "cron",
  "network",
  "scanner",
];

export default async function SecurityPage() {
  const checks: Record<string, Awaited<ReturnType<typeof getLatestCheckByModule>>> = {};
  let changes: Awaited<ReturnType<typeof getChangeEvents>> = [];

  try {
    for (const mod of MODULES) {
      const c = await getLatestCheckByModule(mod);
      if (c) checks[mod] = c;
    }
    changes = await getChangeEvents(20);
  } catch {
    /* empty */
  }

  return (
    <div className="space-y-8">
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

      <Card>
        <CardHeader>
          <CardTitle>Was ist was – und warum so?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
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

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
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
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Änderungshistorie</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-2">
            {changes.map((c) => (
              <li key={c.id} className="text-zinc-400">
                <span className="text-zinc-200">{c.category}</span> –{" "}
                {c.changeType}: {c.entityKey}
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
