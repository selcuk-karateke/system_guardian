import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ServerSelect } from "@/components/dashboard/server-select";
import { SshTargetNote } from "@/components/dashboard/ssh-target-note";
import { getLatestCheckByModule } from "@/lib/dashboard-data";
import { resolveSelectedServer } from "@/lib/server-scope";

export default async function DatabasesPage({
  searchParams,
}: {
  searchParams: Promise<{ server?: string }>;
}) {
  const sp = await searchParams;
  const { serverRows, selectedServerId, selected } = await resolveSelectedServer(
    sp.server,
  );

  let check: Awaited<ReturnType<typeof getLatestCheckByModule>> | undefined;
  try {
    if (selectedServerId) {
      check = await getLatestCheckByModule("database", selectedServerId);
    }
  } catch {
    /* empty */
  }

  const dbs =
    (check?.data as {
      databases?: Record<
        string,
        { ok: boolean; sizeBytes?: number; skipped?: boolean }
      >;
      checkMode?: string;
    })?.databases ?? {};

  const isMock = (check?.data as { checkMode?: string })?.checkMode === "mock";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-3xl font-bold">Datenbanken</h1>
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

      <Card className="border-zinc-800 bg-zinc-900/40">
        <CardContent className="pt-6 text-sm text-zinc-400 space-y-3">
          <p>
            <strong className="text-zinc-200">Zwei verschiedene Welten:</strong>
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>App-Datenbank</strong> (lokal): PostgreSQL{" "}
              <code className="text-zinc-300">system_guardian</code> in{" "}
              <code>DATABASE_URL</code> – speichert Checks, Alerts, Historie.
              Läuft auf deinem PC, hat mit den Karten unten nichts zu tun.
            </li>
            <li>
              <strong>Überwachte Datenbanken</strong> (unten): PostgreSQL/MySQL{" "}
              <em>auf dem Server</em> per SSH – typisch Coolify-Container{" "}
              <code>coolify-db</code> und optional MySQL-Apps.
            </li>
          </ul>
          {isMock && (
            <p className="text-sky-300/90 border-t border-zinc-800 pt-3">
              CHECK_MODE=mock: „Verbunden“ unten sind simulierte Testwerte, kein
              echter Server.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="sg-stagger grid md:grid-cols-2 gap-4">
        {[
          {
            key: "postgresql",
            title: "PostgreSQL (Server)",
            hint: "Prüft coolify-db per docker exec",
          },
          {
            key: "mysql",
            title: "MySQL (Server)",
            hint: "Nur wenn ein MySQL-Container läuft",
          },
        ].map(({ key, title, hint }) => {
          const db = dbs[key];
          return (
            <Card key={key}>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-zinc-500 mb-2">{hint}</p>
                <p className={db?.ok ? "text-emerald-400" : "text-zinc-500"}>
                  {db?.ok
                    ? "Erreichbar"
                    : db?.skipped
                      ? "Nicht installiert / übersprungen (normal bei reinem Coolify+PG)"
                      : "Check fehlgeschlagen"}
                </p>
                {db?.sizeBytes ? (
                  <p className="text-sm text-zinc-500 mt-2">
                    DB-Größe (Coolify):{" "}
                    {Math.round(db.sizeBytes / 1024 / 1024)} MB
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
