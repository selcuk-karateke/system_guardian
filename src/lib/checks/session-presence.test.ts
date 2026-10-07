import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeActiveSessions,
  parseFailedAuthSources,
  parseWLines,
  parseWhoLines,
} from "./session-presence";

describe("parseWLines", () => {
  it("parses idle and what from w -h", () => {
    const sessions = parseWLines(
      `deploy   pts/0    203.0.113.10    08:00    2:15   0.05s  0.01s  -bash
root     pts/1    10.0.1.20       09:15    0.00s  0.10s  0.02s  htop
`,
    );
    assert.equal(sessions.length, 2);
    assert.equal(sessions[0].user, "deploy");
    assert.equal(sessions[0].from, "203.0.113.10");
    assert.equal(sessions[0].fromMasked, "203.0.xxx.xxx");
    assert.equal(sessions[0].idle, "2:15");
    assert.equal(sessions[0].what, "-bash");
    assert.equal(sessions[1].trusted, true);
  });
});

describe("parseWhoLines", () => {
  it("parses parenthesized remote host", () => {
    const sessions = parseWhoLines(
      "deploy   pts/0        2026-06-03 08:00 (203.0.113.10)\n",
    );
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].from, "203.0.113.10");
    assert.equal(sessions[0].loginAt, "2026-06-03 08:00");
  });
});

describe("mergeActiveSessions", () => {
  it("prefers w over who", () => {
    const sessions = mergeActiveSessions(
      "nobody   pts/9        2026-01-01 00:00 (1.1.1.1)\n",
      "deploy   pts/0    203.0.113.10    08:00    1:00   0.00s  0.00s  bash\n",
    );
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].user, "deploy");
  });
});

describe("parseFailedAuthSources", () => {
  it("aggregates failed password IPs", () => {
    const sources = parseFailedAuthSources(`
Jun  3 07:00:00 sshd[999]: Failed password for invalid user admin from 203.0.113.99 port 22
Jun  3 07:01:00 sshd[1000]: Failed password for root from 203.0.113.99 port 22
Jun  3 07:02:00 sshd[1001]: Failed password for test from 198.51.100.200 port 22
`);
    assert.equal(sources.length, 2);
    assert.equal(sources[0].ip, "203.0.113.99");
    assert.equal(sources[0].count, 2);
    assert.equal(sources[1].count, 1);
  });
});
