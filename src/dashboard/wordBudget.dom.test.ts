// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Track 6 word budget (docs/dashboard-plan.md): counts the words and controls a
// person can see on each screen after a fixture scan, the same measurement as
// research/2026-10-27-dashboard-friction.md. Closed <details>, option lists and
// hidden nodes don't count, since nobody sees them.
import { beforeAll, describe, expect, it } from "vitest";
import { bootDashboard, type BootedDashboard } from "./testHarness";

// Ceilings sit a little above the 2026-10-29 counts (UI plan step 7); raise
// one only on purpose.
const BUDGET: Record<string, { words: number; controls: number }> = {
  overview: { words: 50, controls: 10 },
  delete: { words: 80, controls: 16 },
  subscriptions: { words: 50, controls: 8 },
  organize: { words: 195, controls: 28 },
  impersonation: { words: 80, controls: 10 },
  screener: { words: 60, controls: 6 },
  report: { words: 45, controls: 5 },
  senders: { words: 92, controls: 15 },
  settings: { words: 125, controls: 16 },
  recent: { words: 15, controls: 1 },
};

// Each action's one home (docs/ui-plan-2026-10-29.md). Elsewhere it may be a
// link or sit in a row's ⋯ menu, never a plain button.
const HOME: Record<string, string[]> = {
  Trash: ["delete"],
  Unsubscribe: ["subscriptions"],
  Mute: ["subscriptions"],
  Block: ["impersonation", "screener"],
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

  it("one primary button per screen", () => {
    const extra = Object.keys(BUDGET).filter((screen) => {
      dash.showScreen(screen);
      const root = document.querySelector(`section.screen[data-screen="${screen}"]`)!;
      return Array.from(root.querySelectorAll(".btn-accent-solid")).filter(visible).length > 1;
    });
    expect(extra).toEqual([]);
  });

  it("every checkbox and switch names itself", () => {
    const unnamed = Object.keys(BUDGET).flatMap((screen) => {
      dash.showScreen(screen);
      const root = document.querySelector(`section.screen[data-screen="${screen}"]`)!;
      return Array.from(root.querySelectorAll<HTMLInputElement>("input[type=checkbox]"))
        .filter(visible)
        .filter((box) => {
          const name =
            box.getAttribute("aria-label") ||
            (box.getAttribute("aria-labelledby") &&
              document.getElementById(box.getAttribute("aria-labelledby")!)?.textContent) ||
            Array.from(box.labels ?? []).map((l) => l.textContent).join("");
          return !name?.trim();
        })
        .map((box) => `${screen}#${box.id}`);
    });
    expect(unnamed).toEqual([]);
  });

  it("nothing folds more than two levels deep", () => {
    expect(document.querySelectorAll("section.screen details details details").length).toBe(0);
  });

  it("each action is a button only in its home place", () => {
    const strays = Object.keys(BUDGET).flatMap((screen) => {
      dash.showScreen(screen);
      const root = document.querySelector(`section.screen[data-screen="${screen}"]`)!;
      return Array.from(root.querySelectorAll("button"))
        .filter(visible)
        .map((b) => b.textContent!.trim())
        .filter((label) => HOME[label] && !HOME[label].includes(screen))
        .map((label) => `${label} on ${screen}`);
    });
    expect(strays).toEqual([]);
  });
});
