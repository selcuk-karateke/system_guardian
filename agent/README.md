# System Guardian host agent

Node metrics agent — outbound HTTPS push to Guardian (`POST /api/agent/ingest`).

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
