export type GlobeTint = {
  /** Stable id for ripple detection (usually IP). */
  id: string;
  /** [latitude, longitude] — tints existing land dots */
  location: [number, number];
  /** 0..1 brightness (hits × freshness already baked in) */
  weight: number;
  /** 0..1 how new this source is */
  freshness: number;
  hits?: number;
  country?: string;
};

/** @deprecated use GlobeTint */
export type AttackMarker = GlobeTint;

type FailedAuthSource = {
  ip?: string;
  count?: number;
  trusted?: boolean;
};

type ActiveSessionRow = {
  from?: string;
  trusted?: boolean;
};

type WebVisitorRow = {
  ip?: string;
  hits?: number;
  uaClass?: string;
};

type GeoHit = { ll: [number, number]; country?: string };

/** Hetzner Falkenstein-ish — visual home when server IP won't geolocate. */
export const DEFAULT_HOME_GEO: GeoHit = {
  ll: [50.48, 12.37],
  country: "DE",
};

/**
 * Documentation / demo IPs — keep tint patches visible offline.
 */
const FALLBACK_GEO: Record<string, GeoHit> = {
  "203.0.113.10": { ll: [52.52, 13.4], country: "DE" },
  "203.0.113.50": { ll: [48.14, 11.58], country: "DE" },
  "203.0.113.77": { ll: [47.37, 8.54], country: "CH" },
  "203.0.113.99": { ll: [31.23, 121.47], country: "CN" },
  "203.0.113.41": { ll: [39.9, 116.4], country: "CN" },
  "203.0.113.55": { ll: [22.32, 114.17], country: "HK" },
  "198.51.100.200": { ll: [55.76, 37.62], country: "RU" },
  "198.51.100.44": { ll: [59.93, 30.33], country: "RU" },
  "192.0.2.10": { ll: [37.77, -122.42], country: "US" },
  "192.0.2.88": { ll: [40.71, -74.01], country: "US" },
  "192.0.2.33": { ll: [41.88, -87.63], country: "US" },
  "198.18.0.50": { ll: [52.37, 4.9], country: "NL" },
  "198.18.0.61": { ll: [51.92, 4.48], country: "NL" },
  "198.18.0.72": { ll: [59.33, 18.07], country: "SE" },
  "198.18.0.83": { ll: [48.86, 2.35], country: "FR" },
  "198.18.0.94": { ll: [50.11, 8.68], country: "DE" },
  "198.18.0.105": { ll: [35.68, 139.69], country: "JP" },
  "198.18.0.116": { ll: [-23.55, -46.63], country: "BR" },
  "198.18.0.127": { ll: [28.61, 77.21], country: "IN" },
  // Mock / demo web visitors
  "198.51.100.10": { ll: [51.5, -0.12], country: "GB" },
  "198.51.100.11": { ll: [40.71, -74.01], country: "US" },
  "198.51.100.12": { ll: [35.68, 139.69], country: "JP" },
};

/** Process-lifetime caches. */
const geoCache = new Map<string, GeoHit | null>();
const firstSeenAt = new Map<string, number>();

const FRESH_MS = 45 * 60_000;

function isV4(ip: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip);
}

function isPublicV4(ip: string): boolean {
  if (!isV4(ip)) return false;
  const [a, b] = ip.split(".").map(Number) as [number, number];
  if (a === 10) return false;
  if (a === 127) return false;
  if (a === 192 && b === 168) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 169 && b === 254) return false;
  return true;
}

/** More hits → brighter (not a bigger patch). */
export function brightnessFromHits(count: number, maxCount: number): number {
  const t = maxCount > 0 ? count / maxCount : 0.5;
  return 0.22 + Math.pow(Math.min(1, t), 0.65) * 0.78;
}

export function freshnessForIp(ip: string, now = Date.now()): number {
  let t0 = firstSeenAt.get(ip);
  if (t0 == null) {
    t0 = now;
    firstSeenAt.set(ip, t0);
  }
  const age = Math.max(0, now - t0);
  return Math.max(0.18, 1 - age / FRESH_MS);
}

/** Test helper — reset first-seen clock. */
export function resetGlobeFreshnessForTests(): void {
  firstSeenAt.clear();
}

async function hydrateFromIpApi(ips: string[]): Promise<void> {
  const pending = ips.filter((ip) => !geoCache.has(ip) && !FALLBACK_GEO[ip]);
  if (pending.length === 0) return;

  try {
    const res = await fetch(
      "http://ip-api.com/batch?fields=status,message,query,lat,lon,countryCode",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.slice(0, 40).map((query) => ({ query }))),
        signal: AbortSignal.timeout(4_000),
        cache: "no-store",
      },
    );
    if (!res.ok) {
      for (const ip of pending) geoCache.set(ip, null);
      return;
    }
    const rows = (await res.json()) as Array<{
      status?: string;
      query?: string;
      lat?: number;
      lon?: number;
      countryCode?: string;
    }>;
    for (const row of rows) {
      const ip = row.query;
      if (!ip) continue;
      if (
        row.status === "success" &&
        Number.isFinite(row.lat) &&
        Number.isFinite(row.lon)
      ) {
        geoCache.set(ip, {
          ll: [row.lat as number, row.lon as number],
          country: row.countryCode,
        });
      } else {
        geoCache.set(ip, null);
      }
    }
  } catch {
    for (const ip of pending) {
      if (!geoCache.has(ip)) geoCache.set(ip, null);
    }
  }
}

function lookupCached(ip: string): GeoHit | null {
  if (FALLBACK_GEO[ip]) return FALLBACK_GEO[ip]!;
  return geoCache.get(ip) ?? null;
}

function collectAttackCounts(
  logins: Record<string, unknown>,
): Map<string, number> {
  const sources =
    (logins.failedAuthSources as FailedAuthSource[] | undefined) ?? [];
  const f2b =
    (logins.fail2ban as { bannedIps?: string[] } | undefined) ?? {};
  const banned = f2b.bannedIps ?? [];

  const counts = new Map<string, number>();
  for (const s of sources) {
    const ip = s.ip?.trim();
    if (!ip || s.trusted || !isPublicV4(ip)) continue;
    counts.set(ip, (counts.get(ip) ?? 0) + Math.max(1, s.count ?? 1));
  }
  for (const ip of banned) {
    if (!isPublicV4(ip)) continue;
    counts.set(ip, Math.max(counts.get(ip) ?? 0, 3));
  }
  return counts;
}

function collectSessionIps(
  logins: Record<string, unknown>,
): { ip: string; trusted: boolean }[] {
  const sessions =
    (logins.activeSessions as ActiveSessionRow[] | undefined) ?? [];
  const seen = new Set<string>();
  const out: { ip: string; trusted: boolean }[] = [];
  for (const s of sessions) {
    const ip = s.from?.trim();
    if (!ip || !isPublicV4(ip) || seen.has(ip)) continue;
    seen.add(ip);
    out.push({ ip, trusted: !!s.trusted });
  }
  return out;
}

function collectWebVisitors(
  web: Record<string, unknown> | undefined,
): { ip: string; hits: number }[] {
  const visitors = (web?.visitors as WebVisitorRow[] | undefined) ?? [];
  const out: { ip: string; hits: number }[] = [];
  const seen = new Set<string>();
  for (const v of visitors) {
    const ip = v.ip?.trim();
    if (!ip || !isPublicV4(ip) || seen.has(ip)) continue;
    if (v.uaClass === "bot") continue;
    seen.add(ip);
    out.push({ ip, hits: Math.max(1, v.hits ?? 1) });
  }
  return out;
}

export type GlobeTints = {
  attacks: GlobeTint[];
  sessions: GlobeTint[];
  web: GlobeTint[];
  /** Server location — geometric reference / “home” on the globe */
  home: GlobeTint | null;
};

export type BuildGlobeTintsOpts = {
  /** Public IPv4 of the monitored server (home-dot). */
  homeIp?: string | null;
};

/**
 * Globe tints from check data — all paint the same land-dot field.
 */
export async function buildGlobeTints(
  checkData: Record<string, Record<string, unknown> | undefined>,
  opts: BuildGlobeTintsOpts = {},
): Promise<GlobeTints> {
  const logins = checkData.logins ?? {};
  const webMod = checkData.web_presence;
  const attackCounts = collectAttackCounts(logins);
  const sessionIps = collectSessionIps(logins);
  const webIps = collectWebVisitors(webMod);
  const homeIp = opts.homeIp?.trim() || "";

  const allIps = [
    ...new Set([
      ...attackCounts.keys(),
      ...sessionIps.map((s) => s.ip),
      ...webIps.map((w) => w.ip),
      ...(homeIp && isPublicV4(homeIp) ? [homeIp] : []),
    ]),
  ];

  if (allIps.length > 0) await hydrateFromIpApi(allIps);

  const now = Date.now();
  const attacks: GlobeTint[] = [];
  if (attackCounts.size > 0) {
    const maxCount = Math.max(...attackCounts.values());
    for (const [ip, count] of [...attackCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    )) {
      if (attacks.length >= 48) break;
      const geo = lookupCached(ip);
      if (!geo) continue;
      const freshness = freshnessForIp(ip, now);
      const hitBright = brightnessFromHits(count, maxCount);
      attacks.push({
        id: ip,
        location: geo.ll,
        hits: count,
        freshness,
        weight: Math.min(1, hitBright * (0.35 + 0.65 * freshness)),
        country: geo.country,
      });
    }
  }

  const sessions: GlobeTint[] = [];
  for (const s of sessionIps) {
    if (sessions.length >= 24) break;
    const geo = lookupCached(s.ip);
    if (!geo) continue;
    sessions.push({
      id: s.ip,
      location: geo.ll,
      freshness: 1,
      weight: s.trusted ? 1 : 0.78,
      country: geo.country,
    });
  }

  const web: GlobeTint[] = [];
  if (webIps.length > 0) {
    const maxHits = Math.max(...webIps.map((w) => w.hits));
    for (const w of webIps) {
      if (web.length >= 36) break;
      const geo = lookupCached(w.ip);
      if (!geo) continue;
      web.push({
        id: w.ip,
        location: geo.ll,
        hits: w.hits,
        freshness: 1,
        // Keep traffic quieter than sessions/attacks
        weight: 0.2 + brightnessFromHits(w.hits, maxHits) * 0.35,
        country: geo.country,
      });
    }
  }

  let home: GlobeTint | null = null;
  if (homeIp && isPublicV4(homeIp)) {
    const geo = lookupCached(homeIp) ?? DEFAULT_HOME_GEO;
    home = {
      id: `home:${homeIp}`,
      location: geo.ll,
      freshness: 1,
      weight: 1,
      country: geo.country,
    };
  } else {
    home = {
      id: "home:default",
      location: DEFAULT_HOME_GEO.ll,
      freshness: 1,
      weight: 0.92,
      country: DEFAULT_HOME_GEO.country,
    };
  }

  return { attacks, sessions, web, home };
}

export async function buildAttackMarkers(
  checkData: Record<string, Record<string, unknown> | undefined>,
): Promise<GlobeTint[]> {
  return (await buildGlobeTints(checkData)).attacks;
}
