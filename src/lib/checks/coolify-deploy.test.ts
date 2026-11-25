import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coolifyResourceKey,
  filterRoutineCoolifyDiffs,
  isCoolifyManagedContainer,
} from "./coolify-deploy";
import type { DiffItem } from "@/lib/history/diff";

describe("coolify deploy filter", () => {
  it("pairs redeploys by deploy-suffix base even without backend/frontend prefix", () => {
    const diffs: DiffItem[] = [
      {
        category: "docker_containers",
        changeType: "removed",
        entityKey: "app-abc123def456-1731400000",
      },
      {
        category: "docker_containers",
        changeType: "added",
        entityKey: "app-abc123def456-1731400999",
      },
    ];
    const filtered = filterRoutineCoolifyDiffs(diffs, new Map());
    assert.equal(filtered.length, 0);
  });

  it("keeps non-coolify removals", () => {
    const diffs: DiffItem[] = [
      {
        category: "docker_containers",
        changeType: "removed",
        entityKey: "random-manual-box",
      },
    ];
    const filtered = filterRoutineCoolifyDiffs(diffs, new Map());
    assert.equal(filtered.length, 1);
  });

  it("treats backend-* timestamp names as managed", () => {
    assert.equal(
      isCoolifyManagedContainer("backend-u4084wssk08gcwog0cw4w4wc-1731400000"),
      true,
    );
    assert.ok(
      coolifyResourceKey("backend-u4084wssk08gcwog0cw4w4wc-1731400000"),
    );
  });
});
