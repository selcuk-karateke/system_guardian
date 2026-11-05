import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_THRESHOLDS,
  getCachedThreshold,
  resetRuntimeConfigForTests,
} from "./runtime-config";

describe("runtime-config defaults", () => {
  it("returns hardcoded defaults before hydrate", () => {
    resetRuntimeConfigForTests();
    assert.equal(
      getCachedThreshold("CPU_WARNING", 1),
      DEFAULT_THRESHOLDS.CPU_WARNING,
    );
    assert.equal(getCachedThreshold("MISSING_KEY", 42), 42);
  });
});
