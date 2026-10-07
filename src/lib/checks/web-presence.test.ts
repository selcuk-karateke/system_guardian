import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateWebPresence,
  classifyUserAgent,
  parseAccessLogLine,
} from "./web-presence";

describe("classifyUserAgent", () => {
  it("detects browser vs bot", () => {
    assert.equal(
      classifyUserAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0"),
      "browser",
    );
    assert.equal(
      classifyUserAgent("Mozilla/5.0 (compatible; bingbot/2.0)"),
      "bot",
    );
    assert.equal(classifyUserAgent("curl/8.0"), "bot");
    assert.equal(classifyUserAgent("-"), "other");
  });
});

describe("parseAccessLogLine", () => {
  it("parses Traefik JSON", () => {
    const hit = parseAccessLogLine(
      JSON.stringify({
        ClientHost: "203.0.113.50",
        RequestMethod: "GET",
        RequestPath: "/cart?x=1",
        RequestHost: "shop.example.com",
        DownstreamStatus: 200,
        RequestUserAgent: "Mozilla/5.0 Chrome/120.0.0.0",
        StartUTC: "2026-06-03T08:03:00Z",
      }),
    );
    assert.ok(hit);
    assert.equal(hit.ip, "203.0.113.50");
    assert.equal(hit.path, "/cart");
    assert.equal(hit.host, "shop.example.com");
    assert.equal(hit.uaClass, "browser");
  });

  it("parses CLF-ish lines", () => {
    const hit = parseAccessLogLine(
      '203.0.113.77 - - [03/Jun/2026:08:05:00 +0000] "GET /profil HTTP/1.1" 200 1200 "-" "Mozilla/5.0 Firefox/125.0"',
    );
    assert.ok(hit);
    assert.equal(hit.ip, "203.0.113.77");
    assert.equal(hit.path, "/profil");
    assert.equal(hit.status, 200);
  });
});

describe("aggregateWebPresence", () => {
  it("splits visitors and bots and counts paths", () => {
    const hits = [
      parseAccessLogLine(
        JSON.stringify({
          ClientHost: "203.0.113.50",
          RequestMethod: "GET",
          RequestPath: "/a",
          RequestHost: "ex.com",
          DownstreamStatus: 200,
          RequestUserAgent: "Mozilla/5.0 Chrome/120",
        }),
      ),
      parseAccessLogLine(
        JSON.stringify({
          ClientHost: "203.0.113.50",
          RequestMethod: "GET",
          RequestPath: "/b",
          RequestHost: "ex.com",
          DownstreamStatus: 404,
          RequestUserAgent: "Mozilla/5.0 Chrome/120",
        }),
      ),
      parseAccessLogLine(
        JSON.stringify({
          ClientHost: "198.51.100.10",
          RequestMethod: "GET",
          RequestPath: "/robots.txt",
          RequestHost: "ex.com",
          DownstreamStatus: 200,
          RequestUserAgent: "bingbot/2.0",
        }),
      ),
    ].filter((h) => h != null);

    const data = aggregateWebPresence(hits, "coolify-proxy");
    assert.equal(data.uniqueIps, 2);
    assert.equal(data.visitorCount, 1);
    assert.equal(data.botCount, 1);
    assert.equal(data.error4xx, 1);
    assert.equal(data.visitors[0].hits, 2);
    assert.ok(data.topPaths.length >= 2);
  });
});
