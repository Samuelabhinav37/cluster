// Minimal logistic-regression primitives for the engagement model.
//
// p(won't-miss | sender) = sigmoid( w_global · x  +  w_user · x )
//
// w_global is a shipped constant (globalWeights.ts). w_user is a per-user delta
// vector, initialised to zeros and nudged one gradient step per labelled
// action by `sgdStep`, with L2 pulling it back toward zero so the global prior
// dominates until the user has given real signal.

/** Numerically stable logistic sigmoid. */
export function sigmoid(z: number): number {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

export function dot(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

export interface SgdOptions {
  /** Step size. Small — the global prior should not be easy to override. */
  learningRate?: number;
  /** L2 strength: each step also shrinks w_user toward zero by `l2 * w`. */
  l2?: number;
}

export const DEFAULT_SGD: Required<SgdOptions> = { learningRate: 0.05, l2: 0.01 };

/**
 * One online logistic-regression gradient step on the per-user delta weights.
 * `globalWeights` are fixed and only contribute to the prediction; the returned
 * array is a new `userWeights` with the step applied. `sampleWeight` lets a
 * stronger signal (an undo, a reply to a sender we'd scored high) count for
 * more than a plain dismiss.
 */
export function sgdStep(
  userWeights: readonly number[],
  globalWeights: readonly number[],
  x: readonly number[],
  y: 0 | 1,
  sampleWeight = 1,
  options: SgdOptions = {},
): number[] {
  const { learningRate, l2 } = { ...DEFAULT_SGD, ...options };
  const z = dot(globalWeights, x) + dot(userWeights, x);
  const dLossDz = sigmoid(z) - y;
  return userWeights.map(
    (w, i) => w - learningRate * (sampleWeight * dLossDz * (x[i] ?? 0) + l2 * w),
  );
}

/** Mean log-loss of `(x, y)` pairs under the combined weights — for tests and
 * for an optional "is the personal model actually helping?" check later. */
export function logLoss(
  globalWeights: readonly number[],
  userWeights: readonly number[],
  samples: { x: readonly number[]; y: 0 | 1 }[],
): number {
  if (samples.length === 0) return 0;
  let total = 0;
  for (const { x, y } of samples) {
    const p = sigmoid(dot(globalWeights, x) + dot(userWeights, x));
    const clamped = Math.min(1 - 1e-12, Math.max(1e-12, p));
    total += -(y * Math.log(clamped) + (1 - y) * Math.log(1 - clamped));
  }
  return total / samples.length;
}
