import { createHash } from "crypto";
import { diffAndStore } from "@/lib/history/persist";
import { getSshClient } from "@/lib/ssh";
import { getFileChangeHint } from "./file-change-hint";
import type { AlertInput, CheckResult } from "./types";

export const COLLECT_SSH_KEYS_SCRIPT = `
if [ -f /root/.ssh/authorized_keys ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    printf 'root\\t%s\\n' "$line"
  done < /root/.ssh/authorized_keys
fi
for f in /home/*/.ssh/authorized_keys; do
  [ -f "$f" ] || continue
  u=$(basename "$(dirname "$(dirname "$f")")")
  while IFS= read -r line || [ -n "$line" ]; do
    printf '%s\\t%s\\n' "$u" "$line"
  done < "$f"
done
`.trim();

function lineToKeyEntry(line: string): { hash: string; preview: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const hash = createHash("sha256").update(trimmed).digest("hex").slice(0, 16);
  return { hash, preview: trimmed.slice(0, 80) };
}

export function parseSshKeysCollectOutput(stdout: string): {
  keys: Record<string, string>;
  rootKeyCount: number;
  homeKeyCount: number;
  homeUserCount: number;
} {
  const keys: Record<string, string> = {};
  let rootKeyCount = 0;
  const homeByUser = new Set<string>();
  let homeKeyCount = 0;

  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const scope = line.slice(0, tab);
    const entry = lineToKeyEntry(line.slice(tab + 1));
    if (!entry) continue;
    keys[entry.hash] = entry.preview;
    if (scope === "root") rootKeyCount++;
    else {
      homeKeyCount++;
      homeByUser.add(scope);
    }
  }

  return {
    keys,
    rootKeyCount,
    homeKeyCount,
    homeUserCount: homeByUser.size,
  };
}

export async function runSshKeysCheck(serverId: string): Promise<CheckResult> {
  const ssh = await getSshClient(serverId);
  const { stdout } = await ssh.exec(COLLECT_SSH_KEYS_SCRIPT);
  const { keys: keyMap, rootKeyCount, homeKeyCount, homeUserCount } =
    parseSshKeysCollectOutput(stdout);
  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";

  const { diffs, isBaseline } = await diffAndStore(
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

  if (isBaseline) {
    alerts.push({
      level: "info",
      message: `SSH keys baseline recorded (${Object.keys(keyMap).length} key(s))`,
    });
  }

  for (const d of diffs) {
    status = "critical";
    const label =
      d.changeType === "added"
        ? "SSH key added"
        : d.changeType === "removed"
          ? "SSH key removed"
          : "SSH key changed";
    const hint = await getFileChangeHint(ssh, "/root/.ssh/authorized_keys");
    alerts.push({
      level: "critical",
      message: `${label} (fingerprint ${d.entityKey})${hint ? ` — ${hint}` : ""}`,
      recommendation:
        "Prüfen ob Key beabsichtigt (root vs. /home/*/.ssh). Sonst Zeile aus authorized_keys entfernen",
    });
  }

  const keyCount = Object.keys(keyMap).length;

  return {
    module: "ssh_keys",
    status,
    data: {
      keyCount,
      rootKeyCount,
      homeKeyCount,
      homeUserCount,
    },
    alerts,
  };
}
