import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateTotpSecret,
  buildTotp,
  verifyTotpCode,
  totpUri,
} from "./totp";

describe("totp", () => {
  it("generates secret and verifies current code", () => {
    const secret = generateTotpSecret();
    assert.ok(secret.length >= 16);
    const token = buildTotp(secret, "admin").generate();
    assert.equal(verifyTotpCode(secret, "admin", token), true);
    assert.equal(verifyTotpCode(secret, "admin", "000000"), false);
  });

  it("builds otpauth uri", () => {
    const secret = generateTotpSecret();
    const uri = totpUri(secret, "admin");
    assert.match(uri, /^otpauth:\/\/totp\//);
    assert.match(uri, /System%20Guardian|System Guardian/);
  });
});
