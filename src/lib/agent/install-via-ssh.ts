import { readFile } from "fs/promises";
import { join } from "path";
import {
  commitAgentToken,
  mintAgentTokenPlain,
} from "@/lib/agent/token";
import { getCheckMode } from "@/lib/config";
import { getServerById } from "@/lib/servers";
import { getSshClient } from "@/lib/ssh";

const INSTALL_DIR = "/opt/guardian-agent";
const SERVICE_NAME = "guardian-agent";

function appBaseUrl(): string {
  return (process.env.APP_URL ?? "").replace(/\/$/, "");
}

function isLoopbackUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname === "::1"
    );
  } catch {
    return true;
  }
}

function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\"'\"'`)}'`;
}

export type InstallAgentResult = {
  ok: boolean;
  message: string;
  /** Present on success — for optional display; prefer not logging. */
  agentToken?: string;
  agentInstallCmd?: string;
  warning?: string;
};

/**
 * Push metrics agent + systemd unit over SSH.
 * Mints a token in memory, deploys it to the host, then commits the hash to DB.
 * Failed SSH no longer invalidates a working agent (avoids 401 install loops).
 */
export async function installAgentViaSsh(
  serverId: string,
): Promise<InstallAgentResult> {
  const server = await getServerById(serverId);
  if (!server || !server.isActive) {
    return { ok: false, message: "Server nicht gefunden" };
  }

  const hasCreds = Boolean(
    server.sshPrivateKeyEnc || server.sshPasswordEnc,
  );
  if (getCheckMode() === "ssh" && !hasCreds) {
    return {
      ok: false,
      message:
        "Kein SSH-Key/Passwort am Server — unter Bearbeiten hinterlegen, dann erneut.",
    };
  }

  const base = appBaseUrl();
  if (!base) {
    return {
      ok: false,
      message:
        "APP_URL fehlt — Agent braucht eine von außen erreichbare Guardian-URL.",
    };
  }

  // Mint locally first — do NOT write DB until host has the token
  const plain = mintAgentTokenPlain();
  const installCmd = `curl -fsSL ${base}/api/agent/install.sh | sudo bash -s -- --url ${base} --token ${plain} --server ${serverId}`;

  let agentSource: string;
  try {
    agentSource = await readFile(
      join(
        /* turbopackIgnore: true */ process.cwd(),
        "agent",
        "guardian-agent.mjs",
      ),
      "utf8",
    );
  } catch {
    return {
      ok: false,
      message: "Lokales agent/guardian-agent.mjs fehlt",
    };
  }

  if (getCheckMode() !== "ssh") {
    // Mock on Windows must not burn a live host token
    if (server.agentTokenHash) {
      return {
        ok: false,
        message:
          "CHECK_MODE=mock — Install abgebrochen, sonst wäre der Live-Agent-Token ungültig (401-Loop). CHECK_MODE=ssh setzen und erneut „Agent installieren“.",
      };
    }
    const committed = await commitAgentToken(serverId, plain);
    if (!committed) {
      return { ok: false, message: "Token konnte nicht gespeichert werden" };
    }
    return {
      ok: true,
      message:
        "CHECK_MODE=mock — Token ausgestellt (noch kein Host). Später mit SSH oder One-Liner installieren.",
      agentToken: plain,
      agentInstallCmd: installCmd,
      warning: isLoopbackUrl(base)
        ? "APP_URL zeigt auf localhost — vom echten Host aus nicht erreichbar."
        : undefined,
    };
  }

  const b64 = Buffer.from(agentSource, "utf8").toString("base64");
  const remote = [
    "set -euo pipefail",
    `if ! command -v node >/dev/null 2>&1; then echo "NODE_MISSING" >&2; exit 42; fi`,
    `NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"`,
    `if [ "$NODE_MAJOR" -lt 18 ]; then echo "NODE_TOO_OLD:$NODE_MAJOR" >&2; exit 43; fi`,
    `mkdir -p ${INSTALL_DIR}`,
    `echo ${shellSingleQuote(b64)} | base64 -d > ${INSTALL_DIR}/guardian-agent.mjs`,
    `chmod 755 ${INSTALL_DIR}/guardian-agent.mjs`,
    `cat > ${INSTALL_DIR}/env <<'ENVEOF'`,
    `GUARDIAN_URL=${base}`,
    `GUARDIAN_TOKEN=${plain}`,
    `GUARDIAN_SERVER_ID=${serverId}`,
    `GUARDIAN_INTERVAL_MS=5000`,
    `ENVEOF`,
    `chmod 600 ${INSTALL_DIR}/env`,
    `cat > /etc/systemd/system/${SERVICE_NAME}.service <<'UNITEOF'`,
    `[Unit]`,
    `Description=System Guardian metrics agent`,
    `After=network-online.target`,
    `Wants=network-online.target`,
    ``,
    `[Service]`,
    `Type=simple`,
    `EnvironmentFile=${INSTALL_DIR}/env`,
    `ExecStart=/usr/bin/env node ${INSTALL_DIR}/guardian-agent.mjs`,
    `Restart=always`,
    `RestartSec=5`,
    `User=root`,
    `Nice=5`,
    ``,
    `[Install]`,
    `WantedBy=multi-user.target`,
    `UNITEOF`,
    `NODE_PATH="$(command -v node)"`,
    `sed -i "s|^ExecStart=.*|ExecStart=$NODE_PATH ${INSTALL_DIR}/guardian-agent.mjs|" /etc/systemd/system/${SERVICE_NAME}.service`,
    `systemctl daemon-reload`,
    `systemctl enable --now ${SERVICE_NAME}`,
    `systemctl restart ${SERVICE_NAME}`,
    `systemctl is-active ${SERVICE_NAME}`,
  ].join("\n");

  try {
    const ssh = await getSshClient(serverId);
    const result = await ssh.exec(remote, 90_000);
    if (result.code === 42) {
      return {
        ok: false,
        message:
          "Auf dem Host ist kein Node.js installiert (v18+ nötig). Node installieren, dann erneut „Agent installieren“.",
      };
    }
    if (result.code === 43) {
      return {
        ok: false,
        message: `Node auf dem Host zu alt (${result.stderr.trim() || "?"} — mind. v18).`,
      };
    }
    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout || "").trim().slice(0, 400);
      return {
        ok: false,
        message: `SSH-Install fehlgeschlagen (exit ${result.code})${detail ? `: ${detail}` : ""} — alter Agent-Token unverändert.`,
      };
    }

    const committed = await commitAgentToken(serverId, plain);
    if (!committed) {
      return {
        ok: false,
        message:
          "Host hat den neuen Token, DB-Commit fehlgeschlagen — bitte erneut „Agent installieren“.",
        agentToken: plain,
        agentInstallCmd: installCmd,
      };
    }

    const active = result.stdout.trim().split("\n").pop() === "active";
    const warning = isLoopbackUrl(base)
      ? "Install ok, aber APP_URL ist localhost — Agent auf dem Host kann Guardian nicht erreichen. APP_URL auf die öffentliche URL setzen und Agent neu installieren."
      : undefined;

    return {
      ok: true,
      message: active
        ? `Agent auf „${server.name}“ installiert und aktiv`
        : `Agent-Dateien auf „${server.name}“ geschrieben — Service-Status prüfen`,
      agentToken: plain,
      agentInstallCmd: installCmd,
      warning,
    };
  } catch (e) {
    return {
      ok: false,
      message: `${e instanceof Error ? e.message : "SSH-Install fehlgeschlagen"} — alter Agent-Token unverändert.`,
    };
  }
}
