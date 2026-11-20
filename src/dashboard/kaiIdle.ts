import type { KaiAction, KaiInstance } from "./kai/kaiLife";

/** Calm gestures Kai makes on its own when you sit still (research 2026-11-20 #10). */
export const IDLE_GESTURES: KaiAction[] = ["lookAround", "tilt", "stretch", "wiggle"];
export const IDLE_FIRST_MS = 8000;
export const IDLE_GAP_MS: [number, number] = [15000, 25000];
export const IDLE_MAX_PER_SCREEN = 3;

/**
 * Kai does a small gesture after 8 s without input, then every 15 to 25 s,
 * never the same one twice in a row and at most 3 per screen. Call `reset`
 * when the screen changes. Stops when `signal` aborts or Kai leaves the page.
 */
export function startIdle(kai: KaiInstance, signal?: AbortSignal, now = () => performance.now()) {
  const stop = new AbortController();
  signal?.addEventListener("abort", () => stop.abort());
  let lastInput = now();
  let nextAt = 0;
  let count = 0;
  let last: KaiAction | null = null;
  const touch = () => (lastInput = now());
  for (const type of ["pointermove", "pointerdown", "keydown", "scroll"])
    window.addEventListener(type, touch, { signal: stop.signal, passive: true });
  const timer = window.setInterval(() => {
    if (!kai.root.isConnected) return stop.abort();
    const t = now();
    if (document.hidden || count >= IDLE_MAX_PER_SCREEN) return;
    if (t - lastInput < IDLE_FIRST_MS || t < nextAt) return;
    const pick = IDLE_GESTURES.filter((g) => g !== last);
    last = pick[Math.floor(Math.random() * pick.length)];
    kai.do(last);
    count++;
    nextAt = t + IDLE_GAP_MS[0] + Math.random() * (IDLE_GAP_MS[1] - IDLE_GAP_MS[0]);
  }, 1000);
  stop.signal.addEventListener("abort", () => clearInterval(timer));
  return {
    reset() {
      count = 0;
      touch();
    },
  };
}
