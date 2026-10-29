import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findScanForContainer,
  isContainerScanned,
  uniqueScanRecords,
} from "./match-scan";
import type { TrivyScanRecord } from "./types";

const base: TrivyScanRecord = {
  imageRef: "abc123:deadbeef",
  imageDigest: "sha256:111",
  containerName: "abc123def456789012345678-20261029T120000",
  scannedAt: new Date().toISOString(),
  highCount: 2,
  criticalCount: 1,
  findings: [],
  durationMs: 1,
};

describe("match-scan", () => {
  it("dedupes by digest", () => {
    const map = {
      [base.imageDigest]: base,
      [base.imageRef]: base,
    };
    assert.equal(uniqueScanRecords(map).length, 1);
  });

  it("matches renamed coolify container by uuid", () => {
    const scan = findScanForContainer([base], {
      name: "abc123def456789012345678-20261029T999999",
      image: "other:tag",
      coolifyUuid: "abc123def456789012345678",
    });
    assert.equal(scan?.imageDigest, base.imageDigest);
    assert.equal(
      isContainerScanned([base], {
        name: "abc123def456789012345678-20261029T999999",
        image: "other:tag",
      }),
      true,
    );
  });

  it("matches docker short image id to digest", () => {
    const pg: TrivyScanRecord = {
      ...base,
      imageRef: "postgres:18-alpine",
      imageDigest:
        "sha256:96d56f7f57c6aacd1fcb908bc83b345ec5f83231ee486dd66a1baadce274db88",
      containerName: "z3lvagqzni2pb2vjn53lqd4b",
    };
    const hit = findScanForContainer([pg], {
      name: "other-db-container",
      image: "96d56f7f57c6",
    });
    assert.equal(hit?.imageRef, "postgres:18-alpine");
  });
});
