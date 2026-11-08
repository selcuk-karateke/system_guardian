/**
 * Low-precision live Sun / Moon sub-points (Earth lat/lon under the body).
 * Meeus-style approximations — good enough for HUD globe, not navigation.
 */

export type AstroBody = {
  id: "sun" | "moon";
  name: string;
  lat: number;
  lon: number;
  /** Illuminated fraction 0..1 (moon); sun = 1. */
  phase: number;
};

export type AstroSky = {
  at: number;
  sun: AstroBody;
  moon: AstroBody;
};

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

function wrap180(deg: number): number {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

function clampLat(deg: number): number {
  return Math.max(-90, Math.min(90, deg));
}

/** Julian Date (UTC). */
export function julianDate(date: Date): number {
  return date.getTime() / 86_400_000 + 2_440_587.5;
}

/** Greenwich mean sidereal time (degrees). */
function gmstDeg(jd: number): number {
  const T = (jd - 2_451_545.0) / 36_525;
  let gmst =
    280.46061837 +
    360.98564736629 * (jd - 2_451_545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38_710_000;
  gmst = ((gmst % 360) + 360) % 360;
  return gmst;
}

/**
 * Sun geometric subsolar point (approx ±0.1°).
 */
export function sunSubpoint(date: Date): AstroBody {
  const jd = julianDate(date);
  const T = (jd - 2_451_545.0) / 36_525;

  // Mean longitude & anomaly (deg)
  const L0 = (280.46646 + 36000.76983 * T + 0.0003032 * T * T) % 360;
  const M =
    (357.52911 + 35999.05029 * T - 0.0001537 * T * T) % 360;
  const Mr = M * DEG;

  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) +
    0.000289 * Math.sin(3 * Mr);

  const trueLong = (L0 + C) * DEG;
  const eps =
    (23.439291 - 0.0130042 * T - 0.00000016 * T * T) * DEG;

  const ra = Math.atan2(Math.cos(eps) * Math.sin(trueLong), Math.cos(trueLong));
  const dec = Math.asin(Math.sin(eps) * Math.sin(trueLong));

  const lon = wrap180(ra * RAD - gmstDeg(jd));
  const lat = clampLat(dec * RAD);

  return { id: "sun", name: "Sonne", lat, lon, phase: 1 };
}

/**
 * Moon geocentric sublunar point + illuminated fraction (approx).
 */
export function moonSubpoint(date: Date): AstroBody {
  const jd = julianDate(date);
  const T = (jd - 2_451_545.0) / 36_525;

  const Lp =
    (218.3164477 +
      481267.88123421 * T -
      0.0015786 * T * T +
      (T * T * T) / 538_841) %
    360;
  const D =
    (297.8501921 +
      445267.1114034 * T -
      0.0018819 * T * T +
      (T * T * T) / 545_868) %
    360;
  const M =
    (357.5291092 + 35999.0502909 * T - 0.0001536 * T * T) % 360;
  const Mp =
    (134.9633964 +
      477198.8675055 * T +
      0.0087414 * T * T +
      (T * T * T) / 69_699) %
    360;
  const F =
    (93.272095 +
      483202.0175233 * T -
      0.0036539 * T * T) %
    360;

  const Dr = D * DEG;
  const Mr = M * DEG;
  const Mpr = Mp * DEG;
  const Fr = F * DEG;

  // Longitude / latitude periodic terms (deg) — leading terms only
  const lonEcl =
    Lp +
    6.289 * Math.sin(Mpr) +
    1.274 * Math.sin(2 * Dr - Mpr) +
    0.658 * Math.sin(2 * Dr) +
    0.214 * Math.sin(2 * Mpr) -
    0.186 * Math.sin(Mr) -
    0.114 * Math.sin(2 * Fr);

  const latEcl =
    5.128 * Math.sin(Fr) +
    0.281 * Math.sin(Mpr + Fr) +
    0.278 * Math.sin(Mpr - Fr) +
    0.173 * Math.sin(2 * Dr - Fr);

  const eps =
    (23.439291 - 0.0130042 * T) * DEG;
  const lonR = lonEcl * DEG;
  const latR = latEcl * DEG;

  const cosB = Math.cos(latR);
  const x = Math.cos(lonR) * cosB;
  const y = Math.sin(lonR) * cosB;
  const z = Math.sin(latR);

  // Equatorial
  const xe = x;
  const ye = y * Math.cos(eps) - z * Math.sin(eps);
  const ze = y * Math.sin(eps) + z * Math.cos(eps);

  const ra = Math.atan2(ye, xe);
  const dec = Math.atan2(ze, Math.hypot(xe, ye));

  const lon = wrap180(ra * RAD - gmstDeg(jd));
  const lat = clampLat(dec * RAD);

  // Illumination from phase angle (sun–moon elongation approx)
  const sun = sunSubpoint(date);
  const cosPsi =
    Math.sin(sun.lat * DEG) * Math.sin(lat * DEG) +
    Math.cos(sun.lat * DEG) *
      Math.cos(lat * DEG) *
      Math.cos((sun.lon - lon) * DEG);
  const psi = Math.acos(Math.max(-1, Math.min(1, cosPsi)));
  const phase = (1 + Math.cos(psi)) / 2;

  return { id: "moon", name: "Mond", lat, lon, phase };
}

export function liveAstro(date = new Date()): AstroSky {
  return {
    at: date.getTime(),
    sun: sunSubpoint(date),
    moon: moonSubpoint(date),
  };
}

/** Unit vector toward the sun in globe XYZ (for WebGL lighting). */
export function sunDirection(date = new Date()): [number, number, number] {
  const s = sunSubpoint(date);
  const lat = s.lat * DEG;
  const lon = s.lon * DEG;
  const cl = Math.cos(lat);
  // Match attackToXyz / lonLatToXyz: z = −sin(lon)
  return [cl * Math.cos(lon), Math.sin(lat), -cl * Math.sin(lon)];
}
