import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

const COOLIFY_PATTERNS = [
  { key: "coolify", match: (n: string) => n === "coolify" || (n.startsWith("coolify") && !n.includes("-")) },
  { key: "coolify-realtime", match: (n: string) => n.includes("realtime") },
  { key: "coolify-db", match: (n: string) => n.includes("-db") || n.includes("postgres") && n.includes("coolify") },
  { key: "coolify-redis", match: (n: string) => n.includes("redis") },
  { key: "coolify-proxy", match: (n: string) => n.includes("proxy") || n.includes("traefik") },
];

export async function runCoolifyCheck(serverId: string): Promise<CheckResult> {
  void serverId;
  const ssh = getSshClient();
  const { stdout } = await ssh.exec("docker ps -a --format '{{json .}}'");
  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";
  const found: Record<string, string> = {};

  for (const line of stdout.split("\n").filter(Boolean)) {
    try {
      const row = JSON.parse(line) as { Names: string; State: string };
      const name = row.Names.toLowerCase();
      if (!name.includes("coolify") && !name.includes("traefik")) continue;
      for (const { key, match } of COOLIFY_PATTERNS) {
        if (match(name)) found[key] = row.State;
      }
    } catch {
      /* skip */
    }
  }

  for (const { key } of COOLIFY_PATTERNS) {
    if (found[key] !== "running") {
      status = "critical";
      alerts.push({
        level: "critical",
        message: `Coolify service ${key} is down or missing`,
        recommendation: `Check container: docker ps -a | grep ${key}`,
      });
    }
  }

  return {
    module: "coolify",
    status,
    data: { services: found },
    alerts,
  };
}
