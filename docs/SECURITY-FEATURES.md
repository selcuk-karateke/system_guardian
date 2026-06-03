# Security-Features – Was ist was? (System Guardian)

Dieses Dokument erklärt die **SIEM-ähnlichen Begriffe** und wie System Guardian sie **bewusst** umsetzt – nicht als 1:1-Kopie von Wazuh/Kibana.

---

## Übersicht: Zwei Welten

| Welt | Ziel | Beispiel-Produkt |
|------|------|------------------|
| **SIEM / HIDS** | Security-Operations, Forensik, Compliance | Wazuh, Elastic Security |
| **System Guardian** | Coolify-Infrastruktur + klare Ops-Alerts | Dieses Projekt |

System Guardian **integriert** Security-Funktionen, die für **euren Host** relevant sind – per SSH, ohne separate Log-Cluster.

---

## 1. Log-Analyse

**Was es ist:** Zentral Logs sammeln, durchsuchen, Muster finden (fehlgeschlagene Logins, Errors, Angriffe).

**Warum bei SIEMs so:** Terabytes an Logs → Elasticsearch/OpenSearch, teure Storage, eigene Analysten.

**System Guardian:**

| Modul | Route | Was passiert |
|-------|-------|----------------|
| `logs` | Server-Cron (15 min) | `journalctl` + `dmesg`, Muster: ERROR, FATAL, OOM, Disk |
| `logins` | Security-Cron (60 min) | `last`, `auth.log` – Root-Login, Failed Passwords |

**Warum so bei uns:** Kein Log-Archiv – wir prüfen **live per SSH** die letzten Zeilen. Reicht für „gibt es gerade ein Problem?“. Kein Kibana, weil Next.js-Dashboard + PostgreSQL-Historie für euren Maßstab reichen.

**Später (Phase 2):** Konfigurierbare Regex, mehr Log-Dateien, optional Forward an Loki.

---

## 2. Intrusion Detection (HIDS)

**Was es ist:** Host auf Angriffe prüfen – verdächtige Prozesse, Rootkits, Port-Scans, ungewöhnliche Nutzer.

**Warum bei SIEMs so:** Agent auf jedem Host, Kernel-Module, Signatur-Datenbanken.

**System Guardian = mehrere Module zusammen (kein separater „HIDS-Agent“):**

| Modul | Erkennt |
|-------|---------|
| `logins` | Fehlgeschlagene SSH-Logins, Root-Sessions |
| `scanner` | nmap, masscan, … installiert oder in Logs |
| `ports` / `network` | Neue offene Ports |
| `users` | Neue User, UID 0 |
| `scanner` + `logins` | Verdächtige Aktivität |

**Warum so:** Ein **schlanker HIDS** für einen Coolify-Server – ohne Agent-Installation auf dem Host. Alles läuft vom Guardian-Container per SSH.

**Was fehlt bewusst:** Rootkit-Scanner (rkhunter), Echtzeit-Prozessüberwachung → zu schwer für v1.

---

## 3. File Integrity Monitoring (FIM)

**Was es ist:** Prüfen, ob kritische Dateien **unverändert** sind (Hash-Vergleich).

**Warum bei SIEMs so:** Tausende Pfade, Compliance (PCI-DSS), Echtzeit-Inotify.

**System Guardian:**

| Modul | Dateien |
|-------|---------|
| `ssh_keys` | `authorized_keys` |
| `users` | `/etc/passwd` (User-Liste) |
| `cron` | Crontabs |
| **`fim`** | Konfigurierbar via `FIM_PATHS` (z. B. `sshd_config`, `sudoers`) |

**Baseline-Logik:** Beim **ersten Scan** wird nur gespeichert, **kein Alert** – sonst „alle Dateien neu“-Spam. Ab Scan 2: echte Änderungen → Warning/Critical.

**Warum so:** FIM nur für **Pfade, die ihr definiert** – nicht das ganze Dateisystem.

---

## 4. Vulnerability Detection (CVE)

**Was es ist:** Installierte Pakete vs. CVE-Datenbank (apt, npm, Docker-Images).

**Warum bei SIEMs so:** Eigene Scanner, tägliche DB-Updates, Reports für Audits.

**System Guardian (Phase 2 – geplant):**

- Modul `vulnerabilities`: `apt list --upgradable`, optional `trivy` für Images
- Alerts: „kritisches CVE“ vs. „Patch verfügbar“

**Warum nicht in v1:** CVE-Scan ist **eigenes Produkt** (Trivy, Nessus). Falsche Alarme ohne sorgfältige Konfiguration. Erst wenn Ops-Basis steht.

---

## 5. Cloud Security (AWS / Azure / GCP)

**Was es ist:** CloudTrail, IAM, offene S3-Buckets, Azure Activity Log.

**Warum bei SIEMs so:** Cloud ist getrennte Infrastruktur mit eigenen APIs.

**System Guardian:**

- **Heute:** Nur **SSH-Host** (Hetzner VM mit Coolify) – Cloud = „wo der Server läuft“, nicht im Tool.
- **Phase 3 (optional):** Hetzner API, Coolify API – passender als generisches AWS.

**Warum so:** Ihr monitored **den Server**, nicht die ganze Cloud-Organisation.

---

## 6. Dashboard & Visualisierung (Kibana)

**Was es ist:** Kibana/OpenSearch – Log-Suche, Dashboards, Histogramme.

**Warum bei SIEMs so:** Millionen Events brauchen spezialisierte UI.

**System Guardian:**

- **Next.js-Dashboard** – Status pro Modul, Alerts, Historie
- PostgreSQL speichert Checks + Changes, keine Elasticsearch

**Warum so:** Eine App, ein Login, Telegram-Alert – kein zweites Stack (Elastic + Kibana + Warten auf Indizes).

---

## Baseline-Scan – warum wichtig

```
Scan 1: Snapshot speichern → KEINE Diff-Alerts
Scan 2+: Vergleich mit Snapshot → nur echte Änderungen alarmieren
```

Ohne Baseline: erster Cron = „22 neue Ports“, „6 neue Container“ → Telegram-Flut.

Implementiert in: `src/lib/history/persist.ts` → `diffAndStore()`.

---

## Cron-Zuordnung

| Cron | Interval | Enthält |
|------|----------|---------|
| `/api/cron/server` | 15 min | Ops + **Log-Analyse** (`logs`) |
| `/api/cron/security` | 60 min | **HIDS-Teile** + **FIM** |

---

## Env-Variablen (Security)

```env
FIM_PATHS=/etc/ssh/sshd_config,/etc/sudoers,/etc/passwd
```

Siehe `.env.example`.

---

## Roadmap

| Phase | Inhalt |
|-------|--------|
| **v1 (jetzt)** | Baseline, FIM-Pfade, Doku, Dashboard-Erklärung |
| **v2** | CVE/apt, stärkere Log-Regex, Fail2ban-ähnliche Schwellen |
| **v3** | Hetzner/Coolify API, optional Log-Forward |
