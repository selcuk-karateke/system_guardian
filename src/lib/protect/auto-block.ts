import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { changeEvents } from "@/db/schema";
import {
  getAutoBlockJail,
  getBlockedRemoteIps,
  getCheckMode,
  isAutoBlockEnabled,
  isTrustedLoginIp,
  isTrustedOutboundKey,
} from "@/lib/config";
import {
  blockedIpRecommendation,
} from "@/lib/protect/playbooks";
import { getSshClient } from "@/lib/ssh";
import { isPrivateOrLocalIp } from "@/lib/checks/connection-patterns";
import type { AlertInput } from "@/lib/checks/types";

const DEDUP_HOURS = 24;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isBanCandidate(ip: string): boolean {
  if (!ip || isPrivateOrLocalIp(ip)) return false;
  if (isTrustedLoginIp(ip) || isTrustedOutboundKey(ip)) return false;
  return getBlockedRemoteIps().has(ip);
}

async function recentlyBlocked(serverId: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - DEDUP_HOURS * 60 * 60 * 1000);
  const rows = await db
    .select({ id: changeEvents.id })
    .from(changeEvents)
    .where(
      and(
        eq(changeEvents.serverId, serverId),
        eq(changeEvents.category, "protect"),
        eq(changeEvents.changeType, "auto_block"),
        eq(changeEvents.entityKey, ip),
        gte(changeEvents.createdAt, since),
      ),
    )
    .orderBy(desc(changeEvents.createdAt))
    .limit(1);
  return rows.length > 0;
}

async function auditBlock(
  serverId: string,
  ip: string,
  detail: string,
): Promise<void> {
  await db.insert(changeEvents).values({
    serverId,
    category: "protect",
    changeType: "auto_block",
    entityKey: ip,
    previousValue: null,
    newValue: detail.slice(0, 2000),
  });
}

export type AutoBlockResult = {
  attempted: string[];
  banned: string[];
  skipped: string[];
  alerts: AlertInput[];
};

/**
 * Bannt nur IPs aus BLOCKED_REMOTE_IPS via fail2ban (Opt-in).
 * Nie beliebige neue IPs — nur bekannte IOC-Liste.
 */
export async function enforceBlocklistBans(
  serverId: string,
  seenIps: string[],
): Promise<AutoBlockResult> {
  const result: AutoBlockResult = {
    attempted: [],
    banned: [],
    skipped: [],
    alerts: [],
  };

  if (!isAutoBlockEnabled()) {
    return result;
  }
  if (getCheckMode() !== "ssh") {
    result.skipped.push("CHECK_MODE!=ssh");
    return result;
  }

  const jail = getAutoBlockJail();
  const unique = [...new Set(seenIps.map((ip) => ip.trim()).filter(Boolean))];
  const candidates = unique.filter(isBanCandidate);
  if (candidates.length === 0) return result;

  const ssh = await getSshClient(serverId);

  for (const ip of candidates) {
    result.attempted.push(ip);
    if (await recentlyBlocked(serverId, ip)) {
      result.skipped.push(`${ip}:dedup`);
      continue;
    }

    const cmd = `fail2ban-client set ${shellQuote(jail)} banip ${shellQuote(ip)} 2>&1`;
    const execResult = await ssh.exec(cmd);
    const ok =
      execResult.code === 0 ||
      /already banned|OK/i.test(execResult.stdout + execResult.stderr);

    const detail = ok
      ? `fail2ban banip ${ip} jail=${jail} code=${execResult.code} out=${(execResult.stdout || execResult.stderr).slice(0, 200)}`
      : `fail2ban banip FAILED ${ip} jail=${jail} code=${execResult.code} out=${(execResult.stdout || execResult.stderr).slice(0, 300)}`;

    await auditBlock(serverId, ip, detail);

    if (ok) {
      result.banned.push(ip);
      result.alerts.push({
        level: "critical",
        message: `Auto-Block: fail2ban banip ${ip} (IOC-Blocklist)`,
        recommendation: blockedIpRecommendation(ip, {
          autoBlockEnabled: true,
          autoBlocked: true,
        }),
      });
    } else {
      result.alerts.push({
        level: "critical",
        message: `Auto-Block fehlgeschlagen für ${ip}`,
        recommendation: blockedIpRecommendation(ip, {
          autoBlockEnabled: true,
          autoBlocked: false,
        }),
      });
    }
  }

  return result;
}
