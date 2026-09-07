// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Boot smoke test: load the real index.html into jsdom via the shared harness,
// with a fixture Gmail mailbox, and assert the whole pure render chain wires
// up — every tab switches, each extracted module produced its section, and a
// confirm step opens. This is the automated stand-in for a reload-unpacked
// pass; it would have caught the managed_schema.json load break from 01cc8b6.
//
// Action *flows* (a mute/rule/unsubscribe actually firing, undo, offline, the
// 403 UI) live in the sibling *.actions.dom.test.ts / errors.dom.test.ts
// files, also on the harness.
import { beforeAll, describe, expect, it } from "vitest";
import { bootDashboard, type BootedDashboard } from "./testHarness";

let dash: BootedDashboard;

beforeAll(async () => {
  dash = await bootDashboard();
});

describe("dashboard boot smoke", () => {
  it("renders the overview headline from the fixture scan", () => {
    expect(dash.el("overview-headline").textContent).toMatch(/Scanned \d+ sender/);
  });

  it("builds the sender table with rows", () => {
    const groups = dash.el("sender-groups");
    expect(groups.hidden).toBe(false);
    expect(groups.querySelectorAll("tr").length).toBeGreaterThan(0);
  });

  it("flags the free-mail brand claim in the Security tab", () => {
    const items = document.querySelectorAll("#security-sender-list li");
    expect(items.length).toBeGreaterThan(0);
    expect(
      Array.from(items)
        .map((li) => li.textContent)
        .join(" ")
        .toLowerCase(),
    ).toContain("paypal");
  });

  it("lists the unsubscribe-capable sender in the Subscriptions tab", () => {
    expect(dash.el("subscriptions-list").textContent).toContain("shop.example");
  });

  it("shows the empty Recently-done state", () => {
    expect(dash.el("recent-list").textContent).toContain("Nothing done yet");
  });

  it("switches to every tab, showing exactly one panel", () => {
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("#tabs button[data-tab]"),
    );
    expect(buttons.length).toBe(7);
    for (const button of buttons) {
      button.click();
      const shown = Array.from(
        document.querySelectorAll<HTMLElement>("section.tab-panel[data-tab]"),
      ).filter((panel) => !panel.hidden);
      expect(shown).toHaveLength(1);
      expect(shown[0].dataset.tab).toBe(button.dataset.tab);
    }
  });

  it("wires the ARIA tabs pattern: aria-controls, roving tabindex, arrow keys", () => {
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("#tabs button[data-tab]"),
    );
    for (const btn of buttons) {
      const panelId = btn.getAttribute("aria-controls")!;
      const panel = document.getElementById(panelId)!;
      expect(panel.dataset.tab).toBe(btn.dataset.tab);
      expect(panel.getAttribute("aria-labelledby")).toBe(btn.id);
    }
    buttons[0].click();
    expect(buttons.filter((b) => b.tabIndex === 0).map((b) => b.dataset.tab)).toEqual(["overview"]);
    expect(buttons.filter((b) => b.tabIndex === -1)).toHaveLength(6);
    document
      .getElementById("tabs")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(buttons[1].getAttribute("aria-selected")).toBe("true");
    expect(
      document.querySelector<HTMLElement>("section.tab-panel[data-tab='cleanup']")!.hidden,
    ).toBe(false);
  });

  it("applies and clears the forced theme from the Settings select", () => {
    const select = dash.el("theme-select") as HTMLSelectElement;
    expect(select.value).toBe("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();

    select.value = "dark";
    select.dispatchEvent(new Event("change"));
    expect(document.documentElement.dataset.theme).toBe("dark");

    select.value = "system";
    select.dispatchEvent(new Event("change"));
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("gives the category-group tables a screen-reader caption", () => {
    dash.showTab("cleanup");
    const caption = document.querySelector("#sender-groups table caption");
    expect(caption?.classList.contains("sr-only")).toBe(true);
    expect(caption?.textContent).toMatch(/\d+ senders?, \d+ messages/);
  });

  it("opens a confirm step from a sender-row action", () => {
    dash.showTab("cleanup");
    const muteBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>("#sender-groups button"),
    ).find((b) => b.textContent === "Mute");
    expect(muteBtn, "no Mute button rendered in the sender table").toBeTruthy();
    const cell = muteBtn!.closest("td")!;
    muteBtn!.click();
    expect(cell.textContent).toContain("Hide all mail from");
    expect(Array.from(cell.querySelectorAll("button")).map((b) => b.textContent)).toEqual(
      expect.arrayContaining(["Confirm", "Cancel"]),
    );
  });
});

describe("harness isolation", () => {
  it("a second boot gets fresh module state (no leaked ctx / doubled rows)", async () => {
    const first = await bootDashboard();
    const firstRows = first.el("sender-groups").querySelectorAll("tr").length;

    const second = await bootDashboard();
    const secondRows = second.el("sender-groups").querySelectorAll("tr").length;

    expect(secondRows).toBe(firstRows);
    expect(second.el("recent-list").textContent).toContain("Nothing done yet");
  });
});
