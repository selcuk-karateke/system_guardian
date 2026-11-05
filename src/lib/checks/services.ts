import { getExpectedFailedUnits } from "@/lib/config";
import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

/**
 * Host services inventory (Cockpit-style: enabled + running).
 * `required: true` → alert when not active.
 */
export const SERVICE_CATALOG: {
  unit: string;
  label: string;
  alt?: string[];
  required?: boolean;
}[] = [
  { unit: "nfs-server", label: "NFS", alt: ["nfs-kernel-server"] },
  { unit: "rsync", label: "RSync server", alt: ["rsyncd"] },
  { unit: "smbd", label: "SMB/CIFS", alt: ["smb"] },
  { unit: "ssh", label: "SSH", alt: ["sshd"], required: true },
  { unit: "docker", label: "Docker", required: true },
  { unit: "fail2ban", label: "fail2ban", required: true },
];

const UNIT_LIST = [
  ...new Set(
    SERVICE_CATALOG.flatMap((s) => [s.unit, ...(s.alt ?? [])]),
  ),
].join(" ");

/** Collect enabled + active for catalog units, plus failed units. */
export const COLLECT_SERVICES_SCRIPT = `
for u in ${UNIT_LIST}; do
  en=$(systemctl is-enabled "$u" 2>/dev/null || echo missing)
  st=$(systemctl is-active "$u" 2>/dev/null || echo missing)
  printf 'svc\\t%s\\t%s\\t%s\\n' "$u" "$en" "$st"
done
systemctl list-units --type=service --state=failed --no-legend --plain 2>/dev/null | head -20 | while IFS= read -r line; do
  [ -n "$line" ] && printf 'failed\\t%s\\n' "$line"
done
`.trim();

/** systemctl-Zeile → Unit-Name (● foo.service … → foo.service) */
export function parseFailedUnitName(line: string): string | null {
  const cleaned = line.replace(/^[●○•\s]+/, "").trim();
  if (!cleaned) return null;
  const match = cleaned.match(/^([a-zA-Z0-9@._+-]+\.service)\b/);
  if (match) return match[1];
  const first = cleaned.split(/\s+/)[0];
  return first && first !== "●" ? first : null;
}

export type ServiceRow = {
  unit: string;
  label: string;
  /** Resolved unit name that matched (ssh vs sshd). */
  resolvedUnit: string | null;
  enabled: boolean;
  running: boolean;
  enableState: string;
  activeState: string;
  required: boolean;
  /** Installed / known to systemd (not missing on both names). */
  present: boolean;
};

export type WatchedService = {
  unit: string;
  label: string;
  state: string;
  ok: boolean;
};

type UnitProbe = { enableState: string; activeState: string };

export function parseServicesOutput(stdout: string): {
  probes: Record<string, UnitProbe>;
  failedUnits: string[];
} {
  const probes: Record<string, UnitProbe> = {};
  const failedUnits: string[] = [];

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("svc\t")) {
      const [, unit, enableState, activeState] = trimmed.split("\t");
      if (unit && enableState && activeState) {
        probes[unit] = { enableState, activeState };
      }
    } else if (trimmed.startsWith("unit\t")) {
      // Legacy mock / old script: unit\tname\tactiveState
      const [, unit, activeState] = trimmed.split("\t");
      if (unit && activeState) {
        probes[unit] = {
          enableState:
            activeState === "active" ? "enabled" : probes[unit]?.enableState ?? "unknown",
          activeState,
        };
      }
    } else if (trimmed.startsWith("failed\t")) {
      const raw = trimmed.slice("failed\t".length);
      const name = parseFailedUnitName(raw) ?? raw;
      if (name && name !== "●") failedUnits.push(name);
    }
  }

  return { probes, failedUnits };
}

function isEnabledState(state: string): boolean {
  return state === "enabled" || state === "enabled-runtime" || state === "static";
}

function isRunningState(state: string): boolean {
  return state === "active";
}

function isPresentState(en: string, st: string): boolean {
  return en !== "missing" || (st !== "missing" && st !== "");
}

export function buildServiceRows(
  probes: Record<string, UnitProbe>,
): ServiceRow[] {
  return SERVICE_CATALOG.map((spec) => {
    const candidates = [spec.unit, ...(spec.alt ?? [])];
    let best: UnitProbe | null = null;
    let resolved: string | null = null;
    for (const name of candidates) {
      const p = probes[name];
      if (!p) continue;
      if (!best || isRunningState(p.activeState) || isEnabledState(p.enableState)) {
        best = p;
        resolved = name;
        if (isRunningState(p.activeState)) break;
      }
    }
    const enableState = best?.enableState ?? "missing";
    const activeState = best?.activeState ?? "missing";
    const present = best ? isPresentState(enableState, activeState) : false;
    return {
      unit: spec.unit,
      label: spec.label,
      resolvedUnit: resolved,
      enabled: present && isEnabledState(enableState),
      running: present && isRunningState(activeState),
      enableState,
      activeState,
      required: Boolean(spec.required),
      present,
    };
  });
}

export async function runServicesCheck(serverId: string): Promise<CheckResult> {
  void serverId;
  const ssh = await getSshClient(serverId);
  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";

  const { stdout } = await ssh.exec(COLLECT_SERVICES_SCRIPT);
  const { probes, failedUnits: allFailed } = parseServicesOutput(stdout);
  const expectedFailed = getExpectedFailedUnits();
  const failedUnits = allFailed.filter(
    (u) => !expectedFailed.some((e) => u === e || u.startsWith(`${e}.`)),
  );
  const ignoredFailed = allFailed.filter((u) => !failedUnits.includes(u));
  const rows = buildServiceRows(probes);

  // Back-compat for monitor tile / older UI
  const watched: WatchedService[] = rows
    .filter((r) => r.required)
    .map((r) => ({
      unit: r.unit,
      label: r.label,
      state: r.running ? "active" : r.activeState,
      ok: r.running,
    }));

  for (const row of rows) {
    if (!row.required) continue;
    if (row.running) continue;
    const isDocker = row.unit === "docker";
    status = isDocker
      ? "critical"
      : status === "critical"
        ? "critical"
        : "warning";
    alerts.push({
      level: isDocker ? "critical" : "warning",
      message: `${row.label} läuft nicht (Status: ${row.activeState})`,
      recommendation: serviceRecommendation(row.unit, row.activeState),
    });
  }

  // Optional service: enabled but crashed → warning
  for (const row of rows) {
    if (row.required || !row.present) continue;
    if (row.enabled && !row.running) {
      status = status === "critical" ? "critical" : "warning";
      alerts.push({
        level: "warning",
        message: `${row.label} ist aktiviert, läuft aber nicht (${row.activeState})`,
        recommendation: `systemctl status ${row.resolvedUnit ?? row.unit} && systemctl start ${row.resolvedUnit ?? row.unit}`,
      });
    }
  }

  if (failedUnits.length > 0) {
    status = status === "critical" ? "critical" : "warning";
    const listed = failedUnits.slice(0, 5).join(", ");
    const primary = failedUnits[0];
    alerts.push({
      level: "warning",
      message: `systemd failed: ${listed}${failedUnits.length > 5 ? ` (+${failedUnits.length - 5} weitere)` : ""}`,
      recommendation: primary
        ? `Auf dem Server: systemctl status ${primary} && journalctl -u ${primary} -n 40 --no-pager`
        : "systemctl --failed",
    });
  }

  return {
    module: "services",
    status,
    data: {
      rows,
      watched,
      dockerActive: rows.find((r) => r.unit === "docker")?.running ?? false,
      failedUnits,
      failedUnitNames: failedUnits,
      ignoredFailedUnits: ignoredFailed,
      failedCount: failedUnits.length,
    },
    alerts,
  };
}

function serviceRecommendation(unit: string, state: string): string {
  if (unit === "docker") {
    return "systemctl status docker && systemctl start docker — ohne Docker laufen keine Container-Checks";
  }
  if (unit === "fail2ban") {
    return "systemctl start fail2ban && systemctl enable fail2ban — SSH-Bruteforce wird sonst nicht geblockt";
  }
  if (unit === "ssh") {
    return state === "missing"
      ? "Prüfen ob ssh.service oder sshd.service existiert: systemctl list-units 'ssh*'"
      : "systemctl start ssh — ohne SSH kein Remote-Zugang zum Server";
  }
  return `systemctl start ${unit} falls der Dienst laufen soll`;
}
