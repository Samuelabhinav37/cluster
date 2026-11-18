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
  // Raised for Home v2 (verdict, this week, next up, inbox), approved 2026-10-29.
  // 16: the finished Overview (4 tiles, 5 top senders, 4 kinds, range, Download).
  // 10 only ever passed while the test caught the loading screen (2026-11-18).
  overview: { words: 96, controls: 16 },
  // 2026-11-17 (user asked, Everbee reference): a line under the title, Search/Customize/Filter/Export, pages.
  // 2026-11-17: Breakdown gains the Dashboard chart\'s Total, Per day and Most column.
  // 2026-11-17 (user asked): the safe-to-trash card says why, with Review and Trash.
  delete: { words: 140, controls: 36 },
  // Redesign 2026-11: Cleanup's Senders and Subscriptions tabs.
  // 2026-11-06 Plausible panels: an Emails column head beside Opened.
  // 2026-11-16: the 2x2 tiles, the chart legend, its day picker and Download move in with the tabs.
  // 2026-11-17: the same line, toolbar and pages on Mailing lists.
  subscriptions: { words: 110, controls: 40 },
  // Round 2 (approved 2026-10-30): a five-step picker on each kind card.
  organize: { words: 300, controls: 75 },
  // Redesign 2026-11: KPI row and Suspicious and Quarantine tabs.
  // +Scan now (2026-11-06).
  // 2026-11-17 (asked for): a one-line intro, the Threats chart and Who they pretend to be.
  impersonation: { words: 145, controls: 20 },
  screener: { words: 60, controls: 6 },
  // Redesign 2026-11 (approved): every section on one scrolling page, not one at a time.
  // 2026-11-17 (user asked): Settings is one scrolling page, so every section counts at once.
  settings: { words: 360, controls: 60 },
  // 2026-11-17: the empty state names what lands here and offers Go to Cleanup, plus the Back link.
  recent: { words: 20, controls: 3 },
};

// Each action's one home (docs/ui-plan-2026-10-29.md). Elsewhere it may be a
// link or sit in a row's ⋯ menu, never a plain button.
const HOME: Record<string, string[]> = {
  // Round 2 (approved 2026-10-30): Home's next steps and the Senders card act in place.
  Trash: ["delete", "overview"],
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
  if (!el || el.closest("[hidden], template, option, .sr-only, [aria-hidden=true], [popover]")) return false;
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
            Array.from(box.labels ?? [])
              .map((l) => l.textContent)
              .join("");
          return !name?.trim();
        })
        .map((box) => `${screen}#${box.id}`);
    });
    expect(unnamed).toEqual([]);
  });

  it("nothing folds more than two levels deep", () => {
    expect(document.querySelectorAll("section.screen details details details").length).toBe(0);
  });

  // NN/g UI copy: name the action, never "OK"; one verb per action everywhere
  // (research/2026-10-29-fewer-words-icons-extension.md).
  const buttonLabels = () =>
    Object.keys(BUDGET).flatMap((screen) => {
      dash.showScreen(screen);
      const root = document.querySelector(`section.screen[data-screen="${screen}"]`)!;
      return Array.from(root.querySelectorAll("button, [role=menuitem]"))
        .filter(visible)
        .map((b) => `${b.textContent!.replace(/\s+/g, " ").trim()} (${screen})`);
    });

  it("no button just says OK", () => {
    expect(buttonLabels().filter((l) => /^ok\b/i.test(l))).toEqual([]);
  });

  it("Trash, Unsubscribe, Mute and Archive keep one word each", () => {
    // Delete forever is its own action (skips Trash), so it keeps its name.
    const synonyms = /^(delete(?! forever)|remove|clear out|bin|unsub(?!scribe)|silence|file away)\b/i;
    expect(buttonLabels().filter((l) => synonyms.test(l))).toEqual([]);
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
