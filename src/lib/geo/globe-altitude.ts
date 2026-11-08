/**
 * Compressed radial scale for the monitor globe (Earth radius = 1).
 * Real GEO ≈ 6.6 R would leave the HUD; we keep relative order only.
 *
 * Bands (visual R):
 *   surface/cables  ~1.01
 *   aircraft        ~1.03–1.06
 *   LEO             ~1.08–1.13
 *   MEO             ~1.17–1.25
 *   GEO             ~1.31–1.35
 *   Moon*           ~1.41  (symbol — real ~60 R)
 *   Sun*            ~1.49  (symbol — real ~23k R)
 */

export const GLOBE_ALT = {
  cable: 1.012,
  flightMin: 1.028,
  flightMax: 1.058,
  leoMin: 1.08,
  leoMax: 1.13,
  meoMin: 1.17,
  meoMax: 1.25,
  geoMin: 1.31,
  geoMax: 1.35,
  /** Symbolic — always outside GEO band. */
  moon: 1.41,
  /** Symbolic — outermost marker. */
  sun: 1.49,
} as const;

/** Rays canvas pad must fit sun @ ~1.49 × GLOBE_SCALE 0.97. */
export const GLOBE_RAY_PAD_FRAC = 0.24;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/**
 * Map real altitude (km) → compressed globe radius.
 * Piecewise so LEO/MEO/GEO stay visually separable.
 */
export function visualOrbitRadius(altKm: number): number {
  const a = Math.max(0, altKm);
  if (a < 2_000) {
    // LEO shell
    const t = Math.log1p(a / 80) / Math.log1p(2_000 / 80);
    return lerp(GLOBE_ALT.leoMin, GLOBE_ALT.leoMax, t);
  }
  if (a < 15_000) {
    const t = (a - 2_000) / (15_000 - 2_000);
    return lerp(GLOBE_ALT.meoMin, GLOBE_ALT.meoMax, t);
  }
  // GEO / high
  const t = Math.log1p((a - 15_000) / 2_000) / Math.log1p(25_000 / 2_000);
  return lerp(GLOBE_ALT.geoMin, GLOBE_ALT.geoMax, t);
}

/** Aircraft stay in a thin band just above the surface. */
export function visualFlightElev(altKm: number): number {
  const t = Math.min(1, Math.max(0, altKm / 12));
  return lerp(GLOBE_ALT.flightMin, GLOBE_ALT.flightMax, t);
}
