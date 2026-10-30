import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isMigrateOneShotContainer,
  parseDockerExitedCode,
} from "@/lib/config";
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

describe("migrate one-shot helpers", () => {
  it("detects api-migrate container names", () => {
    assert.equal(
      isMigrateOneShotContainer(
        "api-migrate-b75kba7akdfqrh062p3j95xl-20261028T191935",
      ),
      true,
    );
    assert.equal(isMigrateOneShotContainer("api-b75kba7akdfqrh062p3j95xl"), false);
  });

  it("parses exited codes from docker ps Status", () => {
    assert.equal(parseDockerExitedCode("Exited (0) 2 days ago"), 0);
    assert.equal(parseDockerExitedCode("Exited (1) 3 minutes ago"), 1);
    assert.equal(parseDockerExitedCode("Up 2 hours (healthy)"), null);
  });
});
