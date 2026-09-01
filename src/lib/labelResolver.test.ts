import { describe, expect, it } from "vitest";
import { applyLabelChoice, resolveLabelName } from "./labelResolver";

describe("resolveLabelName", () => {
  it("uses the desired name when nothing else has it", () => {
    expect(resolveLabelName("Shopping", ["Work", "Family"], [], {})).toEqual({ name: "Shopping" });
  });

  it("reuses a label Cluster created (owned), returning its stored casing", () => {
    expect(resolveLabelName("Shopping", ["shopping"], ["Shopping"], {})).toEqual({ name: "shopping" });
  });

  it("flags a collision with a label the user made", () => {
    expect(resolveLabelName("Shopping", ["Shopping"], [], {})).toEqual({
      conflict: { desired: "Shopping", existingUserLabel: "Shopping" },
    });
  });

  it("treats a case variant as the same label (would 409 on create otherwise)", () => {
    expect(resolveLabelName("Shopping", ["shopping"], [], {})).toEqual({
      conflict: { desired: "Shopping", existingUserLabel: "shopping" },
    });
  });

  it("a prior user choice short-circuits everything", () => {
    expect(
      resolveLabelName("Shopping", ["Shopping"], [], { Shopping: "Shopping (Cluster)" }),
    ).toEqual({ name: "Shopping (Cluster)" });
    expect(resolveLabelName("Shopping", ["Shopping"], [], { Shopping: "Shopping" })).toEqual({
      name: "Shopping",
    });
  });
});

describe("applyLabelChoice", () => {
  it("reuse keeps the name, suffix appends ' (Cluster)'", () => {
    expect(applyLabelChoice("Shopping", "reuse")).toBe("Shopping");
    expect(applyLabelChoice("Shopping", "suffix")).toBe("Shopping (Cluster)");
  });
});
