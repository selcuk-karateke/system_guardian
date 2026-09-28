import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  loadRoadmapItems,
  sortedRoadmapItems,
  ROADMAP_STATUS_LABEL,
  ROADMAP_AREA_LABEL,
  type RoadmapStatus,
} from "@/lib/docs/roadmap";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<RoadmapStatus, string> = {
  in_progress: "bg-amber-500/15 text-amber-300 border-amber-700/50",
  planned: "bg-sky-500/15 text-sky-300 border-sky-700/50",
  idea: "bg-zinc-500/15 text-zinc-300 border-zinc-600/50",
  done: "bg-emerald-500/15 text-emerald-300 border-emerald-700/50",
};

export default function RoadmapDocsPage() {
  const items = sortedRoadmapItems(loadRoadmapItems());
  const nextUp = items.filter(
    (i) => i.status === "planned" || i.status === "in_progress",
  );

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <Link href="/docs" className="text-sm text-sky-400 hover:underline">
          ← Dokumentation
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Roadmap</h1>
        <p className="mt-2 text-zinc-400 text-sm leading-relaxed">
          Was als Nächstes gebaut werden soll — und wo Collaborators Ideen
          eintragen. Quelle:{" "}
          <code className="text-zinc-300">docs/backlog.json</code>
        </p>
      </div>

      <Card className="border-sky-900/50 bg-sky-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Idee eintragen</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-300 space-y-2">
          <p>
            PR auf <code className="text-xs">docs/backlog.json</code> mit{" "}
            <code className="text-xs">status: &quot;idea&quot;</code> und deinem
            Namen in <code className="text-xs">proposedBy</code>. Anleitung:{" "}
            <code className="text-xs">docs/BACKLOG.md</code>.
          </p>
          <p className="text-zinc-500">
            Ohne Push-Recht: GitHub-Issue mit Label{" "}
            <code className="text-xs">roadmap</code>.
          </p>
        </CardContent>
      </Card>

      {nextUp.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Als Nächstes</h2>
          <ul className="space-y-2 text-sm">
            {nextUp.map((item, i) => (
              <li
                key={item.id}
                className="flex gap-3 rounded-lg border border-zinc-800 px-3 py-2"
              >
                <span className="text-zinc-600 font-mono text-xs w-5 shrink-0 pt-0.5">
                  {i + 1}.
                </span>
                <div>
                  <div className="text-zinc-100">{item.title}</div>
                  {item.notes && (
                    <p className="text-zinc-500 text-xs mt-0.5">{item.notes}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Backlog</h2>
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="py-3 px-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="font-medium text-zinc-100">{item.title}</div>
                  {item.notes && (
                    <p className="text-xs text-zinc-500">{item.notes}</p>
                  )}
                  <p className="text-[11px] text-zinc-600 font-mono">
                    {item.id} · {ROADMAP_AREA_LABEL[item.area]} ·{" "}
                    {item.proposedBy}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 self-start rounded border px-2 py-0.5 text-xs",
                    STATUS_STYLE[item.status],
                  )}
                >
                  {ROADMAP_STATUS_LABEL[item.status]}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <p className="text-xs text-zinc-500">
        Phasen & Kontext:{" "}
        <code className="text-zinc-400">docs/FUTURE-INTEGRATIONS.md</code>
      </p>
    </div>
  );
}
