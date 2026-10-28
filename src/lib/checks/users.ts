import { isBuiltinUser } from "@/lib/checks/allowlists";
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

const NON_LOGIN_SHELLS = new Set([
  "/usr/sbin/nologin",
  "/sbin/nologin",
  "/bin/false",
  "/usr/bin/false",
]);

/** Login-capable accounts (root or UID >= 1000 with a real shell). */
export function isHumanPasswdUser(user: { uid: number; shell: string }): boolean {
  if (NON_LOGIN_SHELLS.has(user.shell)) return false;
  if (user.uid === 0) return true;
  return user.uid >= 1000;
}

function countPasswdUsers(users: Record<string, { uid: number; shell: string }>) {
  let humanCount = 0;
  let systemCount = 0;
  for (const user of Object.values(users)) {
    if (isHumanPasswdUser(user)) humanCount++;
    else systemCount++;
  }
  return { humanCount, systemCount, userCount: humanCount + systemCount };
}

export async function runUsersCheck(serverId: string): Promise<CheckResult> {
  const ssh = await getSshClient(serverId);
  const { stdout } = await ssh.exec("cat /etc/passwd");
  const users = parsePasswd(stdout);
  const { humanCount, systemCount, userCount } = countPasswdUsers(users);
  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";

  const { diffs, isBaseline } = await diffAndStore(
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

  if (isBaseline) {
    alerts.push({
      level: "info",
      message: `User baseline recorded (${humanCount} human, ${systemCount} system)`,
    });
  }

  for (const d of diffs) {
    if (d.changeType === "added") {
      const name = d.entityKey;
      if (isBuiltinUser(name)) continue;

      const uid = users[name]?.uid;
      if (uid === 0) {
        status = "critical";
        alerts.push({
          level: "critical",
          message: `New root-privileged user: ${name}`,
          recommendation: "Verify UID 0 account was intentionally created",
        });
      } else {
        if (status !== "critical") status = "warning";
        const kind = isHumanPasswdUser(users[name]!) ? "human" : "system";
        alerts.push({
          level: "warning",
          message: `New ${kind} user: ${name}`,
        });
      }
    } else if (d.changeType === "removed") {
      if (isBuiltinUser(d.entityKey)) continue;
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
    data: { userCount, humanCount, systemCount, users },
    alerts,
  };
}
