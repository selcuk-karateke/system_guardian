import { db } from "@/db";
import { monitoredDomains } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { AlertInput, CheckResult } from "./types";

async function probe(url: string): Promise<{
  statusCode: number;
  responseMs: number;
  ok: boolean;
}> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    return {
      statusCode: res.status,
      responseMs: Date.now() - start,
      ok: res.ok,
    };
  } catch {
    return { statusCode: 0, responseMs: Date.now() - start, ok: false };
  }
}

export async function runWebsiteCheck(serverId: string): Promise<CheckResult> {
  void serverId;
  const domains = await db
    .select()
    .from(monitoredDomains)
    .where(eq(monitoredDomains.isActive, true));

  const alerts: AlertInput[] = [];
  let status: CheckResult["status"] = "healthy";
  const results: Record<string, unknown> = {};

  for (const d of domains) {
    const entry: Record<string, unknown> = {};

    if (d.checkHttp) {
      const http = await probe(`http://${d.domain}`);
      entry.http = http;
      if (!http.ok) {
        status = http.statusCode >= 500 ? "critical" : "warning";
        alerts.push({
          level: http.statusCode >= 500 ? "critical" : "warning",
          message: `HTTP ${d.domain} returned ${http.statusCode || "error"}`,
        });
      } else if (http.responseMs > 3000) {
        if (status === "healthy") status = "warning";
        alerts.push({
          level: "warning",
          message: `HTTP ${d.domain} slow (${http.responseMs}ms)`,
        });
      }
    }

    if (d.checkHttps) {
      const https = await probe(`https://${d.domain}`);
      entry.https = https;
      if (!https.ok) {
        status = "critical";
        alerts.push({
          level: "critical",
          message: `HTTPS ${d.domain} returned ${https.statusCode || "error"}`,
        });
      }
    }

    results[d.domain] = entry;
  }

  return {
    module: "website",
    status,
    data: { sites: results },
    alerts,
  };
}
