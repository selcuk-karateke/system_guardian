import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateBackupMonitoring,
  parseBackupHealthJson,
  parseBackupStatusJson,
} from "./backup-monitoring";

const STATUS_OK = `{
  "exit_code": 0,
  "finished_at": "2026-10-30T15:34:16+01:00",
  "log_file": "/backups/logs/backup-2026-10-30_15-17-16.log",
  "run_id": "backup-2026-10-30_15-17-16",
  "schema": 1,
  "started_at": "2026-10-30T15:17:16+01:00",
  "state": "success"
}`;

const HEALTH_OK = `{
  "applications_backed_up": 37,
  "applications_expected": 37,
  "applications_failed": 0,
  "backup_complete": true,
  "backup_path": "/backups/daily/backup-2026-10-30",
  "checksum_valid": true,
  "generated_at": "2026-10-30T15:34:16+01:00",
  "overall_status": "warning",
  "restore_tested": false,
  "run_id": "backup-2026-10-30_15-17-16",
  "schema": 1,
  "warnings": ["Restore-Test noch nicht nachgewiesen"]
}`;

const NOW = Date.parse("2026-10-30T16:00:00+01:00");

describe("parseBackupStatusJson", () => {
  it("reads schema-1 status", () => {
    const s = parseBackupStatusJson(STATUS_OK);
    assert.equal(s?.state, "success");
    assert.equal(s?.exit_code, 0);
    assert.equal(s?.run_id, "backup-2026-10-30_15-17-16");
  });
});

describe("parseBackupHealthJson", () => {
  it("reads schema-1 health", () => {
    const h = parseBackupHealthJson(HEALTH_OK);
    assert.equal(h?.backup_complete, true);
    assert.equal(h?.applications_backed_up, 37);
    assert.equal(h?.overall_status, "warning");
  });
});

describe("evaluateBackupMonitoring", () => {
  it("ok run with overall_status=warning does not alert", () => {
    const r = evaluateBackupMonitoring({
      statusRaw: STATUS_OK,
      healthRaw: HEALTH_OK,
      maxRunAgeHours: 36,
      nowMs: NOW,
    });
    assert.equal(r.alerts.length, 0);
    assert.match(r.summaryLine ?? "", /success/);
    assert.match(r.summaryLine ?? "", /37\/37/);
  });

  it("failed state is critical", () => {
    const r = evaluateBackupMonitoring({
      statusRaw: STATUS_OK.replace('"success"', '"error"'),
      healthRaw: HEALTH_OK,
      maxRunAgeHours: 36,
      nowMs: NOW,
    });
    assert.ok(r.alerts.some((a) => a.level === "critical" && /state=/.test(a.message)));
  });

  it("coverage gap is critical", () => {
    const r = evaluateBackupMonitoring({
      statusRaw: STATUS_OK,
      healthRaw: HEALTH_OK.replace(
        '"applications_backed_up": 37',
        '"applications_backed_up": 30',
      ),
      maxRunAgeHours: 36,
      nowMs: NOW,
    });
    assert.ok(
      r.alerts.some(
        (a) => a.level === "critical" && /Abdeckung 30\/37/.test(a.message),
      ),
    );
  });

  it("stale finished_at is critical", () => {
    const r = evaluateBackupMonitoring({
      statusRaw: STATUS_OK,
      healthRaw: HEALTH_OK,
      maxRunAgeHours: 36,
      nowMs: Date.parse("2026-11-02T16:00:00+01:00"),
    });
    assert.ok(
      r.alerts.some((a) => a.level === "critical" && /zu alt/.test(a.message)),
    );
  });

  it("missing json warns", () => {
    const r = evaluateBackupMonitoring({
      statusRaw: "",
      healthRaw: "",
      maxRunAgeHours: 36,
      nowMs: NOW,
    });
    assert.equal(r.alerts[0]?.level, "warning");
  });
});
