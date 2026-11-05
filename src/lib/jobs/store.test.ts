import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createJob,
  findActiveJob,
  listJobs,
  resetJobsForTests,
  updateJob,
} from "./store";

describe("jobs store", () => {
  it("tracks active jobs and dedupe lookup", () => {
    resetJobsForTests();
    const a = createJob({
      kind: "trivy_batch",
      label: "Trivy Batch-Scan",
      serverId: "s1",
    });
    assert.equal(a.status, "queued");
    assert.ok(findActiveJob("trivy_batch", "s1"));
    updateJob(a.id, { status: "running", message: "Läuft…" });
    assert.equal(listJobs()[0]!.status, "running");
    updateJob(a.id, {
      status: "done",
      message: "ok",
      finishedAt: Date.now(),
    });
    assert.equal(findActiveJob("trivy_batch", "s1"), undefined);
  });
});
