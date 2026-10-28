import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HSTS_MIN_MAX_AGE,
  isHttpsRedirect,
  parseHstsMaxAge,
} from "./website";

describe("parseHstsMaxAge", () => {
  it("reads max-age", () => {
    assert.equal(parseHstsMaxAge("max-age=15552000"), 15_552_000);
    assert.equal(
      parseHstsMaxAge("max-age=31536000; includeSubDomains; preload"),
      31_536_000,
    );
  });

  it("returns null when missing", () => {
    assert.equal(parseHstsMaxAge(null), null);
    assert.equal(parseHstsMaxAge(""), null);
    assert.equal(parseHstsMaxAge("includeSubDomains"), null);
  });
});

describe("isHttpsRedirect", () => {
  it("accepts absolute https Location", () => {
    assert.equal(
      isHttpsRedirect(301, "https://cloud.example.com/"),
      true,
    );
    assert.equal(isHttpsRedirect(308, "https://example.com/login"), true);
  });

  it("rejects http Location and non-redirects", () => {
    assert.equal(isHttpsRedirect(301, "http://example.com/"), false);
    assert.equal(isHttpsRedirect(200, "https://example.com/"), false);
    assert.equal(isHttpsRedirect(302, null), false);
  });
});

describe("HSTS_MIN_MAX_AGE", () => {
  it("matches Nextcloud recommendation (180d)", () => {
    assert.equal(HSTS_MIN_MAX_AGE, 180 * 24 * 60 * 60);
  });
});
