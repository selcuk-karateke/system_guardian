import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Served as text/x-shellscript — one-liner install for the host agent.
 * Usage:
 *   curl -fsSL https://<APP>/api/agent/install.sh | sudo bash -s -- \
 *     --url https://<APP> --token <TOKEN> --server <UUID>
 */
export async function GET(request: NextRequest) {
  const origin =
    process.env.APP_URL?.replace(/\/$/, "") ||
    request.nextUrl.origin.replace(/\/$/, "");

  const script = `#!/usr/bin/env bash
set -euo pipefail

URL=""
TOKEN=""
SERVER_ID=""
INSTALL_DIR="/opt/guardian-agent"
SERVICE_NAME="guardian-agent"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --server) SERVER_ID="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$URL" || -z "$TOKEN" || -z "$SERVER_ID" ]]; then
  echo "Usage: $0 --url https://guardian --token sga_… --server <uuid>" >&2
  exit 1
fi

URL="\${URL%/}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required (v20+). Install node then re-run." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "Node 18+ required (found $(node -v))" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
curl -fsSL "$URL/api/agent/bundle.js" -o "$INSTALL_DIR/guardian-agent.mjs"
chmod 755 "$INSTALL_DIR/guardian-agent.mjs"

cat > "$INSTALL_DIR/env" <<EOF
GUARDIAN_URL=$URL
GUARDIAN_TOKEN=$TOKEN
GUARDIAN_SERVER_ID=$SERVER_ID
GUARDIAN_INTERVAL_MS=5000
EOF
chmod 600 "$INSTALL_DIR/env"

cat > "/etc/systemd/system/\${SERVICE_NAME}.service" <<EOF
[Unit]
Description=System Guardian metrics agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=$INSTALL_DIR/env
ExecStart=$(command -v node) $INSTALL_DIR/guardian-agent.mjs
Restart=always
RestartSec=5
User=root
Nice=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"
systemctl --no-pager --full status "$SERVICE_NAME" || true
echo "Agent installed. Check Guardian settings for 'Agent online'."
`;

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
