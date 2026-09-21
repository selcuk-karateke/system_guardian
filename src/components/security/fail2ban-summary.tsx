import { formatSinceLastCheck } from "@/lib/checks/fail2ban-metrics";

export type Fail2banData = {
  currentlyBanned?: number;
  totalBanned?: number;
  totalBannedDelta?: number;
  banRatePerHour?: number;
  sinceLastCheckHours?: number;
  serviceActive?: boolean;
  jailAvailable?: boolean;
};

export function Fail2banSummary({ data }: { data: Fail2banData | undefined }) {
  if (!data?.serviceActive || !data.jailAvailable) {
    if (data && !data.serviceActive) {
      return <p className="text-xs text-red-400/90 mt-2">fail2ban nicht aktiv</p>;
    }
    return null;
  }

  const active = data.currentlyBanned ?? 0;
  const total = data.totalBanned ?? 0;
  const delta = data.totalBannedDelta;
  const since =
    data.sinceLastCheckHours != null
      ? formatSinceLastCheck(data.sinceLastCheckHours)
      : null;

  return (
    <div className="mt-3 space-y-1 text-xs text-zinc-500">
      <p>
        <span className="text-zinc-400">Aktiv gebannt:</span>{" "}
        <span className="text-zinc-200 font-medium">{active}</span>
        <span className="mx-2 text-zinc-700">·</span>
        <span className="text-zinc-400">Total (kumuliert):</span>{" "}
        <span className="text-zinc-200 font-medium">{total}</span>
      </p>
      {delta != null && delta > 0 && since && (
        <p>
          +{delta} Ban-Ereignisse seit letztem manuellen/Cron-Lauf ({since}
          {data.banRatePerHour != null ? `, ~${data.banRatePerHour}/Std.` : ""})
        </p>
      )}
      <p className="text-zinc-600 leading-relaxed">
        Total = alle Ban-Ereignisse seit Jail-Start. Aktiv = gerade gebannte IPs
        (laufen nach bantime ab).
      </p>
    </div>
  );
}
