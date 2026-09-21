import {
  getTrustedLoginIps,
  isTrustedLoginIp,
  maskLoginIp,
} from "@/lib/config";
import {
  formatRootLoginAlertDetail,
  parseRootLoginLine,
  type ParsedRootLogin,
} from "./last-login";
import {
  formatSinceLastCheck,
  hoursSinceSnapshot,
  isBanSpike,
} from "@/lib/checks/fail2ban-metrics";
import { diffAndStore, getLatestSnapshotMeta } from "@/lib/history/persist";
import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

const FAILED_AUTH_WARN_THRESHOLD = 10;

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
  const trustedIps = getTrustedLoginIps();

  let lastRootLogin: ParsedRootLogin | null = null;
  const untrustedRootLogins: ParsedRootLogin[] = [];

  for (const line of last.stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    logins.push(trimmed);

    const parsed = parseRootLoginLine(trimmed, trustedIps, maskLoginIp);
    if (!parsed) continue;
    if (!lastRootLogin) lastRootLogin = parsed;
    if (!parsed.trusted) {
      if (!untrustedRootLogins.some((l) => l.ip === parsed.ip)) {
        untrustedRootLogins.push(parsed);
      }
    }
  }

  for (const line of auth.stdout.split("\n")) {
    if (line.includes("Failed password")) {
      const ipMatch = line.match(/from\s+(\S+)/);
      if (ipMatch && !isTrustedLoginIp(ipMatch[1])) failedIps.add(ipMatch[1]);
    }
  }

  const fail2ban = parseFail2banStatus(f2b.stdout, f2bSvc.stdout);

  const untrustedKeys = untrustedRootLogins.map(
    (l) => `${l.ip}|${l.at ?? ""}`,
  );
  const { diffs: loginDiffs, isBaseline: loginBaseline } = await diffAndStore(
    serverId,
    "root_logins",
    { untrusted: untrustedKeys },
    (prev, curr) => {
      const prevSet = new Set((prev?.untrusted as string[]) ?? []);
      const currList = (curr.untrusted as string[]) ?? [];
      return currList
        .filter((key) => !prevSet.has(key))
        .map((key) => ({
          changeType: "added" as const,
          entityKey: key,
          newValue: key,
        }));
    },
  );

  const newUntrustedLogins = loginDiffs
    .map((d) => {
      const [ip, atPart] = d.entityKey.split("|");
      return untrustedRootLogins.find(
        (l) => l.ip === ip && (l.at ?? "") === (atPart ?? ""),
      );
    })
    .filter((l): l is ParsedRootLogin => l != null);

  if (loginBaseline && untrustedRootLogins.length > 0) {
    alerts.push({
      level: "info",
      message: `Login-Baseline: ${untrustedRootLogins.length} historische Root-Logins von unbekannten IPs erfasst (kein Alert)`,
    });
  } else if (newUntrustedLogins.length > 0) {
    status = "warning";
    alerts.push({
      level: "warning",
      message: `Neuer Root-Login von unbekannter IP: ${newUntrustedLogins.map(formatRootLoginAlertDetail).join("; ")}`,
      recommendation:
        "In TRUSTED_LOGIN_IPS eintragen wenn bekannt, sonst last/auth.log prüfen",
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

  const prevF2bMeta = await getLatestSnapshotMeta(serverId, "fail2ban");
  const hoursSince = hoursSinceSnapshot(prevF2bMeta?.createdAt ?? null);
  const prevTotalBanned = Number(prevF2bMeta?.payload.totalBanned ?? 0);

  const { diffs, previousSnapshotAt } = await diffAndStore(
    serverId,
    "fail2ban",
    {
      totalBanned: fail2ban.totalBanned,
      currentlyBanned: fail2ban.currentlyBanned,
    },
    (prev, curr) => {
      const prevTotal = Number(prev?.totalBanned ?? 0);
      const currTotal = Number(curr.totalBanned);
      const { spike } = isBanSpike(prevTotal, currTotal, hoursSince);
      if (!spike) return [];
      return [
        {
          changeType: "changed" as const,
          entityKey: "ban_spike",
          previousValue: String(prevTotal),
          newValue: String(currTotal),
        },
      ];
    },
  );

  const banMetrics =
    prevF2bMeta != null
      ? isBanSpike(prevTotalBanned, fail2ban.totalBanned, hoursSince)
      : { spike: false, delta: 0, ratePerHour: 0 };

  for (const d of diffs) {
    if (d.entityKey === "ban_spike") {
      status = status === "critical" ? "critical" : "warning";
      const prev = Number(d.previousValue ?? 0);
      const curr = Number(d.newValue ?? fail2ban.totalBanned);
      const delta = curr - prev;
      const sinceLabel = formatSinceLastCheck(hoursSince);
      alerts.push({
        level: "warning",
        message: `fail2ban Ban-Spike: +${delta} Ereignisse in ${sinceLabel} (Total ${prev}→${curr}, ${fail2ban.currentlyBanned} aktiv)`,
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
      untrustedRootLogins: untrustedRootLogins.map((l) => ({
        masked: l.masked,
        at: l.at,
        active: l.active,
      })),
      newUntrustedLogins: newUntrustedLogins.map((l) => ({
        masked: l.masked,
        at: l.at,
        active: l.active,
      })),
      fail2ban: {
        ...fail2ban,
        totalBannedDelta: banMetrics.delta > 0 ? banMetrics.delta : undefined,
        banRatePerHour:
          banMetrics.ratePerHour > 0
            ? Math.round(banMetrics.ratePerHour)
            : undefined,
        sinceLastCheckHours:
          previousSnapshotAt != null
            ? Math.round(hoursSince * 10) / 10
            : undefined,
      },
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
