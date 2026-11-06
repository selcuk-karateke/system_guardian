import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatTopTalkerDetail,
  formatTopTalkerLine,
  parseAgentIngestPayload,
} from "./ingest";
import { classifyTalkerKind, sanitizeCmdline } from "./talker-meta";

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

describe("formatTopTalkerLine", () => {
  it("includes kind, activity and what-hint", () => {
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
    assert.match(line ?? "", /noch aktiv/);
    assert.match(line ?? "", /rsync\/rsync/);
    assert.match(line ?? "", /db\.dump/);
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
