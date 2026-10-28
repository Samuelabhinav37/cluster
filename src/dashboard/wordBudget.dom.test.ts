// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Track 6 word budget (docs/dashboard-plan.md): counts the words and controls a
// person can see on each screen after a fixture scan, the same measurement as
// research/2026-10-27-dashboard-friction.md. Closed <details>, option lists and
// hidden nodes don't count, since nobody sees them.
import { beforeAll, describe, expect, it } from "vitest";
import { bootDashboard, type BootedDashboard } from "./testHarness";

// Ceilings sit a little above the 2026-10-28 counts; raise one only on purpose.
const BUDGET: Record<string, { words: number; controls: number }> = {
  overview: { words: 60, controls: 16 },
  delete: { words: 120, controls: 26 },
  subscriptions: { words: 130, controls: 12 },
  organize: { words: 220, controls: 30 }, // holds Rules since 2026-10-28
  impersonation: { words: 130, controls: 11 }, // holds the scan charts since 2026-10-28
  screener: { words: 70, controls: 6 },
  report: { words: 50, controls: 6 },
  senders: { words: 85, controls: 18 },
  settings: { words: 135, controls: 18 }, // six groups added 2026-10-28
  recent: { words: 20, controls: 2 },
};

let dash: BootedDashboard;
beforeAll(async () => {
  dash = await bootDashboard();
});

function visible(n: Node): boolean {
  const el = n instanceof Element ? n : n.parentElement;
  if (!el || el.closest("[hidden], template, option, .sr-only, [aria-hidden=true]")) return false;
  const closed = el.closest("details:not([open])");
  return !closed || el.closest("summary")?.parentElement === closed;
}

function screenTexts(screen: string): string[] {
  dash.showScreen(screen);
  const root = document.querySelector(`section.screen[data-screen="${screen}"]`)!;
  const out: string[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = n.textContent!.replace(/\s+/g, " ").trim();
    if (t && visible(n)) out.push(t);
  }
  return out;
}

function measure(screen: string) {
  const words = screenTexts(screen).reduce((sum, t) => sum + (t.match(/[\p{L}\p{N}]+/gu) ?? []).length, 0);
  const root = document.querySelector(`section.screen[data-screen="${screen}"]`)!;
  const controls = Array.from(
    root.querySelectorAll("button, a[href], input, select, textarea, summary"),
  ).filter(visible).length;
  return { words, controls };
}

describe("word budget (every screen, after a scan)", () => {
  it.each(Object.keys(BUDGET))("%s stays within its word and control budget", (screen) => {
    const got = measure(screen);
    expect(got.words, `${screen} words`).toBeLessThanOrEqual(BUDGET[screen].words);
    expect(got.controls, `${screen} controls`).toBeLessThanOrEqual(BUDGET[screen].controls);
  });

  it("no line says more than one sentence", () => {
    const long = Object.keys(BUDGET).flatMap((s) => screenTexts(s).filter((t) => /[.!?] +\p{Lu}/u.test(t)));
    expect(long).toEqual([]);
  });

  it("no dashes in visible copy", () => {
    const dashed = Object.keys(BUDGET).flatMap((s) => screenTexts(s).filter((t) => /[–—]| - /.test(t)));
    expect(dashed).toEqual([]);
  });
});
