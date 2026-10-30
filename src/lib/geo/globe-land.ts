/** Fibonacci land samples for the monitor point-globe (same mask as Cobe). */

const MAP_URL = "/monitor/world-mask.png";

let cached: Float32Array | null = null;
let loading: Promise<Float32Array> | null = null;

/** Spot radius — a small cluster of land dots, still readable on TV. */
export const SPOT_RADIUS_RAD = (2.8 * Math.PI) / 180;

function lonLatToXyz(latDeg: number, lonDeg: number): [number, number, number] {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const cl = Math.cos(lat);
  // Y-up, east = +lon. Negate Z so west sits left when facing +Z (north up).
  // Without this, Europe appears east of Asia — map looks mirrored.
  return [cl * Math.cos(lon), Math.sin(lat), -cl * Math.sin(lon)];
}

function isLand(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  latDeg: number,
  lonDeg: number,
): boolean {
  const u = ((lonDeg + 180) / 360) * w;
  const v = ((90 - latDeg) / 180) * h;
  const x = Math.min(w - 1, Math.max(0, Math.floor(u)));
  const y = Math.min(h - 1, Math.max(0, Math.floor(v)));
  const i = (y * w + x) * 4;
  return (data[i] ?? 0) > 40;
}

/**
 * Unit-sphere XYZ for land only. Cached after first load.
 */
export async function sampleLandPoints(target = 14_000): Promise<Float32Array> {
  if (cached && cached.length >= target * 3) {
    return cached.subarray(0, target * 3);
  }
  if (loading) return loading;

  loading = (async () => {
    const img = await loadImage(MAP_URL);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return new Float32Array(0);
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, w, h);

    const candidates = Math.ceil(target * 2.8);
    const out = new Float32Array(target * 3);
    let n = 0;
    const golden = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < candidates && n < target; i++) {
      const y = 1 - (i / Math.max(1, candidates - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      const lat = (Math.asin(Math.max(-1, Math.min(1, y))) * 180) / Math.PI;
      // Match lonLatToXyz (z = -sin(lon)) so mask UVs aren't mirrored.
      const lon = (Math.atan2(-z, x) * 180) / Math.PI;
      if (!isLand(data, w, h, lat, lon)) continue;
      const o = n * 3;
      out[o] = x;
      out[o + 1] = y;
      out[o + 2] = z;
      n++;
    }

    cached = out.subarray(0, n * 3);
    return cached;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export function attackToXyz(lat: number, lon: number): [number, number, number] {
  return lonLatToXyz(lat, lon);
}

export type TintLayer = {
  centers: Float32Array;
  weights: Float32Array;
  rgb: [number, number, number];
  /** spot = local patch; ring = expanding ripple around centers */
  mode?: "spot" | "ring";
  /** Current ring angular radius (ring mode) */
  ringRadiusRad?: number;
  /** Gaussian width of the ring (ring mode) */
  ringWidthRad?: number;
  /** Optional override for spot radius */
  radiusRad?: number;
};

function spotHeat(
  x: number,
  y: number,
  z: number,
  centers: Float32Array,
  weights: Float32Array,
  cosR: number,
  denom: number,
): number {
  let heat = 0;
  const n = weights.length;
  for (let a = 0; a < n; a++) {
    const o = a * 3;
    const dot = x * centers[o]! + y * centers[o + 1]! + z * centers[o + 2]!;
    if (dot <= cosR) continue;
    heat = Math.max(heat, ((dot - cosR) / denom) * weights[a]!);
  }
  return heat;
}

function ringHeat(
  x: number,
  y: number,
  z: number,
  centers: Float32Array,
  weights: Float32Array,
  ringRadiusRad: number,
  ringWidthRad: number,
): number {
  let heat = 0;
  const n = weights.length;
  const width = Math.max(1e-4, ringWidthRad);
  for (let a = 0; a < n; a++) {
    const o = a * 3;
    const dot = Math.max(
      -1,
      Math.min(1, x * centers[o]! + y * centers[o + 1]! + z * centers[o + 2]!),
    );
    const ang = Math.acos(dot);
    const d = (ang - ringRadiusRad) / width;
    const h = Math.exp(-d * d) * weights[a]!;
    heat = Math.max(heat, h);
  }
  return heat;
}

/**
 * Tint land-dot colors in-place. Layers apply in order (later on top).
 */
export function tintLandColors(
  positions: Float32Array,
  outRgb: Float32Array,
  baseRgb: [number, number, number],
  layers: TintLayer[],
  defaultRadiusRad = SPOT_RADIUS_RAD,
): void {
  const [br, bg, bb] = baseRgb;

  for (let i = 0, p = 0; p < positions.length; i++, p += 3) {
    const x = positions[p]!;
    const y = positions[p + 1]!;
    const z = positions[p + 2]!;
    let r = br;
    let g = bg;
    let b = bb;
    for (const layer of layers) {
      let t = 0;
      if (layer.mode === "ring") {
        t = Math.min(
          1,
          ringHeat(
            x,
            y,
            z,
            layer.centers,
            layer.weights,
            layer.ringRadiusRad ?? 0,
            layer.ringWidthRad ?? (1.2 * Math.PI) / 180,
          ),
        );
      } else {
        const radius = layer.radiusRad ?? defaultRadiusRad;
        const cosR = Math.cos(radius);
        const denom = Math.max(1e-6, 1 - cosR);
        t = Math.min(
          1,
          spotHeat(x, y, z, layer.centers, layer.weights, cosR, denom),
        );
      }
      if (t <= 0) continue;
      r += (layer.rgb[0] - r) * t;
      g += (layer.rgb[1] - g) * t;
      b += (layer.rgb[2] - b) * t;
    }
    const o = i * 3;
    outRgb[o] = r;
    outRgb[o + 1] = g;
    outRgb[o + 2] = b;
  }
}
