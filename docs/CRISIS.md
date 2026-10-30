# Crisis stages (S1–S4)

System Guardian still stores technical alert levels (`info` / `warning` / `critical`) for notify/dedup.  
**User-facing severity is only S1–S4** (English labels). Mapping: `src/lib/crisis/stages.ts`.

> Technical `critical` ≠ automatically S1. Example: Trivy on a side image can be `critical` in the DB and still map to **S3/S4**.

---

## Matrix

| Stage | Name | Typical Guardian signals | Response |
|------:|------|--------------------------|----------|
| **4** | Routine | `info` / many `warning`s (disk high but not full, Fail2ban, single Trivy warning, HSTS/SSL, brief site blips) | Next business day. No night page. |
| **3** | Degraded | Marketing site down, `/tmp` full, backup drift/`warning`, Trivy app-crit on non-core, unknown containers, Docker warnings | Elevated attention. Target ~12h. No night page. |
| **2** | Severe | Core DB down, RAID critical, host disk/load critical, Coolify critical, backup **critical**, Trading/Nextcloud unhealthy/stopped, core site 5xx | Partial mobilization. Daytime ≤15 min. Drop other work. |
| **1** | Emergency | Unknown root login, FIM/SSH-keys critical, security posture/scanner critical, ransomware/exfil suspicion, host dead via vKVM | Full alarm. Wake. External partners. Isolate network if needed. |

**Core systems (S2 candidates):** Trading, Nextcloud, Coolify core, production DB, host storage/RAID.

---

## If / then

### S4 – Routine
- Ticket / board next business day. No after-hours duty.

### S3 – Degraded
- Review on next planned glance (daytime within ~4h).
- Still open after ~8h → treat manually as S2 (no auto-escalate in code yet).

### S2 – Severe
- 08:00–22:00 → Coolify/Docker logs immediately; maintenance page after ~30 min if needed.
- 22:00–08:00 → stay quiet unless Trading has open positions (night mute not in notify code yet).

### S1 – Emergency
- Channel that breaks Focus/DND.
- Hetzner Robot / vKVM first.
- Suspected exfil → pull virtual NIC, then notify customers/partners proactively.

---

## Mapping shortcuts (code)

| Match | Stage |
|-------|------:|
| Ransomware / exfil keywords; unknown root login; FIM / SSH-keys / security_posture / scanner = `critical` | 1 |
| `database` / `raid` / `backups` / `server_health` / `coolify` = `critical`; Trading/Nextcloud down; core site hard-fail | 2 |
| Other `critical` (incl. Trivy); website/Docker/`/tmp`/backup `warning`; successful migrate jobs not S2 | 3 |
| `info` and remaining `warning` | 4 |

Tests: `src/lib/crisis/stages.test.ts`.

---

## Still open (process)

1. 2FA emergency kit (physical backup codes).
2. Monthly restore dry-run → `restore_tested: true` JSON.
3. External status page (off the Hetzner host).
4. Notify routing (channels, night mute, Trading exception).

---

## Related

- [SYSADMIN.md](./SYSADMIN.md)  
- [SECURITY-FEATURES.md](./SECURITY-FEATURES.md)  
- [OPS-CHECKLIST-KAWAI.md](./OPS-CHECKLIST-KAWAI.md)  
