# System Guardian – Handbuch für Systemadmins

Zielgruppe: Ops / Systemadministration. Du kennst Linux, SSH, Cron, Docker, Fail2ban, RAID – und sollst hier schnell sehen, **wo was steckt** und **wie du sinnvoll zuarbeitest**.

> In der laufenden App: **[Dokumentation](/docs)** · API (Redoc): **[/docs/api](/docs/api)**

---

## 1. Was ist das (in Ops-Sprache)?

| Klassiker | System Guardian |
|-----------|-----------------|
| Zabbix / Nagios / Netdata | Host-Checks (CPU, RAM, Disk, Dienste) per SSH |
| Wazuh / OSSEC (HIDS-light) | Login-, User-, Port-, FIM-, Process-Checks |
| Uptime-Robot / Blackbox | Website + SSL |
| Coolify-UI | Coolify-Container + Deploy-Meta zusätzlich im eigenen Dashboard |

Alles läuft **ohne Agent** auf dem Zielhost: Guardian verbindet sich per **SSH**, führt bekannte Shell-Befehle aus (`ss`, `docker`, `journalctl`, `mdstat`, …), speichert Ergebnis in **PostgreSQL** und alarmiert per **Telegram / Discord / E-Mail**.

Lokal (Windows-Dev): `CHECK_MODE=mock` – keine echten SSH-Calls, Fixtures in `src/lib/ssh/mock.ts`.

---

## 2. Architektur (eine Skizze)

```
┌─────────────────┐     Cron (Coolify)      ┌──────────────────────┐
│  Coolify Host   │◄──── Bearer CRON_SECRET ─│  System Guardian     │
│  (monitored)    │     /api/cron/*          │  (Next.js + Postgres)│
│                 │◄──── SSH (CHECKS) ───────│                      │
│  docker, mdadm, │                          │  UI: / /monitor …    │
│  journal, ss    │                          │  API: /api/status    │
└─────────────────┘                          └──────────┬───────────┘
                                                        │
                                              Telegram / Discord / SMTP
```

| Schicht | Ort | Aufgabe |
|---------|-----|---------|
| UI | `src/app/` | Dashboard, Monitor, Settings |
| Cron-API | `src/app/api/cron/` | Geplante Check-Batches |
| Checks | `src/lib/checks/` | Ein Modul ≈ ein Check |
| SSH | `src/lib/ssh/` | Live-Client + Mock |
| Alerts | `src/lib/alerts/` | Dedup, Persistenz, Auto-Resolve |
| Notify | `src/lib/notifications/` | Telegram, Discord, E-Mail |
| DB | `src/db/schema/` | Drizzle-Tabellen |

---

## 3. Wo ist was? (Orientierungskarte)

### 3.1 UI-Routen

| Route | Inhalt | Typische Ops-Frage |
|-------|--------|--------------------|
| `/` | Globaler Status, offene Alerts | „Ist gerade etwas kritisch?“ |
| `/monitor` | TV-Wand, Kacheln, Ticker | „Auf dem NOC-Screen“ |
| `/infrastructure` | Server, RAID, Backups, Logs, SSL… | „CPU/Disk/Backup?“ |
| `/docker` | Container-Inventar, Trivy on-demand | „Welche Container laufen?“ |
| `/databases` | DB-Erreichbarkeit | „Postgres/MySQL down?“ |
| `/security` | Security-Module + Kurz-Erklärung | „HIDS-light Überblick“ |
| `/history` | Snapshots / Diffs | „Was hat sich geändert?“ |
| `/notifications` | Alert-Historie | „Was kam rein?“ |
| `/settings` | Domains, Kanäle (UI) | Konfiguration im UI |
| `/docs` | **Diese Doku-Übersicht** | Einstieg für Collaborators |
| `/docs/api` | **Redoc** (OpenAPI) | Endpoints & Auth |
| `/docs/security` | SIEM-Begriffe vs. Guardian | Begriffsklärung |

### 3.2 Code-Map (wenn du im Repo suchst)

```
src/lib/checks/          ← Check-Logik (hier meist zuarbeiten)
  index.ts               ← SERVER_CHECKS / SECURITY_CHECKS Registrierung
  allowlists.ts          ← bekannte/vertrauenswürdige Muster
  *-patterns.ts          ← Regex / IOC-Muster
src/lib/ssh/mock.ts      ← Windows-Dev-Fixtures
src/lib/alerts/pipeline.ts  ← processAlerts + reconcileOpenAlerts
.env.example             ← alle Schalter / Thresholds / Allowlists
docs/COOLIFY.md          ← Production-Deploy + Cron-URLs
```

### 3.3 Datenbank (was du in Ops brauchst)

| Tabelle (Konzept) | Inhalt |
|-------------------|--------|
| `check_runs` | Letzter Status pro Modul-Lauf |
| `alerts` | Offene/gelöste Alerts (`resolved_at` = erledigt) |
| Snapshots / History | Baselines für Diff (Ports, FIM, …) |
| `servers` | Überwachter Host |

Details: `src/db/schema/`.

---

## 4. Check-Module (Katalog)

Zwei Batches, zwei Cron-Jobs.

### Server-Batch – `/api/cron/server` (alle 15 min)

| Modul-ID | Ops-Thema | Kurz was geprüft wird |
|----------|-----------|------------------------|
| `server_health` | Host | CPU, RAM, Disk, Load |
| `raid` | Storage | `/proc/mdstat` (abschaltbar: `RAID_CHECK_ENABLED`) |
| `docker` | Container | Status, Restarts, unerwartete Images |
| `coolify` | Platform | Coolify-Dienste / Meta |
| `database` | DB | Erreichbarkeit der konfigurierten DBs |
| `ssl` | Zertifikate | Ablauf (Warning typisch &lt;30d) |
| `website` | HTTP(S) | Erreichbarkeit konfigurierter Domains |
| `ports` | Listening | Neue/unbekannte Ports vs. Baseline + `KNOWN_PORTS` |
| `backups` | Backup | Alter/Größe unter `BACKUP_PATHS` |
| `logs` | Journal | ERROR/FATAL/OOM-Muster in Logs |

### Security-Batch – `/api/cron/security` (alle 60 min)

| Modul-ID | Ops-Thema | Kurz was geprüft wird |
|----------|-----------|------------------------|
| `fim` | Datei-Integrität | Hashes unter `FIM_PATHS` |
| `ssh_keys` | SSH | `authorized_keys` Änderungen |
| `users` | Accounts | neue User / UID 0 |
| `logins` | Auth | Root-Login, Failed Auth (`TRUSTED_LOGIN_IPS`) |
| `cron` | Jobs | Crontab-Änderungen |
| `processes` | Prozesse | hohe CPU / verdächtige Muster |
| `network` | Outbound | `ss`-Peers vs. Baseline / Trust |
| `scanner` | Tools | nmap/masscan o.ä. |
| `services` | systemd | failed units (`EXPECTED_FAILED_UNITS`) |
| `security_posture` | IOC-light | Blocklist, verdächtige Connections/Prozesse |

**Baseline-Regel:** Erster Scan speichert nur Snapshot → **keine Diff-Spam-Alerts**. Ab Scan 2: echte Änderungen.

---

## 5. Alert-Stufen

| Level | Wann | Aktion |
|-------|------|--------|
| **INFO** | Normales Ereignis | Historie |
| **WARNING** | Nicht akut (SSL bald ablaufend, neuer Port, Restart) | Notify je nach Kanal |
| **CRITICAL** | Sofort (RAID fail, Backup weg, unbekannter Root-Login, DB down, IOC) | Sofort-Notify |

**Alert-Lifecycle:** Offene Alerts werden **nicht** bei jedem Cron neu eingefügt (Dedup über Modul + Message + Server). Stattdessen wird `last_seen_at` aktualisiert. Wenn ein Modul-Lauf die Message nicht mehr produziert, setzt `reconcileOpenAlerts` `resolved_at` (Auto-Close). UI/Bericht zeigen „zuletzt bestätigt“. Entschärfte Alerts zählen nicht mehr zum globalen WARNING/CRITICAL.

---

## 6. Was du typischerweise konfigurierst (ohne Code)

Alles in `.env` / Coolify Env (Vorlage: `.env.example`).

| Thema | Variablen |
|-------|-----------|
| Zielhost | `CHECK_MODE`, `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` / `_PATH` |
| Cron-Schutz | `CRON_SECRET` |
| Dashboard-Login | `AUTH_SECRET`, `AUTH_USERNAME`/`PASSWORD` oder `AUTH_USERS` |
| Bot-API | `API_SECRET` → `GET /api/status` |
| Notify | `TELEGRAM_*`, `DISCORD_WEBHOOK_URL`, `SMTP_*` |
| Schwellen | `THRESHOLD_CPU_*`, `THRESHOLD_RAM_*`, `THRESHOLD_DISK_*`, … |
| Trust | `TRUSTED_LOGIN_IPS`, `TRUSTED_OUTBOUND_IPS` |
| Ports / Docker | `KNOWN_PORTS`, `KNOWN_DOCKER_IMAGE_PREFIXES`, `EXPECTED_STOPPED_CONTAINERS` |
| Backup | `BACKUP_PATHS`, `BACKUP_MAX_AGE_DAYS`, optional `BACKUP_TRIGGER_COMMAND` |
| FIM | `FIM_PATHS` |
| IOC | `INCIDENT_IOC_DOMAINS`, `BLOCKED_REMOTE_IPS` |
| Schutz | `AUTO_BLOCK_ENABLED` (nur Blocklist-IPs via fail2ban), `AUTO_BLOCK_JAIL` |

**Schutz-Stufen:** Alerts mit Handlungsempfehlung → optional Auto-Block nur für bekannte IOC-IPs → optional Backup-Job anstoßen. **Restore nie automatisch** (nur Empfehlung/Checkliste). UI: Einstellungen → Schutz. Audit: `/history` category `protect`.

**Ops-Tipp:** False Positives zuerst über Allowlists/Trust/Expected-* entschärfen – nicht den Check abschalten.

---

## 7. Betrieb

### Cron manuell triggern

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://guardian.example/api/cron/server
curl -H "Authorization: Bearer $CRON_SECRET" https://guardian.example/api/cron/security
curl -H "Authorization: Bearer $CRON_SECRET" https://guardian.example/api/cron/daily-report
```

Lokal (PowerShell):

```powershell
curl -H "Authorization: Bearer dev-secret" http://localhost:3000/api/cron/server
```

Im UI: Reload-/Check-Buttons auf Dashboard und `/monitor`.

### Health & Status

| Endpoint | Auth | Zweck |
|----------|------|-------|
| `GET /api/health` | öffentlich | Liveness |
| `GET /api/status` | `Bearer API_SECRET` | Globaler Status für Bots |
| `GET /api/history` | Session (UI) | Timeline JSON |

Vollständige Spec: [/docs/api](/docs/api) (Redoc).

### SSH-Voraussetzungen am Zielhost

Der SSH-User braucht Leserechte für: Docker-Socket/CLI, Journal, `/proc`, typische Config-Pfade, Backup-Pfade. Kein Agent, aber **kein** „unprivileged nobody“ ohne Docker-Rechte.

Key-Setup lokal: `npm run setup:ssh-key` · Test: `npm run test:ssh`.

Production: [COOLIFY.md](./COOLIFY.md).

---

## 8. Wie du sinnvoll zuarbeitest

Häufige, willkommene Beiträge:

1. **False Positive entschärfen** – Allowlist / Trust-IP / Expected-Container / Pattern in `allowlists.ts` oder Env
2. **Schwellen anpassen** – dokumentieren in `.env.example` + kurzer Kommentar warum
3. **Neues Muster** – z. B. Log-Regex in `log-patterns.ts`, Connection in `connection-patterns.ts`
4. **Neues Check-Modul** – Checklist:
   - `src/lib/checks/<name>.ts` mit `runXxxCheck(serverId)` und `module: "…"`
   - in `index.ts` in `SERVER_CHECKS` oder `SECURITY_CHECKS`
   - Label in `module-labels.ts`
   - Summary in `src/lib/docs/module-catalog.ts` (Batch + Kurztext)
   - Mock-Fixture in `src/lib/ssh/mock.ts` (Windows-Dev)
   - **`npm run docs:check`** muss grün sein
5. **Neue API-Route** – Eintrag in `public/openapi.yaml`, dann `docs:check`

Bitte **keine** Secrets committen (`.env`, SSH-Keys, Webhooks).

### Wer hält die Doku aktuell?

| Was | Wer / Was |
|-----|-----------|
| Modul-Tabellen in `/docs/sysadmin` | Katalog `module-catalog.ts` (UI liest daraus) |
| Drift Check ↔ Katalog ↔ Labels ↔ OpenAPI | **`npm run docs:check`** (erkennt, schreibt nicht) |
| Prosa, Troubleshooting, Env-Erklärungen | Mensch in `docs/*.md` / Doc-Seiten |

Das System **erkennt** fehlende Katalog-/OpenAPI-Einträge bei PRs (wenn `docs:check` läuft), **generiert** aber keine Fließtexte. Collaborator schlägt Änderung vor → Check rot → Katalog/Spec mitziehen.

Agent-/Dev-Einstieg: [AGENTS.md](../AGENTS.md).

---

## 9. Troubleshooting (kurz)

| Symptom | Check |
|---------|--------|
| Alles mock / keine Live-Daten | `CHECK_MODE=ssh` + Key/Host |
| Cron 401 | `Authorization: Bearer <CRON_SECRET>` |
| UI offen ohne Login | Production: `AUTH_*` setzen |
| CRITICAL oben, aber kaum Warn-Kacheln | Stale Alerts / Legacy-Module – Auto-Resolve + Monitor filtert Placeholders |
| Backup immer CRITICAL | `BACKUP_PATHS` zeigt auf den Host, den SSH trifft (NAS nur wenn SSH-Ziel) |
| hermes / :443 Outbound Warn | Oft Telegram/Cloudflare – Severity ist WARNING, nicht CRITICAL; Trust prüfen |

---

## 10. Weiterlesen

| Dokument | Inhalt |
|----------|--------|
| [COOLIFY.md](./COOLIFY.md) | Deploy, Auth, Cron-Schedule |
| [SECURITY-FEATURES.md](./SECURITY-FEATURES.md) | SIEM-Begriffe ↔ Guardian |
| [FUTURE-INTEGRATIONS.md](./FUTURE-INTEGRATIONS.md) | Roadmap (Phasen) |
| [OPS-CHECKLIST-KAWAI.md](./OPS-CHECKLIST-KAWAI.md) | **Ops-Abhakliste** Host kawai (SSH, Secrets, Ports) |
| [MARCO-UPDATE.md](./MARCO-UPDATE.md) | Kurztext für Collaborator-Chat |

**Monitoring-Profil** (`servers.monitor_profile`): `host`/`full` = alle Module; `container` = App-Fokus (kein RAID/SSH-Keys/Users/Logins/Cron/Scanner/Services/FIM/Backups).
| [backlog.json](./backlog.json) | **Nächste Features / Collaborator-Ideen** (UI: `/docs/roadmap`) |
| OpenAPI / Redoc | App: `/docs/api` · Spec: `/openapi.yaml` |
