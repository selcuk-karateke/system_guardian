import { eq } from "drizzle-orm";
import { db } from "@/db";
import { servers } from "@/db/schema";
import { getServerById } from "@/lib/servers";

const DEFAULT_PATHS =
  "/backups/daily,/backups/monthly,/data/coolify/backups";
const DEFAULT_MONITORING = "/backups/monitoring";

export type ServerBackupConfig = {
  paths: string[];
  /** Empty string = monitoring JSON checks disabled */
  monitoringDir: string;
  triggerCommand: string;
};

function splitPaths(raw: string): string[] {
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

export async function resolveBackupConfig(
  serverId: string,
): Promise<ServerBackupConfig> {
  const server = await getServerById(serverId);
  const fallbackPaths = splitPaths(DEFAULT_PATHS);

  if (!server) {
    return {
      paths: fallbackPaths,
      monitoringDir: DEFAULT_MONITORING,
      triggerCommand: "",
    };
  }

  const paths =
    server.backupPaths != null
      ? splitPaths(server.backupPaths)
      : fallbackPaths;
  const monitoringDir =
    server.backupMonitoringDir != null
      ? server.backupMonitoringDir.trim()
      : DEFAULT_MONITORING;
  const triggerCommand =
    server.backupTriggerCommand != null
      ? server.backupTriggerCommand.trim()
      : "";

  return {
    paths: paths.length > 0 ? paths : fallbackPaths,
    monitoringDir,
    triggerCommand,
  };
}

export type UpdateServerBackupInput = {
  paths?: string | null;
  monitoringDir?: string | null;
  triggerCommand?: string | null;
  clearTrigger?: boolean;
};

export async function updateServerBackup(
  serverId: string,
  input: UpdateServerBackupInput,
) {
  const [existing] = await db
    .select()
    .from(servers)
    .where(eq(servers.id, serverId))
    .limit(1);
  if (!existing) return null;

  const patch: Partial<typeof servers.$inferInsert> = {};

  if (input.paths !== undefined) {
    const joined = (input.paths ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .join(",");
    patch.backupPaths = joined || null;
  }
  if (input.monitoringDir !== undefined) {
    patch.backupMonitoringDir = input.monitoringDir?.trim() || null;
  }
  if (input.clearTrigger) {
    patch.backupTriggerCommand = null;
  } else if (input.triggerCommand !== undefined) {
    patch.backupTriggerCommand = input.triggerCommand?.trim() || null;
  }

  if (Object.keys(patch).length === 0) return existing;

  const [updated] = await db
    .update(servers)
    .set(patch)
    .where(eq(servers.id, serverId))
    .returning();
  return updated;
}
