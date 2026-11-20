// Kai's speech bubble: types a line with Kai's mouth following it
// (research/2026-11-20-kai-speech-bubble-research.md).
import type { KaiInstance } from "./kai/kaiLife";

/** One typed character per this many ms, so the mouth can keep up. */
export const TYPE_MS = 34;
/** Extra beat after a comma-like mark, and after a sentence end, between words only. */
export const PAUSE_SHORT_MS = 120;
export const PAUSE_LONG_MS = 260;

const timers = new WeakMap<HTMLElement, number>();
const lives = new WeakMap<HTMLElement, HTMLElement>();

/** How long to wait after showing character `i` of `text`. */
export function beatAfter(text: string, i: number): number {
  if (text[i + 1] !== " ") return TYPE_MS;
  if (/[.!?…]/.test(text[i])) return TYPE_MS + PAUSE_LONG_MS;
  if (/[,;:]/.test(text[i])) return TYPE_MS + PAUSE_SHORT_MS;
  return TYPE_MS;
}

/**
 * Types `text` into `bubble`. The whole line is laid out up front (the rest
 * hidden), so the box has its final size before the first letter and never
 * grows as it types. Screen readers get the line once, not letter by letter.
 * `pop` plays the entrance (first line of a screen only). Clicking the bubble
 * shows the whole line. `instant` (or reduced motion) skips the typing.
 */
export function typeLine(bubble: HTMLElement, text: string, kai: KaiInstance | null, opts: { pop?: boolean; instant?: boolean } = {}): void {
  clearTimeout(timers.get(bubble));
  bubble.removeAttribute("aria-live");
  let live = lives.get(bubble);
  if (!live) {
    live = document.createElement("span");
    live.className = "sr-only";
    live.setAttribute("aria-live", "polite");
    lives.set(bubble, live);
  }
  if (bubble.parentNode && live.parentNode !== bubble.parentNode) bubble.after(live);
  live.textContent = text;

  const shown = document.createElement("span");
  const rest = document.createElement("span");
  rest.className = "kb-rest";
  for (const s of [shown, rest]) s.setAttribute("aria-hidden", "true");
  bubble.replaceChildren(shown, rest);
  if (opts.pop) {
    bubble.classList.remove("pop");
    void bubble.offsetWidth;
    bubble.classList.add("pop");
  }
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const all = () => {
    clearTimeout(timers.get(bubble));
    shown.textContent = text;
    rest.textContent = "";
  };
  bubble.onclick = all;
  if (opts.instant || reduced || !text) return all();
  rest.textContent = text;
  let n = 0;
  const step = () => {
    n += 1;
    shown.textContent = text.slice(0, n);
    rest.textContent = text.slice(n);
    kai?.voice(text[n - 1]);
    if (n < text.length) timers.set(bubble, window.setTimeout(step, beatAfter(text, n - 1)));
  };
  // Typing starts just after the box appears.
  timers.set(bubble, window.setTimeout(step, opts.pop ? 120 : 0));
}

/** Stops typing in `bubble` where it is. */
export function stopTyping(bubble: HTMLElement): void {
  clearTimeout(timers.get(bubble));
}
