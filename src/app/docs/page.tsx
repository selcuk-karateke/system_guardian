import Link from "next/link";
import { CollapsibleCard } from "@/components/ui/collapsible-card";

const LINKS = [
  {
    href: "/docs/sysadmin",
    title: "Sysadmin-Handbuch",
    body: "Wo ist was? Architektur, Check-Katalog, Env/Allowlists, Betrieb, Zuarbeit – Einstieg für Systemadmins.",
  },
  {
    href: "/docs/roadmap",
    title: "Roadmap & Backlog",
    body: "Was als Nächstes gebaut wird. Collaborators tragen Ideen in docs/backlog.json ein (PR).",
  },
  {
    href: "/docs/api",
    title: "HTTP-API (Redoc)",
    body: "OpenAPI-Spec interaktiv – Health, Status, Cron, Historie. Gängiges Format für Ops & Integrationen.",
  },
  {
    href: "/docs/security",
    title: "Security-Features",
    body: "SIEM-Begriffe (Log-Analyse, FIM, HIDS) vs. wie System Guardian sie umsetzt.",
  },
] as const;

const REPO_DOCS = [
  {
    file: "docs/backlog.json",
    title: "Backlog (editierbar)",
    body: "JSON-Wunschliste — Collaborators hängen idea-Einträge per PR an.",
  },
  {
    file: "docs/BACKLOG.md",
    title: "Backlog-Anleitung",
    body: "Wie man einen Eintrag hinzufügt.",
  },
  {
    file: "docs/FUTURE-INTEGRATIONS.md",
    title: "Roadmap (ausführlich)",
    body: "Phasen, Prioritäten, was bewusst nicht gebaut wird.",
  },
  {
    file: "docs/SYSADMIN.md",
    title: "Sysadmin-Handbuch",
    body: "Wo ist was? Architektur, Check-Katalog, Env/Allowlists, Betrieb, Zuarbeit.",
  },
  {
    file: "docs/CRISIS.md",
    title: "Crisis stages (S1–S4)",
    body: "Emergency / Severe / Degraded / Routine — single UI severity; technical warning/critical stay internal.",
  },
  {
    file: "docs/COOLIFY.md",
    title: "Coolify / Production",
    body: "Deploy, Auth, Cron-Schedule, SSH-Key.",
  },
  {
    file: "docs/SECURITY-FEATURES.md",
    title: "Security (ausführlich)",
    body: "Vollständige Markdown-Version im Repo.",
  },
  {
    file: ".env.example",
    title: "Umgebungsvariablen",
    body: "Alle Schalter, Thresholds und Trust-Listen.",
  },
] as const;

export default function DocsHubPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dokumentation</h1>
        <p className="mt-2 text-zinc-400 text-sm leading-relaxed">
          Orientierung für Collaborators aus dem Sysadmin-/Ops-Bereich: wo was
          liegt, welche Checks laufen, wie API und Cron funktionieren.
        </p>
      </div>

      <CollapsibleCard
        id="docs-ownership"
        className="border-sky-900/50 bg-sky-950/20"
        title="Wer hält das aktuell?"
        titleClassName="text-base"
        summary="docs:check · Katalog"
        contentClassName="text-sm text-zinc-400 space-y-2"
      >
        <p>
          Modul-Listen und API-Pfade werden gegen den Code geprüft:{" "}
          <code className="text-zinc-300">npm run docs:check</code>. Fehlt
          nach einem PR ein Katalog-Eintrag oder OpenAPI-Pfad, schlägt der
          Check fehl — das System erkennt Drift, schreibt aber nichts von
          selbst um.
        </p>
        <p>
          Erklärungen/Prosa bleiben manuell (
          <code className="text-zinc-300">docs/SYSADMIN.md</code>, Security).
          Summaries der Module:{" "}
          <code className="text-zinc-300">src/lib/docs/module-catalog.ts</code>
          .
        </p>
      </CollapsibleCard>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">In der App</h2>
        <div className="sg-stagger grid gap-3">
          {LINKS.map((item) => (
            <CollapsibleCard
              key={item.href}
              id={`docs-app-${item.href.replace(/\//g, "-")}`}
              title={item.title}
              titleClassName="text-base text-sky-400"
              summary="App-Seite"
              contentClassName="text-sm text-zinc-400 space-y-2"
            >
              <p>{item.body}</p>
              <Link
                href={item.href}
                className="inline-block text-sky-400 hover:underline"
              >
                Öffnen →
              </Link>
            </CollapsibleCard>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-200">Im Repository</h2>
        <p className="text-xs text-zinc-500">
          Markdown im Clone lesen oder im Editor öffnen – nicht als gerenderte
          Seite. Haupteinstieg:{" "}
          <code className="text-zinc-400">docs/SYSADMIN.md</code>
        </p>
        <div className="sg-stagger grid gap-3">
          {REPO_DOCS.map((item) => (
            <CollapsibleCard
              key={item.file}
              id={`docs-repo-${item.file.replace(/[/.]/g, "-")}`}
              title={item.title}
              titleClassName="text-base"
              description={
                <code className="text-xs text-sky-500/90">{item.file}</code>
              }
              summary={item.file}
              contentClassName="text-sm text-zinc-400"
            >
              {item.body}
            </CollapsibleCard>
          ))}
        </div>
      </section>

      <p className="text-xs text-zinc-500">
        OpenAPI-Datei direkt:{" "}
        <Link href="/openapi.yaml" className="text-sky-400 hover:underline">
          /openapi.yaml
        </Link>
      </p>
    </div>
  );
}
