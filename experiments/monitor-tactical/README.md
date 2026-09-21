# Monitor Tactical Ops (archived experiment)

Snapshot of the **Tactical Ops / Mission Control** wallboard before restoring **monitor-classic** on `/monitor`.

## What this is

- **Not** the production TV route. Default monitor is again the tile wall from git `782d015` (`MonitorWall` + `monitor.css`).
- This folder is a **read-only archive** of the tactical implementation (components, CSS split, wallboard builder, page).

## Runnable copy

Full runnable tree (tactical as default `/monitor`) lives on branch:

```bash
git fetch origin
git checkout experiment/monitor-tactical
pnpm dev
# open http://localhost:3000/monitor
```

## Compare

| Variant | How to view |
|---------|-------------|
| **monitor-classic** | `master` → `/monitor` (`MonitorWall` + `monitor.css`) |
| **monitor-tactical** | Copy files from this folder back into `src/` or use branch `experiment/monitor-tactical` |

Tactical code is **not** in the main `src/` tree anymore (only this archive).

## Files in this archive

- `src/app/monitor/page.tsx` — tactical data loader (`buildWallboardData`)
- `src/app/monitor/layout.tsx` — Orbitron + `monitor-mission.css`
- `src/app/monitor/css/` — split mission styles
- `src/components/dashboard/mission/` — Mission wall components
- `src/lib/monitor-wallboard.ts`, `src/lib/monitor/wallboard/`
- `src/app/actions/monitor-quick.ts`
- `globals-monitor-snippet.css` — scroll lock for `.mc-wall`

## Do not merge without review

No further tactical UI work on `master` until classic vs tactical is decided.
