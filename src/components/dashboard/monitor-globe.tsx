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
};

/** Stub past the surface (CSS px) — short ray, not infinite. */
const RAY_EXTEND_PX = 12;

const WEB_CSS = "rgb(180 245 255)";
const SESSION_CSS = "rgb(90 255 140)";
const HOME_CSS = "rgb(255 230 90)";
const ATTACK_CSS = "rgb(255 95 75)";
const RIPPLE_RGB: [number, number, number] = [1, 0.55, 0.25];

const PALETTE: Record<
  Status,
  {
    base: [number, number, number];
    glow: string;
  }
> = {
  healthy: {
    base: [0.2, 0.72, 0.78],
    glow: "rgb(34 211 238 / 40%)",
  },
  warning: {
    base: [0.85, 0.65, 0.2],
    glow: "rgb(251 191 36 / 38%)",
  },
  critical: {
    base: [0.85, 0.3, 0.3],
    glow: "rgb(248 113 113 / 42%)",
  },
};

const VERT = `
attribute vec3 a_pos;
attribute vec3 a_col;
uniform mat3 u_rot;
uniform float u_scale;
uniform float u_point;
uniform vec3 u_light;
varying vec3 v_col;
varying float v_z;
void main() {
  vec3 p = u_rot * a_pos;
  v_z = p.z;
  float lit = 0.32 + 0.68 * max(0.0, dot(normalize(p), u_light));
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
  color: string;
  pulse: boolean;
};

const RIPPLE_MS = 2200;
const RIPPLE_MAX_RAD = (14 * Math.PI) / 180;
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
  return (-lon * Math.PI) / 180;
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
  for (const t of web) out.push({ tint: t, color: WEB_CSS, pulse: false });
  for (const t of sessions)
    out.push({ tint: t, color: SESSION_CSS, pulse: false });
  if (home) out.push({ tint: home, color: HOME_CSS, pulse: false });
  for (const t of attacks)
    out.push({ tint: t, color: ATTACK_CSS, pulse: true });
  return out;
}

/**
 * Draw a short radial stub: surface → +5px outward (no infinite ray, no spot radius).
 */
function drawRayStubs(
  ctx: CanvasRenderingContext2D,
  rot: Float32Array,
  css: number,
  dpr: number,
  marks: RayMark[],
  now: number,
  reducedMotion: boolean,
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
    : 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(now * 0.0038));

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

    const alpha =
      Math.min(1, Math.max(0.7, mark.tint.weight)) *
      (0.75 + 0.25 * mark.tint.freshness) *
      (mark.pulse ? pulse : 1);

    const x2 = sx + dx * RAY_EXTEND_PX;
    const y2 = sy + dy * RAY_EXTEND_PX;

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = mark.color;
    ctx.fillStyle = mark.color;
    ctx.shadowColor = mark.color;
    ctx.shadowBlur = mark.pulse ? 8 : 5;
    ctx.lineWidth = mark.pulse ? 2.6 : 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x2, y2, mark.pulse ? 2.6 : 2.2, 0, Math.PI * 2);
    ctx.fill();
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
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rayRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef(status);
  const attacksRef = useRef(attackMarkers);
  const sessionsRef = useRef(sessionMarkers);
  const webRef = useRef(webMarkers);
  const homeRef = useRef(homeMarker);
  statusRef.current = status;
  attacksRef.current = attackMarkers;
  sessionsRef.current = sessionMarkers;
  webRef.current = webMarkers;
  homeRef.current = homeMarker;

  useEffect(() => {
    const canvas = canvasRef.current;
    const rayCanvas = rayRef.current;
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

    const posBuf = gl.createBuffer();
    const colBuf = gl.createBuffer();
    const rot = new Float32Array(9);

    let positions = new Float32Array(0);
    let colors = new Float32Array(0);
    let count = 0;
    let phi = phiTowardTints([
      homeMarker,
      ...sessionMarkers,
      ...attackMarkers,
    ]);
    let theta = 0.22;
    let raf = 0;
    let destroyed = false;
    let lastDataKey = "";
    const seenAttackIds = new Set(attackMarkers.map((m) => m.id));
    const ripples: Ripple[] = [];
    let ripplesArmed = false;

    // Pointer: drag to spin; hover nudges; auto-spin resumes after idle
    let dragging = false;
    let lastPtrX = 0;
    let lastPtrY = 0;
    let autoSpin = true;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    let hoverPhi = 0;
    let hoverTheta = 0;
    let smoothHoverPhi = 0;
    let smoothHoverTheta = 0;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wrap = wrapRef.current;

    const pauseAutoSpin = () => {
      autoSpin = false;
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        if (!dragging) autoSpin = true;
      }, 2200);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      pauseAutoSpin();
      lastPtrX = e.clientX;
      lastPtrY = e.clientY;
      wrap?.setPointerCapture(e.pointerId);
      if (wrap) wrap.dataset.dragging = "1";
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;

      if (dragging) {
        const dx = e.clientX - lastPtrX;
        const dy = e.clientY - lastPtrY;
        lastPtrX = e.clientX;
        lastPtrY = e.clientY;
        phi += dx * 0.0055;
        theta = Math.max(-0.55, Math.min(0.75, theta - dy * 0.0045));
        return;
      }

      // Free move over the globe — gentle aim toward cursor
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      hoverPhi = nx * 0.45;
      hoverTheta = ny * 0.28;
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
      pauseAutoSpin();
    };
    const onPointerLeave = () => {
      hoverPhi = 0;
      hoverTheta = 0;
    };

    wrap?.addEventListener("pointerdown", onPointerDown);
    wrap?.addEventListener("pointermove", onPointerMove);
    wrap?.addEventListener("pointerup", onPointerUp);
    wrap?.addEventListener("pointercancel", onPointerUp);
    wrap?.addEventListener("pointerleave", onPointerLeave);

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
        layers.push({
          centers: new Float32Array(rip.xyz),
          weights: new Float32Array([0.9 * (1 - age)]),
          rgb: RIPPLE_RGB,
          mode: "ring",
          ringRadiusRad: age * RIPPLE_MAX_RAD,
          ringWidthRad: (1.4 * Math.PI) / 180,
        });
      }
      tintLandColors(positions, colors, p.base, layers);
      gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
      gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
      canvas.style.setProperty("--globe-glow", p.glow);
      lastDataKey = tintKey(
        attacksRef.current,
        sessionsRef.current,
        webRef.current,
        homeRef.current,
      );
    };

    const tick = () => {
      if (destroyed) return;
      const { css, dpr } = syncSize();
      const now = performance.now();

      syncRipples(now);
      const nextKey = tintKey(
        attacksRef.current,
        sessionsRef.current,
        webRef.current,
        homeRef.current,
      );
      if (nextKey !== lastDataKey || ripples.length > 0) {
        paintLand(now);
      }

      if (!reduced.matches && autoSpin && !dragging) phi += 0.0024;
      // Ease hover parallax
      smoothHoverPhi += (hoverPhi - smoothHoverPhi) * 0.08;
      smoothHoverTheta += (hoverTheta - smoothHoverTheta) * 0.08;
      rotMat(phi + smoothHoverPhi, theta + smoothHoverTheta, rot);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);

      gl.uniformMatrix3fv(uRot, false, rot);
      gl.uniform1f(uScale, GLOBE_SCALE);
      // Compensates 84% ring--1 canvas so land dots keep prior visual weight
      gl.uniform1f(uPoint, Math.max(1.4, (css / 300) * dpr * 1.9));
      gl.uniform3f(uLight, 0.35, 0.55, 0.85);

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
      gl.enableVertexAttribArray(aCol);
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);

      if (count > 0) gl.drawArrays(gl.POINTS, 0, count);

      drawRayStubs(
        rayCtx,
        rot,
        css,
        dpr,
        collectRays(
          webRef.current,
          sessionsRef.current,
          homeRef.current,
          attacksRef.current,
        ),
        now,
        reduced.matches,
      );

      canvas.style.opacity = "1";
      rayCanvas.style.opacity = "1";
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
  }, []);

  return (
    <div
      ref={wrapRef}
      className="monitor-hud-globe"
      role="img"
      aria-label="Angriffs- und Session-Karte — ziehen zum Drehen"
    >
      <canvas
        ref={canvasRef}
        className="monitor-hud-globe-canvas"
        style={{
          opacity: 0,
          transition: "opacity 0.8s ease",
          filter:
            "drop-shadow(0 0 32px var(--globe-glow, rgb(34 211 238 / 40%)))",
        }}
      />
      <canvas
        ref={rayRef}
        className="monitor-hud-globe-rays"
        style={{ opacity: 0, transition: "opacity 0.8s ease" }}
      />
    </div>
  );
}
