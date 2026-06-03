import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLatestCheckByModule } from "@/lib/dashboard-data";

export default async function DatabasesPage() {
  let check: Awaited<ReturnType<typeof getLatestCheckByModule>> | undefined;
  try {
    check = await getLatestCheckByModule("database");
  } catch {
    /* empty */
  }

  const dbs =
    (check?.data as { databases?: Record<string, { ok: boolean; sizeBytes?: number }> })
      ?.databases ?? {};

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Datenbanken</h1>
      <div className="grid md:grid-cols-2 gap-4">
        {["postgresql", "mysql"].map((name) => {
          const db = dbs[name];
          return (
            <Card key={name}>
              <CardHeader>
                <CardTitle className="capitalize">{name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={db?.ok ? "text-emerald-400" : "text-zinc-500"}>
                  {db?.ok ? "Verbunden" : "Nicht verfügbar / übersprungen"}
                </p>
                {db?.sizeBytes && (
                  <p className="text-sm text-zinc-500 mt-2">
                    Größe: {Math.round(db.sizeBytes / 1024 / 1024)} MB
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
