import {
  getTrustedLoginIps,
  maskLoginIp,
} from "@/lib/config";
import { diffAndStore } from "@/lib/history/persist";
import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

const FAILED_AUTH_WARN_THRESHOLD = 10;
const BAN_SPIKE_THRESHOLD = 100;

export async function runLoginsCheck(serverId: string): Promise<CheckResult> {
  void serverId;
  const ssh = getSshClient();
  const [last, auth, f2b, f2bSvc] = await Promise.all([
    ssh.exec("last -n 30 2>/dev/null"),
    ssh.exec(
      "grep -E 'Failed password|Accepted password|Accepted publickey' /var/log/auth.log 2>/dev/null | tail -50",
    ),
    ssh.exec("fail2ban-client status sshd 2>/dev/null"),
    ssh.exec("systemctl is-active fail2ban 2>/dev/null || echo inactive"),
  ]);

  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";
  const logins: string[] = [];
  const failedIps = new Set<string>();
  const untrustedRootIps = new Set<string>();
  const trustedIps = getTrustedLoginIps();

  let lastRootLogin: {
    ip: string;
    masked: string;
    trusted: boolean;
    line: string;
  } | null = null;

  for (const line of last.stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    logins.push(trimmed);

    if (line.startsWith("root ") && !lastRootLogin) {
      const ipMatch = line.match(/\d+\.\d+\.\d+\.\d+/);
      if (ipMatch) {
        const ip = ipMatch[0];
        lastRootLogin = {
          ip,
          masked: maskLoginIp(ip),
          trusted: trustedIps.has(ip),
          line: trimmed,
        };
        if (!trustedIps.has(ip)) untrustedRootIps.add(ip);
      }
    }
  }

  for (const line of auth.stdout.split("\n")) {
    if (line.includes("Failed password")) {
      const ipMatch = line.match(/from\s+(\S+)/);
      if (ipMatch && !trustedIps.has(ipMatch[1])) failedIps.add(ipMatch[1]);
    }
  }

  const fail2ban = parseFail2banStatus(f2b.stdout, f2bSvc.stdout);

  if (untrustedRootIps.size > 0) {
    status = "warning";
    alerts.push({
      level: "warning",
      message: `Root login from unknown IP: ${[...untrustedRootIps].map(maskLoginIp).join(", ")}`,
      recommendation: "Add to TRUSTED_LOGIN_IPS or verify access",
    });
  }

  if (!fail2ban.serviceActive) {
    status = "critical";
    alerts.push({
      level: "critical",
      message: "fail2ban service is not running",
      recommendation: "systemctl start fail2ban && systemctl enable fail2ban",
    });
  } else if (!fail2ban.jailAvailable) {
    status = "warning";
    alerts.push({
      level: "warning",
      message: "fail2ban sshd jail unavailable or returned an error",
      recommendation: "Run fail2ban-client status sshd on the host",
    });
  } else if (
    fail2ban.currentlyBanned === 0 &&
    failedIps.size >= FAILED_AUTH_WARN_THRESHOLD
  ) {
    status = "warning";
    alerts.push({
      level: "warning",
      message: `${failedIps.size} failed SSH attempts but fail2ban has 0 bans`,
      recommendation: "Check fail2ban jail filters and auth.log paths",
    });
  }

  const { diffs } = await diffAndStore(
    serverId,
    "fail2ban",
    {
      totalBanned: fail2ban.totalBanned,
      currentlyBanned: fail2ban.currentlyBanned,
    },
    (prev, curr) => {
      const prevTotal = Number(prev?.totalBanned ?? 0);
      const currTotal = Number(curr.totalBanned);
      const delta = currTotal - prevTotal;
      if (delta > BAN_SPIKE_THRESHOLD) {
        return [
          {
            changeType: "changed" as const,
            entityKey: "ban_spike",
            previousValue: String(prevTotal),
            newValue: String(delta),
          },
        ];
      }
      return [];
    },
  );

  for (const d of diffs) {
    if (d.entityKey === "ban_spike") {
      status = status === "critical" ? "critical" : "warning";
      alerts.push({
        level: "warning",
        message: `fail2ban ban spike: +${d.newValue} bans since last check`,
        recommendation: "Review auth.log for coordinated SSH attack",
      });
    }
  }

  if (failedIps.size >= 3 && failedIps.size < FAILED_AUTH_WARN_THRESHOLD) {
    if (status === "healthy") status = "warning";
    alerts.push({
      level: "warning",
      message: `Multiple failed SSH attempts from ${failedIps.size} sources`,
    });
  }

  return {
    module: "logins",
    status,
    data: {
      recentLogins: logins.slice(0, 15),
      failedCount: failedIps.size,
      lastRootLogin,
      fail2ban,
    },
    alerts,
  };
}

function parseFail2banStatus(
  stdout: string,
  serviceStdout: string,
): {
  jail: string;
  currentlyBanned: number;
  totalBanned: number;
  bannedIps: string[];
  serviceActive: boolean;
  jailAvailable: boolean;
} {
  const serviceActive = serviceStdout.trim() === "active";
  const empty = {
    jail: "sshd",
    currentlyBanned: 0,
    totalBanned: 0,
    bannedIps: [] as string[],
    serviceActive,
    jailAvailable: false,
  };

  if (!stdout.trim() || /not found|error/i.test(stdout)) return empty;

  const currentlyBanned =
    parseInt(
      stdout.match(/Currently banned:\s+(\d+)/i)?.[1] ?? "0",
      10,
    ) || 0;
  const totalBanned =
    parseInt(stdout.match(/Total banned:\s+(\d+)/i)?.[1] ?? "0", 10) || 0;
  const listMatch = stdout.match(/Banned IP list:\s*(.+)/i);
  const bannedIps = listMatch
    ? listMatch[1]
        .trim()
        .split(/\s+/)
        .filter((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip))
    : [];

  return {
    jail: "sshd",
    currentlyBanned,
    totalBanned,
    bannedIps,
    serviceActive,
    jailAvailable: true,
  };
}
