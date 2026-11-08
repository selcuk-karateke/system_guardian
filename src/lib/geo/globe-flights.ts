/**
 * Stylized air traffic for the monitor globe (v1).
 * Great-circle corridors with ping-pong craft — not live ADS-B.
 * Points are [lat, lon] degrees.
 */

export type GlobeFlight = {
  id: string;
  /** Callsign-ish label for hover. */
  name: string;
  from: [number, number];
  to: [number, number];
  /** Visual seconds for one one-way hop. */
  durationSec: number;
  /** Start offset 0..1 along the route. */
  phase: number;
};

/** Elemental --ok (same family as SSH/session markers). */
export const FLIGHT_STYLE = {
  css: "rgb(74 222 128)",
  alpha: 0.92,
  corridorAlpha: 0.14,
  size: 3.4,
  elev: 1.028,
  bulge: 0.045,
};

/**
 * Busy long-haul corridors with a few craft each (offset phases).
 */
const CORRIDORS: {
  id: string;
  label: string;
  from: [number, number];
  to: [number, number];
  durationSec: number;
  craft: number;
}[] = [
  {
    id: "fra-jfk",
    label: "FRA→JFK",
    from: [50.03, 8.57],
    to: [40.64, -73.78],
    durationSec: 28,
    craft: 3,
  },
  {
    id: "lhr-jfk",
    label: "LHR→JFK",
    from: [51.47, -0.46],
    to: [40.64, -73.78],
    durationSec: 26,
    craft: 3,
  },
  {
    id: "cdg-lax",
    label: "CDG→LAX",
    from: [49.01, 2.55],
    to: [33.94, -118.41],
    durationSec: 36,
    craft: 2,
  },
  {
    id: "ams-sin",
    label: "AMS→SIN",
    from: [52.31, 4.77],
    to: [1.36, 103.99],
    durationSec: 40,
    craft: 2,
  },
  {
    id: "dxb-lhr",
    label: "DXB→LHR",
    from: [25.25, 55.36],
    to: [51.47, -0.46],
    durationSec: 24,
    craft: 3,
  },
  {
    id: "hkg-sfo",
    label: "HKG→SFO",
    from: [22.31, 113.91],
    to: [37.62, -122.38],
    durationSec: 38,
    craft: 2,
  },
  {
    id: "nrt-lax",
    label: "NRT→LAX",
    from: [35.77, 140.39],
    to: [33.94, -118.41],
    durationSec: 32,
    craft: 3,
  },
  {
    id: "syd-lax",
    label: "SYD→LAX",
    from: [-33.95, 151.18],
    to: [33.94, -118.41],
    durationSec: 42,
    craft: 2,
  },
  {
    id: "gru-lis",
    label: "GRU→LIS",
    from: [-23.43, -46.47],
    to: [38.77, -9.13],
    durationSec: 30,
    craft: 2,
  },
  {
    id: "jnb-dxb",
    label: "JNB→DXB",
    from: [-26.14, 28.25],
    to: [25.25, 55.36],
    durationSec: 28,
    craft: 2,
  },
  {
    id: "ist-jfk",
    label: "IST→JFK",
    from: [41.28, 28.75],
    to: [40.64, -73.78],
    durationSec: 34,
    craft: 2,
  },
  {
    id: "muc-pek",
    label: "MUC→PEK",
    from: [48.35, 11.79],
    to: [40.08, 116.58],
    durationSec: 36,
    craft: 2,
  },
  {
    id: "ord-nrt",
    label: "ORD→NRT",
    from: [41.98, -87.90],
    to: [35.77, 140.39],
    durationSec: 40,
    craft: 2,
  },
  {
    id: "mad-eze",
    label: "MAD→EZE",
    from: [40.47, -3.56],
    to: [-34.82, -58.54],
    durationSec: 38,
    craft: 2,
  },
  {
    id: "doh-sin",
    label: "DOH→SIN",
    from: [25.27, 51.61],
    to: [1.36, 103.99],
    durationSec: 26,
    craft: 2,
  },
  {
    id: "fra-cpt",
    label: "FRA→CPT",
    from: [50.03, 8.57],
    to: [-33.97, 18.60],
    durationSec: 34,
    craft: 2,
  },
  {
    id: "sea-icn",
    label: "SEA→ICN",
    from: [47.45, -122.31],
    to: [37.46, 126.44],
    durationSec: 36,
    craft: 2,
  },
  {
    id: "auh-mel",
    label: "AUH→MEL",
    from: [24.43, 54.65],
    to: [-37.67, 144.84],
    durationSec: 44,
    craft: 1,
  },
  {
    id: "yyz-lhr",
    label: "YYZ→LHR",
    from: [43.68, -79.63],
    to: [51.47, -0.46],
    durationSec: 26,
    craft: 2,
  },
  {
    id: "bom-lhr",
    label: "BOM→LHR",
    from: [19.09, 72.87],
    to: [51.47, -0.46],
    durationSec: 30,
    craft: 2,
  },
];

export type GlobeCorridor = {
  id: string;
  label: string;
  from: [number, number];
  to: [number, number];
};

export const GLOBE_CORRIDORS: GlobeCorridor[] = CORRIDORS.map((c) => ({
  id: c.id,
  label: c.label,
  from: c.from,
  to: c.to,
}));

export const GLOBE_FLIGHTS: GlobeFlight[] = CORRIDORS.flatMap((c) => {
  const out: GlobeFlight[] = [];
  for (let i = 0; i < c.craft; i++) {
    out.push({
      id: `${c.id}-${i}`,
      name: `${c.label} · ${i + 1}`,
      from: c.from,
      to: c.to,
      durationSec: c.durationSec * (0.92 + (i % 3) * 0.06),
      phase: (i + 0.15) / Math.max(1, c.craft),
    });
  }
  return out;
});

/** Ping-pong 0→1→0 along the corridor. */
export function flightProgress(flight: GlobeFlight, tMs: number): number {
  const cycle = flight.durationSec * 2;
  let u = (flight.phase + tMs / 1000 / cycle) % 1;
  if (u < 0) u += 1;
  // 0..0.5 outbound, 0.5..1 return
  return u < 0.5 ? u * 2 : 2 - u * 2;
}

/** Heading sign: +1 outbound, −1 return (for triangle orientation). */
export function flightHeadingSign(flight: GlobeFlight, tMs: number): number {
  const cycle = flight.durationSec * 2;
  let u = (flight.phase + tMs / 1000 / cycle) % 1;
  if (u < 0) u += 1;
  return u < 0.5 ? 1 : -1;
}
