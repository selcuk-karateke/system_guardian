import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateBackupTriggerCommand } from "./backup-trigger";
import {
  backupMissingRecommendation,
  restoreChecklistShort,
} from "./playbooks";

describe("validateBackupTriggerCommand", () => {
  it("accepts absolute safe paths", () => {
    assert.equal(validateBackupTriggerCommand("/usr/local/bin/run-backup.sh"), null);
    assert.equal(
      validateBackupTriggerCommand("/opt/backup/run.sh /backups/daily"),
      null,
    );
  });

  it("rejects empty, relative, and shell metacharacters", () => {
    assert.ok(validateBackupTriggerCommand(""));
    assert.ok(validateBackupTriggerCommand("run-backup.sh"));
    assert.ok(validateBackupTriggerCommand("/bin/sh -c 'rm -rf /'"));
    assert.ok(validateBackupTriggerCommand("/usr/bin/backup; reboot"));
  });
});

describe("playbooks", () => {
  it("includes restore checklist without claiming auto-restore", () => {
    const text = backupMissingRecommendation(["/backups/daily"]);
    assert.match(text, /BACKUP_PATHS/);
    assert.match(text, /Restore nur manuell/);
    assert.doesNotMatch(text, /auto.?restore/i);
    assert.ok(restoreChecklistShort().includes("Guardian spielt nichts zurück"));
  });
});
