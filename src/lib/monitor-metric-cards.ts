/**
 * Client-safe TV metric card builders.
 * Keep free of Node/SSH imports — used by monitor-live-panel (browser).
 */

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

export type MonitorLiveHostVitals = {
  cpuPercent: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
  ramPercent: number | null;
  diskPercent: number | null;
  uptimeSec: number | null;
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

export type MetricCardBuildInput = {
  load1: string | number | null | undefined;
  load5?: string | number | null;
  load15?: string | number | null;
  cpuPercent?: number | null;
  cpuCores?: number | null;
  ramPercent?: number | null;
  swapPercent?: number | null;
  diskPercent?: number | null;
  temperatureCelsius?: number | null;
};

export function buildMetricCardsFromParts(
  parts: MetricCardBuildInput,
  uptimeFormatted: string,
  uptimeLines: string[],
): MonitorMetricCards {
  const ram = parts.ramPercent ?? null;
  const disk = parts.diskPercent ?? null;
  const swap = parts.swapPercent ?? null;
  const cores = parts.cpuCores ?? null;
  const load1 =
    parts.load1 == null || parts.load1 === ""
      ? null
      : String(parts.load1);
  const effectivePct =
    effectiveLoadPercent(load1, cores) ?? parts.cpuPercent ?? null;

  const cpuBits: string[] = [];
  if (cores != null) cpuBits.push(`${cores}c`);
  if (effectivePct != null) cpuBits.push(`${effectivePct}%`);
  if (parts.load5 != null || parts.load15 != null) {
    cpuBits.push(
      `${formatLoadNumber(parts.load5 ?? "—")}/${formatLoadNumber(parts.load15 ?? "—")}`,
    );
  }
  if (parts.temperatureCelsius != null) {
    cpuBits.push(`${parts.temperatureCelsius}°`);
  }
  const cpuLines =
    cpuBits.length > 0
      ? [cpuBits.join(" · ")]
      : !load1
        ? ["no snapshot"]
        : [];

  const ramLines: string[] = [];
  if (swap != null && swap > 0) ramLines.push(`swap ${swap}%`);
  else if (swap === 0) ramLines.push("swap idle");
  if (ram == null && ramLines.length === 0) ramLines.push("no snapshot");

  const diskLines: string[] = [];
  if (disk != null) diskLines.push(`${Math.max(0, 100 - disk)}% free`);
  else diskLines.push("no snapshot");

  const finalUptimeLines = [...uptimeLines];
  if (finalUptimeLines.length === 0 && uptimeFormatted === "—") {
    finalUptimeLines.push("no snapshot");
  }

  return {
    cpu: {
      value: effectivePct,
      displayValue: load1 ? formatLoadNumber(load1) : null,
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
      lines: finalUptimeLines,
    },
  };
}

/** Live agent host vitals → same TV card shape (cores / missing fields from seed). */
export function buildMonitorMetricCardsFromLive(
  host: MonitorLiveHostVitals,
  opts: {
    cpuCores?: number | null;
    uptimeFormatted: string;
    uptimeLines?: string[];
    /** Keep last good SSR/SSH values when agent omits a field. */
    seed?: MonitorMetricCards | null;
  },
): MonitorMetricCards {
  const seed = opts.seed ?? null;
  const seedRam =
    seed?.ram.value != null
      ? seed.ram.value
      : null;
  const seedDisk =
    seed?.disk.value != null
      ? seed.disk.value
      : null;
  const seedLoad =
    seed?.cpu.displayValue != null && seed.cpu.displayValue !== ""
      ? seed.cpu.displayValue
      : null;

  const built = buildMetricCardsFromParts(
    {
      load1: host.load1 ?? seedLoad,
      load5: host.load5,
      load15: host.load15,
      cpuPercent: host.cpuPercent ?? seed?.cpu.value ?? null,
      cpuCores: opts.cpuCores ?? null,
      ramPercent: host.ramPercent ?? seedRam,
      diskPercent: host.diskPercent ?? seedDisk,
    },
    opts.uptimeFormatted,
    opts.uptimeLines ?? seed?.uptime.lines ?? [],
  );

  if (!seed) return built;

  return {
    cpu:
      host.load1 != null || host.cpuPercent != null ? built.cpu : seed.cpu,
    ram: host.ramPercent != null ? built.ram : seed.ram,
    disk: host.diskPercent != null ? built.disk : seed.disk,
    uptime:
      host.uptimeSec != null
        ? built.uptime
        : { ...seed.uptime, display: opts.uptimeFormatted || seed.uptime.display },
  };
}
