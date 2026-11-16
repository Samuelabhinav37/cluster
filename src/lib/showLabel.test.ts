import { describe, expect, it } from "vitest";
import { showLabel } from "./clusterLabels";

describe("showLabel", () => {
  it("adds the emoji selector once, so 🏷 and 🛍 draw in color", () => {
    expect(showLabel("🏷 Promotions")).toBe("🏷️ Promotions");
    expect(showLabel(showLabel("🛍 Shopping"))).toBe("🛍️ Shopping");
  });
  it("leaves names without a leading emoji alone", () => {
    expect(showLabel("Work stuff")).toBe("Work stuff");
  });
});
