"use client";

import { useEffect, useRef } from "react";
import type { GlobeTint } from "@/lib/geo/attack-markers";
import {
  attackToXyz,
  sampleLandPoints,
  tintLandColors,
  type TintLayer,
} from "@/lib/geo/globe-land";

type Status = "healthy" | "warning" | "critical";

type Props = {
  status: Status;
  attackMarkers?: GlobeTint[];
  sessionMarkers?: GlobeTint[];
  webMarkers?: GlobeTint[];
  homeMarker?: GlobeTint | null;
  /** Drag + hover readout only — look/brightness is shared everywhere. */
  interactive?: boolean;
};

type RayKind = "web" | "session" | "home" | "attack";

const KIND_LABEL: Record<RayKind, string> = {
  web: "Web",
  session: "SSH",
  home: "Home",
  attack: "Attack",
};

/** Stub past the surface (CSS px) — short ray, not infinite. */
const RAY_EXTEND_PX = 12;

const WEB_CSS = "rgb(180 245 255)";
const SESSION_CSS = "rgb(90 255 140)";
const HOME_CSS = "rgb(255 230 90)";
const ATTACK_CSS = "rgb(255 95 75)";
const RIPPLE_RGB: [number, number, number] = [1, 0.55, 0.25];

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

function phiTowardTints(lists: (GlobeTint | null | undefined)[]): number {
  const all = lists.filter((m): m is GlobeTint => !!m);
  if (!all.length) return 0.4;
  const lon = all.reduce((sum, m) => sum + m.location[1], 0) / all.length;
  // With z = -sin(lon), +phi brings east toward the camera.
  return (lon * Math.PI) / 180;
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
): ProjectedTip[] {
  const cx = css / 2;
  const cy = css / 2;
  const R = (css / 2) * GLOBE_SCALE;
  const out: ProjectedTip[] = [];
  for (const mark of marks) {
    const [x0, y0, z0] = attackToXyz(
      mark.tint.location[0],
      mark.tint.location[1],
    );
    const [x, y, z] = mulRot(rot, x0, y0, z0);
    if (z < 0.04) continue;
    const sx = cx + x * R;
    const sy = cy - y * R;
    const len = Math.hypot(x, y);
    const dx = len < 1e-4 ? 0 : x / len;
    const dy = len < 1e-4 ? -1 : -y / len;
    out.push({
      mark,
      tipX: sx + dx * RAY_EXTEND_PX,
      tipY: sy + dy * RAY_EXTEND_PX,
      z,
    });
  }
  return out;
}

function nearestTip(
  tips: ProjectedTip[],
  mx: number,
  my: number,
  maxDist = 28,
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
  const hits = t.hits != null ? ` · ${t.hits} hits` : "";
  const country = t.country ? ` · ${t.country}` : "";
  const fresh = Math.round(t.freshness * 100);
  return `${KIND_LABEL[mark.kind]} · ${t.id}${country}${hits} · ${fresh}% fresh`;
}

/**
 * Draw a short radial stub: surface → +RAY_EXTEND_PX outward.
 * hoverId = active tip — boosts that ray, dims the rest.
 */
function drawRayStubs(
  ctx: CanvasRenderingContext2D,
  rot: Float32Array,
  css: number,
  dpr: number,
  marks: RayMark[],
  now: number,
  reducedMotion: boolean,
  hoverId: string | null = null,
): void {
  const w = Math.max(1, Math.floor(css * dpr));
  if (ctx.canvas.width !== w || ctx.canvas.height !== w) {
    ctx.canvas.width = w;
    ctx.canvas.height = w;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, w);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cx = css / 2;
  const cy = css / 2;
  const R = (css / 2) * GLOBE_SCALE;
  const pulse = reducedMotion
    ? 1
    : 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(now * 0.0062));
  const hoverPulse = reducedMotion
    ? 1
    : 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(now * 0.011));

  for (const mark of marks) {
    const [x0, y0, z0] = attackToXyz(
      mark.tint.location[0],
      mark.tint.location[1],
    );
    const [x, y, z] = mulRot(rot, x0, y0, z0);
    if (z < 0.04) continue;

    const sx = cx + x * R;
    const sy = cy - y * R;
    const len = Math.hypot(x, y);
    const dx = len < 1e-4 ? 0 : x / len;
    const dy = len < 1e-4 ? -1 : -y / len;
    const hot = hoverId != null && mark.tint.id === hoverId;
    const dim = hoverId != null && !hot ? 0.28 : 1;

    const alpha =
      Math.min(1, Math.max(0.7, mark.tint.weight)) *
      (0.75 + 0.25 * mark.tint.freshness) *
      (mark.pulse ? pulse : 1) *
      (hot ? hoverPulse : 1) *
      dim;

    const extend = hot ? RAY_EXTEND_PX + 10 : RAY_EXTEND_PX;
    const x2 = sx + dx * extend;
    const y2 = sy + dy * extend;

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = mark.color;
    ctx.fillStyle = mark.color;
    ctx.shadowColor = mark.color;
    ctx.shadowBlur = hot ? 22 : mark.pulse ? 14 : 6;
    ctx.lineWidth = hot ? 3.8 : mark.pulse ? 3.1 : 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x2, y2, hot ? 4.2 : mark.pulse ? 3.1 : 2.2, 0, Math.PI * 2);
    ctx.fill();

    if (hot && !reducedMotion) {
      const ringT = (now % 900) / 900;
      ctx.globalAlpha = alpha * (1 - ringT) * 0.85;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(x2, y2, 4 + ringT * 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

/**
 * Land-dot globe sized to the outermost HUD ring.
 * Marks = short radial stubs (+5px past surface), not spot-radius blots.
 */
export function MonitorGlobe({
  status,
  attackMarkers = [],
  sessionMarkers = [],
  webMarkers = [],
  homeMarker = null,
  interactive = false,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rayRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef(status);
  const attacksRef = useRef(attackMarkers);
  const sessionsRef = useRef(sessionMarkers);
  const webRef = useRef(webMarkers);
  const homeRef = useRef(homeMarker);
  const interactiveRef = useRef(interactive);
  statusRef.current = status;
  attacksRef.current = attackMarkers;
  sessionsRef.current = sessionMarkers;
  webRef.current = webMarkers;
  homeRef.current = homeMarker;
  interactiveRef.current = interactive;

  useEffect(() => {
    const canvas = canvasRef.current;
    const rayCanvas = rayRef.current;
    const wrap = wrapRef.current;
    const tipEl = tipRef.current;
    if (!canvas || !rayCanvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
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
    let phi = phiTowardTints([
      homeMarker,
      ...sessionMarkers,
      ...attackMarkers,
    ]);
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
    let lastPtrX = 0;
    let lastPtrY = 0;
    let autoSpin = true;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    let pointerCssX = -1;
    let pointerCssY = -1;
    let lastTipId = "";

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const DRAG_SENS = 0.005;

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

    const showTip = (hit: ProjectedTip, css: number) => {
      if (!tipEl) return;
      const id = hit.mark.tint.id;
      if (id !== lastTipId) {
        tipEl.dataset.show = "0";
        tipEl.textContent = formatHover(hit.mark);
        tipEl.style.setProperty("--tip-accent", hit.mark.color);
        lastTipId = id;
        // Retrigger enter keyframes
        void tipEl.offsetWidth;
      }
      const left = Math.min(css - 12, Math.max(12, hit.tipX));
      const top = Math.min(css - 12, Math.max(12, hit.tipY - 22));
      tipEl.style.left = `${left}px`;
      tipEl.style.top = `${top}px`;
      tipEl.dataset.show = "1";
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!interactiveRef.current || e.button !== 0) return;
      dragging = true;
      pauseAutoSpin();
      lastPtrX = e.clientX;
      lastPtrY = e.clientY;
      wrap?.setPointerCapture(e.pointerId);
      if (wrap) wrap.dataset.dragging = "1";
      hideTip();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!interactiveRef.current || !wrap) return;
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      pointerCssX = e.clientX - rect.left;
      pointerCssY = e.clientY - rect.top;

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
      dragging = false;
      if (wrap) delete wrap.dataset.dragging;
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

    if (interactive) {
      wrap?.addEventListener("pointerdown", onPointerDown);
      wrap?.addEventListener("pointermove", onPointerMove);
      wrap?.addEventListener("pointerup", onPointerUp);
      wrap?.addEventListener("pointercancel", onPointerUp);
      wrap?.addEventListener("pointerleave", onPointerLeave);
    }

    const syncSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const css = canvas.offsetWidth || 1;
      const px = Math.max(1, Math.floor(css * dpr));
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

    /** Land base + optional ban ripples only — marks are ray stubs, not spots. */
    const paintLand = (now: number) => {
      if (!count) return;
      const p = PALETTE[statusRef.current];
      const layers: TintLayer[] = [];
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
      canvas.style.setProperty("--globe-glow", p.glow);
      lastDataKey = `${tintKey(
        attacksRef.current,
        sessionsRef.current,
        webRef.current,
        homeRef.current,
      )}#${statusRef.current}`;
    };

    const tick = () => {
      if (destroyed) return;
      const { css, dpr } = syncSize();
      const now = performance.now();

      syncRipples(now);
      const nextKey = `${tintKey(
        attacksRef.current,
        sessionsRef.current,
        webRef.current,
        homeRef.current,
      )}#${statusRef.current}`;
      if (nextKey !== lastDataKey || ripples.length > 0) {
        paintLand(now);
      }

      const canInteract = interactiveRef.current;
      if (!reduced.matches && (!canInteract || (autoSpin && !dragging))) {
        if (canInteract) {
          // Spin around screen-vertical axis (stays upright after pitch).
          orbitBy(0.0024, 0);
        } else {
          phi += 0.0024;
          rotMat(phi, theta0, rot);
        }
      }

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);

      gl.uniformMatrix3fv(uRot, false, rot);
      gl.uniform1f(uScale, GLOBE_SCALE);
      // Compensates 84% ring--1 canvas so land dots keep visual weight
      gl.uniform1f(uPoint, Math.max(1.4, (css / 300) * dpr * GLOBE_POINT_MUL));
      gl.uniform3f(uLight, 0.35, 0.55, 0.85);
      gl.uniform1f(uAmb, GLOBE_AMB);

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
      gl.enableVertexAttribArray(aCol);
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);

      if (count > 0) gl.drawArrays(gl.POINTS, 0, count);

      const marks = collectRays(
        webRef.current,
        sessionsRef.current,
        homeRef.current,
        attacksRef.current,
      );

      let hoverId: string | null = null;
      if (canInteract && !dragging && pointerCssX >= 0) {
        const hit = nearestTip(
          projectTips(rot, css, marks),
          pointerCssX,
          pointerCssY,
        );
        if (hit) {
          hoverId = hit.mark.tint.id;
          showTip(hit, css);
        } else {
          hideTip();
        }
      }

      drawRayStubs(
        rayCtx,
        rot,
        css,
        dpr,
        marks,
        now,
        reduced.matches,
        hoverId,
      );

      canvas.classList.add("monitor-hud-globe-canvas--ready");
      rayCanvas.classList.add("monitor-hud-globe-rays--ready");
      raf = requestAnimationFrame(tick);
    };

    void (async () => {
      try {
        positions = await sampleLandPoints(14_000);
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
      wrap?.removeEventListener("pointerdown", onPointerDown);
      wrap?.removeEventListener("pointermove", onPointerMove);
      wrap?.removeEventListener("pointerup", onPointerUp);
      wrap?.removeEventListener("pointercancel", onPointerUp);
      wrap?.removeEventListener("pointerleave", onPointerLeave);
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
          ? "Interaktiver Globus — ziehen zum Drehen, Markierungen hover"
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
}
