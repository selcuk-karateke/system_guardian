# Roadmap & geplante Integrationen

Stand: 2026-06-18 — Guardian primär **lokal** (Windows + SSH zum Hetzner-Host), kein eigenes Coolify-Deploy nötig.

## Erledigt (Jun 2026)

| Thema | Status |
|-------|--------|
| Globaler Status / Monitor | Nur **offene** Alerts zählen (`effectiveModuleStatus`) |
| Logins | Snapshot — nur **neue** untrusted Root-Logins; `10.0.1.*` trusted |
| Docker / Coolify | `backend-*` / `frontend-*` als Deploy erkannt; bessere Alert-Texte |
| Vorfallbericht | EINORDNUNG für Docker (CPU, removed), Logins, Network |
| Monitor | Reload-Button |
| `/docker` | Inventar gruppiert, Coolify-Namen/FQDN, **Trivy on-demand** (HIGH/CRITICAL, Cache pro Digest) |
| Network | Eingehende SSH/Listener (`:22` etc.) nicht mehr als „ausgehend“ |
| `security_posture` | Whitelist harmlose Coolify-`sh -c` (`TRUSTED_SHELL_PROCESS_PATTERNS`) |

## In Arbeit / Ops

| Thema | Nächster Schritt |
|-------|------------------|
| SSH vom Dev-PC | Key in `authorized_keys`, `npx tsx scripts/test-ssh.ts` |
| Trivy auf Host | `apt install trivy` für echte Scans (UI schon da) |
| Alerts entschärfen | Nach Code-Deploy alte False Positives schließen |

## Phase 2 — Monitoring

| Thema | Plan |
|-------|------|
| Docker HEALTHCHECK | `(unhealthy)` bei laufenden Containern erkennen (Bugfix offen) |
| Trivy automatisch | 1×/Woche, nur Diff neue HIGH/CRITICAL |
| CVE-Modul | UI-Eintrag „Vulnerability Detection“ aktivieren |
| Log-Analyse | Mehr Dateien, konfigurierbare Regex |

## Phase 2 — Externe Quellen

| Quelle | Nutzen | Integration |
|--------|--------|-------------|
| RDAP/WHOIS (`.de` → `rdap.denic.de`) | Domain-Ablauf (≠ SSL) | `monitoredDomains`, wöchentlich |
| [VirusTotal API](https://www.virustotal.com/) | Phishing/Malware-Reputation | Domain-Report 1×/Woche |
| [URLVoid / APIVoid](https://www.urlvoid.com/) | Blocklists (ähnlich VT) | Optional, VT reicht meist |
| [Have I Been Pwned API v3](https://haveibeenpwned.com/API/v3) | Admin-E-Mails auf Leaks | Manuell/monatlich |

**Bewusst nicht:** whois.net (nur Web-UI), AVG Website Safety (keine API), [TestDisk](https://www.cgsecurity.org/wiki/TestDisk_DE) (kein Monitoring).

## Phase 3

- Cloud/Hetzner-API (optional)
- Vollständiges SIEM / Log-Archiv (Loki o.ä.) — nur bei Bedarf

## Priorität (wenn Ops stabil)

1. SSH + Cron stabil auf Production-Config  
2. Docker Healthcheck-Fix  
3. RDAP Domain-Ablauf  
4. VirusTotal Reputation  
5. HIBP für Ops-Mails  
6. Trivy Wochen-Scan mit Diff  

## Trivy — on-demand vs. geplant

| | On-demand (`/docker` → Scan) | Geplant |
|--|------------------------------|---------|
| Trigger | Button pro Container | Cron 1×/Woche |
| Severity | HIGH, CRITICAL | gleich |
| Speicher | `settings.trivy_image_scans` (Digest-Cache) | + Alert bei neuem Diff |
| Voraussetzung | `CHECK_MODE=ssh`, `trivy` auf Host | gleich |
