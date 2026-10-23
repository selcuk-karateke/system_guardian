# Kurz an Marco (zum Kopieren)

Hey Marco —

**Guardian (Code, schon auf master):**
- Live-Monitoring mit Server-Auswahl (Dashboard / Monitor / Historie)
- Alerts: Auto-Close wenn Ursache weg + `last_seen_at`; Outbound zeigt Container Name/Image (kein „bwilson/hermes = Host-Login“-Fehlschluss)
- Docker: **unhealthy** auch bei `State=running` (HEALTHCHECK) → Warning
- **Monitoring-Profil** pro Server: `host` (alles) vs `container` (ohne RAID/SSH-Keys/Users/…) — Spalte `servers.monitor_profile`, sichtbar unter `/servers/[id]`
- `hermes` ist jetzt default in `TRUSTED_OUTBOUND_PROCESSES` (Coolify-App, CF/Telegram ok)

**Dein Part (Host kawai, nicht Code):**  
→ [`OPS-CHECKLIST-KAWAI.md`](./OPS-CHECKLIST-KAWAI.md) — vor allem SSH härten (PermitRootLogin / PasswordAuth), Secrets aus History rotieren, Ports/`bwilson`-Gruppen.

**Profil setzen** (wenn ein Ziel nur App-Fokus braucht):
```sql
UPDATE servers SET monitor_profile = 'container' WHERE name = '…';
-- zurück: monitor_profile = 'host'
```

Bei Fragen zu Checks: `/docs` und Roadmap `/docs/roadmap`.
