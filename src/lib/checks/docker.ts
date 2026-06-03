import { isExpectedStoppedContainer } from "@/lib/config";
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
  const checkMode = process.env.CHECK_MODE ?? "mock";
  const { stdout, stderr, code } = await ssh.exec(
    "docker ps -a --format '{{json .}}' 2>&1",
  );
  const containers = parseDockerLines(stdout);

  if (
    containers.length === 0 &&
    (code !== 0 ||
      /Cannot connect|not found|permission denied/i.test(stdout + stderr))
  ) {
    return {
      module: "docker",
      status: "critical",
      data: {
        checkMode,
        dockerAvailable: false,
        error: (stderr || stdout).trim().slice(0, 200),
      },
      alerts: [
        {
          level: "critical",
          message: "Docker nicht erreichbar auf dem Ziel-Host",
          recommendation:
            "Prüfe ob Docker läuft, SSH-User in Gruppe docker ist, oder CHECK_MODE=mock für lokale Entwicklung",
        },
      ],
    };
  }

  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";

  const running = containers.filter((c) => c.State === "running");
  const stoppedExpected: string[] = [];
  const stoppedUnexpected: string[] = [];

  for (const c of containers) {
    if (c.State === "running") continue;

    if (c.Status.toLowerCase().includes("restarting")) {
      status = "critical";
      alerts.push({
        level: "critical",
        message: `Container ${c.Names} restart loop`,
      });
      continue;
    }

    if (c.Status.toLowerCase().includes("unhealthy")) {
      status = "critical";
      alerts.push({
        level: "critical",
        message: `Container ${c.Names} unhealthy`,
      });
      continue;
    }

    if (c.State === "exited" || c.State === "dead") {
      if (isExpectedStoppedContainer(c.Names)) {
        stoppedExpected.push(c.Names);
      } else {
        stoppedUnexpected.push(c.Names);
        if (status !== "critical") status = "warning";
        alerts.push({
          level: "warning",
          message: `Container ${c.Names} stopped unexpectedly`,
          recommendation: "Inspect logs: docker logs " + c.Names,
        });
      }
    }
  }

  const containerMap: Record<string, string> = {};
  for (const c of containers) {
    containerMap[c.Names] = `${c.Image}|${c.ID}`;
  }

  const { diffs, isBaseline } = await diffAndStore(
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

  if (isBaseline) {
    alerts.push({
      level: "info",
      message: `Docker baseline recorded (${containers.length} container(s))`,
    });
  }

  for (const d of diffs) {
    if (d.changeType === "added") {
      alerts.push({
        level: "info",
        message: `New container: ${d.entityKey}`,
      });
    } else if (d.changeType === "removed") {
      alerts.push({
        level: "info",
        message: `Container removed: ${d.entityKey}`,
      });
    } else if (d.changeType === "changed") {
      alerts.push({
        level: "info",
        message: `Container ${d.entityKey} image changed`,
      });
    }
  }

  return {
    module: "docker",
    status,
    data: {
      checkMode,
      dockerAvailable: true,
      running: running.length,
      stopped: stoppedExpected.length + stoppedUnexpected.length,
      stoppedExpected,
      stoppedUnexpected,
      total: containers.length,
      containers,
    },
    alerts,
  };
}
