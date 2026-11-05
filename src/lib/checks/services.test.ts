import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildServiceRows,
  parseFailedUnitName,
  parseServicesOutput,
} from "./services";

const SAMPLE = `svc\tnfs-server\tmissing\tmissing
svc\tnfs-kernel-server\tdisabled\tinactive
svc\trsync\tmissing\tmissing
svc\trsyncd\tmissing\tmissing
svc\tsmbd\tenabled\tactive
svc\tsmb\tmissing\tmissing
svc\tssh\tenabled\tactive
svc\tsshd\tdisabled\tinactive
svc\tdocker\tenabled\tactive
svc\tfail2ban\tenabled\tactive
failed\t● chkrootkit.service loaded failed failed LSB
`;

describe("parseServicesOutput", () => {
  it("parses svc rows and failed units", () => {
    const { probes, failedUnits } = parseServicesOutput(SAMPLE);
    assert.equal(probes.smbd?.activeState, "active");
    assert.equal(probes.ssh?.enableState, "enabled");
    assert.ok(failedUnits.some((u) => u.includes("chkrootkit")));
  });

  it("accepts legacy unit\\t lines", () => {
    const { probes } = parseServicesOutput("unit\tdocker\tactive\n");
    assert.equal(probes.docker?.activeState, "active");
  });
});

describe("buildServiceRows", () => {
  it("maps Cockpit-style enabled/running", () => {
    const rows = buildServiceRows(parseServicesOutput(SAMPLE).probes);
    const smb = rows.find((r) => r.unit === "smbd");
    const nfs = rows.find((r) => r.unit === "nfs-server");
    const ssh = rows.find((r) => r.unit === "ssh");
    assert.equal(smb?.enabled, true);
    assert.equal(smb?.running, true);
    assert.equal(nfs?.enabled, false);
    assert.equal(nfs?.running, false);
    assert.equal(ssh?.running, true);
    assert.equal(ssh?.required, true);
  });
});

describe("parseFailedUnitName", () => {
  it("strips bullet prefix", () => {
    assert.equal(
      parseFailedUnitName("● chkrootkit.service loaded failed"),
      "chkrootkit.service",
    );
  });
});
