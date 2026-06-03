import { createHash } from "crypto";
import { diffAndStore } from "@/lib/history/persist";
import { getSshClient } from "@/lib/ssh";
import type { AlertInput, CheckResult } from "./types";

function hashKeys(content: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of content.split("\n").filter((l) => l.trim() && !l.startsWith("#"))) {
    const hash = createHash("sha256").update(line.trim()).digest("hex").slice(0, 16);
    map[hash] = line.trim().slice(0, 80);
  }
  return map;
}

export async function runSshKeysCheck(serverId: string): Promise<CheckResult> {
  const ssh = getSshClient();
  const { stdout } = await ssh.exec(
    "cat /root/.ssh/authorized_keys 2>/dev/null; cat /home/*/.ssh/authorized_keys 2>/dev/null",
  );
  const keyMap = hashKeys(stdout);
  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";

  const diffs = await diffAndStore(
    serverId,
    "ssh_keys",
    { keys: keyMap },
    (prev, curr) => {
      const prevKeys = Object.keys((prev?.keys as Record<string, string>) ?? {});
      const currKeys = Object.keys((curr.keys as Record<string, string>) ?? {});
      const items = [];
      for (const k of currKeys) {
        if (!prevKeys.includes(k))
          items.push({
            changeType: "added" as const,
            entityKey: k,
            newValue: (curr.keys as Record<string, string>)[k],
          });
      }
      for (const k of prevKeys) {
        if (!currKeys.includes(k))
          items.push({
            changeType: "removed" as const,
            entityKey: k,
            previousValue: (prev?.keys as Record<string, string>)?.[k],
          });
      }
      return items;
    },
  );

  for (const d of diffs) {
    status = "critical";
    alerts.push({
      level: "critical",
      message: `SSH key ${d.changeType}: ${d.entityKey}`,
      recommendation: "Verify authorized_keys change was intentional",
    });
  }

  return {
    module: "ssh_keys",
    status,
    data: { keyCount: Object.keys(keyMap).length },
    alerts,
  };
}
