import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  brightnessFromHits,
  buildAttackMarkers,
  buildGlobeTints,
  freshnessForIp,
  resetGlobeFreshnessForTests,
} from "./attack-markers";
import { tintLandColors } from "./globe-land";

describe("buildGlobeTints", () => {
  it("maps attacks, sessions, web and home", async () => {
    resetGlobeFreshnessForTests();
    const tints = await buildGlobeTints(
      {
        logins: {
          failedAuthSources: [
            { ip: "203.0.113.99", count: 12, trusted: false },
            { ip: "10.0.1.7", count: 9, trusted: true },
          ],
          fail2ban: { bannedIps: ["198.51.100.200"] },
          activeSessions: [
            { from: "203.0.113.10", trusted: true },
            { from: "10.0.1.20", trusted: true },
          ],
        },
        web_presence: {
          visitors: [
            { ip: "203.0.113.50", hits: 8, uaClass: "browser" },
            { ip: "198.51.100.10", hits: 3, uaClass: "bot" },
            { ip: "198.51.100.11", hits: 2, uaClass: "browser" },
          ],
        },
      },
      { homeIp: null },
    );
    assert.equal(tints.attacks.length, 2);
    assert.equal(tints.sessions.length, 1);
    assert.equal(tints.web.length, 2);
    assert.ok(tints.home);
    assert.deepEqual(tints.home!.location, [50.48, 12.37]);
    assert.ok(tints.attacks[0]!.weight >= tints.attacks[1]!.weight);
  });

  it("buildAttackMarkers returns attacks only", async () => {
    resetGlobeFreshnessForTests();
    const markers = await buildAttackMarkers({
      logins: {
        failedAuthSources: [
          { ip: "203.0.113.99", count: 12, trusted: false },
          { ip: "198.51.100.200", count: 4, trusted: false },
        ],
      },
    });
    assert.equal(markers.length, 2);
    assert.ok(markers.every((m) => m.id && m.freshness > 0));
  });

  it("returns empty activity layers when no public IPs", async () => {
    const tints = await buildGlobeTints({});
    assert.deepEqual(tints.attacks, []);
    assert.deepEqual(tints.sessions, []);
    assert.deepEqual(tints.web, []);
    assert.ok(tints.home);
  });
});

describe("brightness + freshness", () => {
  it("scales brightness with hits", () => {
    assert.ok(brightnessFromHits(10, 10) > brightnessFromHits(1, 10));
  });

  it("freshness starts high then ages", () => {
    resetGlobeFreshnessForTests();
    const a = freshnessForIp("9.9.9.9", 1_000_000);
    const b = freshnessForIp("9.9.9.9", 1_000_000 + 40 * 60_000);
    assert.ok(a > b);
    assert.ok(b >= 0.18);
  });
});

describe("tintLandColors", () => {
  it("applies session then attack; supports ring mode", () => {
    const positions = new Float32Array([1, 0, 0, -1, 0, 0]);
    const colors = new Float32Array(6);
    const centers = new Float32Array([1, 0, 0]);
    const weights = new Float32Array([1]);
    tintLandColors(positions, colors, [0.2, 0.7, 0.8], [
      { centers, weights, rgb: [0.2, 0.95, 0.45] },
      { centers, weights, rgb: [1, 0, 0] },
      {
        centers,
        weights,
        rgb: [1, 1, 0],
        mode: "ring",
        ringRadiusRad: 0.01,
        ringWidthRad: 0.5,
      },
    ]);
    assert.ok(colors[0]! > 0.5);
  });
});
