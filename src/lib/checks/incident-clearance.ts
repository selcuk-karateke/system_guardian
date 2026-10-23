import {
  getBlockedRemoteIps,
  getIncidentIocDomains,
  getKnownDockerImagePrefixes,
} from "@/lib/config";
import { getActiveObservationWindow } from "@/lib/observation-window";
import { getSshClient } from "@/lib/ssh";
import { detectAppRole, isBenignShellProcessLine, LOG_IOC_PATTERNS } from "./container-audit";
import { fetchCoolifyMetadata, getCoolifyMeta } from "./coolify-meta";
import {
  classifyContainer,
  summarizeInventory,
} from "./docker-inventory";
import { COLLECT_CRON_SCRIPT, parseCronCollectOutput } from "./cron";
import {
  isSuspiciousCronContent,
  partitionCronJobs,
} from "./cron-patterns";
import {
  isOutboundEstablished,
  isSuspiciousConnection,
  parseSsTunapLine,
} from "./connection-patterns";
import {
  parsePidFromSsProcess,
  resolveContainersByPids,
} from "./container-process";
import { getFileChangeHint } from "./file-change-hint";
import { isSuspiciousProcessLine, parsePsAuxLines } from "./process-patterns";
import {
  alertInputFromSsSecurityEvents,
  clearanceFieldsFromSsSecurityEvents,
  alertFromSecurityEvent,
  suspiciousSsHitToSecurityEvent,
  type SecurityEvent,
} from "@/lib/security/events";
import type { AlertInput, CheckResult } from "./types";

export type ClearanceStatus = "pass" | "fail" | "warn";

/** Parst live `sshd -T` — Warnung nur bei effektivem Wert yes */
export function parsePermitRootLoginEffective(stdoutLine: string): {
  value: string | null;
  unreadable: boolean;
} {
  const line = stdoutLine.trim().toLowerCase();
  if (!line || line.includes("nicht lesbar")) {
    return { value: null, unreadable: true };
  }
  const m = line.match(/permitrootlogin\s+(\S+)/);
  return { value: m?.[1] ?? null, unreadable: false };
}

export function isPermitRootLoginUnsafe(effectiveStdoutLine: string): boolean {
  const { value, unreadable } = parsePermitRootLoginEffective(effectiveStdoutLine);
  if (unreadable) return true;
  return value === "yes";
}

export type ClearanceGroup = "ioc" | "scope" | "ssh";

export interface ClearanceItem {
  id: string;
  label: string;
  status: ClearanceStatus;
  detail: string;
  group: ClearanceGroup;
}

const DOWNLOAD_PATTERNS =
  /\b(wget|curl|fetch)\s+https?:\/\//i;
const SHELL_CMD_PATTERNS =
  /\b(bash\s+-i|sh\s+-c\s+.*(curl|wget|nc)|\/bin\/sh\s+-c\s+(curl|wget))/i;
const DNS_QUERY_PATTERNS = (domains: string[]) =>
  new RegExp(
    domains.map((d) => d.replace(/\./g, "\\.")).join("|") +
      "|query.*A\\s|systemd-resolved.*query",
    "i",
  );

function iocGrepPattern(domains: string[], ips: string[]): string {
  const parts = [
    ...domains.map((d) => d.replace(/\./g, "\\.")),
    ...ips.map((ip) => ip.replace(/\./g, "\\.")),
  ];
  return parts.join("|") || "a^";
}

function journalRange(since: string, until: string): string {
  return `--since "${since.replace("T", " ")}" --until "${until.replace("T", " ")}"`;
}

/** Laufende Sicherheitslage + IOC (rollierendes Fenster, siehe OBSERVATION_HOURS). */
export async function runSecurityPostureCheck(
  serverId: string,
): Promise<CheckResult> {
  const ssh = getSshClient();
  const observation = getActiveObservationWindow();
  const domains = getIncidentIocDomains();
  const blockedIps = [...getBlockedRemoteIps()];
  const grepPat = iocGrepPattern(domains, blockedIps);
  const logSince = observation.since;
  const logUntil = observation.until;
  const jRange = journalRange(logSince, logUntil);
  const items: ClearanceItem[] = [];

  const journalSnap = await ssh.exec(
    `journalctl ${jRange} --no-pager 2>/dev/null | head -8000 || true`,
  );
  const journalText = journalSnap.stdout ?? "";

  const dnsHits = journalText
    .split("\n")
    .filter((l) => domains.some((d) => l.includes(d)) || DNS_QUERY_PATTERNS(domains).test(l))
    .filter((l) => domains.some((d) => l.includes(d)))
    .slice(0, 5);
  items.push({
    id: "dns",
    label: "Keine DNS-Anfragen zu den gemeldeten Domains",
    status: dnsHits.length === 0 ? "pass" : "fail",
    detail:
      dnsHits.length === 0
        ? `Fenster ${observation.mode} ${logSince}–${logUntil}: keine Domain-IOC`
        : dnsHits.join(" | "),
    group: "ioc",
  });

  const ipConnHits: string[] = [];
  const ss = await ssh.exec("ss -tunap 2>/dev/null | head -800");
  for (const ip of blockedIps) {
    if (ss.stdout.includes(ip)) ipConnHits.push(`ss: ${ip}`);
  }
  const journalIpHits = journalText
    .split("\n")
    .filter((l) => blockedIps.some((ip) => l.includes(ip)))
    .slice(0, 3);
  const allIpHits = [...ipConnHits, ...journalIpHits.map((l) => `log: ${l.slice(0, 80)}`)];
  items.push({
    id: "ip_connections",
    label: `Keine Verbindungen zu ${blockedIps.join(", ")}`,
    status: allIpHits.length === 0 ? "pass" : "fail",
    detail:
      allIpHits.length === 0
        ? "ss -tunap + journalctl ohne Blocklist-IP"
        : allIpHits.join("; "),
    group: "ioc",
  });

  const downloadHits = [
    ...journalText.split("\n").filter((l) => DOWNLOAD_PATTERNS.test(l)),
    ...(await ssh.exec(
      `grep -rhE 'wget|curl.*https?://' /var/log/auth.log /var/log/syslog 2>/dev/null | tail -30 || true`,
    )).stdout
      .split("\n")
      .filter((l) => DOWNLOAD_PATTERNS.test(l)),
  ].slice(0, 5);
  items.push({
    id: "downloads",
    label: "Keine Download-Aktivitäten",
    status: downloadHits.length === 0 ? "pass" : "fail",
    detail:
      downloadHits.length === 0
        ? "Kein wget/curl-HTTP in Journal-/var/log-Schnitt"
        : downloadHits.map((l) => l.slice(0, 100)).join(" | "),
    group: "ioc",
  });

  const cmdHits = journalText
    .split("\n")
    .filter((l) => SHELL_CMD_PATTERNS.test(l) || LOG_IOC_PATTERNS.some((re) => re.test(l)))
    .slice(0, 5);
  items.push({
    id: "commands",
    label: "Keine verdächtigen Befehle",
    status: cmdHits.length === 0 ? "pass" : "fail",
    detail:
      cmdHits.length === 0
        ? "Journal ohne Shell/Download-IOC-Muster"
        : cmdHits.map((l) => l.slice(0, 100)).join(" | "),
    group: "ioc",
  });

  const ps = await ssh.exec(
    "ps auxww 2>/dev/null | head -250 || ps aux 2>/dev/null | head -250",
  );
  const shellProcs = parsePsAuxLines(ps.stdout).filter(
    (l) =>
      /\b(sh|bash|dash)\s+-c\b/i.test(l) && !isBenignShellProcessLine(l),
  );
  const procSuspicious = parsePsAuxLines(ps.stdout).filter((l) =>
    isSuspiciousProcessLine(l),
  );
  const shellHits = [...shellProcs, ...procSuspicious].slice(0, 5);
  items.push({
    id: "shells",
    label: "Keine Shell-Aufrufe (verdächtig)",
    status: shellHits.length === 0 ? "pass" : "fail",
    detail:
      shellHits.length === 0
        ? "ps aux: keine ungewöhnlichen sh/bash-Payloads"
        : shellHits.join(" | "),
    group: "ioc",
  });

  const varlog = await ssh.exec(
    `grep -rhE '${grepPat}' /var/log/auth.log /var/log/syslog 2>/dev/null | tail -20 || true`,
  );
  const malwareLines: string[] = [];
  for (const line of (journalText + "\n" + varlog.stdout).split("\n")) {
    if (LOG_IOC_PATTERNS.some((re) => re.test(line))) malwareLines.push(line);
  }
  const scanner = await ssh.exec(
    "which nmap masscan xmrig 2>/dev/null; ls /tmp/xmrig /dev/shm/xmrig 2>/dev/null || true",
  );
  const malwareFound =
    malwareLines.length > 0 ||
    (/xmrig|masscan/.test(scanner.stdout) && scanner.stdout.trim().length > 0);
  items.push({
    id: "malware",
    label: "Keine Malware-Indikatoren",
    status: !malwareFound ? "pass" : "fail",
    detail: malwareFound
      ? `${malwareLines.length} Log-/Tool-Treffer`
      : "Keine Miner/C2-Muster in Logs oder /tmp",
    group: "ioc",
  });

  // Only non-IOC outbound hits (blocked IPs are a separate check above).
  // Unknown HTTPS must stay WARNING — CRITICAL only for real IOC / temp-path / bad ports.
  // Path: ss-Hit → SecurityEvent (+ Container-Kontext) → clearance item / AlertInput
  const ssHits: {
    line: string;
    conn: NonNullable<ReturnType<typeof parseSsTunapLine>>;
    hit: NonNullable<ReturnType<typeof isSuspiciousConnection>>;
  }[] = [];
  for (const line of ss.stdout.split("\n")) {
    const conn = parseSsTunapLine(line);
    if (!conn || !isOutboundEstablished(conn)) continue;
    const hit = isSuspiciousConnection(conn);
    if (hit && !blockedIps.includes(conn.remoteIp)) {
      ssHits.push({ line, conn, hit });
    }
  }
  const ssPids = ssHits
    .map((h) => parsePidFromSsProcess(h.conn.process))
    .filter((p): p is number => p != null);
  const containerByPid = await resolveContainersByPids(ssh, ssPids);
  const ssConnectionEvents: SecurityEvent[] = ssHits.map(({ line, conn, hit }) => {
    const pid = parsePidFromSsProcess(conn.process);
    return suspiciousSsHitToSecurityEvent(conn, hit, {
      serverId,
      rawLine: line,
      container: pid != null ? containerByPid.get(pid) ?? null : null,
    });
  });
  const ssClearance = clearanceFieldsFromSsSecurityEvents(ssConnectionEvents);
  if (ssClearance) {
    items.push({
      id: "connections_other",
      label: ssClearance.label,
      status: ssClearance.status,
      detail: ssClearance.detail,
      group: "ioc",
    });
  }

  const docker = await ssh.exec("docker ps -a --format '{{json .}}' 2>&1");
  const coolifyMeta = await fetchCoolifyMetadata((cmd, ms) => ssh.exec(cmd, ms));
  const prefixes = getKnownDockerImagePrefixes();
  const classified: (ReturnType<typeof classifyContainer> & { state: string })[] = [];
  const rows: { Names: string; Image: string; State: string }[] = [];
  for (const line of docker.stdout.split("\n").filter(Boolean)) {
    try {
      const row = JSON.parse(line) as { Names: string; Image: string; State: string };
      rows.push(row);
      classified.push({
        ...classifyContainer(row.Names, row.Image, prefixes, getCoolifyMeta(coolifyMeta, row.Names)),
        state: row.State,
      });
    } catch {
      /* skip */
    }
  }
  const inv = summarizeInventory(classified);
  const running = classified.filter((c) => c.state === "running");
  const postgres = running.filter((c) =>
    /postgres|mysql|mariadb/i.test(c.image),
  );
  const nextjs = running.filter(
    (c) => detectAppRole(c.name, c.image) === "coolify-app",
  );
  const sentinel = rows.find((r) => r.Names.includes("sentinel"));

  items.push({
    id: "scope_docker",
    label: "Docker-Container geprüft",
    status: "warn",
    detail: `${running.length} running / ${classified.length} gesamt (docker ps -a)`,
    group: "scope",
  });
  items.push({
    id: "scope_postgres",
    label: "PostgreSQL geprüft",
    status: "warn",
    detail:
      postgres.length > 0
        ? postgres.map((c) => c.name).join(", ")
        : "keine DB-Container running",
    group: "scope",
  });
  items.push({
    id: "scope_nextjs",
    label: "Next.js geprüft",
    status: "warn",
    detail: `${nextjs.length} App-Container (Stichprobe logs/top im BSI-Fenster empfohlen)`,
    group: "scope",
  });
  items.push({
    id: "scope_sentinel",
    label: "Sentinel geprüft",
    status: "warn",
    detail: sentinel
      ? `${sentinel.Names}: ${sentinel.State} (${sentinel.Image})`
      : "coolify-sentinel nicht gefunden",
    group: "scope",
  });

  const cronOut = await ssh.exec(COLLECT_CRON_SCRIPT);
  const jobs = parseCronCollectOutput(cronOut.stdout);
  const { systemCount, humanCount } = partitionCronJobs(jobs);
  const cronBad = Object.entries(jobs).filter(([, v]) =>
    isSuspiciousCronContent(v),
  );
  items.push({
    id: "scope_cron",
    label: "Cronjobs geprüft",
    status: cronBad.length > 0 ? "fail" : "warn",
    detail:
      cronBad.length > 0
        ? `Auffällig: ${cronBad.map(([, v]) => v.slice(0, 60)).join("; ")}`
        : `System ${systemCount}, Human ${humanCount} — keine Suspicious-Muster`,
    group: cronBad.length > 0 ? "ioc" : "scope",
  });

  items.push({
    id: "scope_network",
    label: "Netzwerke geprüft",
    status: "warn",
    detail: `ss -tunap (${ss.stdout.split("\n").length} Zeilen), Blocklist aktiv`,
    group: "scope",
  });

  const rkh = await ssh.exec(
    "command -v rkhunter >/dev/null || { echo 'RKHUNTER_SKIP'; exit 0; }; timeout 25 rkhunter --check --sk --report-warnings-only 2>&1 | tail -25 || echo 'rkhunter timeout — Vollcheck manuell'",
    90_000,
  );
  const rkhSkip = rkh.stdout.includes("RKHUNTER_SKIP");
  items.push({
    id: "scope_rkhunter",
    label: "rkhunter geprüft",
    status: "warn",
    detail: rkhSkip
      ? "nicht installiert — manuell nachinstallieren empfohlen"
      : rkh.stdout.trim().slice(0, 200) || "lief ohne Warnings (tail)",
    group: "scope",
  });

  const chk = await ssh.exec(
    "command -v chkrootkit >/dev/null || { echo 'CHKROOTKIT_SKIP'; exit 0; }; timeout 45 chkrootkit 2>&1 | grep -iE 'INFECTED|Warning' | head -15 || echo 'chkrootkit ok (keine Warning-Zeilen)'",
    90_000,
  );
  const chkSkip = chk.stdout.includes("CHKROOTKIT_SKIP");
  const chkBad = chk.stdout.includes("INFECTED");
  items.push({
    id: "scope_chkrootkit",
    label: "chkrootkit geprüft",
    status: chkBad ? "fail" : "warn",
    detail: chkSkip
      ? "nicht installiert — manuell nachinstallieren empfohlen"
      : chkBad
        ? chk.stdout.trim().slice(0, 200)
        : "keine INFECTED/Warning-Zeilen",
    group: chkBad ? "ioc" : "scope",
  });

  const containerIssue = inv.foreignRunning.length > 0;
  if (containerIssue) {
    items.push({
      id: "containers",
      label: "Keine kompromittierten Container erkennbar",
      status: "warn",
      detail: `${inv.foreignRunning.length} Container mit nackter Image-ID — manuell verifizieren`,
      group: "ioc",
    });
  }

  const effective = await ssh.exec(
    "sshd -T 2>/dev/null | grep -i '^permitrootlogin ' | head -1 || true",
  );
  const effectiveLine =
    effective.stdout.trim().split("\n").filter(Boolean)[0] ??
    "(sshd -T nicht lesbar)";
  const prlLine = effectiveLine.replace(/^PermitRootLogin/i, "permitrootlogin");
  const prlLower = prlLine.toLowerCase();
  const rootLoginRisk = isPermitRootLoginUnsafe(prlLower);
  items.push({
    id: "ssh_permit_root",
    label: "SSH PermitRootLogin",
    status: rootLoginRisk ? "warn" : "pass",
    detail: rootLoginRisk
      ? `${prlLine} (effektiv) — empfohlen: PermitRootLogin prohibit-password oder no`
      : `${prlLine} (effektiv)`,
    group: "ssh",
  });

  const iocItems = items.filter((i) => i.group === "ioc");
  const failCount = iocItems.filter((i) => i.status === "fail").length;
  const iocWarnCount = iocItems.filter((i) => i.status === "warn").length;
  const allIocPass = failCount === 0 && iocWarnCount === 0;

  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";

  if (!allIocPass) {
    status = failCount > 0 ? "critical" : "warning";
    for (const item of iocItems.filter((i) => i.status !== "pass")) {
      if (item.id === "connections_other") {
        // Alert-rule gate; keep legacy one aggregated AlertInput.
        const matched = ssConnectionEvents.filter(
          (e) => alertFromSecurityEvent(e) !== null,
        );
        const fromEvents = alertInputFromSsSecurityEvents(matched);
        if (fromEvents) alerts.push(fromEvents);
        continue;
      }
      alerts.push({
        level: item.status === "fail" ? "critical" : "warning",
        message: `${item.label}: ${item.detail}`,
      });
    }
  }

  if (rootLoginRisk) {
    if (status === "healthy") status = "warning";
    const sshdHint = await getFileChangeHint(ssh, "/etc/ssh/sshd_config");
    alerts.push({
      level: "warning",
      message: `SSH: ${prlLine} — auf prohibit-password oder no stellen${sshdHint ? ` — ${sshdHint}` : ""}`,
      recommendation:
        "In /etc/ssh/sshd_config: PermitRootLogin prohibit-password (Key) oder no; dann systemctl reload sshd",
    });
  }

  return {
    module: "security_posture",
    status,
    data: {
      allPass: allIocPass && !rootLoginRisk,
      failCount,
      warnCount: items.filter((i) => i.status === "warn").length,
      passCount: items.filter((i) => i.status === "pass").length,
      items,
      iocItems: items.filter((i) => i.group === "ioc"),
      scopeItems: items.filter((i) => i.group === "scope"),
      sshItems: items.filter((i) => i.group === "ssh"),
      iocDomains: domains,
      blockedIps,
      observation,
      window: { logSince, logUntil, mode: observation.mode, hours: observation.hours },
      summaryLine: allIocPass
        ? `Sicherheitslage ok (${observation.mode}, ${observation.hours ?? "fix"}h) — Scope separat.`
        : `${failCount} IOC-Fail, ${iocWarnCount} IOC-Warn`,
    },
    alerts,
  };
}

/** @deprecated Alias – use runSecurityPostureCheck */
export const runIncidentClearanceCheck = runSecurityPostureCheck;
