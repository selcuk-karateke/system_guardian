import type { ReactNode } from "react";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import type { WebPresenceData, WebVisitor } from "@/lib/checks/web-presence";

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-950 text-violet-300 border border-violet-800 tabular-nums">
      {children}
    </span>
  );
}

function VisitorTable({
  rows,
  empty,
}: {
  rows: WebVisitor[];
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
            {["IP", "Host / Path", "UA", "Hits", "Status", "Zuletzt"].map(
              (h) => (
                <th key={h} className="py-1.5 pr-3 font-medium">
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr
              key={`${v.ip}-${v.path}-${v.uaClass}`}
              className="border-b border-zinc-900/80 align-top"
            >
              <td className="py-1.5 pr-3 font-mono text-zinc-300">
                {v.ipMasked}
              </td>
              <td className="py-1.5 pr-3 text-zinc-300">
                <span className="text-zinc-500">{v.host}</span>
                {v.host ? " " : ""}
                <span className="font-mono">{v.path}</span>
              </td>
              <td className="py-1.5 pr-3 text-zinc-400 capitalize">{v.uaClass}</td>
              <td className="py-1.5 pr-3 tabular-nums">{v.hits}</td>
              <td className="py-1.5 pr-3 tabular-nums">{v.status || "—"}</td>
              <td className="py-1.5 pr-3 text-zinc-500 font-mono">
                {v.lastAt ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WebPresenceCard({
  data,
}: {
  data: WebPresenceData | undefined;
}) {
  if (!data) {
    return (
      <CollapsibleCard
        id="web-presence"
        title="Web Presence"
        titleClassName="text-base"
        summary="kein Lauf"
      >
        <p className="text-xs text-zinc-600">
          Noch kein web_presence-Lauf. Security-Cron abwarten oder manuell
          triggern.
        </p>
      </CollapsibleCard>
    );
  }

  return (
    <CollapsibleCard
      id="web-presence"
      title="Web Presence"
      titleClassName="text-base"
      summary={`${data.uniqueIps} IPs · ${data.visitorCount} visitors`}
      description={
        <>
          <p>
            Request-Fenster {data.window}
            {data.proxyContainer
              ? ` · ${data.proxyContainer}`
              : " · kein Proxy-Container gefunden"}{" "}
            — kein Session-Store
          </p>
          <span className="mt-2 inline-flex flex-wrap gap-2">
            <Badge>
              {data.uniqueIps} unique / {data.window}
            </Badge>
            <Badge>{data.visitorCount} visitors</Badge>
            <Badge>{data.botCount} bots</Badge>
            <Badge>
              {data.error4xx}×4xx · {data.error5xx}×5xx
            </Badge>
          </span>
        </>
      }
      contentClassName="space-y-6"
    >
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-200">Recent Visitors</h3>
        <VisitorTable
          rows={data.visitors}
          empty="Keine Browser-Hits im Fenster."
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-200">Likely Bots</h3>
        <VisitorTable rows={data.bots} empty="Keine Bot-Hits im Fenster." />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-200">Top Paths</h3>
        {data.topPaths.length === 0 ? (
          <p className="text-xs text-zinc-600">Keine Pfade.</p>
        ) : (
          <ul className="text-xs space-y-1">
            {data.topPaths.map((p) => (
              <li key={p.path} className="flex justify-between gap-4">
                <span className="font-mono text-zinc-300 truncate">
                  {p.path}
                </span>
                <span className="text-zinc-500 tabular-nums shrink-0">
                  {p.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </CollapsibleCard>
  );
}
