import { worstStatus } from "@/lib/config";
import type { CheckStatus } from "@/lib/checks/types";
import { WALLBOARD_DOMAINS } from "./types";
import type { WallboardData, WallboardSecurityBlock } from "./types";
import { statusWord } from "./helpers";

export function buildSecurity(
  statusMap: Record<string, string>,
  checkData: Record<string, Record<string, unknown>>,
): WallboardData["security"] {
  const scanner = checkData.scanner;
  const ioc = (scanner?.matches as unknown[] | undefined)?.length ?? 0;
  const installedScanners =
    (scanner?.installed as string[] | undefined)?.length ?? 0;

  const mod = (m: string) => (statusMap[m] ?? "unknown") as CheckStatus;

  const warningCount = WALLBOARD_DOMAINS.security.modules.filter((m) => {
    const s = statusMap[m];
    return s === "warning" || s === "critical";
  }).length;

  const blocks: WallboardSecurityBlock[] = [
    {
      label: "IOC",
      value: ioc > 0 ? `${ioc} hit` : "CLEAR",
      status: ioc > 0 ? "warning" : "healthy",
    },
    {
      label: "MALWARE",
      value: "CLEAR",
      status: "healthy",
    },
    {
      label: "FIM",
      value: statusWord(mod("fim")),
      status: mod("fim"),
    },
    {
      label: "SSH",
      value: statusWord(mod("ssh_keys")),
      status: mod("ssh_keys"),
    },
    {
      label: "USERS",
      value: statusWord(mod("users")),
      status: mod("users"),
    },
    {
      label: "SCANNER",
      value:
        installedScanners > 0
          ? `${installedScanners} tool`
          : statusWord(mod("scanner")),
      status: mod("scanner"),
    },
  ];

  const secStatus = worstStatus(
    WALLBOARD_DOMAINS.security.modules.map((m) => mod(m)),
  );
  const threatLevel: "LOW" | "MEDIUM" | "HIGH" =
    secStatus === "critical"
      ? "HIGH"
      : secStatus === "warning" || warningCount >= 2
        ? "MEDIUM"
        : "LOW";

  return { threatLevel, blocks, warningCount };
}
