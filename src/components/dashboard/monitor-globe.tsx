"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { GlobeTint } from "@/lib/geo/attack-markers";
import {
  attackToXyz,
  sampleLandPoints,
  SPOT_RADIUS_RAD,
  tintLandColors,
  type TintLayer,
} from "@/lib/geo/globe-land";
import {
  GLOBE_ROUTES,
  ROUTE_STYLE,
  type GlobeRoute,
} from "@/lib/geo/globe-routes";
import {
  GLOBE_PLATES,
  PLATE_STYLE,
  formatPlateKind,
  type GlobePlate,
} from "@/lib/geo/globe-plates";
import {
  GLOBE_ORBIT_PLANES,
  GLOBE_SATELLITES,
  SAT_STYLE,
  orbitPoint,
  satelliteXyz,
  type GlobeSatellite,
} from "@/lib/geo/globe-satellites";
import {
  FLIGHT_STYLE,
  GLOBE_CORRIDORS,
  GLOBE_FLIGHTS,
  flightHeadingSign,
  flightProgress,
  type GlobeFlight,
} from "@/lib/geo/globe-flights";
import type { LiveAircraft, LiveSatellite } from "@/lib/geo/live-sky";
import {
  liveAstro,
  sunDirection,
  type AstroBody,
} from "@/lib/geo/astro";
import {
  GLOBE_ALT,
  GLOBE_RAY_PAD_FRAC,
  visualFlightElev,
  visualOrbitRadius,
} from "@/lib/geo/globe-altitude";

type Status = "healthy" | "warning" | "critical";

type Props = {
  status: Status;
  attackMarkers?: GlobeTint[];
  sessionMarkers?: GlobeTint[];
  webMarkers?: GlobeTint[];
  homeMarker?: GlobeTint | null;
  /** Drag + hover readout only — look/brightness is shared everywhere. */
  interactive?: boolean;
  /** Undersea fiber overlay (default on). */
  showCables?: boolean;
  /** Oil/gas corridor overlay (default on). */
  showPipelines?: boolean;
  /** Tectonic plate boundaries (default on). */
  showPlates?: boolean;
  /** Orbital satellites overlay (default on). */
  showSats?: boolean;
  /** Air-traffic overlay (default on). */
  showFlights?: boolean;
  /** Live sun + moon + day/night lighting (default on). */
  showAstro?: boolean;
  /** Live OpenSky positions — null = stylized demo corridors. */
  liveFlights?: LiveAircraft[] | null;
  /** ISO time of the flight snapshot (dead-reckoning base). */
  liveFlightsAt?: string | null;
  /** Live CelesTrak/SGP4 positions — null = stylized demo orbits. */
  liveSatellites?: LiveSatellite[] | null;
};

export type MonitorGlobeHandle = {
  /** Zoom 1 + home-facing orientation + resume auto-spin. */
  resetView: () => void;
};

type RayKind = "web" | "session" | "home" | "attack";

const KIND_LABEL: Record<RayKind, string> = {
  web: "Web",
  session: "SSH",
  home: "Home",
  attack: "Attack",
};

/** Tip inset from rays-canvas rim so the end-dot stays inside. */
const RAY_EDGE_INSET_PX = 5;
/**
 * 3D radial lift (unit-sphere) so limb tips clear the rings.
 * Face-on markers foreshorten toward the camera instead of faking a 2D direction.
 */
const RAY_ELEV = 0.58;
/** Lateral (√(x²+y²)) below this → treat as facing the camera. */
const RAY_FACE_LATERAL = 0.12;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Outward hit of ray (ox,oy)+t(dx,dy) with circle (cx,cy,r). */
function rimAlong(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  cx: number,
  cy: number,
  r: number,
): { x: number; y: number } {
  const px = ox - cx;
  const py = oy - cy;
  const b = 2 * (px * dx + py * dy);
  const c = px * px + py * py - r * r;
  const disc = b * b - 4 * c;
  if (disc < 0) return { x: ox + dx * 24, y: oy + dy * 24 };
  const t = Math.max(0, (-b + Math.sqrt(disc)) / 2);
  return { x: ox + dx * t, y: oy + dy * t };
}
/** Great-circle attack → home samples + mid-arc lift above the surface. */
const ARC_STEPS = 48;
/** Mid-arc lift — needs RAY_PAD_FRAC so limbs aren't canvas-clipped. */
const ARC_BULGE = 0.1;
const ARC_MAX = 14;
/** Match marker ray stroke weight. */
const MARKER_LINE_W = 3.2;
const MARKER_LINE_W_PULSE = 4.0;
const MARKER_LINE_W_HOT = 5.2;

/** `rgb(r g b)` / `rgb(r, g, b)` → rgba for tip gradients. */
function rgbAlpha(css: string, a: number): string {
  const m = css.match(/(\d+)\s*,?\s*(\d+)\s*,?\s*(\d+)/);
  if (!m) return css;
  return `rgba(${m[1]},${m[2]},${m[3]},${Math.max(0, Math.min(1, a))})`;
}

/** Soft only at path ends — mid-path stays solid (not the N–S center fade). */
function tipFade(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  if (u < 0.12) return u / 0.12;
  if (u > 0.88) return (1 - u) / 0.12;
  return 1;
}
/**
 * Rays canvas pad vs land box (must match CSS inset on .monitor-hud-globe-rays).
 * Must fit compressed GEO + symbolic sun (~1.49R × GLOBE_SCALE).
 */
const RAY_PAD_FRAC = GLOBE_RAY_PAD_FRAC;

const WEB_CSS = "rgb(180 245 255)";
const SESSION_CSS = "rgb(90 255 140)";
const HOME_CSS = "rgb(255 230 90)";
const ATTACK_CSS = "rgb(255 95 75)";
const RIPPLE_RGB: [number, number, number] = [1, 0.55, 0.25];
const WEB_RGB: [number, number, number] = [0.7, 0.96, 1];
const SESSION_RGB: [number, number, number] = [0.35, 1, 0.55];
const HOME_RGB: [number, number, number] = [1, 0.9, 0.35];
const ATTACK_RGB: [number, number, number] = [1, 0.37, 0.29];

function markSpotRgb(kind: RayKind): [number, number, number] {
  if (kind === "attack") return ATTACK_RGB;
  if (kind === "session") return SESSION_RGB;
  if (kind === "home") return HOME_RGB;
  return WEB_RGB;
}

/** One look for screensaver, night, and standalone — no per-view dimming. */
const PALETTE: Record<
  Status,
  {
    base: [number, number, number];
    glow: string;
  }
> = {
  healthy: {
    base: [0.38, 0.92, 0.98],
    glow: "rgb(56 226 255 / 72%)",
  },
  warning: {
    base: [1, 0.82, 0.35],
    glow: "rgb(251 191 36 / 70%)",
  },
  critical: {
    base: [1, 0.48, 0.42],
    glow: "rgb(248 113 113 / 72%)",
  },
};

const GLOBE_POINT_MUL = 2.35;
const GLOBE_AMB = 0.55;

const VERT = `
attribute vec3 a_pos;
attribute vec3 a_col;
uniform mat3 u_rot;
uniform float u_scale;
uniform float u_point;
uniform vec3 u_light;
uniform float u_amb;
varying vec3 v_col;
varying float v_z;
void main() {
  vec3 p = u_rot * a_pos;
  v_z = p.z;
  float amb = clamp(u_amb, 0.2, 0.75);
  float lit = amb + (1.0 - amb) * max(0.0, dot(normalize(p), u_light));
  v_col = a_col * lit;
  gl_Position = vec4(p.x * u_scale, p.y * u_scale, -p.z * 0.5, 1.0);
  gl_PointSize = max(1.0, u_point * (0.75 + 0.35 * p.z));
}
`;

const FRAG = `
precision mediump float;
varying vec3 v_col;
varying float v_z;
void main() {
  if (v_z < -0.02) discard;
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = dot(c, c);
  if (d > 0.25) discard;
  float a = smoothstep(0.25, 0.04, d);
  gl_FragColor = vec4(v_col, a);
}
`;

type Ripple = {
  id: string;
  xyz: [number, number, number];
  t0: number;
};

type RayMark = {
  tint: GlobeTint;
  kind: RayKind;
  color: string;
  pulse: boolean;
};

type ProjectedTip = {
  mark: RayMark;
  tipX: number;
  tipY: number;
  z: number;
};

const RIPPLE_MS = 3200;
const RIPPLE_MAX_RAD = (22 * Math.PI) / 180;
/**
 * Slightly under 1 so land-dot sprites aren't WebGL-clipped
 * (that was the flat left/right cut). Canvas itself is already
 * sized to ring--1 (84%).
 */
const GLOBE_SCALE = 0.97;
/** Interactive zoom multiplier range (applied on top of GLOBE_SCALE). */
const ZOOM_MIN = 0.62;
const ZOOM_MAX = 2.2;

function compile(
  gl: WebGLRenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(
  gl: WebGLRenderingContext,
  vs: string,
  fs: string,
): WebGLProgram | null {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

/** R = Ry(phi) * Rx(theta), column-major for mulRot. */
function rotMat(phi: number, theta: number, out: Float32Array): void {
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  out[0] = cp;
  out[1] = 0;
  out[2] = -sp;
  out[3] = sp * st;
  out[4] = ct;
  out[5] = cp * st;
  out[6] = sp * ct;
  out[7] = -st;
  out[8] = cp * ct;
}

/** out = a * b (column-major 3×3). */
function matMul(
  a: Float32Array,
  b: Float32Array,
  out: Float32Array,
): void {
  const r0 = a[0]! * b[0]! + a[3]! * b[1]! + a[6]! * b[2]!;
  const r1 = a[1]! * b[0]! + a[4]! * b[1]! + a[7]! * b[2]!;
  const r2 = a[2]! * b[0]! + a[5]! * b[1]! + a[8]! * b[2]!;
  const r3 = a[0]! * b[3]! + a[3]! * b[4]! + a[6]! * b[5]!;
  const r4 = a[1]! * b[3]! + a[4]! * b[4]! + a[7]! * b[5]!;
  const r5 = a[2]! * b[3]! + a[5]! * b[4]! + a[8]! * b[5]!;
  const r6 = a[0]! * b[6]! + a[3]! * b[7]! + a[6]! * b[8]!;
  const r7 = a[1]! * b[6]! + a[4]! * b[7]! + a[7]! * b[8]!;
  const r8 = a[2]! * b[6]! + a[5]! * b[7]! + a[8]! * b[8]!;
  out[0] = r0;
  out[1] = r1;
  out[2] = r2;
  out[3] = r3;
  out[4] = r4;
  out[5] = r5;
  out[6] = r6;
  out[7] = r7;
  out[8] = r8;
}

function setRotX(angle: number, out: Float32Array): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = c;
  out[5] = s;
  out[6] = 0;
  out[7] = -s;
  out[8] = c;
}

function setRotY(angle: number, out: Float32Array): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  out[0] = c;
  out[1] = 0;
  out[2] = -s;
  out[3] = 0;
  out[4] = 1;
  out[5] = 0;
  out[6] = s;
  out[7] = 0;
  out[8] = c;
}

function mulRot(
  m: Float32Array,
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  return [
    m[0]! * x + m[3]! * y + m[6]! * z,
    m[1]! * x + m[4]! * y + m[7]! * z,
    m[2]! * x + m[5]! * y + m[8]! * z,
  ];
}

/**
 * Y-rotation that puts `lon` deg at the camera (+Z).
 * Land uses z = -sin(lon); identity (phi=0) faces lon=-90 (Americas).
 * Subtract π/2 so lon=0 (Europe/Africa) is centered.
 */
function phiFacingLon(lonDeg: number): number {
  return (lonDeg * Math.PI) / 180 - Math.PI / 2;
}

/** Prefer home longitude so the monitored server region faces the camera. */
function phiTowardTints(lists: (GlobeTint | null | undefined)[]): number {
  const home = lists.find((m): m is GlobeTint => !!m);
  if (home) return phiFacingLon(home.location[1]);
  const all = lists.filter((m): m is GlobeTint => !!m);
  if (!all.length) return phiFacingLon(10); // Europe default
  const lon = all.reduce((sum, m) => sum + m.location[1], 0) / all.length;
  return phiFacingLon(lon);
}

function tintKey(
  attacks: GlobeTint[],
  sessions: GlobeTint[],
  web: GlobeTint[],
  home: GlobeTint | null | undefined,
): string {
  const one = (m: GlobeTint) =>
    `${m.id}:${m.weight.toFixed(2)}:${m.freshness.toFixed(2)}`;
  return [
    attacks.map(one).join(","),
    sessions.map(one).join(","),
    web.map(one).join(","),
    home ? one(home) : "",
  ].join("#");
}

function collectRays(
  web: GlobeTint[],
  sessions: GlobeTint[],
  home: GlobeTint | null | undefined,
  attacks: GlobeTint[],
): RayMark[] {
  const out: RayMark[] = [];
  for (const t of web)
    out.push({ tint: t, kind: "web", color: WEB_CSS, pulse: false });
  for (const t of sessions)
    out.push({ tint: t, kind: "session", color: SESSION_CSS, pulse: false });
  if (home)
    out.push({ tint: home, kind: "home", color: HOME_CSS, pulse: false });
  for (const t of attacks)
    out.push({ tint: t, kind: "attack", color: ATTACK_CSS, pulse: true });
  return out;
}

function projectTips(
  rot: Float32Array,
  css: number,
  marks: RayMark[],
  scale: number,
): ProjectedTip[] {
  const cx = css / 2;
  const cy = css / 2;
  const R = (css / 2) * scale;
  const edgeR = css / 2 - RAY_EDGE_INSET_PX;
  const out: ProjectedTip[] = [];
  for (const mark of marks) {
    const [x0, y0, z0] = attackToXyz(
      mark.tint.location[0],
      mark.tint.location[1],
    );
    const [x, y, z] = mulRot(rot, x0, y0, z0);
    if (arcDepthFade(z) < 0.04) continue;
    const sx = cx + x * R;
    const sy = cy - y * R;
    const tipX = cx + x * (1 + RAY_ELEV) * R;
    const tipY = cy - y * (1 + RAY_ELEV) * R;
    const vx = tipX - sx;
    const vy = tipY - sy;
    const vlen = Math.hypot(vx, vy);
    const lateral = Math.hypot(x, y);
    const limb = smoothstep(RAY_FACE_LATERAL, 0.55, lateral);
    out.push({ mark, tipX: sx, tipY: sy, z });
    if (vlen < 0.5 || limb < 0.05) {
      // Face-on: tip is the surface bloom (toward camera)
      out.push({ mark, tipX: sx, tipY: sy, z });
      continue;
    }
    const dx = vx / vlen;
    const dy = vy / vlen;
    const rim = rimAlong(sx, sy, dx, dy, cx, cy, edgeR);
    out.push({
      mark,
      tipX: tipX + (rim.x - tipX) * limb,
      tipY: tipY + (rim.y - tipY) * limb,
      z,
    });
  }
  return out;
}

function nearestTip(
  tips: ProjectedTip[],
  mx: number,
  my: number,
  maxDist = 36,
): ProjectedTip | null {
  let best: ProjectedTip | null = null;
  let bestD = maxDist;
  for (const tip of tips) {
    const d = Math.hypot(tip.tipX - mx, tip.tipY - my);
    if (d <= bestD) {
      bestD = d;
      best = tip;
    }
  }
  return best;
}

function formatHover(mark: RayMark): string {
  const t = mark.tint;
  const title = t.label && t.label !== t.id ? t.label : t.id;
  const hits = t.hits != null ? ` · ${t.hits} hits` : "";
  const country = t.country && t.country !== "?" ? ` · ${t.country}` : "";
  const fresh = Math.round(t.freshness * 100);
  return `${KIND_LABEL[mark.kind]} · ${title}${country}${hits} · ${fresh}% fresh`;
}

/** Unit-sphere slerp for great-circle attack arcs. */
function slerpUnit(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  t: number,
): [number, number, number] {
  let dot = ax * bx + ay * by + az * bz;
  dot = Math.min(1, Math.max(-1, dot));
  const omega = Math.acos(dot);
  if (omega < 1e-4) return [ax, ay, az];
  const so = Math.sin(omega);
  const s0 = Math.sin((1 - t) * omega) / so;
  const s1 = Math.sin(t * omega) / so;
  const x = s0 * ax + s1 * bx;
  const y = s0 * ay + s1 * by;
  const z = s0 * az + s1 * bz;
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function arcDepthFade(z: number): number {
  // Soft limb fade — keep slight back-side so arcs aren't chopped mid-path.
  if (z <= -0.12) return 0;
  if (z >= 0.22) return 1;
  return (z + 0.12) / 0.34;
}

/** Slight lift so routes sit above land dots without fighting markers. */
const ROUTE_ELEV = GLOBE_ALT.cable;
/** Slightly under cables so plates read as geology, not infra. */
const PLATE_ELEV = 1.008;
/** Max densify steps per waypoint segment. */
const ROUTE_SEG_STEPS = 18;

type RouteHit = {
  route: GlobeRoute;
  tipX: number;
  tipY: number;
};

type PlateHit = {
  plate: GlobePlate;
  tipX: number;
  tipY: number;
};


type RouteLayers = {
  showCables: boolean;
  showPipelines: boolean;
  showPlates: boolean;
  showSats: boolean;
  showFlights: boolean;
  showAstro: boolean;
  hoverRouteId: string | null;
  hoverPlateId: string | null;
  hoverSatId: string | null;
  hoverFlightId: string | null;
  hoverAstroId: string | null;
};

const SUN_CSS = "rgb(251 191 36)"; // --warn
const MOON_CSS = "rgb(226 232 240)";
const SUN_ELEV = GLOBE_ALT.sun;
const MOON_ELEV = GLOBE_ALT.moon;

const ORBIT_RING_STEPS = 72;

function routeVisible(route: GlobeRoute, layers: RouteLayers): boolean {
  if (route.kind === "cable") return layers.showCables;
  return layers.showPipelines;
}

function densifyRoute(route: GlobeRoute): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const path = route.path;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const [ax, ay, az] = attackToXyz(a[0], a[1]);
    const [bx, by, bz] = attackToXyz(b[0], b[1]);
    const dot = Math.min(1, Math.max(-1, ax * bx + ay * by + az * bz));
    const ang = Math.acos(dot);
    const steps = Math.max(2, Math.min(ROUTE_SEG_STEPS, Math.ceil(ang / 0.08)));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const [x, y, z] = slerpUnit(ax, ay, az, bx, by, bz, t);
      pts.push([x * ROUTE_ELEV, y * ROUTE_ELEV, z * ROUTE_ELEV]);
    }
  }
  const last = path[path.length - 1]!;
  const [lx, ly, lz] = attackToXyz(last[0], last[1]);
  pts.push([lx * ROUTE_ELEV, ly * ROUTE_ELEV, lz * ROUTE_ELEV]);
  return pts;
}

function densifyPlate(plate: GlobePlate): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const path = plate.path;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const [ax, ay, az] = attackToXyz(a[0], a[1]);
    const [bx, by, bz] = attackToXyz(b[0], b[1]);
    const dot = Math.min(1, Math.max(-1, ax * bx + ay * by + az * bz));
    const ang = Math.acos(dot);
    const steps = Math.max(2, Math.min(ROUTE_SEG_STEPS, Math.ceil(ang / 0.08)));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const [x, y, z] = slerpUnit(ax, ay, az, bx, by, bz, t);
      pts.push([x * PLATE_ELEV, y * PLATE_ELEV, z * PLATE_ELEV]);
    }
  }
  const last = path[path.length - 1]!;
  const [lx, ly, lz] = attackToXyz(last[0], last[1]);
  pts.push([lx * PLATE_ELEV, ly * PLATE_ELEV, lz * PLATE_ELEV]);
  return pts;
}

/** Static routes → densified once (draw loop is hot). */
const ROUTE_XYZ: [number, number, number][][] = GLOBE_ROUTES.map(densifyRoute);
const PLATE_XYZ: [number, number, number][][] = GLOBE_PLATES.map(densifyPlate);

/**
 * Quiet undersea fiber + oil/gas corridors under markers/arcs.
 * Colors = elemental HUD tones (--hud-cyan / --warn). Pipelines on top.
 * Tip-fade only; center fade stays exclusive to the N–S pole axis.
 */
function drawInfraRoutes(
  ctx: CanvasRenderingContext2D,
  rot: Float32Array,
  css: number,
  scale: number,
  pad: number,
  layers: RouteLayers,
): void {
  const cx = pad + css / 2;
  const cy = pad + css / 2;
  const R = (css / 2) * scale;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  // Cables first, pipelines on top (warn yellow must not sit under cyan).
  const order = [0, 1].flatMap((pass) =>
    GLOBE_ROUTES.map((route, r) => ({ route, r })).filter(({ route }) =>
      pass === 0 ? route.kind === "cable" : route.kind === "pipeline",
    ),
  );

  for (const { route, r } of order) {
    if (!routeVisible(route, layers)) continue;
    const style = ROUTE_STYLE[route.kind];
    const xyz = ROUTE_XYZ[r]!;
    if (xyz.length < 2) continue;
    const hot = layers.hoverRouteId === route.id;
    const isPipe = route.kind === "pipeline";

    const projected: { sx: number; sy: number; z: number; t: number }[] = [];
    for (let i = 0; i < xyz.length; i++) {
      const p = xyz[i]!;
      const [x, y, z] = mulRot(rot, p[0], p[1], p[2]);
      projected.push({
        sx: cx + x * R,
        sy: cy - y * R,
        z,
        t: i / (xyz.length - 1),
      });
    }

    ctx.lineWidth = style.width * (hot ? 1.85 : 1);
    ctx.strokeStyle = style.css;
    const alphaMul = hot ? 1 : layers.hoverRouteId ? (isPipe ? 0.4 : 0.28) : 1;
    for (let i = 0; i < projected.length - 1; i++) {
      const a = projected[i]!;
      const b = projected[i + 1]!;
      const depth = (arcDepthFade(a.z) + arcDepthFade(b.z)) * 0.5;
      if (depth < 0.05) continue;
      const along = tipFade((a.t + b.t) * 0.5);
      if (along < 0.04) continue;
      // Pipelines: floor depth so warn yellow stays visible over land dots.
      const d = isPipe ? Math.max(0.62, depth) : depth;
      ctx.globalAlpha = style.alpha * d * along * alphaMul * (hot ? 1.35 : 1);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** Major plate boundaries (PB2002-inspired sketches). */
function drawPlates(
  ctx: CanvasRenderingContext2D,
  rot: Float32Array,
  css: number,
  scale: number,
  pad: number,
  layers: RouteLayers,
): void {
  if (!layers.showPlates) return;
  const cx = pad + css / 2;
  const cy = pad + css / 2;
  const R = (css / 2) * scale;
  const style = PLATE_STYLE;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = style.css;

  for (let p = 0; p < GLOBE_PLATES.length; p++) {
    const plate = GLOBE_PLATES[p]!;
    const xyz = PLATE_XYZ[p]!;
    if (xyz.length < 2) continue;
    const hot = layers.hoverPlateId === plate.id;
    const dim =
      layers.hoverPlateId != null && !hot
        ? 0.28
        : layers.hoverRouteId
          ? 0.45
          : 1;

    const projected: { sx: number; sy: number; z: number; t: number }[] = [];
    for (let i = 0; i < xyz.length; i++) {
      const pt = xyz[i]!;
      const [x, y, z] = mulRot(rot, pt[0], pt[1], pt[2]);
      projected.push({
        sx: cx + x * R,
        sy: cy - y * R,
        z,
        t: i / (xyz.length - 1),
      });
    }

    ctx.lineWidth = style.width * (hot ? 1.9 : 1);
    for (let i = 0; i < projected.length - 1; i++) {
      const a = projected[i]!;
      const b = projected[i + 1]!;
      const depth = (arcDepthFade(a.z) + arcDepthFade(b.z)) * 0.5;
      if (depth < 0.05) continue;
      const along = tipFade((a.t + b.t) * 0.5);
      if (along < 0.04) continue;
      ctx.globalAlpha =
        style.alpha * Math.max(0.55, depth) * along * dim * (hot ? 1.4 : 1);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function nearestPlate(
  rot: Float32Array,
  css: number,
  scale: number,
  mx: number,
  my: number,
  layers: RouteLayers,
  maxDist = 14,
): PlateHit | null {
  if (!layers.showPlates) return null;
  const cx = css / 2;
  const cy = css / 2;
  const R = (css / 2) * scale;
  let best: PlateHit | null = null;
  let bestD = maxDist;

  for (let p = 0; p < GLOBE_PLATES.length; p++) {
    const plate = GLOBE_PLATES[p]!;
    const xyz = PLATE_XYZ[p]!;
    for (const pt of xyz) {
      const [x, y, z] = mulRot(rot, pt[0], pt[1], pt[2]);
      if (arcDepthFade(z) < 0.12) continue;
      const sx = cx + x * R;
      const sy = cy - y * R;
      const d = Math.hypot(sx - mx, sy - my);
      if (d <= bestD) {
        bestD = d;
        best = { plate, tipX: sx, tipY: sy };
      }
    }
  }
  return best;
}

/** Nearest visible route sample in wrap/layout space (markers win first). */
function nearestRoute(
  rot: Float32Array,
  css: number,
  scale: number,
  mx: number,
  my: number,
  layers: RouteLayers,
  maxDist = 15,
): RouteHit | null {
  const cx = css / 2;
  const cy = css / 2;
  const R = (css / 2) * scale;
  let best: RouteHit | null = null;
  let bestD = maxDist;

  for (let r = 0; r < GLOBE_ROUTES.length; r++) {
    const route = GLOBE_ROUTES[r]!;
    if (!routeVisible(route, layers)) continue;
    const xyz = ROUTE_XYZ[r]!;
    for (const p of xyz) {
      const [x, y, z] = mulRot(rot, p[0], p[1], p[2]);
      if (arcDepthFade(z) < 0.12) continue;
      const sx = cx + x * R;
      const sy = cy - y * R;
      const d = Math.hypot(sx - mx, sy - my);
      if (d <= bestD) {
        bestD = d;
        best = { route, tipX: sx, tipY: sy };
      }
    }
  }
  return best;
}

function formatRouteHover(route: GlobeRoute): string {
  const kind = route.kind === "cable" ? "Kabel" : "Pipeline";
  return `${kind} · ${route.name}`;
}

function formatPlateHover(plate: GlobePlate): string {
  return `Platte · ${plate.name} · ${formatPlateKind(plate.kind)}`;
}

function formatSatHover(name: string, kind: string, live: boolean): string {
  const band = kind === "geo" ? "GEO" : kind === "meo" ? "MEO" : "LEO";
  return live
    ? `Satellit · ${name} · ${band} · LIVE`
    : `Satellit · ${name} · ${band}`;
}

function formatFlightHover(name: string, live: boolean): string {
  return live ? `Flug · ${name} · LIVE` : `Flug · ${name}`;
}

function elevXyz(
  lat: number,
  lon: number,
  elev: number,
): [number, number, number] {
  const [x, y, z] = attackToXyz(lat, lon);
  return [x * elev, y * elev, z * elev];
}

/** Offset along true track (deg) for live aircraft heading. */
function trackLookahead(
  lat: number,
  lon: number,
  trackDeg: number,
  /** ~2.5° ≈ readable screen heading on the HUD globe (0.35° was ≈1px). */
  distDeg = 2.5,
): [number, number] {
  const rad = (trackDeg * Math.PI) / 180;
  const dLat = distDeg * Math.cos(rad);
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const dLon = (distDeg * Math.sin(rad)) / Math.max(0.2, cosLat);
  return [
    Math.max(-90, Math.min(90, lat + dLat)),
    ((lon + dLon + 540) % 360) - 180,
  ];
}

/** Coast a live state vector forward a few seconds between OpenSky polls. */
function deadReckonAircraft(
  ac: LiveAircraft,
  skyAtMs: number | null,
): { lat: number; lon: number } {
  if (
    skyAtMs == null ||
    ac.track == null ||
    ac.velocity == null ||
    ac.velocity < 40
  ) {
    return { lat: ac.lat, lon: ac.lon };
  }
  const dt = Math.min(40, Math.max(0, (Date.now() - skyAtMs) / 1000));
  if (dt < 0.2) return { lat: ac.lat, lon: ac.lon };
  const rad = (ac.track * Math.PI) / 180;
  const distM = ac.velocity * dt;
  const dLat = (distM * Math.cos(rad)) / 111_320;
  const cosLat = Math.cos((ac.lat * Math.PI) / 180);
  const dLon = (distM * Math.sin(rad)) / (111_320 * Math.max(0.2, cosLat));
  return {
    lat: Math.max(-90, Math.min(90, ac.lat + dLat)),
    lon: ((ac.lon + dLon + 540) % 360) - 180,
  };
}

function drawPlaneMark(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
  size: number,
  alpha: number,
): void {
  const len = Math.hypot(dx, dy);
  let ux = dx;
  let uy = dy;
  if (len < 0.4) {
    ux = 0;
    uy = -1;
  } else {
    ux /= len;
    uy /= len;
  }
  const px = -uy;
  const py = ux;
  const s = size;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(sx + ux * s * 1.6, sy + uy * s * 1.6);
  ctx.lineTo(
    sx - ux * s * 0.9 + px * s * 0.7,
    sy - uy * s * 0.9 + py * s * 0.7,
  );
  ctx.lineTo(sx - ux * s * 0.55, sy - uy * s * 0.55);
  ctx.lineTo(
    sx - ux * s * 0.9 - px * s * 0.7,
    sy - uy * s * 0.9 - py * s * 0.7,
  );
  ctx.closePath();
  ctx.fill();
}

/** Great-circle position with mid-route altitude bulge. */
function flightXyz(
  flight: GlobeFlight,
  tMs: number,
): [number, number, number] {
  const t = flightProgress(flight, tMs);
  const [ax, ay, az] = attackToXyz(flight.from[0], flight.from[1]);
  const [bx, by, bz] = attackToXyz(flight.to[0], flight.to[1]);
  const [x, y, z] = slerpUnit(ax, ay, az, bx, by, bz, t);
  const elev =
    FLIGHT_STYLE.elev + FLIGHT_STYLE.bulge * Math.sin(Math.PI * t);
  return [x * elev, y * elev, z * elev];
}

/** Sample just ahead for heading (screen triangle). */
function flightXyzAhead(
  flight: GlobeFlight,
  tMs: number,
): [number, number, number] {
  const sign = flightHeadingSign(flight, tMs);
  const t = Math.min(1, Math.max(0, flightProgress(flight, tMs) + sign * 0.012));
  const [ax, ay, az] = attackToXyz(flight.from[0], flight.from[1]);
  const [bx, by, bz] = attackToXyz(flight.to[0], flight.to[1]);
  const [x, y, z] = slerpUnit(ax, ay, az, bx, by, bz, t);
  const elev =
    FLIGHT_STYLE.elev + FLIGHT_STYLE.bulge * Math.sin(Math.PI * t);
  return [x * elev, y * elev, z * elev];
}

type FlightDrawHit = {
  id: string;
  name: string;
  tipX: number;
  tipY: number;
};

/**
 * Live OpenSky craft, or stylized corridors + ping-pong demo.
 */
function drawFlights(
  ctx: CanvasRenderingContext2D,
  rot: Float32Array,
  css: number,
  scale: number,
  pad: number,
  tMs: number,
  layers: RouteLayers,
  liveFlights: LiveAircraft[] | null,
  liveFlightsAtMs: number | null = null,
): void {
  if (!layers.showFlights) return;
  const cx = pad + css / 2;
  const cy = pad + css / 2;
  const R = (css / 2) * scale;
  const style = FLIGHT_STYLE;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = style.css;
  ctx.fillStyle = style.css;

  if (liveFlights && liveFlights.length > 0) {
    for (const ac of liveFlights) {
      const pos = deadReckonAircraft(ac, liveFlightsAtMs);
      const softElev = visualFlightElev(ac.altKm);
      const [px, py, pz] = elevXyz(pos.lat, pos.lon, softElev);
      const [x, y, z] = mulRot(rot, px, py, pz);
      const depth = arcDepthFade(z);
      if (depth < 0.1) continue;
      const sx = cx + x * R;
      const sy = cy - y * R;
      let dx = 0;
      let dy = -1;
      if (ac.track != null) {
        const [la, lo] = trackLookahead(pos.lat, pos.lon, ac.track);
        const [ax, ay, az] = elevXyz(la, lo, softElev);
        const [hx, hy] = mulRot(rot, ax, ay, az);
        dx = cx + hx * R - sx;
        dy = cy - hy * R - sy;
      }
      const hot = layers.hoverFlightId === ac.id;
      const dim = layers.hoverFlightId != null && !hot;
      // Short wake so craft read as moving, not static dots.
      if (Math.hypot(dx, dy) > 1.2) {
        const wake = Math.hypot(dx, dy) || 1;
        ctx.globalAlpha =
          style.alpha * depth * (hot ? 0.55 : dim ? 0.08 : 0.28);
        ctx.lineWidth = hot ? 1.6 : 1.1;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - (dx / wake) * 7, sy - (dy / wake) * 7);
        ctx.stroke();
      }
      drawPlaneMark(
        ctx,
        sx,
        sy,
        dx,
        dy,
        style.size * (hot ? 1.55 : 1.05),
        style.alpha * depth * (hot ? 1 : dim ? 0.2 : 0.92),
      );
    }
    ctx.globalAlpha = 1;
    return;
  }

  // Demo corridors
  for (const c of GLOBE_CORRIDORS) {
    const hot =
      layers.hoverFlightId != null &&
      layers.hoverFlightId.startsWith(`${c.id}-`);
    const dim = layers.hoverFlightId != null && !hot;
    const [ax, ay, az] = attackToXyz(c.from[0], c.from[1]);
    const [bx, by, bz] = attackToXyz(c.to[0], c.to[1]);
    const steps = 28;
    let started = false;
    ctx.lineWidth = hot ? 1.5 : 0.75;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const [lx, ly, lz] = slerpUnit(ax, ay, az, bx, by, bz, t);
      const elev = style.elev + style.bulge * Math.sin(Math.PI * t);
      const [x, y, z] = mulRot(rot, lx * elev, ly * elev, lz * elev);
      const depth = arcDepthFade(z);
      if (depth < 0.06) {
        started = false;
        continue;
      }
      const sx = cx + x * R;
      const sy = cy - y * R;
      const along = tipFade(t);
      ctx.globalAlpha =
        style.corridorAlpha *
        depth *
        Math.max(0.35, along) *
        (hot ? 2.4 : dim ? 0.22 : 1);
      if (!started) {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        started = true;
      } else {
        ctx.lineTo(sx, sy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx, sy);
      }
    }
  }

  for (const flight of GLOBE_FLIGHTS) {
    const [px, py, pz] = flightXyz(flight, tMs);
    const [x, y, z] = mulRot(rot, px, py, pz);
    const depth = arcDepthFade(z);
    if (depth < 0.1) continue;
    const sx = cx + x * R;
    const sy = cy - y * R;
    const [ax, ay, az] = flightXyzAhead(flight, tMs);
    const [hx, hy] = mulRot(rot, ax, ay, az);
    const hot = layers.hoverFlightId === flight.id;
    const dim = layers.hoverFlightId != null && !hot;
    drawPlaneMark(
      ctx,
      sx,
      sy,
      cx + hx * R - sx,
      cy - hy * R - sy,
      style.size * (hot ? 1.55 : 1),
      style.alpha * depth * (hot ? 1 : dim ? 0.22 : 0.9),
    );
  }
  ctx.globalAlpha = 1;
}

function nearestFlight(
  rot: Float32Array,
  css: number,
  scale: number,
  mx: number,
  my: number,
  tMs: number,
  layers: RouteLayers,
  liveFlights: LiveAircraft[] | null,
  liveFlightsAtMs: number | null = null,
  maxDist = 16,
): FlightDrawHit | null {
  if (!layers.showFlights) return null;
  const cx = css / 2;
  const cy = css / 2;
  const R = (css / 2) * scale;
  let best: FlightDrawHit | null = null;
  let bestD = maxDist;

  if (liveFlights && liveFlights.length > 0) {
    for (const ac of liveFlights) {
      const pos = deadReckonAircraft(ac, liveFlightsAtMs);
      const softElev = visualFlightElev(ac.altKm);
      const [px, py, pz] = elevXyz(pos.lat, pos.lon, softElev);
      const [x, y, z] = mulRot(rot, px, py, pz);
      if (arcDepthFade(z) < 0.12) continue;
      const sx = cx + x * R;
      const sy = cy - y * R;
      const d = Math.hypot(sx - mx, sy - my);
      if (d <= bestD) {
        bestD = d;
        best = { id: ac.id, name: ac.name, tipX: sx, tipY: sy };
      }
    }
    return best;
  }

  for (const flight of GLOBE_FLIGHTS) {
    const [px, py, pz] = flightXyz(flight, tMs);
    const [x, y, z] = mulRot(rot, px, py, pz);
    if (arcDepthFade(z) < 0.12) continue;
    const sx = cx + x * R;
    const sy = cy - y * R;
    const d = Math.hypot(sx - mx, sy - my);
    if (d <= bestD) {
      bestD = d;
      best = { id: flight.id, name: flight.name, tipX: sx, tipY: sy };
    }
  }
  return best;
}

type SatDrawHit = {
  id: string;
  name: string;
  kind: "leo" | "meo" | "geo";
  tipX: number;
  tipY: number;
};

/**
 * Live CelesTrak/SGP4 dots, or stylized demo rings + craft.
 */
function drawSatellites(
  ctx: CanvasRenderingContext2D,
  rot: Float32Array,
  css: number,
  scale: number,
  pad: number,
  tMs: number,
  layers: RouteLayers,
  liveSats: LiveSatellite[] | null,
): void {
  if (!layers.showSats) return;
  const cx = pad + css / 2;
  const cy = pad + css / 2;
  const R = (css / 2) * scale;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  if (liveSats) {
    for (const sat of liveSats) {
      const style = SAT_STYLE[sat.kind];
      const elev = visualOrbitRadius(sat.altKm);
      const [px, py, pz] = elevXyz(sat.lat, sat.lon, elev);
      const [x, y, z] = mulRot(rot, px, py, pz);
      const depth = arcDepthFade(z);
      if (depth < 0.08) continue;
      const sx = cx + x * R;
      const sy = cy - y * R;
      const hot = layers.hoverSatId === sat.id;
      const dim = layers.hoverSatId != null && !hot;
      const rad =
        (sat.kind === "leo"
          ? style.r * 0.85
          : sat.kind === "meo"
            ? style.r * 0.95
            : style.r * 1.15) * (hot ? 1.55 : 1);
      ctx.globalAlpha = style.alpha * depth * (hot ? 1 : dim ? 0.22 : 0.8);
      ctx.fillStyle = style.css;
      ctx.beginPath();
      ctx.arc(sx, sy, rad, 0, Math.PI * 2);
      ctx.fill();
      if (hot || /ISS|TIANGONG|CSS|HST|HUBBLE/i.test(sat.name)) {
        ctx.globalAlpha = 0.2 * depth * (hot ? 1 : 0.65);
        ctx.beginPath();
        ctx.arc(sx, sy, rad * 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    return;
  }

  for (const plane of GLOBE_ORBIT_PLANES) {
    const style = SAT_STYLE[plane.kind];
    const hotPlane =
      layers.hoverSatId != null &&
      GLOBE_SATELLITES.some(
        (s) =>
          s.id === layers.hoverSatId &&
          (s.planeId ?? s.id) === plane.id,
      );
    const dim = layers.hoverSatId != null && !hotPlane;
    ctx.strokeStyle = style.css;
    ctx.lineWidth = hotPlane ? 1.35 : plane.kind === "geo" ? 1.05 : 0.7;
    let started = false;
    let firstSx = 0;
    let firstSy = 0;
    let firstOk = false;
    for (let i = 0; i <= ORBIT_RING_STEPS; i++) {
      const a = (i / ORBIT_RING_STEPS) * Math.PI * 2;
      const [px, py, pz] = orbitPoint(plane, a);
      const [x, y, z] = mulRot(rot, px, py, pz);
      const depth = arcDepthFade(z);
      if (depth < 0.05) {
        started = false;
        continue;
      }
      const sx = cx + x * R;
      const sy = cy - y * R;
      ctx.globalAlpha =
        style.orbitAlpha * depth * (hotPlane ? 2.2 : dim ? 0.28 : 1);
      if (!started) {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        started = true;
        if (!firstOk) {
          firstSx = sx;
          firstSy = sy;
          firstOk = true;
        }
      } else {
        ctx.lineTo(sx, sy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx, sy);
      }
    }
    if (started && firstOk && plane.kind === "geo") {
      ctx.lineTo(firstSx, firstSy);
      ctx.stroke();
    }
  }

  for (const sat of GLOBE_SATELLITES) {
    const style = SAT_STYLE[sat.kind];
    const [px, py, pz] = satelliteXyz(sat, tMs);
    const [x, y, z] = mulRot(rot, px, py, pz);
    const depth = arcDepthFade(z);
    if (depth < 0.08) continue;
    const sx = cx + x * R;
    const sy = cy - y * R;
    const hot = layers.hoverSatId === sat.id;
    const dim = layers.hoverSatId != null && !hot;
    const rad =
      (sat.kind === "leo" && !sat.planeId
        ? style.r * 1.35
        : sat.planeId
          ? style.r * 0.72
          : style.r) * (hot ? 1.55 : 1);
    ctx.globalAlpha = style.alpha * depth * (hot ? 1 : dim ? 0.25 : 0.85);
    ctx.fillStyle = style.css;
    ctx.beginPath();
    ctx.arc(sx, sy, rad, 0, Math.PI * 2);
    ctx.fill();
    if (!sat.planeId || hot) {
      ctx.globalAlpha = 0.22 * depth * (hot ? 1 : dim ? 0.2 : 0.7);
      ctx.beginPath();
      ctx.arc(sx, sy, rad * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function nearestSat(
  rot: Float32Array,
  css: number,
  scale: number,
  mx: number,
  my: number,
  tMs: number,
  layers: RouteLayers,
  liveSats: LiveSatellite[] | null,
  maxDist = 16,
): SatDrawHit | null {
  if (!layers.showSats) return null;
  const cx = css / 2;
  const cy = css / 2;
  const R = (css / 2) * scale;
  let best: SatDrawHit | null = null;
  let bestD = maxDist;

  if (liveSats) {
    for (const sat of liveSats) {
      const elev = visualOrbitRadius(sat.altKm);
      const [px, py, pz] = elevXyz(sat.lat, sat.lon, elev);
      const [x, y, z] = mulRot(rot, px, py, pz);
      if (arcDepthFade(z) < 0.12) continue;
      const sx = cx + x * R;
      const sy = cy - y * R;
      const d = Math.hypot(sx - mx, sy - my);
      if (d <= bestD) {
        bestD = d;
        best = {
          id: sat.id,
          name: sat.name,
          kind: sat.kind,
          tipX: sx,
          tipY: sy,
        };
      }
    }
    return best;
  }

  for (const sat of GLOBE_SATELLITES) {
    const [px, py, pz] = satelliteXyz(sat, tMs);
    const [x, y, z] = mulRot(rot, px, py, pz);
    if (arcDepthFade(z) < 0.12) continue;
    const sx = cx + x * R;
    const sy = cy - y * R;
    const d = Math.hypot(sx - mx, sy - my);
    if (d <= bestD) {
      bestD = d;
      best = {
        id: sat.id,
        name: sat.name,
        kind: sat.kind,
        tipX: sx,
        tipY: sy,
      };
    }
  }
  return best;
}

/**
 * One continuous stroke: North Pole → center → South Pole → rim.
 * Gray, quiet; tips fade out via gradient (no segmented alpha steps).
 */
function drawPoleAxis(
  ctx: CanvasRenderingContext2D,
  rot: Float32Array,
  css: number,
  scale: number,
  pad: number,
): void {
  const cx = pad + css / 2;
  const cy = pad + css / 2;
  const R = (css / 2) * scale;
  const edgeR = css / 2 + pad - RAY_EDGE_INSET_PX;
  const tMax = edgeR / R;

  const [nx, ny] = mulRot(rot, 0, 1, 0);
  const x0 = cx + nx * -tMax * R;
  const y0 = cy - ny * -tMax * R;
  const x1 = cx + nx * tMax * R;
  const y1 = cy - ny * tMax * R;

  // Tips fade out; center (through the globe) fades inward too —
  // peaks near the surface poles (~±1 on the unit sphere).
  const tPole = R / edgeR; // |t|=1 → sphere surface along this diameter
  const pN = (1 - tPole) * 0.5;
  const pS = (1 + tPole) * 0.5;
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(0, "rgba(148,163,184,0)");
  grad.addColorStop(Math.max(0.02, pN - 0.08), "rgba(148,163,184,0)");
  grad.addColorStop(pN, "rgba(148,163,184,0.22)");
  grad.addColorStop(0.5, "rgba(148,163,184,0)");
  grad.addColorStop(pS, "rgba(148,163,184,0.22)");
  grad.addColorStop(Math.min(0.98, pS + 0.08), "rgba(148,163,184,0)");
  grad.addColorStop(1, "rgba(148,163,184,0)");

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = grad;
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.lineWidth = MARKER_LINE_W;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/**
 * Attack arcs: great-circle flight paths attacker → home (lifted mid-arc).
 * Segment strokes + depth fade (no hard path breaks on the front limb).
 */
function drawAttackArcs(
  ctx: CanvasRenderingContext2D,
  rot: Float32Array,
  css: number,
  scale: number,
  pad: number,
  home: RayMark,
  attacks: RayMark[],
  hoverId: string | null,
): void {
  if (!attacks.length) return;
  const cx = pad + css / 2;
  const cy = pad + css / 2;
  const R = (css / 2) * scale;
  const [hx0, hy0, hz0] = attackToXyz(
    home.tint.location[0],
    home.tint.location[1],
  );

  const ranked = [...attacks]
    .sort(
      (a, b) =>
        b.tint.freshness * b.tint.weight - a.tint.freshness * a.tint.weight,
    )
    .slice(0, ARC_MAX);

  for (const mark of ranked) {
    const [ax0, ay0, az0] = attackToXyz(
      mark.tint.location[0],
      mark.tint.location[1],
    );
    if (ax0 * hx0 + ay0 * hy0 + az0 * hz0 > 0.9995) continue;

    const hot = hoverId != null && mark.tint.id === hoverId;
    const dim = hoverId != null && !hot ? 0.22 : 1;
    const baseAlpha =
      Math.min(1, Math.max(0.45, mark.tint.weight)) *
      (0.55 + 0.45 * mark.tint.freshness) *
      (hot ? 1 : 0.85) *
      dim;

    type Pt = { sx: number; sy: number; z: number; t: number };
    const pts: Pt[] = [];
    for (let i = 0; i <= ARC_STEPS; i++) {
      const t = i / ARC_STEPS;
      const [lx, ly, lz] = slerpUnit(ax0, ay0, az0, hx0, hy0, hz0, t);
      const elev = 1 + ARC_BULGE * Math.sin(Math.PI * t);
      const [x, y, z] = mulRot(rot, lx * elev, ly * elev, lz * elev);
      pts.push({ sx: cx + x * R, sy: cy - y * R, z, t });
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = hot ? ATTACK_CSS : mark.color;
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    ctx.lineWidth = hot ? 4.2 : 2.8;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const depth = (arcDepthFade(a.z) + arcDepthFade(b.z)) * 0.5;
      if (depth < 0.04) continue;
      const along = tipFade((a.t + b.t) * 0.5);
      if (along < 0.03) continue;
      ctx.globalAlpha = baseAlpha * 0.98 * depth * along;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

type AstroHit = {
  body: AstroBody;
  tipX: number;
  tipY: number;
};

function formatAstroHover(body: AstroBody): string {
  if (body.id === "sun") return `Sonne · LIVE · ${body.lat.toFixed(1)}° / ${body.lon.toFixed(1)}°`;
  const pct = Math.round(body.phase * 100);
  return `Mond · LIVE · ${pct}% · ${body.lat.toFixed(1)}° / ${body.lon.toFixed(1)}°`;
}

/**
 * Live sun / moon discs + soft night wash on the dark hemisphere.
 */
function drawAstro(
  ctx: CanvasRenderingContext2D,
  rot: Float32Array,
  css: number,
  scale: number,
  pad: number,
  layers: RouteLayers,
  date: Date,
): void {
  if (!layers.showAstro) return;
  const cx = pad + css / 2;
  const cy = pad + css / 2;
  const R = (css / 2) * scale;
  const sky = liveAstro(date);

  // Soft night overlay (terminator) — sample sun-facing limb
  const [sx0, sy0, sz0] = sunDirection(date);
  const [slx, sly, slz] = mulRot(rot, sx0, sy0, sz0);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.02, 0, Math.PI * 2);
  ctx.clip();
  // Gradient from sun side → night
  const gx = cx + slx * R * 0.55;
  const gy = cy - sly * R * 0.55;
  const grad = ctx.createRadialGradient(
    gx,
    gy,
    R * 0.15,
    cx - slx * R * 0.2,
    cy + sly * R * 0.2,
    R * 1.15,
  );
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.45, "rgba(0,0,0,0)");
  grad.addColorStop(0.78, "rgba(2,6,18,0.18)");
  grad.addColorStop(1, "rgba(2,6,18,0.42)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = grad;
  ctx.fillRect(cx - R * 1.05, cy - R * 1.05, R * 2.1, R * 2.1);
  ctx.restore();
  void slz;

  const bodies: { body: AstroBody; elev: number; css: string; r: number }[] = [
    { body: sky.sun, elev: SUN_ELEV, css: SUN_CSS, r: 5.2 },
    { body: sky.moon, elev: MOON_ELEV, css: MOON_CSS, r: 3.6 },
  ];

  for (const item of bodies) {
    const [px, py, pz] = elevXyz(item.body.lat, item.body.lon, item.elev);
    const [x, y, z] = mulRot(rot, px, py, pz);
    const depth = arcDepthFade(z);
    if (depth < 0.06) continue;
    const sx = cx + x * R;
    const sy = cy - y * R;
    const hot = layers.hoverAstroId === item.body.id;
    const dim = layers.hoverAstroId != null && !hot;
    const alpha = depth * (hot ? 1 : dim ? 0.28 : 0.95);
    const rad = item.r * (hot ? 1.35 : 1);

    // Bloom
    ctx.globalAlpha = 0.28 * alpha;
    ctx.fillStyle = item.css;
    ctx.beginPath();
    ctx.arc(sx, sy, rad * 2.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(sx, sy, rad, 0, Math.PI * 2);
    ctx.fill();

    // Moon: dark crescent overlay by phase
    if (item.body.id === "moon" && item.body.phase < 0.98) {
      ctx.globalAlpha = alpha * (1 - item.body.phase) * 0.85;
      ctx.fillStyle = "rgb(8 12 22)";
      ctx.beginPath();
      ctx.arc(sx + rad * 0.28, sy, rad * 0.92, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = item.css;
    }
  }
  ctx.globalAlpha = 1;
}

function nearestAstro(
  rot: Float32Array,
  css: number,
  scale: number,
  mx: number,
  my: number,
  layers: RouteLayers,
  date: Date,
  maxDist = 22,
): AstroHit | null {
  if (!layers.showAstro) return null;
  const cx = css / 2;
  const cy = css / 2;
  const R = (css / 2) * scale;
  const sky = liveAstro(date);
  let best: AstroHit | null = null;
  let bestD = maxDist;

  for (const body of [sky.sun, sky.moon]) {
    const elev = body.id === "sun" ? SUN_ELEV : MOON_ELEV;
    const [px, py, pz] = elevXyz(body.lat, body.lon, elev);
    const [x, y, z] = mulRot(rot, px, py, pz);
    if (arcDepthFade(z) < 0.08) continue;
    const sx = cx + x * R;
    const sy = cy - y * R;
    const d = Math.hypot(sx - mx, sy - my);
    if (d <= bestD) {
      bestD = d;
      best = { body, tipX: sx, tipY: sy };
    }
  }
  return best;
}

/**
 * Overlay: attack→home arcs, then 3D-radial rays.
 * Limb → extend to rim; face-on → foreshorten + bloom toward camera.
 */
function drawRayStubs(
  ctx: CanvasRenderingContext2D,
  rot: Float32Array,
  css: number,
  dpr: number,
  scale: number,
  marks: RayMark[],
  hoverId: string | null = null,
  layers: RouteLayers = {
    showCables: true,
    showPipelines: true,
    showPlates: true,
    showSats: true,
    showFlights: true,
    showAstro: true,
    hoverRouteId: null,
    hoverPlateId: null,
    hoverSatId: null,
    hoverFlightId: null,
    hoverAstroId: null,
  },
  tMs = 0,
  liveFlights: LiveAircraft[] | null = null,
  liveFlightsAtMs: number | null = null,
  liveSats: LiveSatellite[] | null = null,
  date = new Date(),
): void {
  const pad = css * RAY_PAD_FRAC;
  const full = css + pad * 2;
  const w = Math.max(1, Math.round(full * dpr));
  if (ctx.canvas.width !== w || ctx.canvas.height !== w) {
    ctx.canvas.width = w;
    ctx.canvas.height = w;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, w);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const home = marks.find((m) => m.kind === "home");
  const attacks = marks.filter((m) => m.kind === "attack");
  drawPlates(ctx, rot, css, scale, pad, layers);
  drawInfraRoutes(ctx, rot, css, scale, pad, layers);
  drawFlights(
    ctx,
    rot,
    css,
    scale,
    pad,
    tMs,
    layers,
    liveFlights,
    liveFlightsAtMs,
  );
  drawSatellites(ctx, rot, css, scale, pad, tMs, layers, liveSats);
  drawAstro(ctx, rot, css, scale, pad, layers, date);
  drawPoleAxis(ctx, rot, css, scale, pad);
  if (home) {
    drawAttackArcs(ctx, rot, css, scale, pad, home, attacks, hoverId);
  }

  const cx = pad + css / 2;
  const cy = pad + css / 2;
  const R = (css / 2) * scale;
  /** Outer rim of the rays canvas (past the HUD rings). */
  const edgeR = css / 2 + pad - RAY_EDGE_INSET_PX;
  for (const mark of marks) {
    const [x0, y0, z0] = attackToXyz(
      mark.tint.location[0],
      mark.tint.location[1],
    );
    const [x, y, z] = mulRot(rot, x0, y0, z0);
    // Same soft limb fade as attack arcs — no hard pop at the horizon.
    const depth = arcDepthFade(z);
    if (depth < 0.04) continue;

    const sx = cx + x * R;
    const sy = cy - y * R;
    // Elevate along surface normal (toward camera when frontal).
    const tipX = cx + x * (1 + RAY_ELEV) * R;
    const tipY = cy - y * (1 + RAY_ELEV) * R;
    const vx = tipX - sx;
    const vy = tipY - sy;
    const vlen = Math.hypot(vx, vy);
    const lateral = Math.hypot(x, y);
    const faceOn = 1 - smoothstep(RAY_FACE_LATERAL, 0.55, lateral);
    const limb = 1 - faceOn;

    const hot = hoverId != null && mark.tint.id === hoverId;
    const dim = hoverId != null && !hot ? 0.28 : 1;

    // Colored line only — no tip dots; alpha fades toward the tip.
    const alpha =
      Math.min(1, Math.max(0.7, mark.tint.weight)) *
      (0.75 + 0.25 * mark.tint.freshness) *
      (hot ? 1 : 0.92) *
      dim *
      depth;

    const color = mark.color;
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.lineCap = "round";
    ctx.lineWidth =
      (hot ? MARKER_LINE_W_HOT : mark.pulse ? MARKER_LINE_W_PULSE : MARKER_LINE_W) *
      (0.55 + 0.45 * Math.max(limb, faceOn));
    ctx.globalAlpha = 1;

    // Lateral ray along true projected radial; stretch toward rim at the limb.
    if (limb > 0.04 && vlen > 0.5) {
      const dx = vx / vlen;
      const dy = vy / vlen;
      const rim = rimAlong(sx, sy, dx, dy, cx, cy, edgeR);
      const x2 = tipX + (rim.x - tipX) * limb;
      const y2 = tipY + (rim.y - tipY) * limb;
      const a0 = alpha * Math.max(limb, 0.2);

      // Solid from surface; only the outer tip fades (center fade = pole axis only).
      const grad = ctx.createLinearGradient(sx, sy, x2, y2);
      grad.addColorStop(0, rgbAlpha(color, a0));
      grad.addColorStop(0.62, rgbAlpha(color, a0));
      grad.addColorStop(1, rgbAlpha(color, 0));
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Face-on: short foreshortened stub toward camera (no fill disc).
    if (faceOn > 0.04) {
      const reach = (hot ? 14 : mark.pulse ? 11 : 9) * faceOn * (0.4 + 0.6 * z);
      const x2 = sx;
      const y2 = sy - reach * 0.15;
      const a0 = alpha * faceOn;
      const grad = ctx.createLinearGradient(sx, sy, x2, y2);
      grad.addColorStop(0, rgbAlpha(color, a0));
      grad.addColorStop(0.55, rgbAlpha(color, a0));
      grad.addColorStop(1, rgbAlpha(color, 0));
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

/**
 * Land-dot globe sized to the outermost HUD ring.
 * Overlays: attack→home arcs + 3D-radial rays (rim at limb, bloom face-on).
 */
export const MonitorGlobe = forwardRef<MonitorGlobeHandle, Props>(
  function MonitorGlobe(
    {
      status,
      attackMarkers = [],
      sessionMarkers = [],
      webMarkers = [],
      homeMarker = null,
      interactive = false,
      showCables = true,
      showPipelines = true,
      showPlates = true,
      showSats = true,
      showFlights = true,
      showAstro = true,
      liveFlights = null,
      liveFlightsAt = null,
      liveSatellites = null,
    },
    ref,
  ) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rayRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const resetViewRef = useRef<() => void>(() => {});
  const statusRef = useRef(status);
  const attacksRef = useRef(attackMarkers);
  const sessionsRef = useRef(sessionMarkers);
  const webRef = useRef(webMarkers);
  const homeRef = useRef(homeMarker);
  const interactiveRef = useRef(interactive);
  const showCablesRef = useRef(showCables);
  const showPipelinesRef = useRef(showPipelines);
  const showPlatesRef = useRef(showPlates);
  const showSatsRef = useRef(showSats);
  const showFlightsRef = useRef(showFlights);
  const showAstroRef = useRef(showAstro);
  const liveFlightsRef = useRef(liveFlights);
  const liveFlightsAtRef = useRef(liveFlightsAt);
  const liveSatsRef = useRef(liveSatellites);
  statusRef.current = status;
  attacksRef.current = attackMarkers;
  sessionsRef.current = sessionMarkers;
  webRef.current = webMarkers;
  homeRef.current = homeMarker;
  interactiveRef.current = interactive;
  showCablesRef.current = showCables;
  showPipelinesRef.current = showPipelines;
  showPlatesRef.current = showPlates;
  showSatsRef.current = showSats;
  showFlightsRef.current = showFlights;
  showAstroRef.current = showAstro;
  liveFlightsRef.current = liveFlights;
  liveFlightsAtRef.current = liveFlightsAt;
  liveSatsRef.current = liveSatellites;

  useImperativeHandle(ref, () => ({
    resetView: () => resetViewRef.current(),
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    const rayCanvas = rayRef.current;
    const wrap = wrapRef.current;
    const tipEl = tipRef.current;
    if (!canvas || !rayCanvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      // Antialias at 4K is costly and can shimmer on TVs
      antialias: false,
      // Premultiplied composites correctly; false can paint opaque white slabs on TVs
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });
    // Don't let CSS/JS set --globe-glow into unsupported color-mix paths
    wrap?.style.removeProperty("--globe-glow");
    const rayCtx = rayCanvas.getContext("2d");
    if (!gl || !rayCtx) return;

    const program = link(gl, VERT, FRAG);
    if (!program) return;
    gl.useProgram(program);

    const aPos = gl.getAttribLocation(program, "a_pos");
    const aCol = gl.getAttribLocation(program, "a_col");
    const uRot = gl.getUniformLocation(program, "u_rot");
    const uScale = gl.getUniformLocation(program, "u_scale");
    const uPoint = gl.getUniformLocation(program, "u_point");
    const uLight = gl.getUniformLocation(program, "u_light");
    const uAmb = gl.getUniformLocation(program, "u_amb");

    const posBuf = gl.createBuffer();
    const colBuf = gl.createBuffer();
    const rot = new Float32Array(9);
    const dragTmp = new Float32Array(9);
    const dragA = new Float32Array(9);
    const dragB = new Float32Array(9);

    let positions = new Float32Array(0);
    let colors = new Float32Array(0);
    let count = 0;
    // Home first — camera should face the monitored server region.
    const phi0 = phiTowardTints([
      homeMarker,
      ...sessionMarkers,
      ...attackMarkers,
    ]);
    let phi = phi0;
    const theta0 = 0.22;
    // Interactive mode accumulates view-space orbit on `rot` (not Euler).
    rotMat(phi, theta0, rot);
    let raf = 0;
    let destroyed = false;
    let lastDataKey = "";
    const seenAttackIds = new Set(attackMarkers.map((m) => m.id));
    const ripples: Ripple[] = [];
    let ripplesArmed = false;

    let dragging = false;
    let pinching = false;
    let lastPtrX = 0;
    let lastPtrY = 0;
    let autoSpin = true;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    let pointerCssX = -1;
    let pointerCssY = -1;
    let lastTipId = "";
    let zoom = 1;
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    const activePtrs = new Map<number, { x: number; y: number }>();
    /** Zoom host = rings box so HUD circles scale with the globe. */
    const zoomHost =
      (wrap?.closest(".monitor-hud-rings") as HTMLElement | null) ?? wrap;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const DRAG_SENS = 0.005;

    const clampZoom = (z: number) =>
      Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

    /** CSS zoom on rings container — globe + decorative circles stay locked. */
    const applyZoomCss = () => {
      zoomHost?.style.setProperty("--globe-zoom", String(zoom));
      // Legacy cleanup if an older session set zoom on the globe node.
      wrap?.style.removeProperty("--globe-zoom");
    };
    applyZoomCss();

    const ptrDist = () => {
      const pts = [...activePtrs.values()];
      if (pts.length < 2) return 0;
      return Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
    };

    /** Map pointer into layout (pre-CSS-scale) space for hit-testing. */
    const pointerInLayout = (e: PointerEvent) => {
      if (!wrap) return { x: -1, y: -1 };
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return { x: -1, y: -1 };
      const layoutW = wrap.offsetWidth || 1;
      const layoutH = wrap.offsetHeight || 1;
      return {
        x: ((e.clientX - rect.left) / rect.width) * layoutW,
        y: ((e.clientY - rect.top) / rect.height) * layoutH,
      };
    };

    /** Left-multiply view-space Rx/Ry so screen up/down stays vertical after yaw. */
    const orbitBy = (dYaw: number, dPitch: number) => {
      setRotY(dYaw, dragA);
      setRotX(dPitch, dragB);
      matMul(dragB, rot, dragTmp); // pitch in view space
      matMul(dragA, dragTmp, rot); // then yaw in view space
    };

    const pauseAutoSpin = () => {
      autoSpin = false;
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        if (!dragging) autoSpin = true;
      }, 2200);
    };

    const hideTip = () => {
      if (!tipEl) return;
      tipEl.dataset.show = "0";
      lastTipId = "";
    };

    const resetView = () => {
      zoom = 1;
      applyZoomCss();
      phi = phi0;
      rotMat(phi0, theta0, rot);
      autoSpin = true;
      if (resumeTimer) {
        clearTimeout(resumeTimer);
        resumeTimer = null;
      }
      hideTip();
    };
    resetViewRef.current = resetView;

    const placeTip = (
      id: string,
      text: string,
      accent: string,
      tipX: number,
      tipY: number,
      css: number,
    ) => {
      if (!tipEl) return;
      if (id !== lastTipId) {
        tipEl.dataset.show = "0";
        tipEl.textContent = text;
        tipEl.style.setProperty("--tip-accent", accent);
        lastTipId = id;
        void tipEl.offsetWidth;
      }
      const left = Math.min(css - 12, Math.max(12, tipX));
      const top = Math.min(css - 12, Math.max(12, tipY - 22));
      tipEl.style.left = `${left}px`;
      tipEl.style.top = `${top}px`;
      tipEl.dataset.show = "1";
    };

    const showTip = (hit: ProjectedTip, css: number) => {
      placeTip(
        hit.mark.tint.id,
        formatHover(hit.mark),
        hit.mark.color,
        hit.tipX,
        hit.tipY,
        css,
      );
    };

    const showRouteTip = (hit: RouteHit, css: number) => {
      placeTip(
        `route:${hit.route.id}`,
        formatRouteHover(hit.route),
        ROUTE_STYLE[hit.route.kind].css,
        hit.tipX,
        hit.tipY,
        css,
      );
    };

    const showPlateTip = (hit: PlateHit, css: number) => {
      placeTip(
        `plate:${hit.plate.id}`,
        formatPlateHover(hit.plate),
        PLATE_STYLE.css,
        hit.tipX,
        hit.tipY,
        css,
      );
    };

    const showSatTip = (hit: SatDrawHit, css: number, live: boolean) => {
      placeTip(
        `sat:${hit.id}`,
        formatSatHover(hit.name, hit.kind, live),
        SAT_STYLE[hit.kind].css,
        hit.tipX,
        hit.tipY,
        css,
      );
    };

    const showFlightTip = (
      hit: FlightDrawHit,
      css: number,
      live: boolean,
    ) => {
      placeTip(
        `flight:${hit.id}`,
        formatFlightHover(hit.name, live),
        FLIGHT_STYLE.css,
        hit.tipX,
        hit.tipY,
        css,
      );
    };

    const showAstroTip = (hit: AstroHit, css: number) => {
      placeTip(
        `astro:${hit.body.id}`,
        formatAstroHover(hit.body),
        hit.body.id === "sun" ? SUN_CSS : MOON_CSS,
        hit.tipX,
        hit.tipY,
        css,
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!interactiveRef.current || e.button !== 0) return;
      pauseAutoSpin();
      activePtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      wrap?.setPointerCapture(e.pointerId);
      hideTip();

      if (activePtrs.size >= 2) {
        pinching = true;
        dragging = false;
        if (wrap) delete wrap.dataset.dragging;
        pinchStartDist = ptrDist() || 1;
        pinchStartZoom = zoom;
        return;
      }

      dragging = true;
      lastPtrX = e.clientX;
      lastPtrY = e.clientY;
      if (wrap) wrap.dataset.dragging = "1";
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!interactiveRef.current || !wrap) return;
      const layout = pointerInLayout(e);
      pointerCssX = layout.x;
      pointerCssY = layout.y;

      if (activePtrs.has(e.pointerId)) {
        activePtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (pinching && activePtrs.size >= 2) {
        const d = ptrDist();
        if (d > 0 && pinchStartDist > 0) {
          zoom = clampZoom(pinchStartZoom * (d / pinchStartDist));
          applyZoomCss();
        }
        return;
      }

      if (dragging) {
        const dx = e.clientX - lastPtrX;
        const dy = e.clientY - lastPtrY;
        lastPtrX = e.clientX;
        lastPtrY = e.clientY;
        // Grab semantics: finger right → surface right; finger down → surface down.
        orbitBy(dx * DRAG_SENS, dy * DRAG_SENS);
        return;
      }
      pauseAutoSpin();
    };
    const onPointerUp = (e: PointerEvent) => {
      activePtrs.delete(e.pointerId);
      if (activePtrs.size < 2) pinching = false;
      if (activePtrs.size === 0) {
        dragging = false;
        if (wrap) delete wrap.dataset.dragging;
      } else if (activePtrs.size === 1) {
        const only = [...activePtrs.values()][0]!;
        dragging = true;
        lastPtrX = only.x;
        lastPtrY = only.y;
        if (wrap) wrap.dataset.dragging = "1";
      }
      try {
        wrap?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (interactiveRef.current) pauseAutoSpin();
    };
    const onPointerLeave = () => {
      pointerCssX = -1;
      pointerCssY = -1;
      hideTip();
    };
    const onWheel = (e: WheelEvent) => {
      if (!interactiveRef.current) return;
      e.preventDefault();
      pauseAutoSpin();
      const factor = Math.exp(-e.deltaY * 0.0012);
      zoom = clampZoom(zoom * factor);
      applyZoomCss();
    };

    if (interactive) {
      wrap?.addEventListener("pointerdown", onPointerDown);
      wrap?.addEventListener("pointermove", onPointerMove);
      wrap?.addEventListener("pointerup", onPointerUp);
      wrap?.addEventListener("pointercancel", onPointerUp);
      wrap?.addEventListener("pointerleave", onPointerLeave);
      wrap?.addEventListener("wheel", onWheel, { passive: false });
    }

    let lastCss = 0;
    const syncSize = () => {
      // Cap DPR — 4K×2 wrecks fill-rate; snap css to avoid 1px resize thrash/flicker
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const raw = canvas.clientWidth || canvas.offsetWidth || 1;
      const css =
        lastCss > 0 && Math.abs(raw - lastCss) < 1.5 ? lastCss : Math.round(raw);
      lastCss = css;
      const px = Math.max(1, Math.round(css * dpr));
      if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px;
        canvas.height = px;
        gl.viewport(0, 0, px, px);
      }
      return { css, dpr, px };
    };

    const syncRipples = (now: number) => {
      const attacks = attacksRef.current;
      if (!ripplesArmed) {
        for (const a of attacks) seenAttackIds.add(a.id);
        ripplesArmed = true;
        return;
      }
      for (const a of attacks) {
        if (seenAttackIds.has(a.id)) continue;
        seenAttackIds.add(a.id);
        const [x, y, z] = attackToXyz(a.location[0], a.location[1]);
        ripples.push({ id: a.id, xyz: [x, y, z], t0: now });
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        if (now - ripples[i]!.t0 > RIPPLE_MS) ripples.splice(i, 1);
      }
      if (ripples.length > 12) ripples.splice(0, ripples.length - 12);
    };

    /**
     * Land base + marker spot patches (hoverable regions) + ban ripples.
     * Rays stay as stubs; spots tint the land dots around each mark.
     */
    const paintLand = (now: number, hoverId: string | null = null) => {
      if (!count) return;
      const p = PALETTE[statusRef.current];
      const layers: TintLayer[] = [];

      const marks = collectRays(
        webRef.current,
        sessionsRef.current,
        homeRef.current,
        attacksRef.current,
      );
      for (const mark of marks) {
        const [x, y, z] = attackToXyz(
          mark.tint.location[0],
          mark.tint.location[1],
        );
        const hot = hoverId != null && mark.tint.id === hoverId;
        const dim = hoverId != null && !hot;
        const w =
          Math.min(1, Math.max(0.45, mark.tint.weight)) *
          (0.55 + 0.45 * mark.tint.freshness) *
          (hot ? 1.35 : dim ? 0.35 : 0.85);
        layers.push({
          centers: new Float32Array([x, y, z]),
          weights: new Float32Array([w]),
          rgb: markSpotRgb(mark.kind),
          mode: "spot",
          radiusRad: hot ? SPOT_RADIUS_RAD * 1.55 : SPOT_RADIUS_RAD,
        });
      }

      for (const rip of ripples) {
        const age = (now - rip.t0) / RIPPLE_MS;
        if (age < 0 || age > 1) continue;
        const fade = 1 - age;
        layers.push({
          centers: new Float32Array(rip.xyz),
          weights: new Float32Array([1.15 * fade * fade]),
          rgb: RIPPLE_RGB,
          mode: "ring",
          ringRadiusRad: age * RIPPLE_MAX_RAD,
          ringWidthRad: (2.2 * Math.PI) / 180,
        });
      }
      tintLandColors(positions, colors, p.base, layers);
      gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
      gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
      lastDataKey = `${tintKey(
        attacksRef.current,
        sessionsRef.current,
        webRef.current,
        homeRef.current,
      )}#${statusRef.current}#${hoverId ?? ""}`;
    };

    let lastFrameAt = 0;
    // Wall/TV: 30fps is enough and cuts OLED compositing flicker hard
    const minFrameMs = interactive ? 0 : 1000 / 30;

    const tick = (frameTime = performance.now()) => {
      if (destroyed) return;
      raf = requestAnimationFrame(tick);
      if (frameTime - lastFrameAt < minFrameMs) return;
      lastFrameAt = frameTime;

      const { css, dpr } = syncSize();
      const now = frameTime;

      syncRipples(now);

      const canInteract = interactiveRef.current;
      if (!reduced.matches && (!canInteract || (autoSpin && !dragging))) {
        if (canInteract) {
          // Spin around screen-vertical axis (stays upright after pitch).
          orbitBy(0.0024, 0);
        } else {
          // Wall/TV: slower spin → fewer perceived frame seams
          phi += 0.0012;
          rotMat(phi, theta0, rot);
        }
      }

      const marks = collectRays(
        webRef.current,
        sessionsRef.current,
        homeRef.current,
        attacksRef.current,
      );

      let hoverId: string | null = null;
      let hoverRouteId: string | null = null;
      let hoverPlateId: string | null = null;
      let hoverSatId: string | null = null;
      let hoverFlightId: string | null = null;
      let hoverAstroId: string | null = null;
      const nowDate = new Date();
      const routeLayers: RouteLayers = {
        showCables: showCablesRef.current,
        showPipelines: showPipelinesRef.current,
        showPlates: showPlatesRef.current,
        showSats: showSatsRef.current,
        showFlights: showFlightsRef.current,
        showAstro: showAstroRef.current,
        hoverRouteId: null,
        hoverPlateId: null,
        hoverSatId: null,
        hoverFlightId: null,
        hoverAstroId: null,
      };
      if (canInteract && !dragging && !pinching && pointerCssX >= 0) {
        const hit = nearestTip(
          projectTips(rot, css, marks, GLOBE_SCALE),
          pointerCssX,
          pointerCssY,
        );
        if (hit) {
          hoverId = hit.mark.tint.id;
          showTip(hit, css);
        } else {
          const astroHit = nearestAstro(
            rot,
            css,
            GLOBE_SCALE,
            pointerCssX,
            pointerCssY,
            routeLayers,
            nowDate,
          );
          if (astroHit) {
            hoverAstroId = astroHit.body.id;
            showAstroTip(astroHit, css);
          } else {
            const flightsAtMs = (() => {
              const iso = liveFlightsAtRef.current;
              if (!iso) return null;
              const t = Date.parse(iso);
              return Number.isFinite(t) ? t : null;
            })();
            const flightHit = nearestFlight(
              rot,
              css,
              GLOBE_SCALE,
              pointerCssX,
              pointerCssY,
              now,
              routeLayers,
              liveFlightsRef.current,
              flightsAtMs,
            );
            if (flightHit) {
              hoverFlightId = flightHit.id;
              showFlightTip(
                flightHit,
                css,
                (liveFlightsRef.current?.length ?? 0) > 0,
              );
            } else {
              const satHit = nearestSat(
                rot,
                css,
                GLOBE_SCALE,
                pointerCssX,
                pointerCssY,
                now,
                routeLayers,
                liveSatsRef.current,
              );
              if (satHit) {
                hoverSatId = satHit.id;
                showSatTip(satHit, css, liveSatsRef.current != null);
              } else {
                const routeHit = nearestRoute(
                  rot,
                  css,
                  GLOBE_SCALE,
                  pointerCssX,
                  pointerCssY,
                  routeLayers,
                );
                if (routeHit) {
                  hoverRouteId = routeHit.route.id;
                  showRouteTip(routeHit, css);
                } else {
                  const plateHit = nearestPlate(
                    rot,
                    css,
                    GLOBE_SCALE,
                    pointerCssX,
                    pointerCssY,
                    routeLayers,
                  );
                  if (plateHit) {
                    hoverPlateId = plateHit.plate.id;
                    showPlateTip(plateHit, css);
                  } else {
                    hideTip();
                  }
                }
              }
            }
          }
        }
      }
      routeLayers.hoverRouteId = hoverRouteId;
      routeLayers.hoverPlateId = hoverPlateId;
      routeLayers.hoverSatId = hoverSatId;
      routeLayers.hoverFlightId = hoverFlightId;
      routeLayers.hoverAstroId = hoverAstroId;

      const nextKey = `${tintKey(
        attacksRef.current,
        sessionsRef.current,
        webRef.current,
        homeRef.current,
      )}#${statusRef.current}#${hoverId ?? ""}`;
      if (nextKey !== lastDataKey || ripples.length > 0) {
        paintLand(now, hoverId);
      }

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);

      // Zoom is CSS (--globe-zoom); WebGL stays at GLOBE_SCALE so the canvas never clips.
      gl.uniformMatrix3fv(uRot, false, rot);
      gl.uniform1f(uScale, GLOBE_SCALE);
      gl.uniform1f(uPoint, Math.max(1.4, (css / 300) * dpr * GLOBE_POINT_MUL));
      if (showAstroRef.current) {
        const [sx, sy, sz] = sunDirection(nowDate);
        const [lx, ly, lz] = mulRot(rot, sx, sy, sz);
        gl.uniform3f(uLight, lx, ly, lz);
        gl.uniform1f(uAmb, 0.32);
      } else {
        gl.uniform3f(uLight, 0.35, 0.55, 0.85);
        gl.uniform1f(uAmb, GLOBE_AMB);
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
      gl.enableVertexAttribArray(aCol);
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);

      if (count > 0) gl.drawArrays(gl.POINTS, 0, count);

      const flightsAtMs = (() => {
        const iso = liveFlightsAtRef.current;
        if (!iso) return null;
        const t = Date.parse(iso);
        return Number.isFinite(t) ? t : null;
      })();
      drawRayStubs(
        rayCtx,
        rot,
        css,
        dpr,
        GLOBE_SCALE,
        marks,
        hoverId,
        routeLayers,
        now,
        liveFlightsRef.current,
        flightsAtMs,
        liveSatsRef.current,
        nowDate,
      );
    };

    void (async () => {
      try {
        // Copy into a concrete ArrayBuffer-backed view (TS 5.x Float32Array generics).
        positions = new Float32Array(await sampleLandPoints(14_000));
      } catch {
        positions = new Float32Array(0);
      }
      if (destroyed) return;
      count = positions.length / 3;
      colors = new Float32Array(count * 3);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      paintLand(performance.now());
      raf = requestAnimationFrame(tick);
    })();

    return () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      if (resumeTimer) clearTimeout(resumeTimer);
      resetViewRef.current = () => {};
      zoomHost?.style.removeProperty("--globe-zoom");
      wrap?.style.removeProperty("--globe-zoom");
      wrap?.removeEventListener("pointerdown", onPointerDown);
      wrap?.removeEventListener("pointermove", onPointerMove);
      wrap?.removeEventListener("pointerup", onPointerUp);
      wrap?.removeEventListener("pointercancel", onPointerUp);
      wrap?.removeEventListener("pointerleave", onPointerLeave);
      wrap?.removeEventListener("wheel", onWheel);
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(colBuf);
      gl.deleteProgram(program);
    };
  }, [interactive]);

  return (
    <div
      ref={wrapRef}
      className="monitor-hud-globe"
      data-interactive={interactive ? "1" : undefined}
      role={interactive ? "img" : undefined}
      aria-hidden={interactive ? undefined : true}
      aria-label={
        interactive
          ? "Interaktiver Globus — ziehen zum Drehen, scrollen zum Zoomen, Markierungen hover"
          : undefined
      }
    >
      <canvas ref={canvasRef} className="monitor-hud-globe-canvas" />
      <canvas ref={rayRef} className="monitor-hud-globe-rays" />
      {interactive && (
        <div ref={tipRef} className="monitor-globe-tip" data-show="0" />
      )}
    </div>
  );
  },
);
