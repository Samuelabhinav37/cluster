// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { scanStage } from "./scanStage";

describe("scan stage cube", () => {
  it("stays tangled after the quick count and solves once labels go on", () => {
    // Reduced motion applies the turns at once, so the test needs no frames.
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const stage = scanStage();
    const cube = stage.el.querySelector(".unt-cube")!;
    stage.update({ done: 150, total: 150, eta: "", label: "Reading your mail" });
    stage.update({ done: 9, total: 9, eta: "", label: "Reading your sent mail" });
    expect(cube.classList.contains("is-solved")).toBe(false);
    stage.update({ done: 9, total: 9, eta: "", label: "Putting labels on your inbox" });
    expect(cube.classList.contains("is-solved")).toBe(true);
    vi.unstubAllGlobals();
  });
});
