/**
 * Live sky feeds for the monitor globe:
 * - Aircraft: OpenSky Network state vectors (server-side, cached)
 * - Satellites: CelesTrak GP → SGP4 via satellite.js (TLE cached ~2h)
 *
 * Cables/pipelines stay static infrastructure (they don't move).
 */

import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  json2satrec,
  propagate,
} from "satellite.js";

export type LiveAircraft = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  altKm: number;
  track: number | null;
  /** Ground speed m/s — used for short dead-reckoning between polls. */
  velocity: number | null;
  country?: string;
};

export type LiveSatellite = {
  id: string;
  name: string;
  kind: "leo" | "meo" | "geo";
  lat: number;
  lon: number;
  altKm: number;
};

export type LiveSkyPayload = {
  ok: boolean;
  at: string;
  flights: LiveAircraft[];
  satellites: LiveSatellite[];
  flightsSource: "live" | "unavailable";
  satellitesSource: "live" | "unavailable";
  /** From OpenSky `X-Rate-Limit-Remaining` when present. */
  openskyRemaining?: number;
  error?: string;
};

/**
 * Success TTL for Standard (4 000 credits/day).
 * ~90s ≈ <1 000 pulls/day if the globe stays open — comfortable headroom.
 */
const FLIGHT_CACHE_MS = 90_000;
/** After 429, stop hammering — credits reset on a rolling/daily window. */
const FLIGHT_BACKOFF_MS = 15 * 60_000;
/** Stretch poll further when remaining credits are low. */
const FLIGHT_LOW_CREDIT_MS = 5 * 60_000;
const TLE_CACHE_MS = 2 * 60 * 60_000;
const MAX_FLIGHTS = 280;
const MAX_SATS = 420;

type FlightCache = {
  /** Wall time of the OpenSky snapshot (dead-reckoning base). */
  observedAt: number;
  /** Do not call OpenSky again before this. */
  nextAttemptAt: number;
  flights: LiveAircraft[];
  ok: boolean;
  remaining?: number;
  error?: string;
};

type OpenSkyFetch = {
  states: unknown[][] | null;
  remaining?: number;
};

type TleRecord = Record<string, unknown>;
type TleCache = {
  at: number;
  records: { id: string; name: string; omm: TleRecord }[];
};

let flightCache: FlightCache | null = null;
let flightInflight: Promise<FlightCache> | null = null;
let tleCache: TleCache | null = null;
let tleInflight: Promise<TleCache> | null = null;

const CELESTRAK_GROUPS: { group: string; limit?: number }[] = [
  { group: "stations" },
  { group: "weather" },
  { group: "gps-ops" },
  { group: "galileo" },
  { group: "glo-ops" },
  { group: "geo", limit: 80 },
  { group: "iridium-NEXT", limit: 60 },
  { group: "oneweb", limit: 80 },
  { group: "starlink", limit: 160 },
];

function satKind(altKm: number): LiveSatellite["kind"] {
  if (altKm < 2_000) return "leo";
  if (altKm < 15_000) return "meo";
  return "geo";
}

async function fetchOpenSkyStates(): Promise<OpenSkyFetch> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "system-guardian-monitor/1.0",
  };

  const clientId = process.env.OPENSKY_CLIENT_ID?.trim();
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET?.trim();
  if (clientId && clientSecret) {
    try {
      const tokenRes = await fetch(
        "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret,
          }),
          signal: AbortSignal.timeout(12_000),
        },
      );
      if (tokenRes.ok) {
        const tok = (await tokenRes.json()) as { access_token?: string };
        if (tok.access_token) {
          headers.Authorization = `Bearer ${tok.access_token}`;
        }
      }
    } catch {
      /* anonymous fallback */
    }
  }

  const res = await fetch("https://opensky-network.org/api/states/all", {
    headers,
    signal: AbortSignal.timeout(18_000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`OpenSky HTTP ${res.status}`);
  }
  const remRaw = res.headers.get("x-rate-limit-remaining");
  const remaining =
    remRaw != null && remRaw !== "" ? Number.parseInt(remRaw, 10) : undefined;
  const body = (await res.json()) as { states?: unknown[][] | null };
  return {
    states: body.states ?? null,
    remaining: Number.isFinite(remaining) ? remaining : undefined,
  };
}

function flightTtlMs(remaining?: number): number {
  if (remaining != null && remaining < 200) return FLIGHT_LOW_CREDIT_MS;
  return FLIGHT_CACHE_MS;
}

function asNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function normalizeFlights(states: unknown[][]): LiveAircraft[] {
  const raw: LiveAircraft[] = [];
  for (const row of states) {
    if (!Array.isArray(row) || row.length < 11) continue;
    const icao = typeof row[0] === "string" ? row[0] : null;
    const callsign =
      typeof row[1] === "string" ? row[1].trim() : "";
    const country = typeof row[2] === "string" ? row[2] : undefined;
    const lon = asNum(row[5]);
    const lat = asNum(row[6]);
    // Prefer baro, fall back to geo (index 13) — many vectors lack one or the other.
    const altM = asNum(row[7]) ?? asNum(row[13]);
    const onGround = row[8] === true;
    const velocity = asNum(row[9]);
    const track = asNum(row[10]);
    if (!icao || lon == null || lat == null || onGround) continue;
    if (altM == null || altM < 400) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    raw.push({
      id: icao,
      name: callsign || icao.toUpperCase(),
      lat,
      lon,
      altKm: altM / 1000,
      track,
      velocity,
      country,
    });
  }

  if (raw.length <= MAX_FLIGHTS) return raw;

  // Spatial grid downsample so the globe isn't striped by API order.
  const cellDeg = 6;
  const buckets = new Map<string, LiveAircraft[]>();
  for (const ac of raw) {
    const key = `${Math.floor((ac.lat + 90) / cellDeg)}:${Math.floor((ac.lon + 180) / cellDeg)}`;
    const list = buckets.get(key);
    if (list) list.push(ac);
    else buckets.set(key, [ac]);
  }
  const cells = [...buckets.values()];
  const picked: LiveAircraft[] = [];
  let round = 0;
  while (picked.length < MAX_FLIGHTS && cells.some((c) => c.length > round)) {
    for (const cell of cells) {
      const ac = cell[round];
      if (!ac) continue;
      picked.push(ac);
      if (picked.length >= MAX_FLIGHTS) break;
    }
    round += 1;
  }
  return picked;
}

async function loadFlights(): Promise<FlightCache> {
  const now = Date.now();
  if (flightCache && now < flightCache.nextAttemptAt) {
    return flightCache;
  }
  if (flightInflight) return flightInflight;

  flightInflight = (async () => {
    try {
      const fetched = await fetchOpenSkyStates();
      const flights = fetched.states
        ? normalizeFlights(fetched.states)
        : [];
      const t = Date.now();
      flightCache = {
        observedAt: t,
        nextAttemptAt: t + flightTtlMs(fetched.remaining),
        flights,
        ok: flights.length > 0,
        remaining: fetched.remaining,
        error:
          flights.length > 0
            ? undefined
            : "OpenSky returned no airborne states",
      };
      return flightCache;
    } catch (err) {
      const message = err instanceof Error ? err.message : "OpenSky failed";
      const t = Date.now();
      const rateLimited = /429/.test(message);
      const wait = rateLimited ? FLIGHT_BACKOFF_MS : FLIGHT_CACHE_MS;
      if (flightCache?.ok && flightCache.flights.length > 0) {
        // Keep last good snapshot; push nextAttempt so we don't burn more credits.
        flightCache = {
          ...flightCache,
          nextAttemptAt: t + wait,
          error: message,
        };
        return flightCache;
      }
      flightCache = {
        observedAt: t,
        nextAttemptAt: t + wait,
        flights: [],
        ok: false,
        error: message,
      };
      return flightCache;
    } finally {
      flightInflight = null;
    }
  })();

  return flightInflight;
}

async function fetchCelestrakGroup(
  group: string,
): Promise<TleRecord[]> {
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=JSON`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "system-guardian-monitor/1.0",
    },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`CelesTrak ${group} HTTP ${res.status}`);
  const data = (await res.json()) as TleRecord[];
  return Array.isArray(data) ? data : [];
}

function sampleRecords(rows: TleRecord[], limit?: number): TleRecord[] {
  if (!limit || rows.length <= limit) return rows;
  const step = rows.length / limit;
  const out: TleRecord[] = [];
  for (let i = 0; i < limit; i++) {
    out.push(rows[Math.min(rows.length - 1, Math.floor(i * step))]!);
  }
  return out;
}

async function loadTles(): Promise<TleCache> {
  const now = Date.now();
  if (tleCache && now - tleCache.at < TLE_CACHE_MS) return tleCache;
  if (tleInflight) return tleInflight;

  tleInflight = (async () => {
    const records: TleCache["records"] = [];
    const seen = new Set<string>();

    await Promise.all(
      CELESTRAK_GROUPS.map(async ({ group, limit }) => {
        try {
          const rows = sampleRecords(await fetchCelestrakGroup(group), limit);
          for (const omm of rows) {
            const id = String(
              omm.NORAD_CAT_ID ?? omm.OBJECT_ID ?? omm.OBJECT_NAME ?? "",
            );
            const name = String(omm.OBJECT_NAME ?? id);
            if (!id || seen.has(id)) continue;
            seen.add(id);
            records.push({ id, name, omm });
          }
        } catch {
          /* one group failing shouldn't kill the layer */
        }
      }),
    );

    tleCache = { at: Date.now(), records };
    return tleCache;
  })().finally(() => {
    tleInflight = null;
  });

  return tleInflight;
}

function propagateSatellites(
  records: TleCache["records"],
): LiveSatellite[] {
  const now = new Date();
  const gmst = gstime(now);
  const out: LiveSatellite[] = [];

  for (const rec of records) {
    if (out.length >= MAX_SATS) break;
    try {
      const satrec = json2satrec(rec.omm as never);
      const pv = propagate(satrec, now);
      if (!pv?.position || typeof pv.position === "boolean") continue;
      const geo = eciToGeodetic(pv.position, gmst);
      const lat = degreesLat(geo.latitude);
      const lon = degreesLong(geo.longitude);
      const altKm = geo.height;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(altKm)) {
        continue;
      }
      if (altKm < 80 || altKm > 80_000) continue;
      out.push({
        id: rec.id,
        name: rec.name,
        kind: satKind(altKm),
        lat,
        lon,
        altKm,
      });
    } catch {
      /* skip bad element */
    }
  }
  return out;
}

export async function getLiveSky(): Promise<LiveSkyPayload> {
  const [flightsRes, tles] = await Promise.all([loadFlights(), loadTles()]);
  let satellites: LiveSatellite[] = [];
  let satellitesSource: LiveSkyPayload["satellitesSource"] = "unavailable";
  try {
    satellites = propagateSatellites(tles.records);
    satellitesSource = satellites.length > 0 ? "live" : "unavailable";
  } catch {
    satellitesSource = "unavailable";
  }

  const flightsLive = flightsRes.ok && flightsRes.flights.length > 0;
  return {
    ok: flightsLive || satellitesSource === "live",
    // Prefer flight snapshot time so client dead-reckoning stays honest on stale/429 cache.
    at: new Date(
      flightsLive ? flightsRes.observedAt : Date.now(),
    ).toISOString(),
    flights: flightsLive ? flightsRes.flights : [],
    satellites,
    flightsSource: flightsLive ? "live" : "unavailable",
    satellitesSource,
    openskyRemaining: flightsRes.remaining,
    error: flightsRes.error,
  };
}
