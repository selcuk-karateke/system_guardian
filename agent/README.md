# System Guardian host agent

Optional Node metrics agent — outbound HTTPS push to Guardian (`POST /api/agent/ingest`).

Guardian itself stays agentless via SSH. With a fresh agent sample you get live egress/host cards on `/monitor`, and `server_health` prefers agent CPU/RAM/disk for snapshots and threshold alerts (SSH remains fallback).

## Install

**Preferred:** Settings → Server → **Agent installieren** (SSH push, one click).  
Needs SSH key/password on the server row + `APP_URL` reachable from the host.

**Manual** (fallback):

```bash
curl -fsSL https://<GUARDIAN>/api/agent/install.sh | sudo bash -s -- \
  --url https://<GUARDIAN> --token sga_… --server <uuid>
```

Requires Node 18+, `ss`, systemd.

## Local run

```bash
export GUARDIAN_URL=http://localhost:3000
export GUARDIAN_TOKEN=sga_…
export GUARDIAN_SERVER_ID=<uuid>
node guardian-agent.mjs
```
