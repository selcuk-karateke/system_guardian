import { db } from "@/db";
import { monitoredDomains } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { AlertInput, CheckResult } from "./types";

/** Nextcloud / Mozilla recommend ≥ 180 days. */
export const HSTS_MIN_MAX_AGE = 15_552_000;

export type HttpProbe = {
  statusCode: number;
  responseMs: number;
  ok: boolean;
  location: string | null;
};

export type HttpsSecurityProbe = {
  statusCode: number;
  responseMs: number;
  ok: boolean;
  hstsMaxAge: number | null;
  hstsPresent: boolean;
};

export function parseHstsMaxAge(header: string | null): number | null {
  if (!header) return null;
  const m = header.match(/max-age\s*=\s*(\d+)/i);
  if (!m) return null;
  return Number(m[1]);
}

export function isHttpsRedirect(
  statusCode: number,
  location: string | null,
): boolean {
  if (![301, 302, 303, 307, 308].includes(statusCode)) return false;
  if (!location) return false;
  try {
    const u = new URL(location, "http://placeholder.invalid");
    return u.protocol === "https:";
  } catch {
    return /^https:\/\//i.test(location);
  }
}

async function probeHttp(url: string): Promise<HttpProbe> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(15000),
      redirect: "manual",
      headers: { "User-Agent": "SystemGuardian/website-check" },
    });
    return {
      statusCode: res.status,
      responseMs: Date.now() - start,
      ok: res.status > 0 && res.status < 500,
      location: res.headers.get("location"),
    };
  } catch {
    return {
      statusCode: 0,
      responseMs: Date.now() - start,
      ok: false,
      location: null,
    };
  }
}

async function probeHttpsSecurity(url: string): Promise<HttpsSecurityProbe> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
      headers: { "User-Agent": "SystemGuardian/website-check" },
    });
    const hsts = res.headers.get("strict-transport-security");
    const hstsMaxAge = parseHstsMaxAge(hsts);
    return {
      statusCode: res.status,
      responseMs: Date.now() - start,
      ok: res.ok,
      hstsMaxAge,
      hstsPresent: hstsMaxAge != null,
    };
  } catch {
    return {
      statusCode: 0,
      responseMs: Date.now() - start,
      ok: false,
      hstsMaxAge: null,
      hstsPresent: false,
    };
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

  const bump = (level: "warning" | "critical") => {
    if (level === "critical") status = "critical";
    else if (status === "healthy") status = "warning";
  };

  for (const d of domains) {
    const entry: Record<string, unknown> = {};

    if (d.checkHttp) {
      const http = await probeHttp(`http://${d.domain}`);
      const redirectsToHttps = isHttpsRedirect(http.statusCode, http.location);
      entry.http = {
        ...http,
        redirectsToHttps,
      };

      if (http.statusCode === 0) {
        // Port 80 closed/filtered is fine if HTTPS works — no open cleartext.
        entry.httpClosed = true;
      } else if (redirectsToHttps) {
        // desired: HTTP only used as jump to HTTPS
      } else if (http.statusCode >= 500) {
        bump("critical");
        alerts.push({
          level: "critical",
          message: `HTTP ${d.domain} returned ${http.statusCode}`,
        });
      } else {
        bump("warning");
        alerts.push({
          level: "warning",
          message: `HTTP ${d.domain} does not redirect to HTTPS (${http.statusCode})`,
          recommendation:
            "Enable Force HTTPS / redirect in Coolify or Traefik for this domain",
        });
      }

      if (http.responseMs > 3000 && http.statusCode > 0) {
        bump("warning");
        alerts.push({
          level: "warning",
          message: `HTTP ${d.domain} slow (${http.responseMs}ms)`,
        });
      }
    }

    if (d.checkHttps) {
      const https = await probeHttpsSecurity(`https://${d.domain}`);
      entry.https = https;

      if (!https.ok) {
        bump("critical");
        alerts.push({
          level: "critical",
          message: `HTTPS ${d.domain} returned ${https.statusCode || "error"}`,
        });
      } else if (!https.hstsPresent) {
        bump("warning");
        alerts.push({
          level: "warning",
          message: `HTTPS ${d.domain}: Strict-Transport-Security missing`,
          recommendation:
            "Set HSTS on the reverse proxy (Traefik/Coolify), max-age ≥ 15552000",
        });
      } else if (
        https.hstsMaxAge != null &&
        https.hstsMaxAge < HSTS_MIN_MAX_AGE
      ) {
        bump("warning");
        alerts.push({
          level: "warning",
          message: `HTTPS ${d.domain}: HSTS max-age ${https.hstsMaxAge} < ${HSTS_MIN_MAX_AGE}`,
          recommendation:
            "Increase STSSeconds / max-age to at least 15552000 (180 days)",
        });
      }

      if (https.responseMs > 3000 && https.ok) {
        bump("warning");
        alerts.push({
          level: "warning",
          message: `HTTPS ${d.domain} slow (${https.responseMs}ms)`,
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
