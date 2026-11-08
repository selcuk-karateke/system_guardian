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
  error?: string;
};

const FLIGHT_CACHE_MS = 15_000;
const TLE_CACHE_MS = 2 * 60 * 60_000;
const MAX_FLIGHTS = 280;
const MAX_SATS = 420;

type FlightCache = {
  at: number;
  flights: LiveAircraft[];
  ok: boolean;
  error?: string;
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

/** Compress real altitude into globe radius bands (surface=1 … GEO≈1.19). */
export function visualOrbitRadius(altKm: number): number {
  const a = Math.max(0, altKm);
  const t = Math.log1p(a / 180) / Math.log1p(36_000 / 180);
  return 1 + Math.min(0.195, Math.max(0.02, t * 0.195));
}

async function fetchOpenSkyStates(): Promise<unknown[][] | null> {
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
  const body = (await res.json()) as { states?: unknown[][] | null };
  return body.states ?? null;
}

function normalizeFlights(states: unknown[][]): LiveAircraft[] {
  const raw: LiveAircraft[] = [];
  for (const row of states) {
    if (!Array.isArray(row) || row.length < 11) continue;
    const icao = typeof row[0] === "string" ? row[0] : null;
    const callsign =
      typeof row[1] === "string" ? row[1].trim() : "";
    const country = typeof row[2] === "string" ? row[2] : undefined;
    const lon = typeof row[5] === "number" ? row[5] : null;
    const lat = typeof row[6] === "number" ? row[6] : null;
    const altM = typeof row[7] === "number" ? row[7] : null;
    const onGround = row[8] === true;
    const track = typeof row[10] === "number" ? row[10] : null;
    if (!icao || lon == null || lat == null || onGround) continue;
    if (altM == null || altM < 400) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    raw.push({
      id: icao,
      name: callsign || icao.toUpperCase(),
      lat,
      lon,
      altKm: altM / 1000,
      track,
      country,
    });
  }

  if (raw.length <= MAX_FLIGHTS) return raw;

  // Spatial-ish downsample: keep evenly spaced by hash of id
  const step = Math.ceil(raw.length / MAX_FLIGHTS);
  const picked: LiveAircraft[] = [];
  for (let i = 0; i < raw.length && picked.length < MAX_FLIGHTS; i += step) {
    picked.push(raw[i]!);
  }
  return picked;
}

async function loadFlights(): Promise<FlightCache> {
  const now = Date.now();
  if (flightCache && now - flightCache.at < FLIGHT_CACHE_MS) {
    return flightCache;
  }
  if (flightInflight) return flightInflight;

  flightInflight = (async () => {
    try {
      const states = await fetchOpenSkyStates();
      const flights = states ? normalizeFlights(states) : [];
      flightCache = {
        at: Date.now(),
        flights,
        ok: true,
      };
      return flightCache;
    } catch (err) {
      const message = err instanceof Error ? err.message : "OpenSky failed";
      if (flightCache?.ok) {
        // Serve stale briefly
        return flightCache;
      }
      flightCache = {
        at: Date.now(),
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

  return {
    ok: flightsRes.ok || satellitesSource === "live",
    at: new Date().toISOString(),
    flights: flightsRes.flights,
    satellites,
    flightsSource: flightsRes.ok ? "live" : "unavailable",
    satellitesSource,
    error: flightsRes.error,
  };
}
