# Collaborator-Backlog

**Datei:** [`backlog.json`](./backlog.json) — einzige Quelle für die Roadmap-UI (`/docs/roadmap`).

## Eintrag hinzufügen

1. Branch öffnen.
2. In `docs/backlog.json` unter `"items"` ein Objekt anhängen:

```json
{
  "id": "mein-kurz-id",
  "title": "Kurzer Titel",
  "status": "idea",
  "proposedBy": "dein-name",
  "area": "monitoring",
  "notes": "Warum / grober Ansatz"
}
```

3. `npm run docs:check` (prüft u. a. Backlog-Schema).
4. PR mit 1–2 Sätzen Begründung.

`area`: `monitoring` | `security` | `ux` | `ops` | `other`  
`status`: `idea` (Vorschlag) → Core setzt `planned` / `in_progress` / `done`

Kein Repo-Push? GitHub-Issue mit Label **`roadmap`** — wir tragen es in `backlog.json` ein.

Kontext & Phasen: [FUTURE-INTEGRATIONS.md](./FUTURE-INTEGRATIONS.md).
