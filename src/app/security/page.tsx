import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getChangeEvents,
  getLatestCheckByModule,
} from "@/lib/dashboard-data";

export default async function SecurityPage() {
  const modules = ["ssh_keys", "users", "logins", "cron", "network", "scanner"];
  const checks: Record<string, Awaited<ReturnType<typeof getLatestCheckByModule>>> = {};
  let changes: Awaited<ReturnType<typeof getChangeEvents>> = [];

  try {
    for (const mod of modules) {
      const c = await getLatestCheckByModule(mod);
      if (c) checks[mod] = c;
    }
    changes = await getChangeEvents(20);
  } catch {
    /* empty */
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Sicherheit</h1>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((mod) => (
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
              <p className="text-xs text-zinc-500 mt-2">
                Alerts: {checks[mod] ? "see notifications" : 0}
              </p>
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
