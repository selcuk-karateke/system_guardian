import type { ReactNode } from "react";
import {
  Fail2banSummary,
  type Fail2banData,
} from "@/components/security/fail2ban-summary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActiveSession, FailedAuthSource } from "@/lib/checks/session-presence";

export type LoginsPresenceData = {
  activeSessions?: ActiveSession[];
  activeCount?: number;
  sshEstablishedCount?: number;
  recentLogins?: string[];
  failedCount?: number;
  failedAuthSources?: FailedAuthSource[];
  fail2ban?: Fail2banData & {
    bannedIps?: string[];
    bannedIpsMasked?: string[];
  };
};

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-800 tabular-nums">
      {children}
    </span>
  );
}

function MiniTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-zinc-600">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 text-left border-b border-zinc-800">
            {headers.map((h) => (
              <th key={h} className="py-1.5 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b border-zinc-900/80 align-top">
              {cells.map((cell, j) => (
                <td key={j} className="py-1.5 pr-3 text-zinc-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SshPresenceCard({ data }: { data: LoginsPresenceData | undefined }) {
  const sessions = data?.activeSessions ?? [];
  const activeCount = data?.activeCount ?? sessions.length;
  const failed = (data?.failedAuthSources ?? []).filter((s) => !s.trusted);
  const bannedMasked = data?.fail2ban?.bannedIpsMasked ?? [];
  const recent = (data?.recentLogins ?? []).slice(0, 10);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">SSH Who&apos;s Online</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Badge>{activeCount} online</Badge>
          {data?.sshEstablishedCount != null && (
            <Badge>{data.sshEstablishedCount} :22 ESTAB</Badge>
          )}
          <Badge>{data?.failedCount ?? failed.length} failed IPs</Badge>
          <Badge>{data?.fail2ban?.currentlyBanned ?? 0} bans aktiv</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-200">Aktive Sessions</h3>
          <MiniTable
            headers={["Benutzer", "Von", "TTY", "Idle", "Was", "Trust"]}
            empty="Keine aktiven Sessions (who/w leer)."
            rows={sessions.map((s) => [
              <span key="u" className="font-mono text-zinc-100">
                {s.user}
              </span>,
              <span key="f" className="font-mono">
                {s.fromMasked}
              </span>,
              s.tty,
              s.idle ?? "—",
              <span key="w" className="text-zinc-400 max-w-[12rem] truncate inline-block">
                {s.what ?? "—"}
              </span>,
              s.trusted ? (
                <span key="t" className="text-emerald-400">
                  trusted
                </span>
              ) : (
                <span key="t" className="text-amber-400">
                  unknown
                </span>
              ),
            ])}
          />
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-200">Letzte Logins</h3>
          {recent.length === 0 ? (
            <p className="text-xs text-zinc-600">Keine last-Einträge.</p>
          ) : (
            <ul className="text-xs font-mono space-y-1 text-zinc-400 max-h-40 overflow-auto">
              {recent.map((line, i) => (
                <li key={i} className="truncate">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-200">Failed Auth (Quellen)</h3>
          <MiniTable
            headers={["IP", "Versuche"]}
            empty="Keine Failed-Password-Quellen im auth.log-Ausschnitt."
            rows={failed.slice(0, 12).map((s) => [
              <span key="ip" className="font-mono">
                {s.ipMasked}
              </span>,
              String(s.count),
            ])}
          />
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-200">Fail2ban</h3>
          <Fail2banSummary data={data?.fail2ban} />
          {bannedMasked.length > 0 && (
            <p className="text-xs text-zinc-500">
              Aktiv gebannt:{" "}
              <span className="font-mono text-zinc-300">
                {bannedMasked.join(", ")}
              </span>
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
