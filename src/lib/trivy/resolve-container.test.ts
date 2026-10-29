import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coolifyUuidFromContainerName,
  pickResolvedContainer,
} from "./resolve-container";

describe("coolifyUuidFromContainerName", () => {
  it("extracts Coolify UUID from Dockerfile container name", () => {
    assert.equal(
      coolifyUuidFromContainerName("k5gesmdkvemisft5ugebotgb-203210584829"),
      "k5gesmdkvemisft5ugebotgb",
    );
    assert.equal(
      coolifyUuidFromContainerName(
        "y12ug8h3x4nz6mg2d6qhl5bh-20261029T133623",
      ),
      "y12ug8h3x4nz6mg2d6qhl5bh",
    );
  });

  it("ignores non-coolify names", () => {
    assert.equal(coolifyUuidFromContainerName("coolify-proxy"), null);
    assert.equal(coolifyUuidFromContainerName("postgres"), null);
  });
});

describe("pickResolvedContainer", () => {
  it("prefers running after rebuild name swap", () => {
    assert.equal(
      pickResolvedContainer([
        { name: "k5gesmdkvemisft5ugebotgb-203210584829", state: "exited" },
        { name: "k5gesmdkvemisft5ugebotgb-998877665544", state: "running" },
      ]),
      "k5gesmdkvemisft5ugebotgb-998877665544",
    );
  });

  it("falls back when nothing running", () => {
    assert.equal(
      pickResolvedContainer([
        { name: "k5gesmdkvemisft5ugebotgb-1", state: "exited" },
      ]),
      "k5gesmdkvemisft5ugebotgb-1",
    );
  });
});
