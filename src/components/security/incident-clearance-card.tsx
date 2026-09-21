import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClearanceItem } from "@/lib/checks/incident-clearance";

function ClearanceList({
  items,
  title,
}: {
  title: string;
  items: ClearanceItem[];
}) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
        {title}
      </h3>
      <ul className="space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex gap-2">
            <span
              className={
                item.status === "pass"
                  ? "text-emerald-400 shrink-0"
                  : item.status === "fail"
                    ? "text-red-400 shrink-0"
                    : "text-amber-400 shrink-0"
              }
            >
              {item.status === "pass" ? "✓" : item.status === "fail" ? "✗" : "!"}
            </span>
            <span>
              <span className="text-zinc-200">{item.label}</span>
              <span className="text-zinc-500 block text-xs mt-0.5">
                {item.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IncidentClearanceCard({
  data,
  status,
}: {
  status?: string;
  data?: {
    allPass?: boolean;
    items?: ClearanceItem[];
    iocItems?: ClearanceItem[];
    scopeItems?: ClearanceItem[];
    sshItems?: ClearanceItem[];
    window?: { logSince: string; logUntil: string };
    summaryLine?: string;
  };
}) {
  const ioc = data?.iocItems ?? data?.items?.filter((i) => i.group === "ioc") ?? [];
  const scope =
    data?.scopeItems ?? data?.items?.filter((i) => i.group === "scope") ?? [];
  const ssh = data?.sshItems ?? data?.items?.filter((i) => i.group === "ssh") ?? [];

  if (!ioc.length && !scope.length && !ssh.length) return null;

  return (
    <Card className="border-zinc-700">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          Sicherheitslage (IOC + Prüfumfang)
          <span
            className={
              data?.allPass
                ? "text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800"
                : status === "critical"
                  ? "text-xs px-2 py-0.5 rounded-full bg-red-950 text-red-400 border border-red-800"
                  : "text-xs px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 border border-amber-800"
            }
          >
            {data?.allPass ? "IOC ok" : status ?? "—"}
          </span>
        </CardTitle>
        {data?.window && (
          <p className="text-xs text-zinc-500 mt-1">
            IOC-Fenster: {data.window.logSince} → {data.window.logUntil} (UTC)
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {data?.summaryLine && (
          <p className="text-sm text-zinc-300">{data.summaryLine}</p>
        )}
        <ClearanceList title="IOC — keine Treffer erwartet" items={ioc} />
        <ClearanceList
          title="Prüfumfang (Warnung = durchgeführt, nicht automatisch sauber)"
          items={scope}
        />
        <ClearanceList title="SSH-Härtung" items={ssh} />
      </CardContent>
    </Card>
  );
}
