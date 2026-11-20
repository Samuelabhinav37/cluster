import type { KaiInstance } from "./kai/kaiLife";

/** Where Kai last stood on screen, so the next Kai can fly in from there. */
let last: DOMRect | null = null;

export const TRAVEL_MS = 720;

/** Notes where Kai stands now. */
export function rememberKai(host: HTMLElement): void {
  const r = host.getBoundingClientRect();
  if (r.width) last = r;
}

/**
 * Kai flies from where it stood (`from`, by default the last remembered spot)
 * to where `host` is now: a low arc, leaning into the move, then a small
 * landing squash. Like Astro running to the next spot instead of popping in.
 */
export function travel(host: HTMLElement, kai: KaiInstance | null, from: DOMRect | null = last): void {
  const to = host.getBoundingClientRect();
  if (to.width) last = to;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  if (!from || !from.width || !to.width || reduced || typeof host.animate !== "function") return;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const s = from.width / to.width;
  if (Math.hypot(dx, dy) < 6 && Math.abs(s - 1) < 0.03) return;
  const lean = dx > 0 ? -9 : 9;
  const lift = Math.min(60, 20 + Math.hypot(dx, dy) * 0.12);
  host.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${s})` },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(${(s + 1) / 2}) rotate(${lean}deg)`, offset: 0.5 },
      { transform: "none" },
    ],
    { duration: TRAVEL_MS, easing: "cubic-bezier(0.33, 0.8, 0.3, 1)" },
  );
  window.setTimeout(() => kai?.do("land"), TRAVEL_MS - 60);
}
