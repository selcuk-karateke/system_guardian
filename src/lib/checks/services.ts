import { getExpectedFailedUnits } from "@/lib/config";
import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

/** Dienste, die auf dem Produktionsserver aktiv sein müssen. */
const REQUIRED_SERVICES: { unit: string; label: string; alt?: string }[] = [
  { unit: "docker", label: "Docker" },
  { unit: "fail2ban", label: "fail2ban" },
  { unit: "ssh", label: "SSH (OpenSSH)", alt: "sshd" },
];

const COLLECT_SERVICES_SCRIPT = `
for u in docker fail2ban ssh sshd; do
  st=$(systemctl is-active "$u" 2>/dev/null || echo missing)
  printf 'unit\\t%s\\t%s\\n' "$u" "$st"
done
systemctl list-units --type=service --state=failed --no-legend --plain 2>/dev/null | head -20 | while IFS= read -r name; do
  [ -n "$name" ] && printf 'failed\\t%s\\n' "$name"
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

export type WatchedService = {
  unit: string;
  label: string;
  state: string;
  ok: boolean;
};

function parseServicesOutput(stdout: string): {
  unitStates: Record<string, string>;
  failedUnits: string[];
} {
  const unitStates: Record<string, string> = {};
  const failedUnits: string[] = [];

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("unit\t")) {
      const [, unit, state] = trimmed.split("\t");
      if (unit && state) unitStates[unit] = state;
    } else if (trimmed.startsWith("failed\t")) {
      const raw = trimmed.slice("failed\t".length);
      const name = parseFailedUnitName(raw) ?? raw;
      if (name && name !== "●") failedUnits.push(name);
    }
  }

  return { unitStates, failedUnits };
}

function resolveRequiredState(
  spec: (typeof REQUIRED_SERVICES)[number],
  unitStates: Record<string, string>,
): WatchedService {
  const primary = unitStates[spec.unit];
  const alt = spec.alt ? unitStates[spec.alt] : undefined;
  const state =
    primary === "active"
      ? "active"
      : alt === "active"
        ? "active"
        : (primary ?? alt ?? "missing");
  return {
    unit: spec.unit,
    label: spec.label,
    state,
    ok: state === "active",
  };
}

export async function runServicesCheck(serverId: string): Promise<CheckResult> {
  void serverId;
  const ssh = await getSshClient(serverId);
  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";

  const { stdout } = await ssh.exec(COLLECT_SERVICES_SCRIPT);
  const { unitStates, failedUnits: allFailed } = parseServicesOutput(stdout);
  const expectedFailed = getExpectedFailedUnits();
  const failedUnits = allFailed.filter(
    (u) => !expectedFailed.some((e) => u === e || u.startsWith(`${e}.`)),
  );
  const ignoredFailed = allFailed.filter((u) => !failedUnits.includes(u));
  const watched = REQUIRED_SERVICES.map((spec) =>
    resolveRequiredState(spec, unitStates),
  );

  for (const svc of watched) {
    if (svc.ok) continue;
    const isDocker = svc.unit === "docker";
    status = isDocker ? "critical" : status === "critical" ? "critical" : "warning";
    alerts.push({
      level: isDocker ? "critical" : "warning",
      message: `${svc.label} läuft nicht (Status: ${svc.state})`,
      recommendation: serviceRecommendation(svc.unit, svc.state),
    });
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
      watched,
      dockerActive: watched.find((w) => w.unit === "docker")?.ok ?? false,
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
