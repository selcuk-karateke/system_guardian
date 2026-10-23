# Ops-Checkliste – Server „kawai“

Quellen (PDFs, Stand Okt. 2026): Server-Analyse, Coolify-Forensik, bwilson/Docker-Forensik, Guardian-Fehlerbericht, Unattended-Upgrades-Doku, Hetzner-Backup-Doku.

Ziel: **Host härten & Aufräumen** — getrennt vom Guardian-Code. Abhaken in der Reihenfolge; Änderungen dokumentieren (Ticket/Chat).

---

## P0 / Hoch

| # | Aufgabe | Quelle | Status |
|---|---------|--------|--------|
| O1 | **SSH härten:** `PermitRootLogin no` (nur mit getestetem sudo-Admin) | Server-Analyse, Fehlerbericht P2 | ☐ |
| O2 | **SSH:** `PasswordAuthentication no` (Key-only) | Server-Analyse | ☐ |
| O3 | Vor SSH-Änderung: 2. Session offen, `sshd -t`, dann Reload | Fehlerbericht | ☐ |
| O4 | **Secrets rotieren**, die in Shell-History standen (API-Token, Auth-Parameter) — History nicht zitieren | Coolify-Forensik A1 | ☐ |
| O5 | Paketstand prüfen: Security-Updates / ausstehende Upgrades | Server-Analyse (72 Pakete am 01.10.) | ☐ |

## P1 / Mittel

| # | Aufgabe | Quelle | Status |
|---|---------|--------|--------|
| O6 | **unattended-upgrades** aktiv + Reboot nur bei Bedarf um **04:30** | Debian13-Doku (Soll); Analyse hatte „inaktiv“ | ☐ prüfen / bestätigen |
| O7 | **bwilson:** Mitgliedschaft `sudo` / `docker` prüfen; entfernen wenn Konto nicht mehr privilegiert braucht | bwilson BW-02/03 (Konto war wieder aktiviert) | ☐ |
| O8 | bwilson weiterhin `nologin`/Sperre nur wenn bewusst so gewollt; sonst dokumentieren warum aktiv | bwilson | ☐ |
| O9 | Öffentliche Ports abgleichen: Host `5432`, `3000`/`5173`, Docker `6001`/`6002`/`8000`/`8080` | Server-Analyse | ☐ |
| O10 | PostgreSQL öffentlich gebunden? Firewall + `pg_hba.conf` verifizieren | Server-Analyse | ☐ |

## P2 / Niedrig / Beobachtung

| # | Aufgabe | Quelle | Status |
|---|---------|--------|--------|
| O11 | Docker-Images aufräumen (~32 GB) kontrolliert | Server-Analyse | ☐ |
| O12 | Zombie-Prozesse bei Wiederholung untersuchen | Server-Analyse | ☐ |
| O13 | Hermes-Container: Root-Start / Image-Vertrauen / Mounts (separates Hardening) | bwilson BW-06 | ☐ |
| O14 | Nextcloud PHP-FPM lange Worker = Performance, kein Security-Event | bwilson BW-05 | ☐ |
| O15 | Backup: DB-Dumps im Hetzner-Skript vorhanden? Manual-Test laut Backup-Doku | Hetzner-Backup | ☐ |

## Wichtig für Forensik / Guardian

- Prozesse **nicht** mit `pkill -u bwilson` beenden — trifft Container mit UID 1000 (Nextcloud/Hermes).
- Host-Username aus `ps` allein ist **kein** Login-Beweis → immer `/proc/<PID>/cgroup` / Container-ID.
- `hermes` = Hermes-Agent/WebUI-Container, typisch Outbound zu Cloudflare/Telegram → in Guardian ggf. `TRUSTED_OUTBOUND_PROCESSES=hermes` (nach Verifikation).

## Guardian (Code) – parallel, nicht Ops

Siehe Roadmap (`docs/backlog.json`): Alert-Lifecycle (Nachprüfung/Auto-Close), Container-Kontext in Alerts, Docker unhealthy.

---

*Letzte Ableitung aus Anhänge-PDFs · bei Erledigung Status hier oder in Chat aktualisieren.*
