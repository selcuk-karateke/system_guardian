import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchStackKeywords } from "./keywords";
import { parseRssItems, severityFromTitle } from "./parse-rss";

describe("advisories parse-rss", () => {
  it("parses RSS items and severity tags", () => {
    const xml = `<?xml version="1.0"?>
<rss><channel>
<item>
  <title>[UPDATE] [kritisch] Nextcloud: Schwachstelle</title>
  <link>https://example.test/a</link>
  <description>Foo bar</description>
  <pubDate>Wed, 25 Nov 2026 12:00:00 GMT</pubDate>
</item>
<item>
  <title>[hoch] Unrelated Widget</title>
  <link>https://example.test/b</link>
  <description>nix</description>
</item>
</channel></rss>`;
    const items = parseRssItems(xml);
    assert.equal(items.length, 2);
    assert.equal(items[0]!.title.includes("Nextcloud"), true);
    assert.equal(severityFromTitle(items[0]!.title), "critical");
    assert.equal(severityFromTitle(items[1]!.title), "high");
    assert.deepEqual(matchStackKeywords(items[0]!.title), ["nextcloud"]);
  });
});
