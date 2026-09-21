import { createHash } from "crypto";
import { getFimPaths } from "@/lib/config";
import { diffAndStore } from "@/lib/history/persist";
import { getSshClient } from "@/lib/ssh";
import { getFileChangeHint } from "./file-change-hint";
import type { AlertInput, CheckResult } from "./types";

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export async function runFimCheck(serverId: string): Promise<CheckResult> {
  const ssh = getSshClient();
  const paths = getFimPaths();
  const hashes: Record<string, string> = {};
  const missing: string[] = [];

  for (const filePath of paths) {
    const { stdout, code } = await ssh.exec(
      `cat '${filePath.replace(/'/g, "'\\''")}' 2>/dev/null || echo '__MISSING__'`,
    );
    if (code !== 0 || stdout.trim() === "__MISSING__" || !stdout.trim()) {
      missing.push(filePath);
      continue;
    }
    hashes[filePath] = hashContent(stdout);
  }

  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";

  const { diffs, isBaseline } = await diffAndStore(
    serverId,
    "fim_files",
    { hashes },
    (prev, curr) => {
      const prevH = (prev?.hashes as Record<string, string>) ?? {};
      const currH = curr.hashes as Record<string, string>;
      const items = [];
      for (const path of Object.keys(currH)) {
        if (prevH[path] !== undefined && prevH[path] !== currH[path]) {
          items.push({
            changeType: "changed" as const,
            entityKey: path,
            previousValue: prevH[path],
            newValue: currH[path],
          });
        }
      }
      for (const path of Object.keys(prevH)) {
        if (currH[path] === undefined) {
          items.push({
            changeType: "removed" as const,
            entityKey: path,
            previousValue: prevH[path],
          });
        }
      }
      return items;
    },
  );

  if (isBaseline) {
    alerts.push({
      level: "info",
      message: `FIM baseline recorded for ${Object.keys(hashes).length} file(s)`,
    });
  }

  const changedPaths = diffs
    .filter((d) => d.changeType === "changed" || d.changeType === "removed")
    .map((d) => d.entityKey);

  for (const d of diffs) {
    status = "critical";
    const hint = await getFileChangeHint(ssh, d.entityKey);
    alerts.push({
      level: "critical",
      message: `FIM: ${d.entityKey} geändert${hint ? ` — ${hint}` : ""}`,
      recommendation:
        "Prüfen ob Änderung beabsichtigt (eigener Login, Coolify, apt). Sonst auth.log / journalctl -u ssh",
    });
  }

  for (const path of missing) {
    status = status === "critical" ? "critical" : "warning";
    alerts.push({
      level: "warning",
      message: `FIM: cannot read ${path}`,
    });
  }

  return {
    module: "fim",
    status,
    data: {
      paths,
      files: hashes,
      missing,
      changedPaths,
      isBaseline,
      pathCount: paths.length,
    },
    alerts,
  };
}
