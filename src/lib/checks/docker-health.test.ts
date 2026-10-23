import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isDockerStatusRestarting,
  isDockerStatusUnhealthy,
  unhealthyAlertLevel,
} from "./docker-health";

describe("isDockerStatusUnhealthy", () => {
  it("detects unhealthy while still running", () => {
    assert.equal(
      isDockerStatusUnhealthy("Up 2 hours (unhealthy)", "running"),
      true,
    );
  });

  it("ignores healthy running", () => {
    assert.equal(
      isDockerStatusUnhealthy("Up 2 weeks (healthy)", "running"),
      false,
    );
  });
});

describe("isDockerStatusRestarting", () => {
  it("detects restart loop", () => {
    assert.equal(
      isDockerStatusRestarting("Restarting (1) 5 seconds ago", "restarting"),
      true,
    );
  });
});

describe("unhealthyAlertLevel", () => {
  it("warns for running unhealthy", () => {
    assert.equal(unhealthyAlertLevel("running"), "warning");
  });

  it("critical when not running", () => {
    assert.equal(unhealthyAlertLevel("exited"), "critical");
  });
});
