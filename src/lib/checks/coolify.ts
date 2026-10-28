import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

type CoolifyServiceSpec = {
  key: string;
  /** required → missing/down = CRITICAL; optional → only alert if present but not running */
  required: boolean;
  match: (n: string) => boolean;
};

/** Core Coolify stack. Realtime is optional (many installs omit it; UI still works). */
export const COOLIFY_SERVICES: CoolifyServiceSpec[] = [
  {
    key: "coolify",
    required: true,
    match: (n) =>
      n === "coolify" || (n.startsWith("coolify") && !n.includes("-")),
  },
  {
    key: "coolify-db",
    required: true,
    match: (n) =>
      n.includes("coolify-db") ||
      (n.includes("postgres") && n.includes("coolify")),
  },
  {
    key: "coolify-redis",
    required: true,
    match: (n) => n.includes("coolify-redis") || n === "redis",
  },
  {
    key: "coolify-proxy",
    required: true,
    match: (n) =>
      n === "coolify-proxy" ||
      n === "traefik" ||
      (n.includes("traefik") && !n.includes("error")),
  },
  {
    key: "coolify-realtime",
    required: false,
    match: (n) => n.includes("realtime"),
  },
  {
    key: "coolify-sentinel",
    required: false,
    match: (n) => n.includes("sentinel"),
  },
];

export type CoolifyEval = {
  services: Record<string, string>;
  alerts: AlertInput[];
  status: CheckResult["status"];
};

/** Pure evaluation for tests / reuse. */
export function evaluateCoolifyServices(
  containers: Array<{ Names: string; State: string }>,
): CoolifyEval {
  const found: Record<string, string> = {};

  for (const row of containers) {
    const name = row.Names.toLowerCase();
    if (!name.includes("coolify") && !name.includes("traefik")) continue;
    for (const { key, match } of COOLIFY_SERVICES) {
      if (match(name)) found[key] = row.State;
    }
  }

  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";

  const bump = (level: "warning" | "critical") => {
    if (level === "critical") status = "critical";
    else if (status === "healthy") status = "warning";
  };

  for (const { key, required } of COOLIFY_SERVICES) {
    const state = found[key];
    if (state === "running") continue;

    if (required) {
      bump("critical");
      alerts.push({
        level: "critical",
        message: `Coolify service ${key} is down or missing`,
        recommendation: `Check container: docker ps -a | grep ${key}`,
      });
      continue;
    }

    // Optional: silence when absent; warn only if installed but unhealthy.
    if (state != null && state !== "running") {
      bump("warning");
      alerts.push({
        level: "warning",
        message: `Coolify optional service ${key} is ${state}`,
        recommendation: `Check container: docker ps -a | grep ${key}`,
      });
    }
  }

  return { services: found, alerts, status };
}

export async function runCoolifyCheck(serverId: string): Promise<CheckResult> {
  const ssh = await getSshClient(serverId);
  const { stdout } = await ssh.exec("docker ps -a --format '{{json .}}'");
  const containers: Array<{ Names: string; State: string }> = [];

  for (const line of stdout.split("\n").filter(Boolean)) {
    try {
      const row = JSON.parse(line) as { Names: string; State: string };
      containers.push(row);
    } catch {
      /* skip */
    }
  }

  const { services, alerts, status } = evaluateCoolifyServices(containers);

  return {
    module: "coolify",
    status,
    data: { services },
    alerts,
  };
}
