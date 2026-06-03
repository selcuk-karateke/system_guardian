import { getKnownPorts } from "@/lib/checks/allowlists";
import { diffStringSets } from "@/lib/history/diff";
import { diffAndStore } from "@/lib/history/persist";
import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

function parseListeningPorts(stdout: string): string[] {
  const ports: string[] = [];
  for (const line of stdout.split("\n")) {
    const m = line.match(/:(\d+)\s/);
    if (m && line.includes("LISTEN")) {
      ports.push(m[1]);
    }
  }
  return [...new Set(ports)].sort();
}

export async function runPortsCheck(serverId: string): Promise<CheckResult> {
  const ssh = getSshClient();
  const { stdout } = await ssh.exec("ss -tulpn 2>/dev/null || netstat -tulpn");
  const ports = parseListeningPorts(stdout);
  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";

  const knownPorts = getKnownPorts();
  const { diffs, isBaseline } = await diffAndStore(
    serverId,
    "ports",
    { ports },
    (prev, curr) => {
      const prevPorts = (prev?.ports as string[]) ?? [];
      const currPorts = curr.ports as string[];
      return diffStringSets(prevPorts, currPorts);
    },
  );

  if (isBaseline) {
    alerts.push({
      level: "info",
      message: `Ports baseline recorded (${ports.length} listener(s))`,
    });
  }

  for (const d of diffs) {
    if (d.changeType === "added") {
      if (knownPorts.has(d.entityKey)) continue;
      status = "warning";
      alerts.push({
        level: "warning",
        message: `New unknown port detected: ${d.entityKey}`,
        recommendation: "Verify service is intentional and firewall rules",
      });
    }
  }

  return {
    module: "ports",
    status,
    data: { ports, count: ports.length },
    alerts,
  };
}
