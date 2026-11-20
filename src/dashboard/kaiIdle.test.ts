// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { startIdle, IDLE_MAX_PER_SCREEN } from "./kaiIdle";
import type { KaiInstance } from "./kai/kaiLife";

afterEach(() => vi.useRealTimers());

it("waits for stillness, never repeats a gesture back to back, and stops at 3 per screen", () => {
  vi.useFakeTimers();
  let t = 0;
  const done: string[] = [];
  const kai = { root: document.body, do: (a: string) => done.push(a) } as unknown as KaiInstance;
  const stop = new AbortController();
  const idle = startIdle(kai, stop.signal, () => t);
  const wait = (ms: number) => {
    for (let i = 0; i < ms / 1000; i++) {
      t += 1000;
      vi.advanceTimersByTime(1000);
    }
  };
  wait(7000);
  expect(done).toEqual([]);
  wait(120000);
  expect(done).toHaveLength(IDLE_MAX_PER_SCREEN);
  done.forEach((g, i) => i && expect(g).not.toBe(done[i - 1]));
  idle.reset();
  wait(9000);
  expect(done).toHaveLength(IDLE_MAX_PER_SCREEN + 1);
  stop.abort();
  wait(120000);
  expect(done).toHaveLength(IDLE_MAX_PER_SCREEN + 1);
});
