import { diffHashMaps, diffStringSets } from "@/lib/history/diff";
import { diffAndStore } from "@/lib/history/persist";
import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

interface DockerRow {
  ID: string;
  Names: string;
  Image: string;
  Status: string;
  State: string;
}

function parseDockerLines(stdout: string): DockerRow[] {
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as DockerRow;
      } catch {
        return null;
      }
    })
    .filter((r): r is DockerRow => r !== null);
}

export async function runDockerCheck(serverId: string): Promise<CheckResult> {
  const ssh = getSshClient();
  const { stdout } = await ssh.exec(
    "docker ps -a --format '{{json .}}' 2>/dev/null || docker ps -a --format '{{json .}}'",
  );
  const containers = parseDockerLines(stdout);
  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";

  const running = containers.filter((c) => c.State === "running");
  const stopped = containers.filter((c) => c.State !== "running");

  for (const c of containers) {
    if (c.State === "exited") {
      status = status === "critical" ? "critical" : "warning";
      alerts.push({
        level: "warning",
        message: `Container ${c.Names} exited`,
        recommendation: "Inspect logs: docker logs " + c.Names,
      });
    }
    if (c.Status.toLowerCase().includes("restarting")) {
      status = "critical";
      alerts.push({
        level: "critical",
        message: `Container ${c.Names} restart loop`,
      });
    }
    if (c.Status.toLowerCase().includes("unhealthy")) {
      status = "critical";
      alerts.push({
        level: "critical",
        message: `Container ${c.Names} unhealthy`,
      });
    }
  }

  const containerMap: Record<string, string> = {};
  for (const c of containers) {
    containerMap[c.Names] = `${c.Image}|${c.ID}`;
  }

  const diffs = await diffAndStore(
    serverId,
    "docker_containers",
    { containers: containerMap },
    (prev, curr) => {
      const prevMap = (prev?.containers as Record<string, string>) ?? {};
      const currMap = curr.containers as Record<string, string>;
      const hashDiffs = diffHashMaps(prevMap, currMap);
      const containerDiffs = diffStringSets(
        Object.keys(prevMap),
        Object.keys(currMap),
      );
      return [...hashDiffs, ...containerDiffs];
    },
  );

  for (const d of diffs) {
    if (d.changeType === "added") {
      alerts.push({
        level: "info",
        message: `New container: ${d.entityKey}`,
      });
    } else if (d.changeType === "removed") {
      alerts.push({
        level: "warning",
        message: `Container removed: ${d.entityKey}`,
      });
    } else if (d.changeType === "changed") {
      alerts.push({
        level: "warning",
        message: `Container ${d.entityKey} image changed`,
      });
    }
  }

  return {
    module: "docker",
    status,
    data: {
      running: running.length,
      stopped: stopped.length,
      total: containers.length,
      containers,
    },
    alerts,
  };
}
