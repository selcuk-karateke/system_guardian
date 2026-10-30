import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseDiskMax,
  parseDfMounts,
  parseTmpfsAlerts,
} from "./server-health";

const REAL_DF = `Filesystem      Size  Used Avail Use% Mounted on
udev             32G     0   32G   0% /dev
tmpfs           6.3G  4.8M  6.3G   1% /run
/dev/md2        906G  533G  328G  62% /
tmpfs            32G   32G  1.8M 100% /tmp
/dev/md1        989M  149M  789M  16% /boot
overlay         906G  533G  328G  62% /var/lib/docker/rootfs/overlayfs/abc
`;

describe("parseDiskMax", () => {
  it("ignores full tmpfs and reports real root use%", () => {
    assert.deepEqual(parseDiskMax(REAL_DF), { percent: 62, mount: "/" });
  });

  it("returns 0 when only virtual mounts exist", () => {
    assert.deepEqual(
      parseDiskMax(`Filesystem Size Used Avail Use% Mounted on
tmpfs 1G 1G 0 100% /tmp
`),
      { percent: 0, mount: null },
    );
  });
});

describe("parseTmpfsAlerts", () => {
  it("flags /tmp at 100% without treating it as disk", () => {
    assert.deepEqual(parseTmpfsAlerts(REAL_DF), [
      { mount: "/tmp", percent: 100 },
    ]);
  });

  it("ignores tiny /run tmpfs", () => {
    assert.equal(
      parseTmpfsAlerts(REAL_DF).some((t) => t.mount === "/run"),
      false,
    );
  });
});

describe("parseDfMounts", () => {
  it("parses portable df -hP columns", () => {
    const rows = parseDfMounts(REAL_DF);
    assert.equal(rows.find((r) => r.mountedOn === "/")?.usePercent, 62);
    assert.equal(rows.find((r) => r.mountedOn === "/tmp")?.usePercent, 100);
  });
});
