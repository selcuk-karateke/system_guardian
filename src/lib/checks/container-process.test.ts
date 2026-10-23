import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  enrichReasonWithContainer,
  formatContainerContextSuffix,
  parseContainerIdFromCgroup,
  parsePidContainerLookupOutput,
  parsePidFromSsProcess,
  shortImageRef,
} from "./container-process";

describe("parsePidFromSsProcess", () => {
  it("extracts pid from ss users field", () => {
    assert.equal(
      parsePidFromSsProcess('users:(("hermes",pid=948,fd=3))'),
      948,
    );
  });

  it("returns null when missing", () => {
    assert.equal(parsePidFromSsProcess('users:(("nginx",fd=3))'), null);
  });
});

describe("parseContainerIdFromCgroup", () => {
  it("parses docker-.scope style", () => {
    const id = "ec056641fd2aabcdef0123456789abcdef0123456789abcdef0123456789ab";
    assert.equal(
      parseContainerIdFromCgroup(
        `0::/system.slice/docker-${id}.scope`,
      ),
      id,
    );
  });

  it("parses /docker/ path", () => {
    assert.equal(
      parseContainerIdFromCgroup("12:freezer:/docker/abc123def456"),
      "abc123def456",
    );
  });
});

describe("parsePidContainerLookupOutput", () => {
  it("maps pid to container fields", () => {
    const map = parsePidContainerLookupOutput(
      [
        "SG_PID_CONTAINER_LOOKUP",
        "948\tec056641fd2a\thermes-agent\tnousresearch/hermes-agent:latest",
        "1\t\t\t",
      ].join("\n"),
    );
    assert.equal(map.get(948)?.containerName, "hermes-agent");
    assert.equal(map.get(948)?.image, "nousresearch/hermes-agent:latest");
    assert.equal(map.get(1)?.containerId, null);
  });
});

describe("enrichReasonWithContainer", () => {
  it("appends container suffix once", () => {
    const info = {
      pid: 948,
      containerId: "ec056641fd2aabcdef",
      containerName: "hermes-agent",
      image: "nousresearch/hermes-agent:latest",
    };
    const once = enrichReasonWithContainer("Outbound 443 to 1.2.3.4 (hermes)", info);
    assert.match(once, /\[container hermes-agent · nousresearch\/hermes-agent:latest #ec056641fd2a\]/);
    assert.equal(enrichReasonWithContainer(once, info), once);
  });
});

describe("formatContainerContextSuffix / shortImageRef", () => {
  it("shortens long image refs", () => {
    const long = `registry.example.com/${"a".repeat(60)}:tag`;
    assert.ok(shortImageRef(long).endsWith("…"));
  });

  it("uses id when name missing", () => {
    assert.equal(
      formatContainerContextSuffix({
        containerId: "abcdef0123456789",
        containerName: null,
        image: null,
      }),
      " [container abcdef012345]",
    );
  });
});
