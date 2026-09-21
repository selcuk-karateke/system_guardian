# Monitor (`/monitor`) — Informationsarchitektur & Code

TV-Wallboard für Production. **Kein Admin-Dashboard** — fünf Erkennungszonen aus 5 m Entfernung.

## Die 5 Pflicht-Informationen (5 m, ~2 s)

| # | Information | Erkennung ohne Lesen |
|---|-------------|----------------------|
| 1 | **Systemzustand** | Ringfarbe + Füllstand (Beacon oben links) |
| 2 | **Sicherheitslage** | Rahmenfarbe + LED-Punkte am Bildschirmrand |
| 3 | **Netzwerkaktivität** | Anzahl leuchtender Verbindungen zur Mitte |
| 4 | **Docker/Infrastruktur** | Kette unten: alle Knoten grün vs. rot |
| 5 | **Aktuelle Vorfälle** | Orange/rote Streifen rechts (Events) |

**Wichtigste:** **Systemzustand** (1) — entscheidet „alles OK?“ vs. „sofort handeln“.

## Render-Kette (aktiv)

```
src/app/monitor/page.tsx
  MonitorAutoRefresh
    MonitorTvProtection
      MonitorMissionWall          mission/monitor-mission-wall.tsx
        MonitorClock
        McStageScaler             mission/mc-stage-scaler.tsx
          McSecurityFrame         security
          McNetworkTactical       network
          McCoreBeacon            core
          McDockerInfra           docker
          McEventIncidents        events
          McZoneActions           actions (×5 Zonen)
layout.tsx → monitor-mission.css → css/*.css
Data: buildWallboardData() ← lib/monitor/wallboard/
```

## Datenquellen

| Bereich | Builder | Rohdaten |
|---------|---------|----------|
| Core | `build.ts` | `getAllModuleStatuses`, `metricsSnapshots`, Uptime |
| Network | `network.ts` | `checkData.network`, `scanner`, Modul-Status ports/logs/network/scanner |
| Security | `security.ts` | Security-Module in `statusMap`, `checkData.scanner` |
| Docker | `docker.ts` | `checkData.docker` (containers, inventory.byCategory) |
| Events | `events.ts` | `getRecentAlerts`, `getChangeEvents` |

## Komponenten (aktiv)

| Datei | Zone | Zeilen ca. |
|-------|------|------------|
| `mission/monitor-mission-wall.tsx` | Shell/Composer | ~120 |
| `mission/mc-stage-scaler.tsx` | Layout | ~45 |
| `mission/mc-core-beacon.tsx` | core | ~55 |
| `mission/mc-network-tactical.tsx` | network | ~135 |
| `mission/mc-security-frame.tsx` | security | ~45 |
| `mission/mc-docker-infra.tsx` | docker | ~70 |
| `mission/mc-event-incidents.tsx` | events | ~25 |
| `mission/mc-deck-flows.tsx` | background | ~45 |
| `mission/mc-zone-actions.tsx` | actions | ~60 |
| `monitor-clock.tsx` | Header | ~20 |
| `monitor-auto-refresh.tsx` | Wrapper | ~17 |
| `monitor-tv-protection.tsx` | Wrapper | ~75 |

## Wallboard-Lib

```
lib/monitor/wallboard/
  types.ts      — Typen, WALLBOARD_DOMAINS
  helpers.ts    — Scores, Event-Parsing
  events.ts     — Alerts + ChangeEvents, Gruppierung
  network.ts    — Knoten, Tactical
  docker.ts     — Gruppen, Summary
  security.ts   — Threat, Blocks
  build.ts      — buildWallboardData()
  index.ts
lib/monitor-wallboard.ts — Re-Export (Kompatibilität)
```

## CSS

```
monitor-mission.css          — @import Partials
css/shell.css                — .mc-wall, Header, Stage, Footer, TV
css/security.css             — .mc-secframe*
css/network.css              — .mc-holocore, .mc-netmap*
css/core.css                 — .mc-beacon*
css/docker.css               — .mc-topo*
css/events.css               — .mc-incident*
css/actions.css              — .mc-zone-btn
```

## IA-Backlog (umgesetzt)

- `McDeckFlows`, Grid, Radar-Ringe, Signal-Balken, Packet-Animation entfernt
- Netzwerk: volle Labels (`Cloudflare`, `GitHub`, …)
- Security-LEDs: nur Farbe (Tooltip bei Hover)
- Eine Actions-Leiste: Checks · Erledigt · Refresh
- Branding: „System Guardian“
- Footer meta entfernt
- Beacon: Ring + Punkte; Zahl `91` ausgeblendet (Füllgrad = Health)

## Altlasten (bereits gelöscht)

Jarvis-Ordner, `monitor.css`, Tile-Wall-Komponenten, `monitor-module-routes.ts`.

## Nächster Schritt (nach Freigabe IA)

1. Elemente ohne Zweck entfernen (kein neues Styling)
2. `mission/*` → `monitor/{core,network,…}/` verschieben
3. Kürzel ausschreiben, Deck-Flows nur bei echten Kanten
