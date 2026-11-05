import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  primaryInterface,
  type HostInterface,
} from "@/lib/checks/host-network";
import { cn } from "@/lib/utils";

type Props = {
  interfaces: HostInterface[] | null;
  checkedAt?: Date | null;
};

export function NetworkInterfacesPanel({ interfaces, checkedAt }: Props) {
  const primary = interfaces ? primaryInterface(interfaces) : null;

  return (
    <div id="interfaces" className="space-y-4">
      {primary && (
        <Card className="overflow-hidden border-cyan-400/20">
          <CardContent className="p-0">
            <div className="relative px-6 py-5 bg-gradient-to-br from-cyan-400/15 via-transparent to-transparent">
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-400 font-semibold">
                Uplink
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold text-zinc-50">
                {primary.name}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-sm text-zinc-300">
                {primary.ipv4.map((a) => (
                  <span key={a}>{a}</span>
                ))}
                {primary.ipv6.map((a) => (
                  <span key={a} className="text-zinc-400 text-xs sm:text-sm">
                    {a}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs font-mono text-zinc-500">
                {primary.mtu != null && <span>MTU {primary.mtu}</span>}
                {primary.gateway4 && <span>gw {primary.gateway4}</span>}
                <span
                  className={cn(
                    primary.linkUp ? "text-emerald-400" : "text-zinc-600",
                  )}
                >
                  link {primary.linkUp ? "up" : primary.state}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="tracking-wide">Interfaces</CardTitle>
          {checkedAt && (
            <span className="text-xs text-zinc-600 font-mono">
              {checkedAt.toLocaleString("de-DE")}
            </span>
          )}
        </CardHeader>
        <CardContent>
          {!interfaces?.length ? (
            <p className="text-sm text-zinc-500">
              Noch keine Interface-Daten — erscheinen nach dem nächsten
              Server-Health-Lauf.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-800/80 rounded-xl border border-zinc-800 overflow-hidden">
              {interfaces.map((iface) => {
                const addrs = [...iface.ipv4, ...iface.ipv6];
                const gws = [iface.gateway4, iface.gateway6].filter(
                  Boolean,
                ) as string[];
                return (
                  <li
                    key={iface.name}
                    className="grid gap-2 sm:grid-cols-[8rem_1fr_auto] items-start px-4 py-3 bg-zinc-950/40"
                  >
                    <div>
                      <p className="font-mono text-sm text-zinc-100">
                        {iface.name}
                      </p>
                      <p
                        className={cn(
                          "text-[11px] uppercase tracking-wider mt-0.5",
                          iface.linkUp
                            ? "text-emerald-400"
                            : "text-zinc-600",
                        )}
                      >
                        {iface.linkUp ? "up" : iface.state || "down"}
                      </p>
                    </div>
                    <div className="font-mono text-xs text-zinc-400 space-y-0.5 min-w-0">
                      {addrs.length
                        ? addrs.map((a) => (
                            <div key={a} className="truncate" title={a}>
                              {a}
                            </div>
                          ))
                        : "—"}
                      {gws.length > 0 && (
                        <div className="text-zinc-600 pt-1">
                          gw {gws.join(" · ")}
                        </div>
                      )}
                    </div>
                    <div className="font-mono text-xs text-zinc-500 sm:text-right">
                      {iface.mtu != null ? `MTU ${iface.mtu}` : ""}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
