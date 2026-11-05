import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HostInventory } from "@/lib/checks/host-inventory";
import { formatUptime } from "@/lib/utils";

type Props = {
  inventory: HostInventory | null;
  uptimeSeconds?: number | null;
};

export function SystemInfoCard({ inventory, uptimeSeconds }: Props) {
  const inv = inventory;
  const updatesOk = !inv || inv.updatesAvailable <= 0;
  const rebootOk = !inv || !inv.rebootRequired;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Systeminformationen</CardTitle>
      </CardHeader>
      <CardContent>
        {!inv ? (
          <p className="text-sm text-zinc-500">
            Noch kein Server-Health-Check — Inventar erscheint nach dem nächsten
            Lauf.
          </p>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <div>
              <dt className="text-zinc-500 font-medium">Hostname</dt>
              <dd className="font-mono">{inv.hostname ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 font-medium">Version</dt>
              <dd>{inv.osPretty ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 font-medium">Prozessor</dt>
              <dd>{inv.cpuModel ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 font-medium">Kernel</dt>
              <dd className="font-mono text-xs sm:text-sm">
                {inv.kernel ? `Linux ${inv.kernel}` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500 font-medium">Systemzeit</dt>
              <dd className="font-mono text-xs sm:text-sm">
                {inv.systemTime ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500 font-medium">Laufzeit</dt>
              <dd>
                {uptimeSeconds != null ? formatUptime(uptimeSeconds) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500 font-medium">
                Aktualisierungen verfügbar
              </dt>
              <dd className="mt-1 font-medium">
                {updatesOk ? (
                  <span className="text-emerald-400">✓</span>
                ) : (
                  <span className="text-amber-400">
                    ! {inv.updatesAvailable}
                    {inv.securityUpdates > 0
                      ? ` (${inv.securityUpdates} security)`
                      : ""}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500 font-medium">
                Systemneustart erforderlich
              </dt>
              <dd className="mt-1 font-medium">
                {rebootOk ? (
                  <span className="text-emerald-400">✓</span>
                ) : (
                  <span className="text-amber-400">! ja</span>
                )}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
