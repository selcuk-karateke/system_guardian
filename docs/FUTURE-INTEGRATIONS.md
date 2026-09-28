# Roadmap & geplante Integrationen

Stand: 2026-09-28

> **In der App:** [/docs/roadmap](/docs/roadmap) · **Mitmachen:** Einträge in [backlog.json](./backlog.json) per PR (`status: idea`). Anleitung: [BACKLOG.md](./BACKLOG.md).

Guardian: Coolify-Host per SSH, Dashboard + Cron. Collaborators (Sysadmin/Ops) priorisieren mit über das Backlog.

## Erledigt (Auszug)

| Wann | Thema |
|------|--------|
| Jun 2026 | Monitor/Status nur offene Alerts; Logins-Baseline; Docker/Coolify-Deploy-Erkennung; Trivy on-demand; Network-Inbound-Fix |
| Sep 2026 | Auto-Resolve offener Alerts; Monitor-Status/Ticker aligned; Outbound :443 ohne False-CRITICAL |
| Sep 2026 | Sysadmin-Doku, Redoc (`/docs/api`), `npm run docs:check` (Katalog/OpenAPI-Drift) |

Ältere Details: Git-History / frühere Abschnitte in PRs.

## Als Nächstes (Priorität)

Wenn Ops/Production stabil:

1. Docker HEALTHCHECK `(unhealthy)` erkennen  
2. Trivy 1×/Woche + Diff-Alerts  
3. RDAP Domain-Ablauf (≠ SSL)  
4. Optional: VirusTotal / HIBP  

Vollständige Wunschliste inkl. Collaborator-Ideen: **[backlog.json](./backlog.json)** · Anleitung [BACKLOG.md](./BACKLOG.md).

## Phase 2 — Monitoring & Security

| Thema | Plan |
|-------|------|
| Docker HEALTHCHECK | `(unhealthy)` bei laufenden Containern |
| Trivy automatisch | 1×/Woche, nur Diff neue HIGH/CRITICAL |
| CVE-Modul | UI „Vulnerability Detection“ |
| Log-Analyse | Mehr Dateien, konfigurierbare Regex |

## Phase 2 — Externe Quellen

| Quelle | Nutzen |
|--------|--------|
| RDAP/WHOIS (`.de` → DENIC) | Domain-Ablauf |
| VirusTotal API | Domain-Reputation |
| Have I Been Pwned API v3 | Ops-Mails auf Leaks |

**Bewusst nicht:** whois.net (nur Web-UI), AVG Website Safety (keine API), TestDisk (kein Monitoring).

## Phase 3

- Hetzner-/Coolify-API (optional)
- Log-Archiv (Loki o.ä.) nur bei Bedarf

## Wie Collaborators etwas eintragen

1. Fork/Branch → in [backlog.json](./backlog.json) unter `items` ein Objekt anhängen (`status: "idea"`, `proposedBy: "dein-name"`).  
2. PR mit kurzer Begründung (False Positive? fehlendes Monitoring? Ops-Schmerz?).  
3. Core priorisiert (`idea` → `planned` / `in_progress`).  

Details: [BACKLOG.md](./BACKLOG.md). Kein Git-Zugang? Issue mit Label **`roadmap`**.

Vor Code-Änderungen an Checks/API: `npm run docs:check` (siehe [SYSADMIN.md](./SYSADMIN.md)).

## Trivy — on-demand vs. geplant

| | On-demand (`/docker` → Scan) | Geplant |
|--|------------------------------|---------|
| Trigger | Button pro Container | Cron 1×/Woche |
| Severity | HIGH, CRITICAL | gleich |
| Speicher | Digest-Cache | + Alert bei neuem Diff |
| Voraussetzung | `CHECK_MODE=ssh`, `trivy` auf Host | gleich |
