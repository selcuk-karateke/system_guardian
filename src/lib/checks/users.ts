import { diffAndStore } from "@/lib/history/persist";
import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

function parsePasswd(stdout: string): Record<string, { uid: number; shell: string }> {
  const users: Record<string, { uid: number; shell: string }> = {};
  for (const line of stdout.split("\n").filter(Boolean)) {
    const parts = line.split(":");
    if (parts.length < 7) continue;
    users[parts[0]] = {
      uid: parseInt(parts[2], 10),
      shell: parts[6],
    };
  }
  return users;
}

export async function runUsersCheck(serverId: string): Promise<CheckResult> {
  const ssh = getSshClient();
  const { stdout } = await ssh.exec("cat /etc/passwd");
  const users = parsePasswd(stdout);
  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";

  const diffs = await diffAndStore(
    serverId,
    "users",
    { users },
    (prev, curr) => {
      const prevU = (prev?.users as Record<string, { uid: number }>) ?? {};
      const currU = curr.users as Record<string, { uid: number }>;
      const items = [];
      for (const name of Object.keys(currU)) {
        if (!prevU[name]) {
          items.push({
            changeType: "added" as const,
            entityKey: name,
            newValue: String(currU[name].uid),
          });
        }
      }
      for (const name of Object.keys(prevU)) {
        if (!currU[name]) {
          items.push({
            changeType: "removed" as const,
            entityKey: name,
          });
        }
      }
      return items;
    },
  );

  for (const d of diffs) {
    if (d.changeType === "added") {
      const uid = users[d.entityKey]?.uid;
      if (uid === 0) {
        status = "critical";
        alerts.push({
          level: "critical",
          message: `New root-privileged user: ${d.entityKey}`,
        });
      } else {
        if (status !== "critical") status = "warning";
        alerts.push({
          level: "warning",
          message: `New system user: ${d.entityKey}`,
        });
      }
    } else if (d.changeType === "removed") {
      if (status !== "critical") status = "warning";
      alerts.push({
        level: "warning",
        message: `User removed: ${d.entityKey}`,
      });
    }
  }

  return {
    module: "users",
    status,
    data: { userCount: Object.keys(users).length, users },
    alerts,
  };
}
