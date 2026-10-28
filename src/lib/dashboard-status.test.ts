import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  effectiveModuleStatus,
  overallStatusFromAlertLevels,
  rollupRelatedModuleStatuses,
} from "./dashboard-data";

describe("dashboard status rollup", () => {
  it("overall critical from trivy alerts", () => {
    assert.equal(
      overallStatusFromAlertLevels(["warning", "critical"]),
      "critical",
    );
  });

  it("module without open alerts is healthy", () => {
    assert.equal(effectiveModuleStatus("critical", []), "healthy");
  });

  it("lifts docker when trivy is critical", () => {
    const rolled = rollupRelatedModuleStatuses({
      docker: "healthy",
      trivy: "critical",
      logs: "warning",
    });
    assert.equal(rolled.docker, "critical");
    assert.equal(rolled.trivy, "critical");
    assert.equal(rolled.logs, "warning");
  });
});
