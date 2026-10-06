// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Non-functional: baseline accessibility of the rendered dashboard, checked
// on every screen after a real (fixture) scan. Structural checks only — jsdom
// has no layout, so contrast, focus visibility and zoom stay on the manual
// live-test checklist.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootDashboard, type BootedDashboard } from "./testHarness";

const SCREENS = ["overview", "delete", "organize", "subscriptions", "impersonation", "senders", "rules", "screener", "recent"];

let dash: BootedDashboard;
beforeAll(async () => {
  vi.restoreAllMocks();
  dash = await bootDashboard();
});

function accessibleName(el: Element): string {
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    return labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
  }
  return (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "").trim();
}

function describeEl(el: Element): string {
  return el.outerHTML.slice(0, 140);
}

/** Visit every screen, collecting elements matched by `selector` from each. */
function acrossScreens(selector: string): Element[] {
  const seen = new Set<Element>();
  for (const screen of SCREENS) {
    dash.showScreen(screen);
    for (const el of Array.from(document.querySelectorAll(selector))) seen.add(el);
  }
  return [...seen];
}

describe("accessibility baseline (every screen, after a scan)", () => {
  it("every button, summary and link has an accessible name", () => {
    const unnamed = acrossScreens("button, summary, a[href]")
      .filter((el) => accessibleName(el) === "")
      .map(describeEl);
    expect(unnamed).toEqual([]);
  });

  function unlabelledControls(): Element[] {
    return acrossScreens("input:not([type=hidden]), select, textarea").filter((el) => {
      if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) return false;
      if (el.closest("label")) return false;
      const id = el.getAttribute("id");
      return !(id && document.querySelector(`label[for="${id}"]`));
    });
  }

  // KNOWN A11Y GAP (audit 2026-10-05): By-domain row checkboxes, the snooze
  // duration <select> on each Organize row, and the Rules manual form (which
  // relies on placeholder text, not a label) have no accessible label.
  const isKnownUnlabelled = (el: Element) =>
    el.hasAttribute("data-domain-key") ||
    (el.tagName === "SELECT" && el.querySelector('option[value="7"]')?.textContent === "1 week") ||
    /^rule-/.test(el.id);

  it("every form control outside the known gaps has a label", () => {
    expect(unlabelledControls().filter((el) => !isKnownUnlabelled(el)).map(describeEl)).toEqual([]);
  });

  it.fails("KNOWN A11Y GAP: domain checkboxes, snooze selects and the Rules form are unlabelled", () => {
    expect(unlabelledControls().filter(isKnownUnlabelled).map(describeEl)).toEqual([]);
  });

  it("every image has alt text (empty alt for decorative images is fine)", () => {
    const missing = acrossScreens("img")
      .filter((img) => !img.hasAttribute("alt"))
      .map(describeEl);
    expect(missing).toEqual([]);
  });

  it("decorative inline SVG icons are hidden from assistive tech", () => {
    const exposed = acrossScreens("button svg, .nav-item svg, .tile svg")
      .filter((svg) => svg.getAttribute("aria-hidden") !== "true" && !svg.getAttribute("aria-label"))
      .map(describeEl);
    expect(exposed).toEqual([]);
  });

  it("each screen has exactly one h1", () => {
    for (const screen of SCREENS) {
      const section = document.querySelector(`section.screen[data-screen="${screen}"]`)!;
      expect(section.querySelectorAll("h1").length, screen).toBe(1);
    }
  });

  it("the status line is announced politely and the sidebar is a labelled landmark", () => {
    expect(dash.el("status").getAttribute("role")).toBe("status");
    expect(dash.el("sidebar").getAttribute("aria-label")).toBeTruthy();
  });

  it("the active nav item is exposed to assistive tech (aria-current or aria-selected)", () => {
    dash.showScreen("rules");
    const active = document.querySelector('#sidebar button[data-screen="rules"]')!;
    const exposed = active.getAttribute("aria-current") ?? active.getAttribute("aria-selected");
    expect(exposed && exposed !== "false").toBeTruthy();
  });

  it("no duplicate ids (aria references and label[for] depend on uniqueness)", () => {
    const ids = Array.from(document.querySelectorAll("[id]")).map((e) => e.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect([...new Set(dupes)]).toEqual([]);
  });
});
