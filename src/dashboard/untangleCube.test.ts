// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { applyMove, isSolved, scramble, solution, solvedCube, untangleCube } from "./untangleCube";

describe("untangle cube", () => {
  it("a scramble mixes the faces and its solution puts every face back to one colour", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const moves = scramble(18, random);
    const cube = solvedCube();
    for (const m of moves) applyMove(cube, m);
    expect(isSolved(cube)).toBe(false);
    for (const m of solution(moves)) applyMove(cube, m);
    expect(isSolved(cube)).toBe(true);
  });

  it("never turns the same layer twice in a row", () => {
    const moves = scramble(40);
    for (let i = 1; i < moves.length; i++) {
      expect(moves[i].axis === moves[i - 1].axis && moves[i].layer === moves[i - 1].layer).toBe(false);
    }
  });

  it("keeps turning while it waits, and is solved only once all is read", () => {
    let queued: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => queued.push(f));
    let now = 0;
    const run = (ms: number) => {
      for (const end = now + ms; now < end; now += 250) {
        const due = queued;
        queued = [];
        due.forEach((f) => f(now));
      }
    };
    const cube = untangleCube(8);
    document.body.append(cube.el);
    const turnsDrawn = () => cube.el.querySelectorAll(".unt-sticker").length;
    cube.progress(0.5);
    run(40_000);
    expect(cube.el.classList.contains("is-solved")).toBe(false);
    expect(turnsDrawn()).toBeGreaterThan(0);
    cube.progress(1);
    run(40_000);
    expect(cube.el.classList.contains("is-solved")).toBe(true);
    cube.stop();
    vi.unstubAllGlobals();
  });
});
