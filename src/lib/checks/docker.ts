import {
  getKnownDockerImagePrefixes,
  isExpectedStoppedContainer,
  isMigrateOneShotContainer,
  parseDockerExitedCode,
  THRESHOLDS,
} from "@/lib/config";
import {
  classifyContainer,
  summarizeInventory,
} from "./docker-inventory";
import {
  fetchCoolifyMetadata,
  formatContainerAlert,
  formatContainerDisplay,
  getCoolifyMeta,
  type CoolifyMeta,
} from "./coolify-meta";
import { filterRoutineCoolifyDiffs, isCoolifyManagedContainer } from "./coolify-deploy";
import {
  isDockerStatusRestarting,
  isDockerStatusUnhealthy,
  unhealthyAlertLevel,
} from "./docker-health";
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
  displayName?: string;
  coolify?: CoolifyMeta;
}

interface DockerStatRow {
  Name: string;
  CPUPerc: string;
  MemPerc: string;
}

function parseDockerStatLines(stdout: string): DockerStatRow[] {
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as DockerStatRow;
      } catch {
        return null;
      }
    })
    .filter((r): r is DockerStatRow => r !== null && Boolean(r.Name));
}

function parsePercent(value: string | undefined): number {
  if (!value) return 0;
  return parseFloat(value.replace("%", "").trim()) || 0;
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
  const checkMode = process.env.CHECK_MODE ?? "mock";
  const ssh = await getSshClient(serverId);
  const { stdout, stderr, code } = await ssh.exec(
    "docker ps -a --format '{{json .}}' 2>&1",
  );
  const rawContainers = parseDockerLines(stdout);
  let coolifyMeta = new Map<string, CoolifyMeta>();
  try {
    coolifyMeta = await fetchCoolifyMetadata((cmd, t) => ssh.exec(cmd, t));
  } catch {
    /* inspect optional */
  }

  const containers: DockerRow[] = rawContainers.map((c) => {
    const meta = getCoolifyMeta(coolifyMeta, c.Names);
    const display = formatContainerDisplay(c.Names, meta);
    return {
      ...c,
      coolify: meta,
      displayName: display !== c.Names ? display : undefined,
    };
  });

  const label = (name: string) =>
    formatContainerAlert(name, getCoolifyMeta(coolifyMeta, name));

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
    // HEALTHCHECK: oft State=running + Status "Up … (unhealthy)"
    if (isDockerStatusUnhealthy(c.Status, c.State)) {
      const level = unhealthyAlertLevel(c.State);
      if (level === "critical") status = "critical";
      else if (status === "healthy") status = "warning";
      alerts.push({
        level,
        message: `Container ${label(c.Names)} unhealthy`,
        recommendation: `docker inspect --format '{{.State.Health}}' ${c.Names}; docker logs --tail 100 ${c.Names}`,
      });
      if (c.State === "running") continue;
    }

    if (isDockerStatusRestarting(c.Status, c.State)) {
      status = "critical";
      alerts.push({
        level: "critical",
        message: `Container ${label(c.Names)} restart loop`,
      });
      continue;
    }

    if (c.State === "running") continue;

    if (c.State === "exited" || c.State === "dead") {
      if (isExpectedStoppedContainer(c.Names)) {
        stoppedExpected.push(c.Names);
        continue;
      }
      if (isMigrateOneShotContainer(c.Names)) {
        const exitCode = parseDockerExitedCode(c.Status);
        if (exitCode === 0 || exitCode == null) {
          // null: Status ohne Code — trotzdem als One-Shot behandeln (kein Panic)
          stoppedExpected.push(c.Names);
          continue;
        }
        stoppedUnexpected.push(c.Names);
        if (status !== "critical") status = "warning";
        alerts.push({
          level: "warning",
          message: `Container ${label(c.Names)} migrate failed (exit ${exitCode})`,
          recommendation: `Inspect logs: docker logs ${c.Names}`,
        });
        continue;
      }
      stoppedUnexpected.push(c.Names);
      if (status !== "critical") status = "warning";
      alerts.push({
        level: "warning",
        message: `Container ${label(c.Names)} stopped unexpectedly`,
        recommendation: `Inspect logs: docker logs ${c.Names}`,
      });
    }
  }

  const containerMap: Record<string, string> = {};
  const coolifyPayload: Record<string, CoolifyMeta> = {};
  for (const c of containers) {
    containerMap[c.Names] = `${c.Image}|${c.ID}`;
    if (c.coolify && Object.keys(c.coolify).length > 0) {
      coolifyPayload[c.Names] = c.coolify;
    }
  }

  const { diffs, isBaseline } = await diffAndStore(
    serverId,
    "docker_containers",
    { containers: containerMap, coolify: coolifyPayload },
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

  const knownPrefixes = getKnownDockerImagePrefixes();
  const classified = containers.map((c) => {
    const row = classifyContainer(c.Names, c.Image, knownPrefixes, c.coolify);
    const display = formatContainerDisplay(c.Names, c.coolify);
    return {
      ...row,
      state: c.State,
      displayName: display !== c.Names ? display : undefined,
      coolify: c.coolify,
    };
  });
  const inventory = summarizeInventory(classified);

  if (inventory.wordpressRunning.length > 0) {
    if (status !== "critical") status = "warning";
    alerts.push({
      level: "warning",
      message: `WordPress: ${inventory.wordpressRunning.map((c) => c.displayName ?? c.name).join(", ")}`,
      recommendation: "Verify WordPress is intentional; check plugins and outbound traffic",
    });
  }

  if (inventory.monitoringRunning.length > 0) {
    alerts.push({
      level: "info",
      message: `Monitoring: ${inventory.monitoringRunning.map((c) => `${c.displayName ?? c.name} (${c.image})`).join(", ")}`,
    });
  }

  for (const foreign of inventory.foreignRunning) {
    status = "critical";
    alerts.push({
      level: "critical",
      message: `Unexpected container: ${label(foreign.name)} (${foreign.image})`,
      recommendation: "docker inspect + docker logs; remove if not yours",
    });
  }

  const securityDiffs = filterRoutineCoolifyDiffs(diffs, coolifyMeta);
  const containerChanges = securityDiffs.map((d) => ({
    changeType: d.changeType,
    name: d.entityKey,
    label: label(d.entityKey),
    previousValue: d.previousValue,
    newValue: d.newValue,
    coolifyManaged: isCoolifyManagedContainer(
      d.entityKey,
      getCoolifyMeta(coolifyMeta, d.entityKey),
    ),
  }));

  for (const d of securityDiffs) {
    const meta = getCoolifyMeta(coolifyMeta, d.entityKey);
    const img = containerMap[d.entityKey]?.split("|")[0] ?? "";
    if (d.changeType === "added") {
      status = "critical";
      alerts.push({
        level: "critical",
        message: `Unbekannter neuer Container: ${label(d.entityKey)}${img ? ` · ${img.split("/").pop()}` : ""}`,
        recommendation:
          "Nicht von Coolify verwaltet — prüfen wer docker run / compose gestartet hat",
      });
    } else if (d.changeType === "removed") {
      const isCoolifyName = isCoolifyManagedContainer(
        d.entityKey,
        getCoolifyMeta(coolifyMeta, d.entityKey),
      );
      alerts.push({
        level: "warning",
        message: isCoolifyName
          ? `Coolify-Container ersetzt/entfernt: ${label(d.entityKey)}`
          : `Container entfernt (nicht Coolify-Deploy): ${label(d.entityKey)}`,
        recommendation: isCoolifyName
          ? "Typisch bei Coolify-Redeploy (alter backend-* Container weg). Prüfen ob App erreichbar; sonst entschärfen."
          : "War das beabsichtigt? docker ps -a und Coolify-Deploy-Historie prüfen.",
      });
      if (status === "healthy") status = "warning";
    } else if (d.changeType === "changed") {
      alerts.push({
        level: "warning",
        message: `Container ${label(d.entityKey)} — Image/ID geändert (ohne Coolify-Routine)`,
      });
      if (status === "healthy") status = "warning";
    }
  }

  const resourceAlerts: { name: string; cpu: number; mem: number }[] = [];
  const { stdout: statsOut } = await ssh.exec(
    "docker stats --no-stream --format '{{json .}}' 2>/dev/null",
  );
  const stats = parseDockerStatLines(statsOut);
  const cpuWarn = THRESHOLDS.dockerCpuWarning();
  const memWarn = THRESHOLDS.dockerMemWarning();

  for (const s of stats) {
    const cpu = parsePercent(s.CPUPerc);
    const mem = parsePercent(s.MemPerc);
    if (cpu < cpuWarn && mem < memWarn) continue;
    resourceAlerts.push({ name: s.Name, cpu, mem });
    if (status !== "critical") status = "warning";
    alerts.push({
      level: "warning",
      message: `Container ${label(s.Name)} high resources (CPU ${cpu.toFixed(0)}%, MEM ${mem.toFixed(0)}%)`,
      recommendation: "Check docker stats; rule out miner or traffic spike",
    });
    if (resourceAlerts.length >= 5) break;
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
      resourceHotspots: resourceAlerts,
      containerChanges,
      inventory: {
        onlyCoolifyStack: inventory.onlyCoolifyStack,
        byCategory: inventory.byCategory,
        foreignRunning: inventory.foreignRunning.map((c) => ({
          name: c.name,
          displayName: c.displayName,
          image: c.image,
          project: c.coolify?.projectName,
          fqdn: c.coolify?.fqdn,
        })),
        wordpressRunning: inventory.wordpressRunning.map((c) => c.name),
        monitoringRunning: inventory.monitoringRunning.map((c) => ({
          name: c.name,
          image: c.image,
        })),
      },
    },
    alerts,
  };
}
