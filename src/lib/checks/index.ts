import { runCheckWithPersist } from "@/lib/alerts/pipeline";
import {
  parseMonitorProfile,
  profileAllowsModule,
  type MonitorProfile,
} from "@/lib/monitor-profiles";
import { getServerById } from "@/lib/servers";
import type { CheckResult, CheckRunner } from "./types";
import { runBackupsCheck } from "./backups";
import { runCoolifyCheck } from "./coolify";
import { runCronCheck } from "./cron";
import { runFimCheck } from "./fim";
import { runSecurityPostureCheck } from "./incident-clearance";
import { runServicesCheck } from "./services";
import { runDatabaseCheck } from "./database";
import { runDockerCheck } from "./docker";
import { runLoginsCheck } from "./logins";
import { runLogsCheck } from "./logs";
import { runNetworkCheck } from "./network";
import { runProcessesCheck } from "./processes";
import { runPortsCheck } from "./ports";
import { runRaidCheck } from "./raid";
import { runScannerCheck } from "./scanner";
import { runServerHealthCheck } from "./server-health";
import { runSslCheck } from "./ssl";
import { runSshKeysCheck } from "./ssh-keys";
import { runUsersCheck } from "./users";
import { runWebPresenceCheck } from "./web-presence";
import { runTrivyCheck } from "./trivy";
import { runWebsiteCheck } from "./website";

export type NamedCheck = { module: string; run: CheckRunner };

export const SERVER_CHECKS = [
  { module: "server_health", run: runServerHealthCheck },
  { module: "raid", run: runRaidCheck },
  { module: "docker", run: runDockerCheck },
  { module: "coolify", run: runCoolifyCheck },
  { module: "database", run: runDatabaseCheck },
  { module: "ssl", run: runSslCheck },
  { module: "website", run: runWebsiteCheck },
  { module: "ports", run: runPortsCheck },
  { module: "backups", run: runBackupsCheck },
  { module: "logs", run: runLogsCheck },
] as const;

export const SECURITY_CHECKS = [
  { module: "fim", run: runFimCheck },
  { module: "ssh_keys", run: runSshKeysCheck },
  { module: "users", run: runUsersCheck },
  { module: "logins", run: runLoginsCheck },
  { module: "web_presence", run: runWebPresenceCheck },
  { module: "cron", run: runCronCheck },
  { module: "processes", run: runProcessesCheck },
  { module: "network", run: runNetworkCheck },
  { module: "scanner", run: runScannerCheck },
  { module: "services", run: runServicesCheck },
  { module: "security_posture", run: runSecurityPostureCheck },
  { module: "trivy", run: runTrivyCheck },
] as const;

async function resolveProfile(serverId: string): Promise<MonitorProfile> {
  const server = await getServerById(serverId);
  return parseMonitorProfile(server?.monitorProfile);
}

function filterChecks(
  checks: readonly NamedCheck[],
  profile: MonitorProfile,
): NamedCheck[] {
  return checks.filter((c) => profileAllowsModule(profile, c.module));
}

export async function runServerCheckBatch(
  serverId: string,
): Promise<CheckResult[]> {
  const profile = await resolveProfile(serverId);
  const results: CheckResult[] = [];
  for (const { run } of filterChecks(SERVER_CHECKS, profile)) {
    results.push(await runCheckWithPersist(serverId, run));
  }
  return results;
}

export async function runSecurityCheckBatch(
  serverId: string,
): Promise<CheckResult[]> {
  const profile = await resolveProfile(serverId);
  const results: CheckResult[] = [];
  for (const { run } of filterChecks(SECURITY_CHECKS, profile)) {
    results.push(await runCheckWithPersist(serverId, run));
  }
  return results;
}

export type { CheckResult, AlertInput, CheckStatus } from "./types";
