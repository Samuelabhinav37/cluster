// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { beatAfter, typeLine, TYPE_MS, PAUSE_LONG_MS, PAUSE_SHORT_MS } from "./kaiBubble";

it("pauses after punctuation between words only", () => {
  const t = "Hi, I am Kai! Okay.";
  expect(beatAfter(t, 1)).toBe(TYPE_MS);
  expect(beatAfter(t, 2)).toBe(TYPE_MS + PAUSE_SHORT_MS);
  expect(beatAfter(t, 12)).toBe(TYPE_MS + PAUSE_LONG_MS);
  expect(beatAfter(t, t.length - 1)).toBe(TYPE_MS);
});

it("lays out the whole line first, types it, and a click shows it all", () => {
  vi.useFakeTimers();
  const p = document.createElement("p");
  document.body.append(p);
  typeLine(p, "Hello there.", null);
  expect(p.textContent).toBe("Hello there.");
  expect(p.querySelector(".kb-rest")!.textContent).toBe("Hello there.");
  vi.advanceTimersByTime(TYPE_MS * 2);
  expect(p.firstElementChild!.textContent).toBe("Hel");
  p.click();
  expect(p.querySelector(".kb-rest")!.textContent).toBe("");
  expect(document.querySelector("[aria-live]")!.textContent).toBe("Hello there.");
  vi.useRealTimers();
});
