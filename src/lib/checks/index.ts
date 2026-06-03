import { runCheckWithPersist } from "@/lib/alerts/pipeline";
import type { CheckResult } from "./types";
import { runBackupsCheck } from "./backups";
import { runCoolifyCheck } from "./coolify";
import { runCronCheck } from "./cron";
import { runDatabaseCheck } from "./database";
import { runDockerCheck } from "./docker";
import { runLoginsCheck } from "./logins";
import { runLogsCheck } from "./logs";
import { runNetworkCheck } from "./network";
import { runPortsCheck } from "./ports";
import { runRaidCheck } from "./raid";
import { runScannerCheck } from "./scanner";
import { runServerHealthCheck } from "./server-health";
import { runSslCheck } from "./ssl";
import { runSshKeysCheck } from "./ssh-keys";
import { runUsersCheck } from "./users";
import { runWebsiteCheck } from "./website";

export const SERVER_CHECKS = [
  runServerHealthCheck,
  runRaidCheck,
  runDockerCheck,
  runCoolifyCheck,
  runDatabaseCheck,
  runSslCheck,
  runWebsiteCheck,
  runPortsCheck,
  runBackupsCheck,
  runLogsCheck,
] as const;

export const SECURITY_CHECKS = [
  runSshKeysCheck,
  runUsersCheck,
  runLoginsCheck,
  runCronCheck,
  runNetworkCheck,
  runScannerCheck,
] as const;

export async function runServerCheckBatch(
  serverId: string,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const runner of SERVER_CHECKS) {
    results.push(await runCheckWithPersist(serverId, runner));
  }
  return results;
}

export async function runSecurityCheckBatch(
  serverId: string,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const runner of SECURITY_CHECKS) {
    results.push(await runCheckWithPersist(serverId, runner));
  }
  return results;
}

export type { CheckResult, AlertInput, CheckStatus } from "./types";
