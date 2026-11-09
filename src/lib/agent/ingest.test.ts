import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alertsFromAgentLive,
  formatTopTalkerDetail,
  formatTopTalkerLine,
  isAgentEgressAlertMessage,
  parseAgentIngestPayload,
  toMonitorLivePayload,
} from "./ingest";
import { classifyTalkerKind, sanitizeCmdline } from "./talker-meta";
import type { AgentLiveSnapshot } from "./types";

describe("parseAgentIngestPayload", () => {
  it("accepts a minimal live payload", () => {
    const p = parseAgentIngestPayload({
      agentVersion: "0.2.0",
      hostname: "kawai",
      cpuPercent: 12,
      load1: 1.1,
      egress: { txMbps: 6.3, rxMbps: 1.2, iface: "enp35s0", windowSec: 5 },
      talkers: [
        {
          pid: 42,
          process: "rsync",
          remoteIp: "10.0.0.5",
          remotePort: 873,
          state: "established",
          txBps: 800_000,
          txBytes: 4_000_000,
          stillActive: true,
          kind: "rsync",
          cmdline: "rsync -a /backup/db.sql 10.0.0.5::nas/",
          openFiles: ["/backup/db.sql"],
        },
      ],
    });
    assert.ok(p);
    assert.equal(p!.hostname, "kawai");
    assert.equal(p!.talkers.length, 1);
    assert.equal(p!.talkers[0]!.kind, "rsync");
    assert.equal(p!.talkers[0]!.openFiles?.[0], "/backup/db.sql");
    assert.equal(p!.egress?.iface, "enp35s0");
  });

  it("fills kind from port when missing", () => {
    const p = parseAgentIngestPayload({
      agentVersion: "0.1.0",
      hostname: "x",
      talkers: [
        {
          process: "unknown",
          remoteIp: "1.2.3.4",
          remotePort: 22,
          state: "established",
          txBps: 10,
          stillActive: true,
        },
      ],
    });
    assert.equal(p!.talkers[0]!.kind, "ssh");
  });

  it("rejects garbage", () => {
    assert.equal(parseAgentIngestPayload(null), null);
    assert.equal(parseAgentIngestPayload("x"), null);
  });
});

describe("classifyTalkerKind / sanitizeCmdline", () => {
  it("classifies ports and process names", () => {
    assert.equal(classifyTalkerKind("sshd", 22), "ssh");
    assert.equal(classifyTalkerKind("curl", 443), "https");
    assert.equal(classifyTalkerKind("pg_dump", 5432), "db");
    assert.equal(classifyTalkerKind("foo", 873), "rsync");
  });

  it("redacts secrets in cmdline", () => {
    const s = sanitizeCmdline("curl -H token=supersecrettokenvalue123 https://x");
    assert.match(s, /token=\*\*\*/);
    assert.doesNotMatch(s, /supersecret/);
  });
});

describe("toMonitorLivePayload", () => {
  it("exposes host vitals even without egress", () => {
    const snap: AgentLiveSnapshot = {
      agentVersion: "0.2.0",
      hostname: "kawai",
      cpuPercent: 8,
      load1: 0.42,
      load5: 0.5,
      load15: 0.6,
      memUsedBytes: 2_000_000_000,
      memTotalBytes: 8_000_000_000,
      diskUsedBytes: 100_000_000_000,
      diskTotalBytes: 200_000_000_000,
      uptimeSec: 90_000,
      egress: null,
      talkers: [],
      receivedAt: 1,
      serverId: "00000000-0000-0000-0000-000000000001",
    };
    const p = toMonitorLivePayload(snap);
    assert.equal(p.online, true);
    assert.equal(p.egress, null);
    assert.equal(p.host?.load1, 0.42);
    assert.equal(p.host?.ramPercent, 25);
    assert.equal(p.host?.diskPercent, 50);
    assert.equal(p.host?.uptimeSec, 90_000);
  });
});

describe("alertsFromAgentLive", () => {
  const base: AgentLiveSnapshot = {
    agentVersion: "0.2.0",
    hostname: "kawai",
    cpuPercent: 8,
    load1: 0.4,
    load5: 0.5,
    load15: 0.6,
    memUsedBytes: null,
    memTotalBytes: null,
    diskUsedBytes: null,
    diskTotalBytes: null,
    uptimeSec: null,
    egress: { txMbps: 400, rxMbps: 1, iface: "enp35s0", windowSec: 5 },
    talkers: [],
    receivedAt: 1,
    serverId: "00000000-0000-0000-0000-000000000001",
  };

  it("uses a stable message without live Mbit/s", () => {
    const alerts = alertsFromAgentLive(base);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]!.level, "critical");
    assert.doesNotMatch(alerts[0]!.message, /\d+\.\d+ Mbit/);
    assert.match(alerts[0]!.message, /\(Agent\)/);
    assert.match(alerts[0]!.recommendation ?? "", /400\.0 Mbit/);
    assert.ok(alerts[0]!.dedupeKey);
  });

  it("skips LAN / private top talkers (no exfil spam)", () => {
    const alerts = alertsFromAgentLive({
      ...base,
      talkers: [
        {
          pid: 1,
          process: "docker-proxy",
          remoteIp: "10.0.1.35",
          remotePort: 80,
          state: "established",
          txBps: 50_000_000,
          rxBps: 0,
          stillActive: true,
          kind: "http",
        },
      ],
    });
    assert.equal(alerts.length, 0);
  });

  it("detects legacy and new agent egress messages", () => {
    assert.equal(
      isAgentEgressAlertMessage(
        "Möglicher Datenabfluss: Egress 295.9 Mbit/s (Agent) · enp35s0",
      ),
      true,
    );
    assert.equal(
      isAgentEgressAlertMessage(
        "Möglicher Datenabfluss: Egress (Agent) · enp35s0 · curl → 1.2.3.4:443",
      ),
      true,
    );
    assert.equal(
      isAgentEgressAlertMessage("Hoher Egress (Agent) · enp35s0"),
      true,
    );
    assert.equal(isAgentEgressAlertMessage("Disk 90%"), false);
  });
});

describe("formatTopTalkerLine", () => {
  it("stays one short HUD line (detail carries paths)", () => {
    const line = formatTopTalkerLine([
      {
        pid: 1,
        process: "rsync",
        remoteIp: "1.2.3.4",
        remotePort: 873,
        state: "established",
        txBps: 50_000,
        rxBps: 0,
        txBytes: 250_000,
        stillActive: true,
        kind: "rsync",
        cmdline: "rsync -a /var/backups/app 1.2.3.4::nas",
        openFiles: ["/var/backups/app/db.dump"],
      },
    ]);
    assert.match(line ?? "", /aktiv/);
    assert.match(line ?? "", /rsync → 1\.2\.3\.4:873/);
    assert.doesNotMatch(line ?? "", /db\.dump/);
  });

  it("detail line exposes cmdline + files for alerts", () => {
    const detail = formatTopTalkerDetail([
      {
        pid: 1,
        process: "pg_dump",
        remoteIp: "9.9.9.9",
        remotePort: 22,
        state: "established",
        txBps: 1_000_000,
        rxBps: 0,
        stillActive: true,
        kind: "db",
        cmdline: "pg_dump -Fc mydb",
        openFiles: [],
      },
    ]);
    assert.match(detail ?? "", /pg_dump/);
    assert.match(detail ?? "", /cmd: pg_dump/);
  });
});
