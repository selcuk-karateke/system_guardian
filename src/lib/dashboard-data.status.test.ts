import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  effectiveModuleStatus,
  overallStatusFromAlertLevels,
} from "./dashboard-data";

describe("overallStatusFromAlertLevels", () => {
  it("is healthy with no alerts", () => {
    assert.equal(overallStatusFromAlertLevels([]), "healthy");
  });

  it("warning beats healthy; critical beats warning", () => {
    assert.equal(overallStatusFromAlertLevels(["warning"]), "warning");
    assert.equal(
      overallStatusFromAlertLevels(["warning", "critical", "warning"]),
      "critical",
    );
  });

  it("ignores info/unknown levels for overall critical path", () => {
    assert.equal(overallStatusFromAlertLevels(["info"]), "healthy");
    assert.equal(
      overallStatusFromAlertLevels(["info", "warning"]),
      "warning",
    );
  });
});

describe("effectiveModuleStatus", () => {
  it("follows open alerts, not stale check status", () => {
    assert.equal(effectiveModuleStatus("critical", []), "healthy");
    assert.equal(
      effectiveModuleStatus("healthy", [{ level: "critical" }]),
      "critical",
    );
    assert.equal(
      effectiveModuleStatus("critical", [{ level: "warning" }]),
      "warning",
    );
  });
});
