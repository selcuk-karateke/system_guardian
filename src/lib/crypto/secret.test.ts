import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("secret crypto", () => {
  it("round-trips encrypt/decrypt", async () => {
    process.env.AUTH_SECRET = "test-secret-at-least-16";
    const { encryptSecret, decryptSecret } = await import("./secret");
    const plain = "-----BEGIN KEY-----\nabc\n-----END KEY-----";
    const enc = encryptSecret(plain);
    assert.match(enc, /^sg1:/);
    assert.equal(decryptSecret(enc), plain);
  });
});
