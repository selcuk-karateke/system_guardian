import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateEgressDelta,
  parseProcNetDev,
  type EgressSnapshot,
} from "./egress-traffic";

const SAMPLE = `
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo compressed
    lo: 1000 0 0 0 0 0 0 0 1000 0 0 0 0 0 0
  eth0: 5000000 0 0 0 0 0 0 0 8000000 0 0 0 0 0 0
  veth1: 999 0 0 0 0 0 0 0 999 0 0 0 0 0 0
`;

describe("parseProcNetDev", () => {
  it("sums non-virtual ifaces and skips lo/veth", () => {
    const snap = parseProcNetDev(SAMPLE);
    assert.equal(snap.totalRx, 5_000_000);
    assert.equal(snap.totalTx, 8_000_000);
    assert.ok(snap.byIface.eth0);
    assert.equal(snap.byIface.lo, undefined);
  });
});

describe("evaluateEgressDelta", () => {
  it("alerts critical on huge TX burst", () => {
    const prev: EgressSnapshot = {
      at: Date.now() - 15 * 60_000,
      totalRx: 0,
      totalTx: 0,
      byIface: { eth0: { rx: 0, tx: 0 } },
    };
    const curr: EgressSnapshot = {
      at: Date.now(),
      totalRx: 1_000_000,
      // ~3 GB in 15 min
      totalTx: 3 * 1024 * 1024 * 1024,
      byIface: { eth0: { rx: 1_000_000, tx: 3 * 1024 * 1024 * 1024 } },
    };
    const ev = evaluateEgressDelta(prev, curr, {
      mbpsWarning: 40,
      mbpsCritical: 150,
      mbWarning: 400,
      mbCritical: 2048,
      minWindowSec: 60,
      maxVolumeWindowSec: 20 * 60,
    });
    assert.ok(ev.alerts.some((a) => a.level === "critical"));
    assert.match(ev.alerts[0]!.message, /Datenabfluss/i);
  });

  it("skips baseline / short windows", () => {
    const curr = parseProcNetDev(SAMPLE);
    assert.equal(evaluateEgressDelta(null, curr).alerts.length, 0);
    const prev = { ...curr, at: curr.at - 10_000 };
    assert.equal(
      evaluateEgressDelta(prev, curr, {
        mbpsWarning: 1,
        mbpsCritical: 2,
        mbWarning: 1,
        mbCritical: 2,
        minWindowSec: 60,
        maxVolumeWindowSec: 20 * 60,
      }).alerts.length,
      0,
    );
  });

  it("ignores volume thresholds on long gaps (rate-only)", () => {
    // ~6.3 Mbit/s over 14h ≈ 36 GB — must NOT fire critical volume S1
    const hours = 14;
    const seconds = hours * 3600;
    const txBytes = Math.round((6.3e6 / 8) * seconds); // ~36.7 GB
    const prev: EgressSnapshot = {
      at: Date.now() - seconds * 1000,
      totalRx: 0,
      totalTx: 0,
      byIface: { eth0: { rx: 0, tx: 0 } },
    };
    const curr: EgressSnapshot = {
      at: Date.now(),
      totalRx: 1_000_000,
      totalTx: txBytes,
      byIface: { eth0: { rx: 1_000_000, tx: txBytes } },
    };
    const ev = evaluateEgressDelta(prev, curr, {
      mbpsWarning: 40,
      mbpsCritical: 150,
      mbWarning: 400,
      mbCritical: 2048,
      minWindowSec: 60,
      maxVolumeWindowSec: 20 * 60,
    });
    assert.equal(ev.alerts.length, 0);
    assert.ok(ev.delta);
    assert.ok(ev.delta!.txMbps < 10);
  });
});
