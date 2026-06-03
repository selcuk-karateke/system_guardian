import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

export async function runDatabaseCheck(serverId: string): Promise<CheckResult> {
  void serverId;
  const ssh = getSshClient();
  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";
  const databases: Record<string, unknown> = {};

  const pgCmd =
    "docker exec coolify-db psql -U coolify -d coolify -t -c \"SELECT pg_database_size(datname) FROM pg_database WHERE datname=current_database();\" 2>/dev/null || echo 'pg_fail'";
  const mysqlCmd =
    "docker exec $(docker ps --format '{{.Names}}' | grep -i mysql | head -1) mysql -e 'SELECT 1' 2>/dev/null || echo 'mysql_skip'";

  const [pg, mysql] = await Promise.all([
    ssh.exec(pgCmd),
    ssh.exec(mysqlCmd),
  ]);

  if (pg.stdout.includes("pg_fail") || pg.code !== 0) {
    alerts.push({
      level: "warning",
      message: "PostgreSQL check skipped or failed",
      recommendation: "Verify coolify-db container and credentials",
    });
    if (status === "healthy") status = "warning";
    databases.postgresql = { ok: false };
  } else {
    const size = parseInt(pg.stdout.trim(), 10) || 0;
    databases.postgresql = { ok: true, sizeBytes: size };
    if (size > 50 * 1024 ** 3) {
      alerts.push({
        level: "warning",
        message: "PostgreSQL database unusually large",
      });
      status = "warning";
    }
  }

  if (!mysql.stdout.includes("mysql_skip") && mysql.code === 0) {
    databases.mysql = { ok: true };
  } else {
    databases.mysql = { ok: false, skipped: true };
  }

  return {
    module: "database",
    status,
    data: { databases },
    alerts,
  };
}
