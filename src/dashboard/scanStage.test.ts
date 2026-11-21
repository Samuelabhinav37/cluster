// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { scanStage } from "./scanStage";
import { sharedCube } from "./untangleCube";

describe("scan stage cube", () => {
  it("stays tangled through reading and labelling, and solves only when the first read ends", () => {
    // Reduced motion applies the turns at once, so the test needs no frames.
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const stage = scanStage();
    const cube = stage.el.querySelector(".unt-cube")!;
    stage.update({ done: 150, total: 150, eta: "", label: "Reading your mail" });
    stage.update({ done: 9, total: 9, eta: "", label: "Reading your sent mail" });
    expect(cube.classList.contains("is-solved")).toBe(false);
    // Labelling has no count: it used to solve the cube at once, then it sat still while labels went on.
    stage.update({ done: 9, total: 9, eta: "", label: "Putting labels on your inbox" });
    expect(cube.classList.contains("is-solved")).toBe(false);
    sharedCube().progress(1); // what the dashboard does when the first read ends
    expect(cube.classList.contains("is-solved")).toBe(true);
    vi.unstubAllGlobals();
  });
});

