import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareCrisisAlerts,
  crisisStageHeroLabel,
  crisisStageToWallTone,
  resolveCrisisStage,
  worstCrisisStageFromAlerts,
} from "./stages";

describe("resolveCrisisStage", () => {
  it("maps unknown root login to S1", () => {
    assert.equal(
      resolveCrisisStage({
        module: "logins",
        level: "warning",
        message: "Neuer Root-Login von unbekannter IP: 1.2.3.4",
      }),
      1,
    );
  });

  it("maps ransomware wording to S1", () => {
    assert.equal(
      resolveCrisisStage({
        module: "logs",
        level: "critical",
        message: "Verdacht auf Ransomware / Verschlüsselung",
      }),
      1,
    );
  });

  it("maps FIM critical to S1", () => {
    assert.equal(
      resolveCrisisStage({
        module: "fim",
        level: "critical",
        message: "FIM change /etc/passwd",
      }),
      1,
    );
  });

  it("maps DB / backup / host critical to S2", () => {
    assert.equal(
      resolveCrisisStage({
        module: "database",
        level: "critical",
        message: "PostgreSQL nicht erreichbar",
      }),
      2,
    );
    assert.equal(
      resolveCrisisStage({
        module: "backups",
        level: "critical",
        message: "Backup zu alt",
      }),
      2,
    );
    assert.equal(
      resolveCrisisStage({
        module: "server_health",
        level: "critical",
        message: "Disk usage 98%",
      }),
      2,
    );
  });

  it("maps trading/nextcloud outage to S2", () => {
    assert.equal(
      resolveCrisisStage({
        module: "docker",
        level: "warning",
        message: "Container nextcloud (production) — nextcloud-xyz unhealthy",
      }),
      2,
    );
    assert.equal(
      resolveCrisisStage({
        module: "docker",
        level: "warning",
        message: "Container trading (staging) stopped unexpectedly",
      }),
      2,
    );
  });

  it("does not treat successful api-migrate stop as S2", () => {
    assert.equal(
      resolveCrisisStage({
        module: "docker",
        level: "warning",
        message:
          'Container trading (staging) ["main"] — api-migrate-b75kba7akdfqrh062p3j95xl-20261028T191935 stopped unexpectedly',
      }),
      3,
    );
  });

  it("maps Trivy critical to S3 not S1", () => {
    assert.equal(
      resolveCrisisStage({
        module: "trivy",
        level: "critical",
        message: "Trivy backup-dry-run (production): 14 crit / 19 high · 2 images",
      }),
      3,
    );
  });

  it("maps cosmetic website / network / trivy warnings to S4", () => {
    assert.equal(
      resolveCrisisStage({
        module: "website",
        level: "warning",
        message: "HTTPS example.com: Strict-Transport-Security missing",
      }),
      4,
    );
    assert.equal(
      resolveCrisisStage({
        module: "network",
        level: "warning",
        message: "Neue ausgehende Verbindung: tcp 1.2.3.4:443",
      }),
      4,
    );
    assert.equal(
      resolveCrisisStage({
        module: "trivy",
        level: "warning",
        message: "Trivy dachpro (production): 0 crit / 25 high",
      }),
      4,
    );
  });

  it("maps site outage warnings to S3", () => {
    assert.equal(
      resolveCrisisStage({
        module: "website",
        level: "warning",
        message: "HTTP kawai-labs.com does not redirect to HTTPS (307)",
      }),
      3,
    );
  });
});

describe("worstCrisisStageFromAlerts", () => {
  it("picks S1 over louder Trivy critical", () => {
    const worst = worstCrisisStageFromAlerts([
      {
        module: "trivy",
        level: "critical",
        message: "Trivy backup-dry-run: 14 crit",
      },
      {
        module: "logins",
        level: "warning",
        message: "Neuer Root-Login von unbekannter IP",
      },
    ]);
    assert.equal(worst, 1);
  });
});

describe("crisisStage labels", () => {
  it("uses English hero labels", () => {
    assert.equal(crisisStageHeroLabel(null), "OK");
    assert.equal(crisisStageHeroLabel(3), "S3 · DEGRADED");
    assert.equal(crisisStageToWallTone(3), "warning");
    assert.equal(crisisStageToWallTone(1), "critical");
  });
});

describe("compareCrisisAlerts", () => {
  it("orders S1 before S3 before S4", () => {
    const rows = [
      {
        module: "trivy",
        level: "warning",
        message: "Trivy x: 0 crit",
        createdAt: new Date("2026-10-30T20:00:00Z"),
      },
      {
        module: "trivy",
        level: "critical",
        message: "Trivy backup-dry-run: 14 crit",
        createdAt: new Date("2026-10-30T12:00:00Z"),
      },
      {
        module: "logins",
        level: "warning",
        message: "Neuer Root-Login von unbekannter IP",
        createdAt: new Date("2026-10-30T10:00:00Z"),
      },
    ];
    const sorted = [...rows].sort(compareCrisisAlerts);
    assert.equal(sorted[0]!.module, "logins");
    assert.equal(sorted[1]!.module, "trivy");
    assert.ok(/backup-dry-run/.test(sorted[1]!.message));
  });
});
