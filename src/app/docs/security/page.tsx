import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SECURITY_CONCEPTS } from "@/lib/security/concepts";

export default function SecurityDocsPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/security" className="text-sm text-sky-400 hover:underline">
        ← Zurück zu Sicherheit
      </Link>
      <h1 className="text-3xl font-bold">Security-Features erklärt</h1>
      <p className="text-zinc-400 text-sm">
        Kurzfassung aus <code>docs/SECURITY-FEATURES.md</code>. Vollständige
        Details und Roadmap stehen in der Datei im Repository.
      </p>

      {SECURITY_CONCEPTS.map((c) => (
        <Card key={c.id}>
          <CardHeader>
            <CardTitle>{c.title}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-zinc-300">
            <p>
              <strong className="text-zinc-400">SIEM-Klassiker:</strong> {c.siem}
            </p>
            <p>
              <strong className="text-zinc-400">System Guardian:</strong>{" "}
              {c.guardian}
            </p>
            <p className="text-sky-400/90">{c.why}</p>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Baseline-Scan</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-400">
          Beim ersten Lauf pro Kategorie (Ports, FIM, Docker, …) wird nur ein
          Snapshot gespeichert. Erst ab dem zweiten Lauf gibt es Alerts bei
          Änderungen – damit der erste Cron nicht jeden Port/Container als
          „neu“ meldet.
        </CardContent>
      </Card>
    </div>
  );
}
