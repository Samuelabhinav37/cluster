// @vitest-environment jsdom
// Settings groups added 2026-10-28 (settingsMore.ts).
import { describe, expect, it, vi } from "vitest";
import { bootDashboard } from "./testHarness";

const key = (k: string) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
const shown = () => document.querySelector<HTMLElement>(".screen:not([hidden])")?.dataset.screen;

describe("Settings: more groups", () => {
  it("G then O goes to Organize, but not while typing", async () => {
    const dash = await bootDashboard();
    key("g");
    key("o");
    expect(shown()).toBe("organize");
    (dash.el("rule-natural-language") as HTMLInputElement).focus();
    key("g");
    key("p");
    expect(shown()).toBe("organize");
  });

  it("Show Kai off hides Kai and is remembered", async () => {
    const dash = await bootDashboard();
    const toggle = dash.el("show-kai-toggle") as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    expect(document.querySelector<HTMLElement>(".kai-guide")!.hidden).toBe(true);
    await vi.waitFor(() => expect(dash.storedSettings().showKai).toBe(false));
  });

  it("a notification stays off when Chrome's permission is refused", async () => {
    const dash = await bootDashboard();
    chrome.permissions.request = vi.fn(async () => false) as never;
    const toggle = dash.el("notify-scam-toggle") as HTMLInputElement;
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(toggle.checked).toBe(false));
    expect(dash.storedSettings().notifyScamHeld).toBe(false);
  });

  it("Erase asks first, then clears what Cluster stored", async () => {
    const dash = await bootDashboard();
    const clear = vi.fn(async () => {});
    chrome.storage.local.clear = clear as never;
    (dash.el("settings-erase") as HTMLButtonElement).click();
    expect(clear).not.toHaveBeenCalled();
    const confirm = Array.from(dash.el("settings-erase-slot").querySelectorAll("button")).find(
      (b) => b.textContent === "Confirm",
    )!;
    confirm.click();
    await vi.waitFor(() => expect(clear).toHaveBeenCalled());
  });
});
