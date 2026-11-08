/**
 * Stylized orbital layer for the monitor globe (v1).
 * Elements are simplified circular orbits — not TLEs / SGP4.
 * Time is sped up so LEO motion is readable on a wall display.
 */

export type SatKind = "leo" | "meo" | "geo";

export type GlobeSatellite = {
  id: string;
  name: string;
  kind: SatKind;
  /** Radius in globe units (1 = surface). */
  radius: number;
  /** Inclination degrees. */
  incl: number;
  /** RAAN / nodal longitude degrees. */
  raan: number;
  /** Mean motion rad/s (already visually accelerated). */
  omega: number;
  /** Phase at t=0 (rad). */
  phase: number;
  /** Optional constellation tag for shared orbit ring. */
  planeId?: string;
};

export const SAT_STYLE: Record<
  SatKind,
  { css: string; alpha: number; r: number; orbitAlpha: number }
> = {
  leo: { css: "rgb(167 243 208)", alpha: 0.95, r: 2.2, orbitAlpha: 0.12 },
  meo: { css: "rgb(196 181 253)", alpha: 0.9, r: 2.0, orbitAlpha: 0.1 },
  geo: { css: "rgb(253 224 71)", alpha: 0.92, r: 2.4, orbitAlpha: 0.14 },
};

/** ~90 real minutes → ~18s on screen. */
const LEO_OMEGA = (Math.PI * 2) / 18;
/** MEO slower. */
const MEO_OMEGA = (Math.PI * 2) / 42;
/** GEO fixed in Earth frame (ω≈0). */
const GEO_OMEGA = 0;

function planeSats(opts: {
  planeId: string;
  name: string;
  kind: SatKind;
  radius: number;
  incl: number;
  raan: number;
  count: number;
  omega: number;
  phase0?: number;
}): GlobeSatellite[] {
  const out: GlobeSatellite[] = [];
  const phase0 = opts.phase0 ?? 0;
  for (let i = 0; i < opts.count; i++) {
    out.push({
      id: `${opts.planeId}-${i}`,
      name: `${opts.name} · ${i + 1}`,
      kind: opts.kind,
      radius: opts.radius,
      incl: opts.incl,
      raan: opts.raan,
      omega: opts.omega,
      phase: phase0 + (i / opts.count) * Math.PI * 2,
      planeId: opts.planeId,
    });
  }
  return out;
}

/**
 * Notable craft + sample constellation planes.
 * Starlink/OneWeb are plane samples, not the full catalog.
 */
export const GLOBE_SATELLITES: GlobeSatellite[] = [
  // Radii compressed for HUD framing (real GEO≈6.6R would leave the canvas).
  {
    id: "iss",
    name: "ISS",
    kind: "leo",
    radius: 1.055,
    incl: 51.6,
    raan: 40,
    omega: LEO_OMEGA * 1.05,
    phase: 0.4,
  },
  {
    id: "tiangong",
    name: "Tiangong",
    kind: "leo",
    radius: 1.05,
    incl: 41.5,
    raan: 110,
    omega: LEO_OMEGA,
    phase: 2.1,
  },
  {
    id: "hubble",
    name: "Hubble",
    kind: "leo",
    radius: 1.06,
    incl: 28.5,
    raan: 200,
    omega: LEO_OMEGA * 0.98,
    phase: 4.2,
  },
  {
    id: "css-cargo",
    name: "Tianzhou",
    kind: "leo",
    radius: 1.048,
    incl: 41.5,
    raan: 112,
    omega: LEO_OMEGA,
    phase: 3.4,
  },

  // Starlink — a few orbital shells / planes
  ...planeSats({
    planeId: "starlink-a",
    name: "Starlink",
    kind: "leo",
    radius: 1.065,
    incl: 53,
    raan: 15,
    count: 10,
    omega: LEO_OMEGA * 1.1,
  }),
  ...planeSats({
    planeId: "starlink-b",
    name: "Starlink",
    kind: "leo",
    radius: 1.065,
    incl: 53,
    raan: 75,
    count: 10,
    omega: LEO_OMEGA * 1.1,
    phase0: 0.6,
  }),
  ...planeSats({
    planeId: "starlink-c",
    name: "Starlink",
    kind: "leo",
    radius: 1.07,
    incl: 70,
    raan: 140,
    count: 8,
    omega: LEO_OMEGA * 1.08,
    phase0: 1.2,
  }),
  ...planeSats({
    planeId: "starlink-d",
    name: "Starlink",
    kind: "leo",
    radius: 1.07,
    incl: 97.6,
    raan: 210,
    count: 8,
    omega: LEO_OMEGA * 1.12,
    phase0: 0.3,
  }),

  // OneWeb polar-ish
  ...planeSats({
    planeId: "oneweb-a",
    name: "OneWeb",
    kind: "leo",
    radius: 1.078,
    incl: 87.4,
    raan: 30,
    count: 8,
    omega: LEO_OMEGA * 0.92,
  }),
  ...planeSats({
    planeId: "oneweb-b",
    name: "OneWeb",
    kind: "leo",
    radius: 1.078,
    incl: 87.4,
    raan: 120,
    count: 8,
    omega: LEO_OMEGA * 0.92,
    phase0: 1.0,
  }),

  // Iridium NEXT
  ...planeSats({
    planeId: "iridium-a",
    name: "Iridium",
    kind: "leo",
    radius: 1.072,
    incl: 86.4,
    raan: 0,
    count: 6,
    omega: LEO_OMEGA * 0.95,
  }),
  ...planeSats({
    planeId: "iridium-b",
    name: "Iridium",
    kind: "leo",
    radius: 1.072,
    incl: 86.4,
    raan: 60,
    count: 6,
    omega: LEO_OMEGA * 0.95,
    phase0: 0.8,
  }),

  // GPS (MEO) — 4 of 6 planes
  ...planeSats({
    planeId: "gps-a",
    name: "GPS",
    kind: "meo",
    radius: 1.13,
    incl: 55,
    raan: 0,
    count: 4,
    omega: MEO_OMEGA,
  }),
  ...planeSats({
    planeId: "gps-b",
    name: "GPS",
    kind: "meo",
    radius: 1.13,
    incl: 55,
    raan: 60,
    count: 4,
    omega: MEO_OMEGA,
    phase0: 0.7,
  }),
  ...planeSats({
    planeId: "gps-c",
    name: "GPS",
    kind: "meo",
    radius: 1.13,
    incl: 55,
    raan: 120,
    count: 4,
    omega: MEO_OMEGA,
    phase0: 1.4,
  }),
  ...planeSats({
    planeId: "galileo-a",
    name: "Galileo",
    kind: "meo",
    radius: 1.14,
    incl: 56,
    raan: 25,
    count: 4,
    omega: MEO_OMEGA * 0.97,
  }),
  ...planeSats({
    planeId: "glonass-a",
    name: "GLONASS",
    kind: "meo",
    radius: 1.125,
    incl: 64.8,
    raan: 80,
    count: 4,
    omega: MEO_OMEGA * 1.02,
  }),

  // Geostationary belt samples (fixed over equator)
  {
    id: "goes-e",
    name: "GOES-East",
    kind: "geo",
    radius: 1.185,
    incl: 0,
    raan: 0,
    omega: GEO_OMEGA,
    phase: (-75.2 * Math.PI) / 180,
  },
  {
    id: "goes-w",
    name: "GOES-West",
    kind: "geo",
    radius: 1.185,
    incl: 0,
    raan: 0,
    omega: GEO_OMEGA,
    phase: (-137.2 * Math.PI) / 180,
  },
  {
    id: "meteo-eu",
    name: "Meteosat",
    kind: "geo",
    radius: 1.185,
    incl: 0,
    raan: 0,
    omega: GEO_OMEGA,
    phase: (0 * Math.PI) / 180,
  },
  {
    id: "himawari",
    name: "Himawari",
    kind: "geo",
    radius: 1.185,
    incl: 0,
    raan: 0,
    omega: GEO_OMEGA,
    phase: (140.7 * Math.PI) / 180,
  },
  {
    id: "insat",
    name: "INSAT",
    kind: "geo",
    radius: 1.185,
    incl: 0,
    raan: 0,
    omega: GEO_OMEGA,
    phase: (82 * Math.PI) / 180,
  },
  {
    id: "eutelsat",
    name: "Eutelsat",
    kind: "geo",
    radius: 1.185,
    incl: 0,
    raan: 0,
    omega: GEO_OMEGA,
    phase: (7 * Math.PI) / 180,
  },
  {
    id: "astra",
    name: "Astra",
    kind: "geo",
    radius: 1.185,
    incl: 0,
    raan: 0,
    omega: GEO_OMEGA,
    phase: (19.2 * Math.PI) / 180,
  },
  {
    id: "ses",
    name: "SES",
    kind: "geo",
    radius: 1.185,
    incl: 0,
    raan: 0,
    omega: GEO_OMEGA,
    phase: (-22 * Math.PI) / 180,
  },
];

/** Unique orbital planes for faint ring strokes. */
export type OrbitPlane = {
  id: string;
  kind: SatKind;
  radius: number;
  incl: number;
  raan: number;
};

export const GLOBE_ORBIT_PLANES: OrbitPlane[] = (() => {
  const map = new Map<string, OrbitPlane>();
  for (const s of GLOBE_SATELLITES) {
    const id = s.planeId ?? s.id;
    if (map.has(id)) continue;
    map.set(id, {
      id,
      kind: s.kind,
      radius: s.radius,
      incl: s.incl,
      raan: s.raan,
    });
  }
  return [...map.values()];
})();

/**
 * Unit-ish XYZ in globe frame (Y-up, Z = −sin lon).
 * GEO uses phase as Earth-fixed longitude on the equator.
 */
export function satelliteXyz(
  sat: GlobeSatellite,
  tMs: number,
): [number, number, number] {
  const r = sat.radius;
  const anomaly = sat.phase + sat.omega * (tMs / 1000);
  const i = (sat.incl * Math.PI) / 180;
  const O = (sat.raan * Math.PI) / 180;

  // Equatorial circle in XZ matching globe lon (z = −sin lon), then incline + RAAN.
  let x = r * Math.cos(anomaly);
  let y = 0;
  let z = -r * Math.sin(anomaly);

  const y1 = y * Math.cos(i) - z * Math.sin(i);
  const z1 = y * Math.sin(i) + z * Math.cos(i);
  y = y1;
  z = z1;

  const x2 = x * Math.cos(O) + z * Math.sin(O);
  const z2 = -x * Math.sin(O) + z * Math.cos(O);
  return [x2, y, z2];
}

export function orbitPoint(
  plane: OrbitPlane,
  anomaly: number,
): [number, number, number] {
  return satelliteXyz(
    {
      id: plane.id,
      name: plane.id,
      kind: plane.kind,
      radius: plane.radius,
      incl: plane.incl,
      raan: plane.raan,
      omega: 0,
      phase: anomaly,
    },
    0,
  );
}
