import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alertInputFromTrivyRecord,
  trivyAlertMessage,
} from "./alerts";
import type { TrivyScanRecord } from "./types";

const base: TrivyScanRecord = {
  imageRef: "app:latest",
  imageDigest: "sha256:abcdef0123456789",
  containerName: "my-app",
  scannedAt: new Date().toISOString(),
  highCount: 2,
  criticalCount: 0,
  findings: [
    {
      vulnerabilityId: "CVE-2026-1",
      severity: "HIGH",
      title: "x",
    },
  ],
  durationMs: 10,
};

describe("trivy alerts", () => {
  it("builds warning for HIGH only", () => {
    const alert = alertInputFromTrivyRecord(base);
    assert.ok(alert);
    assert.equal(alert.level, "warning");
    assert.match(alert.message, /2 high/);
    assert.match(alert.recommendation ?? "", /Coolify/);
  });

  it("builds critical when crit > 0", () => {
    const alert = alertInputFromTrivyRecord({
      ...base,
      criticalCount: 1,
      highCount: 5,
    });
    assert.equal(alert?.level, "critical");
  });

  it("returns null when clean", () => {
    assert.equal(
      alertInputFromTrivyRecord({ ...base, highCount: 0, criticalCount: 0 }),
      null,
    );
  });

  it("keeps stable digest in message", () => {
    assert.match(trivyAlertMessage(base), /digest abcdef012345/);
  });
});
