#!/usr/bin/env node
/**
 * System Guardian host metrics agent — outbound push only.
 * Env: GUARDIAN_URL, GUARDIAN_TOKEN, GUARDIAN_SERVER_ID, GUARDIAN_INTERVAL_MS
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { hostname as osHostname, loadavg, freemem, totalmem, cpus } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const VERSION = "0.2.0";
const SKIP_IFACE = /^(lo|veth|br-|docker|virbr|fwbr|cali|flannel|cni|tun|tap)/i;
const SKIP_FD_PATH =
  /^(socket:|pipe:|anon_inode:|\/dev\/|\/proc\/|\/sys\/|\/run\/systemd)/i;
const INTERESTING_PATH = /^\/(var|home|opt|srv|data|backup|mnt|media|root)\b/i;
const SECRET_RE =
  /(?<=(?:password|passwd|pwd|token|secret|api[_-]?key|authorization|auth)=)\S+/gi;

const PORT_KIND = {
  22: "ssh",
  2222: "ssh",
  443: "https",
  8443: "https",
  80: "http",
  8080: "http",
  8000: "http",
  873: "rsync",
  21: "ftp",
  25: "smtp",
  465: "smtp",
  587: "smtp",
  3306: "db",
  5432: "db",
  27017: "db",
  6379: "db",
  445: "smb",
  139: "smb",
  2049: "nfs",
  9418: "git",
  53: "dns",
};

const URL = (process.env.GUARDIAN_URL || "").replace(/\/$/, "");
const TOKEN = process.env.GUARDIAN_TOKEN || "";
const SERVER_ID = process.env.GUARDIAN_SERVER_ID || "";
const INTERVAL_MS = Math.max(
  2000,
  parseInt(process.env.GUARDIAN_INTERVAL_MS || "5000", 10) || 5000,
);

if (!URL || !TOKEN || !SERVER_ID) {
  console.error(
    "Missing GUARDIAN_URL / GUARDIAN_TOKEN / GUARDIAN_SERVER_ID",
  );
  process.exit(1);
}

/** @type {{ at: number, totalRx: number, totalTx: number, byIface: Record<string, {rx:number,tx:number}> } | null} */
let prevNet = null;
/** @type {Map<string, { write: number, read: number, at: number }>} */
let prevIo = new Map();
/** @type {Set<string>} */
let prevConnKeys = new Set();
let prevCpu = null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readText(path) {
  try {
    return await fs.readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function sampleCpuPercent() {
  const list = cpus();
  let idle = 0;
  let total = 0;
  for (const c of list) {
    const t = Object.values(c.times).reduce((a, b) => a + b, 0);
    idle += c.times.idle;
    total += t;
  }
  const cur = { idle, total };
  let pct = null;
  if (prevCpu) {
    const dIdle = cur.idle - prevCpu.idle;
    const dTotal = cur.total - prevCpu.total;
    if (dTotal > 0) pct = Math.round((1 - dIdle / dTotal) * 1000) / 10;
  }
  prevCpu = cur;
  return pct;
}

async function sampleDiskRoot() {
  try {
    const { stdout } = await execFileAsync("df", ["-BP", "/"], {
      timeout: 5000,
      maxBuffer: 64_000,
    });
    const line = stdout.trim().split("\n")[1];
    if (!line) return { used: null, total: null };
    const parts = line.trim().split(/\s+/);
    const total = Number(parts[1]) * 1024;
    const used = Number(parts[2]) * 1024;
    if (!Number.isFinite(total) || !Number.isFinite(used)) {
      return { used: null, total: null };
    }
    return { used, total };
  } catch {
    return { used: null, total: null };
  }
}

async function sampleNet() {
  const text = await readText("/proc/net/dev");
  const byIface = {};
  let totalRx = 0;
  let totalTx = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.includes("|") || line.startsWith("Inter")) continue;
    const m = line.match(/^([^:]+):\s*(.+)$/);
    if (!m) continue;
    const iface = m[1].trim();
    if (SKIP_IFACE.test(iface)) continue;
    const nums = m[2].trim().split(/\s+/).map(Number);
    if (nums.length < 9) continue;
    const rx = nums[0] || 0;
    const tx = nums[8] || 0;
    byIface[iface] = { rx, tx };
    totalRx += rx;
    totalTx += tx;
  }
  return { at: Date.now(), totalRx, totalTx, byIface };
}

function computeEgress(prev, curr) {
  if (!prev) return null;
  const seconds = Math.max(0.5, (curr.at - prev.at) / 1000);
  const txBytes = Math.max(0, curr.totalTx - prev.totalTx);
  const rxBytes = Math.max(0, curr.totalRx - prev.totalRx);
  let best = null;
  let bestDelta = 0;
  for (const [iface, cur] of Object.entries(curr.byIface)) {
    const p = prev.byIface[iface];
    const d = cur.tx - (p?.tx ?? cur.tx);
    if (d > bestDelta) {
      bestDelta = d;
      best = iface;
    }
  }
  return {
    txMbps: (txBytes * 8) / seconds / 1e6,
    rxMbps: (rxBytes * 8) / seconds / 1e6,
    iface: best,
    windowSec: Math.round(seconds * 10) / 10,
  };
}

async function readProcIo(pid) {
  const text = await readText(`/proc/${pid}/io`);
  if (!text) return null;
  let read = 0;
  let write = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("read_bytes:")) read = Number(line.slice(11).trim()) || 0;
    if (line.startsWith("write_bytes:"))
      write = Number(line.slice(12).trim()) || 0;
  }
  return { read, write };
}

async function readComm(pid) {
  const c = (await readText(`/proc/${pid}/comm`)).trim();
  return c || "unknown";
}

function classifyKind(processName, remotePort) {
  const base = (processName.split(/[\s/]/)[0] || processName).toLowerCase();
  if (/^(rsync|rclone)$/.test(base)) return "rsync";
  if (/^(scp|sftp|ssh|sshd)$/.test(base)) return "ssh";
  if (/^(curl|wget|http)/.test(base)) return "https";
  if (/^(pg_dump|mysqldump|mariadb-dump|mongoexport)/.test(base)) return "db";
  if (base === "git") return "git";
  if (/^(smbclient|smbd)$/.test(base)) return "smb";
  if (remotePort != null && PORT_KIND[remotePort]) return PORT_KIND[remotePort];
  return "other";
}

function sanitizeCmdline(raw, max = 140) {
  let s = String(raw || "")
    .replace(/\0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(SECRET_RE, "***");
  s = s.replace(/\b[A-Za-z0-9+/=_-]{40,}\b/g, "[redacted]");
  if (s.length > max) s = `${s.slice(0, max - 1)}…`;
  return s;
}

async function readCmdline(pid) {
  const raw = await readText(`/proc/${pid}/cmdline`);
  if (!raw) return null;
  const s = sanitizeCmdline(raw, 160);
  return s || null;
}

async function readOpenFiles(pid, limit = 4) {
  const dir = `/proc/${pid}/fd`;
  let names;
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const found = [];
  const seen = new Set();
  // Cap directory walk — busy processes can have hundreds of fds
  for (const name of names.slice(0, 64)) {
    if (found.length >= limit) break;
    let target = "";
    try {
      target = await fs.readlink(`${dir}/${name}`);
    } catch {
      continue;
    }
    if (!target || SKIP_FD_PATH.test(target)) continue;
    if (seen.has(target)) continue;
    seen.add(target);
    found.push(target.length > 160 ? `${target.slice(0, 159)}…` : target);
  }
  found.sort((a, b) => {
    const ia = INTERESTING_PATH.test(a) ? 0 : 1;
    const ib = INTERESTING_PATH.test(b) ? 0 : 1;
    return ia - ib || a.length - b.length;
  });
  return found.slice(0, limit);
}

/**
 * Parse `ss -Htnopi state established` for peer + pid.
 * Top talkers get cmdline + open files (answers "welche Daten").
 */
async function sampleTalkers() {
  let stdout = "";
  try {
    const r = await execFileAsync(
      "ss",
      ["-Htnopi", "state", "established"],
      { timeout: 8000, maxBuffer: 2_000_000 },
    );
    stdout = r.stdout || "";
  } catch {
    return [];
  }

  const now = Date.now();
  const nextIo = new Map();
  const connKeys = new Set();
  /** @type {Map<string, any>} */
  const byKey = new Map();

  const blocks = stdout.split("\n").filter(Boolean);
  for (const line of blocks) {
    // users:(("name",pid=123,fd=…))
    const usersMatch = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
    // ss: local then peer — take last host:port as remote
    const addrs = [...line.matchAll(/(\[?[0-9a-fA-F:.]+\]?|[\d.]+):(\d+)/g)];
    if (addrs.length < 2) continue;
    const peer = addrs[addrs.length - 1];
    const remoteIp = peer[1].replace(/^\[|\]$/g, "");
    const remotePort = Number(peer[2]);
    if (
      remoteIp === "127.0.0.1" ||
      remoteIp === "::1" ||
      remoteIp.startsWith("127.")
    ) {
      continue;
    }
    const pid = usersMatch ? Number(usersMatch[2]) : null;
    const processName = usersMatch
      ? usersMatch[1]
      : pid
        ? await readComm(pid)
        : "unknown";
    const key = `${pid ?? "?"}|${remoteIp}|${remotePort}`;
    connKeys.add(key);

    let txBps = 0;
    let rxBps = 0;
    let txBytes = 0;
    let rxBytes = 0;
    if (pid != null) {
      const io = await readProcIo(pid);
      if (io) {
        const prev = prevIo.get(String(pid));
        nextIo.set(String(pid), { ...io, at: now });
        if (prev && prev.at < now) {
          const dt = Math.max(0.5, (now - prev.at) / 1000);
          txBytes = Math.max(0, io.write - prev.write);
          rxBytes = Math.max(0, io.read - prev.read);
          txBps = txBytes / dt;
          rxBps = rxBytes / dt;
        }
      }
    }

    const port = Number.isFinite(remotePort) ? remotePort : null;
    const stillActive = prevConnKeys.has(key);
    const existing = byKey.get(key);
    if (!existing || txBps > existing.txBps) {
      byKey.set(key, {
        pid,
        process: processName,
        remoteIp,
        remotePort: port,
        state: "established",
        txBps,
        rxBps,
        txBytes,
        rxBytes,
        stillActive,
        kind: classifyKind(processName, port),
      });
    }
  }

  prevIo = nextIo;
  prevConnKeys = connKeys;

  const ranked = [...byKey.values()]
    .sort((a, b) => b.txBps - a.txBps)
    .slice(0, 25);

  // Enrich only the hottest talkers (cmdline + open files)
  const enrichN = Math.min(8, ranked.length);
  await Promise.all(
    ranked.slice(0, enrichN).map(async (t) => {
      if (t.pid == null) return;
      const [cmdline, openFiles] = await Promise.all([
        readCmdline(t.pid),
        readOpenFiles(t.pid, 4),
      ]);
      t.cmdline = cmdline;
      t.openFiles = openFiles;
    }),
  );

  return ranked;
}

async function collect() {
  const [cpuPercent, disk, net, talkers] = await Promise.all([
    sampleCpuPercent(),
    sampleDiskRoot(),
    sampleNet(),
    sampleTalkers(),
  ]);
  const egress = computeEgress(prevNet, net);
  prevNet = net;
  const loads = loadavg();
  const memTotal = totalmem();
  const memFree = freemem();

  return {
    agentVersion: VERSION,
    hostname: osHostname(),
    serverId: SERVER_ID,
    collectedAt: Date.now(),
    cpuPercent,
    load1: Math.round(loads[0] * 100) / 100,
    load5: Math.round(loads[1] * 100) / 100,
    load15: Math.round(loads[2] * 100) / 100,
    memUsedBytes: memTotal - memFree,
    memTotalBytes: memTotal,
    diskUsedBytes: disk.used,
    diskTotalBytes: disk.total,
    uptimeSec: Math.floor(process.uptime()), // process; host from /proc/uptime below
    egress,
    talkers,
  };
}

async function hostUptimeSec() {
  const t = await readText("/proc/uptime");
  const n = Number(t.split(/\s+/)[0]);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

async function push(payload) {
  const res = await fetch(`${URL}/api/agent/ingest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ingest ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function tick() {
  try {
    const payload = await collect();
    const up = await hostUptimeSec();
    if (up != null) payload.uptimeSec = up;
    const result = await push(payload);
    const talk = payload.talkers?.[0];
    const talkHint = talk
      ? ` talker=${talk.process}->${talk.remoteIp}${talk.stillActive ? "*" : ""}`
      : "";
    console.log(
      `[agent] ok cpu=${payload.cpuPercent ?? "?"} tx=${payload.egress?.txMbps?.toFixed?.(2) ?? "?"}Mbps alerts=${result.alerts ?? 0}${talkHint}`,
    );
  } catch (e) {
    console.error(`[agent] ${e instanceof Error ? e.message : e}`);
  }
}

console.log(
  `[agent] v${VERSION} → ${URL} server=${SERVER_ID} every ${INTERVAL_MS}ms`,
);
await tick();
setInterval(tick, INTERVAL_MS);
