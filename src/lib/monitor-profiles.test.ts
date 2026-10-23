import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseMonitorProfile,
  profileAllowsModule,
} from "./monitor-profiles";

describe("parseMonitorProfile", () => {
  it("defaults to host", () => {
    assert.equal(parseMonitorProfile(undefined), "host");
    assert.equal(parseMonitorProfile("app"), "container");
  });
});

describe("profileAllowsModule", () => {
  it("host runs raid and ssh_keys", () => {
    assert.equal(profileAllowsModule("host", "raid"), true);
    assert.equal(profileAllowsModule("host", "ssh_keys"), true);
  });

  it("container skips host-only modules", () => {
    assert.equal(profileAllowsModule("container", "raid"), false);
    assert.equal(profileAllowsModule("container", "ssh_keys"), false);
    assert.equal(profileAllowsModule("container", "docker"), true);
    assert.equal(profileAllowsModule("container", "website"), true);
  });
});
