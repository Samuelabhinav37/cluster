// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { firstVisitTip } from "./kaiGuide";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("firstVisitTip", () => {
  it("gives each page's tip once, and nothing for pages without one", () => {
    const store = memory();
    expect(firstVisitTip("organize", store)).toBe("Choose how long each label stays.");
    expect(firstVisitTip("organize", store)).toBeNull();
    expect(firstVisitTip("delete", store)).not.toBeNull();
    expect(firstVisitTip("overview", store)).toBeNull();
  });
});
