import type { metricsSnapshots } from "@/db/schema";

type MetricsRow = typeof metricsSnapshots.$inferSelect;

export type MonitorMetricCards = {
  cpu: {
    value: number | null;
    displayValue?: string | null;
    lines: string[];
    tone: "ok" | "warn" | "crit";
  };
  ram: { value: number | null; lines: string[]; tone: "ok" | "warn" | "crit" };
  disk: { value: number | null; lines: string[]; tone: "ok" | "warn" | "crit" };
  uptime: { display: string; lines: string[] };
};

function toneFromPercent(
  pct: number | null | undefined,
  warn: number,
  crit: number,
): "ok" | "warn" | "crit" {
  if (pct == null) return "ok";
  if (pct >= crit) return "crit";
  if (pct >= warn) return "warn";
  return "ok";
}

function formatLoadNumber(load: string | number): string {
  const n = typeof load === "number" ? load : parseFloat(load);
  if (Number.isNaN(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function effectiveLoadPercent(
  load1: string | null | undefined,
  cores: number | null | undefined,
): number | null {
  if (!load1) return null;
  const load = parseFloat(load1);
  if (Number.isNaN(load)) return null;
  const c = cores && cores > 0 ? cores : null;
  if (!c) return null;
  return Math.min(100, Math.round((load / c) * 100));
}

export function buildMonitorMetricCards(
  m: MetricsRow | null | undefined,
  uptimeFormatted: string,
): MonitorMetricCards {
  const ram = m?.ramPercent ?? null;
  const disk = m?.diskPercent ?? null;
  const swap = m?.swapPercent ?? null;
  const sec = m?.uptimeSeconds ?? null;
  const cores = m?.cpuCores ?? null;
  const load1 = m?.loadAvg1 ?? null;
  const effectivePct =
    effectiveLoadPercent(load1, cores) ?? m?.cpuPercent ?? null;

  const cpuLines: string[] = [];
  if (effectivePct != null) {
    cpuLines.push(`${effectivePct}% effective load`);
  }
  if (m?.loadAvg5 || m?.loadAvg15) {
    cpuLines.push(
      `5m ${formatLoadNumber(m.loadAvg5 ?? "—")} · 15m ${formatLoadNumber(m.loadAvg15 ?? "—")}`,
    );
  }
  if (m?.temperatureCelsius != null) {
    cpuLines.push(`temp ${m.temperatureCelsius}°C`);
  }

  let cpuDisplay: string | null = null;
  if (load1 && cores) {
    cpuDisplay = `${formatLoadNumber(load1)} / ${cores}`;
  } else if (load1) {
    cpuDisplay = formatLoadNumber(load1);
  }

  const ramLines: string[] = [];
  if (swap != null) ramLines.push(`swap ${swap}%`);
  if (m?.networkOk != null) {
    ramLines.push(m.networkOk ? "network ok" : "check network");
  }

  const diskLines: string[] = [];
  if (disk != null) diskLines.push(`${disk}% used · ${100 - disk}% free`);

  const uptimeLines: string[] = [];
  if (sec != null) uptimeLines.push(`${sec.toLocaleString("en-US")} sec`);
  if (sec != null && sec >= 86400) {
    uptimeLines.push(`${Math.floor(sec / 86400)}d since boot`);
  }

  if (cpuLines.length === 0 && effectivePct == null && !load1) {
    cpuLines.push("no snapshot");
  }
  if (ramLines.length === 0 && ram == null) ramLines.push("no snapshot");
  if (diskLines.length === 0 && disk == null) diskLines.push("no snapshot");
  if (uptimeLines.length === 0 && uptimeFormatted === "—") {
    uptimeLines.push("no snapshot");
  }

  return {
    cpu: {
      value: effectivePct,
      displayValue: cpuDisplay,
      lines: cpuLines,
      tone: toneFromPercent(effectivePct, 80, 95),
    },
    ram: {
      value: ram,
      lines: ramLines,
      tone: toneFromPercent(ram, 85, 95),
    },
    disk: {
      value: disk,
      lines: diskLines,
      tone: toneFromPercent(disk, 85, 95),
    },
    uptime: {
      display: uptimeFormatted,
      lines: uptimeLines,
    },
  };
}

export function formatModuleDetail(
  module: string,
  data: Record<string, unknown> | undefined,
  opts?: {
    status?: string;
    checkedAt?: Date | null;
    metrics?: MetricsRow | null;
  },
): string | null {
  const lines = formatModuleDetailLines(module, data, opts);
  return lines.length ? lines.join(" · ") : null;
}

export function formatModuleDetailLines(
  module: string,
  data: Record<string, unknown> | undefined,
  opts?: {
    status?: string;
    checkedAt?: Date | null;
    metrics?: MetricsRow | null;
  },
): string[] {
  if (data) {
    const fromData = formatModuleDetailLinesFromData(module, data);
    if (fromData?.length) return fromData;
  }

  if (module === "server_health" && opts?.metrics) {
    const m = opts.metrics;
    const parts: string[] = [];
    if (m.loadAvg1 && m.cpuCores) {
      parts.push(`load ${formatLoadNumber(m.loadAvg1)}/${m.cpuCores}`);
    } else if (m.loadAvg1) {
      parts.push(`load ${formatLoadNumber(m.loadAvg1)}`);
    }
    const eff = effectiveLoadPercent(m.loadAvg1, m.cpuCores);
    if (eff != null) parts.push(`${eff}% effective`);
    if (m.ramPercent != null) parts.push(`ram ${m.ramPercent}%`);
    if (m.diskPercent != null) parts.push(`disk ${m.diskPercent}%`);
    if (parts.length) return [parts.join(" · ")];
  }

  if (opts?.checkedAt) {
    const mins = Math.round((Date.now() - opts.checkedAt.getTime()) / 60000);
    if (mins < 1) return ["checked just now"];
    if (mins < 60) return [`checked ${mins}m ago`];
    return [`checked ${Math.round(mins / 60)}h ago`];
  }

  if (opts?.status === "healthy") return ["operational"];
  if (opts?.status === "warning") return ["degraded"];
  if (opts?.status === "critical") return ["outage"];
  if (opts?.status === "unknown") return ["no check yet"];

  return ["—"];
}

function shortenLabel(text: string, max = 24): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function formatModuleDetailLinesFromData(
  module: string,
  data: Record<string, unknown>,
): string[] | null {
  switch (module) {
    case "docker": {
      if (data.dockerAvailable === false) {
        const err = data.error as string | undefined;
        return [err ? `offline · ${shortenLabel(err, 36)}` : "docker offline"];
      }
      const r = data.running as number | undefined;
      const t = data.total as number | undefined;
      const unexpected = data.stoppedUnexpected as string[] | undefined;
      const expected = data.stoppedExpected as string[] | undefined;
      if (r == null || t == null) return null;
      const lines = [`${r}/${t} running`];
      const u = unexpected?.length ?? 0;
      if (u === 0) {
        const e = expected?.length ?? 0;
        lines.push(e > 0 ? `${e} expected stop` : "0 unexpected stops");
      } else {
        lines.push(`↓ ${shortenLabel(unexpected![0])}`);
        if (u > 1) lines.push(`+${u - 1} more stopped`);
      }
      return lines;
    }
    case "backups": {
      const summary = data.summary as
        | {
            present?: boolean;
            sizeHuman?: string;
            ageHours?: number;
            ageDays?: number;
            latestFile?: string;
          }
        | undefined;
      if (summary?.present === false) return ["no backup"];
      if (summary?.sizeHuman && summary.latestFile) {
        const age =
          summary.ageHours != null && summary.ageHours < 48
            ? `${Math.round(summary.ageHours)}h old`
            : `${Math.round(summary.ageDays ?? 0)}d old`;
        const file = summary.latestFile.split("/").pop() ?? summary.latestFile;
        return [`${summary.sizeHuman} · ${age}`, shortenLabel(file, 28)];
      }
      return null;
    }
    case "database": {
      const dbs = data.databases as
        | Record<string, { ok?: boolean; skipped?: boolean; sizeBytes?: number }>
        | undefined;
      if (!dbs) return null;
      const parts: string[] = [];
      const pg = dbs.postgresql ?? dbs.postgres;
      if (pg?.ok) {
        const gb =
          pg.sizeBytes != null
            ? ` · ${(pg.sizeBytes / 1024 ** 3).toFixed(1)} GB`
            : "";
        parts.push(`PG ok${gb}`);
      } else if (pg && !pg.skipped) parts.push("PG down");
      if (dbs.mysql?.ok) parts.push("MySQL ok");
      else if (dbs.mysql?.skipped) parts.push("MySQL skip");
      return parts.length ? [parts.join(" · ")] : null;
    }
    case "ssl": {
      const certs = data.certificates as
        | Record<string, { daysLeft?: number }>
        | undefined;
      if (!certs || !Object.keys(certs).length) return null;
      const days = Object.values(certs).map((c) => c.daysLeft ?? 999);
      const min = Math.min(...days);
      return [`min ${min}d left`, `${Object.keys(certs).length} certs`];
    }
    case "ports": {
      const count = data.count as number | undefined;
      return count != null ? [`${count} ports`] : null;
    }
    case "logs": {
      const critical = (data.criticalLines ?? data.critical) as
        | string[]
        | undefined;
      const warning = (data.warningLines ?? data.warning) as
        | string[]
        | undefined;
      const first = critical?.[0] ?? warning?.[0];
      if (first) return [shortenLabel(first, 72)];
      return ["no matches"];
    }
    case "ssh_keys": {
      const n = data.keyCount as number | undefined;
      return n != null ? [`${n} keys`] : null;
    }
    case "users": {
      const human = data.humanCount as number | undefined;
      const system = data.systemCount as number | undefined;
      if (human != null && system != null) {
        return [
          `${human} human account${human === 1 ? "" : "s"}`,
          `${system} system account${system === 1 ? "" : "s"}`,
        ];
      }
      const n = data.userCount as number | undefined;
      return n != null ? [`${n} accounts`] : null;
    }
    case "logins": {
      const root = data.lastRootLogin as
        | { masked?: string; trusted?: boolean }
        | undefined;
      const f2b = data.fail2ban as
        | {
            currentlyBanned?: number;
            serviceActive?: boolean;
            jailAvailable?: boolean;
          }
        | undefined;
      const lines: string[] = [];
      if (root?.masked) {
        lines.push(
          `root ${root.masked} · ${root.trusted ? "known" : "unknown"}`,
        );
      }
      if (f2b?.serviceActive && f2b.jailAvailable) {
        lines.push(`fail2ban · ${f2b.currentlyBanned ?? 0} banned`);
      } else if (f2b && !f2b.serviceActive) {
        lines.push("fail2ban inactive");
      }
      if (lines.length) return lines;
      const f = data.failedCount as number | undefined;
      return f != null ? [`${f} failed auth`] : null;
    }
    case "cron": {
      const n = data.jobCount as number | undefined;
      return n != null ? [`${n} cron jobs`] : null;
    }
    case "raid": {
      if (data.skipped) return ["mdadm disabled"];
      const arrays = data.arrays as unknown[] | undefined;
      return arrays?.length ? [`${arrays.length} md array(s)`] : ["no md raid"];
    }
    case "coolify": {
      const services = data.services as Record<string, string> | undefined;
      if (!services || !Object.keys(services).length) return ["no services"];
      const keys = Object.keys(services);
      const running = keys.filter((k) => services[k] === "running").length;
      return [`${running}/${keys.length} running`];
    }
    case "website": {
      const sites = data.sites as { url?: string; statusCode?: number }[] | undefined;
      if (!sites?.length) return null;
      const ok = sites.filter((s) => s.statusCode && s.statusCode < 400).length;
      return [`${ok}/${sites.length} reachable`];
    }
    case "scanner": {
      const installed = data.installed as string[] | undefined;
      return installed?.length
        ? [shortenLabel(installed.join(", "), 32)]
        : ["no scanners"];
    }
    case "fim": {
      const n = data.pathCount as number | undefined;
      return n != null ? [`${n} paths`] : null;
    }
    case "network": {
      const n = data.listenerCount as number | undefined;
      const pub = (data.publicPorts as string[] | undefined)?.length;
      if (n != null && pub != null) return [`${n} listener`, `${pub} public`];
      return n != null ? [`${n} listener`] : null;
    }
    case "server_health": {
      const load = data.loadAvg as string[] | undefined;
      const cores = data.cpuCores as number | undefined;
      const eff = data.effectiveLoadPercent as number | undefined;
      const t = data.temperatureCelsius as number | undefined;
      const lines: string[] = [];
      if (load?.[0] && cores) {
        lines.push(`load ${formatLoadNumber(load[0])}/${cores}`);
      } else if (load?.[0]) {
        lines.push(`load ${formatLoadNumber(load[0])}`);
      }
      if (eff != null) lines.push(`${eff}% effective`);
      if (t != null) lines.push(`${t}°C`);
      return lines.length ? lines : null;
    }
    default:
      return null;
  }
}

export async function getLatestCheckDataByModule(): Promise<
  Record<string, Record<string, unknown>>
> {
  const { db } = await import("@/db");
  const { checkRuns } = await import("@/db/schema");
  const { desc } = await import("drizzle-orm");

  const runs = await db
    .select({ module: checkRuns.module, data: checkRuns.data })
    .from(checkRuns)
    .orderBy(desc(checkRuns.createdAt))
    .limit(120);

  const map: Record<string, Record<string, unknown>> = {};
  for (const r of runs) {
    if (!map[r.module]) map[r.module] = r.data;
  }
  return map;
}
