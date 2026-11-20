import { describe, expect, it } from "vitest";
import { applyMove, isSolved, scramble, solution, solvedCube } from "./untangleCube";

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
});
