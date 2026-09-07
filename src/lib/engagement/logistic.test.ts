import { describe, expect, it } from "vitest";
import { dot, logLoss, sigmoid, sgdStep } from "./logistic";

describe("sigmoid", () => {
  it("is 0.5 at zero, monotonic, and bounded in (0, 1)", () => {
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(-2)).toBeLessThan(sigmoid(-1));
    expect(sigmoid(1)).toBeLessThan(sigmoid(2));
    expect(sigmoid(20)).toBeGreaterThan(0.999);
    expect(sigmoid(20)).toBeLessThan(1);
    expect(sigmoid(-20)).toBeLessThan(0.001);
    expect(sigmoid(-20)).toBeGreaterThan(0);
    // Saturates to the float bounds at extremes, never past them.
    expect(sigmoid(1e6)).toBeLessThanOrEqual(1);
    expect(sigmoid(-1e6)).toBeGreaterThanOrEqual(0);
  });
});

describe("dot", () => {
  it("sums the elementwise product over the shorter length", () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(dot([1, 1, 1, 1], [2, 3])).toBe(5);
  });
});

describe("sgdStep convergence", () => {
  // A tiny separable problem: y = 1 iff w_true · x > 0, no global prior.
  // Index 0 is a bias-like constant; indices 1 and 2 carry the real signal
  // (negative then positive); index 3 is pure noise (true weight 0).
  const DIM = 4;
  const wTrue = [1.5, -2, 0.8, 0];

  function makeSample(rng: () => number) {
    const x = Array.from({ length: DIM }, () => rng() * 2 - 1);
    x[0] = 1; // bias-like constant term
    const y: 0 | 1 = dot(wTrue, x) > 0 ? 1 : 0;
    return { x, y };
  }

  it("moves w_user toward the true weights and drives log-loss down", () => {
    let seed = 42;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const global = new Array(DIM).fill(0);
    const samples = Array.from({ length: 400 }, () => makeSample(rng));

    let w = new Array(DIM).fill(0);
    const lossBefore = logLoss(global, w, samples);

    for (let epoch = 0; epoch < 40; epoch++) {
      for (const { x, y } of samples) {
        w = sgdStep(w, global, x, y, 1, { learningRate: 0.1, l2: 0.0 });
      }
    }
    const lossAfter = logLoss(global, w, samples);

    expect(lossAfter).toBeLessThan(lossBefore);
    expect(lossAfter).toBeLessThan(0.2);
    // Direction, not exact magnitude (logistic weights are scale-free).
    expect(Math.sign(w[1])).toBe(-1); // wTrue[1] = -2
    expect(Math.sign(w[2])).toBe(1); // wTrue[2] = 0.8
    // w[3] tracks noise — just assert it stayed small next to the real signal.
    expect(Math.abs(w[3])).toBeLessThan(Math.abs(w[1]));
  });

  it("L2 regularisation pulls an unconstrained weight back toward zero", () => {
    const global = [0, 0];
    const x = [1, 1];
    let w = [0, 0];
    // Always y = 1 with a big step and no L2: w grows without bound.
    for (let i = 0; i < 50; i++) w = sgdStep(w, global, x, 1, 1, { learningRate: 0.5, l2: 0 });
    const unregularised = w[1];

    let wReg = [0, 0];
    for (let i = 0; i < 50; i++) {
      wReg = sgdStep(wReg, global, x, 1, 1, { learningRate: 0.5, l2: 0.3 });
    }
    expect(wReg[1]).toBeLessThan(unregularised);
    expect(wReg[1]).toBeGreaterThan(0); // still learns the direction
  });

  it("returns a new array and leaves the input untouched", () => {
    const w = [0.1, 0.2];
    const next = sgdStep(w, [0, 0], [1, 1], 1);
    expect(next).not.toBe(w);
    expect(w).toEqual([0.1, 0.2]);
  });
});
