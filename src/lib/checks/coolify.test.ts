import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateCoolifyServices } from "./coolify";

const stack = (
  rows: Array<{ Names: string; State: string }>,
) => evaluateCoolifyServices(rows);

describe("evaluateCoolifyServices", () => {
  it("is healthy without realtime when core stack is up", () => {
    const r = stack([
      { Names: "coolify", State: "running" },
      { Names: "coolify-db", State: "running" },
      { Names: "coolify-redis", State: "running" },
      { Names: "coolify-proxy", State: "running" },
      { Names: "coolify-sentinel", State: "running" },
    ]);
    assert.equal(r.status, "healthy");
    assert.equal(r.alerts.length, 0);
    assert.equal(r.services["coolify-realtime"], undefined);
    assert.equal(r.services["coolify-sentinel"], "running");
  });

  it("does not alert when realtime is simply missing", () => {
    const r = stack([
      { Names: "coolify", State: "running" },
      { Names: "coolify-db", State: "running" },
      { Names: "coolify-redis", State: "running" },
      { Names: "coolify-proxy", State: "running" },
    ]);
    assert.equal(r.status, "healthy");
    assert.ok(!r.alerts.some((a) => a.message.includes("realtime")));
  });

  it("warns when realtime exists but is not running", () => {
    const r = stack([
      { Names: "coolify", State: "running" },
      { Names: "coolify-db", State: "running" },
      { Names: "coolify-redis", State: "running" },
      { Names: "coolify-proxy", State: "running" },
      { Names: "coolify-realtime", State: "exited" },
    ]);
    assert.equal(r.status, "warning");
    assert.equal(r.alerts.length, 1);
    assert.equal(r.alerts[0]?.level, "warning");
    assert.match(r.alerts[0]?.message ?? "", /realtime/);
  });

  it("is critical when a required service is missing", () => {
    const r = stack([
      { Names: "coolify", State: "running" },
      { Names: "coolify-redis", State: "running" },
      { Names: "coolify-proxy", State: "running" },
    ]);
    assert.equal(r.status, "critical");
    assert.ok(r.alerts.some((a) => a.message.includes("coolify-db")));
  });
});
