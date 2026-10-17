// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// First-run setup, simple mode and the Settings page (UI v4 stage 4).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard } from "./testHarness";

beforeEach(() => {
  vi.restoreAllMocks();
});

async function choosePersona(dash: Awaited<ReturnType<typeof bootDashboard>>, persona: string) {
  (dash.el("setup-banner-start") as HTMLButtonElement).click();
  await vi.waitFor(() => {
    if (dash.el("setup-banner").closest("section")!.hidden === false) throw new Error("still on overview");
  });
  (document.querySelector(`[data-persona="${persona}"]`) as HTMLButtonElement).click();
  expect(dash.el("setup-preview").hidden).toBe(false);
  (dash.el("setup-go") as HTMLButtonElement).click();
}

describe("first-run setup", () => {
  it("offers setup on Overview until it's answered or dismissed", async () => {
    const dash = await bootDashboard();
    expect(dash.el("setup-banner").hidden).toBe(false);
    (dash.el("setup-banner-dismiss") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(dash.storedSettings().setupDone).toBe(true));
    expect(dash.el("setup-banner").hidden).toBe(true);
  });

  it("Keep me safe turns on scam holding and simple mode", async () => {
    const dash = await bootDashboard();
    await choosePersona(dash, "safe");
    await vi.waitFor(() => expect(dash.storedSettings().simpleMode).toBe(true));
    expect(dash.storedSettings().autoQuarantineHighRisk).toBe(true);
    expect(dash.storedSettings().persona).toBe("safe");
    expect(document.body.classList.contains("simple")).toBe(true);
    const shown = Array.from(document.querySelectorAll<HTMLButtonElement>("#sidebar button[data-screen]"))
      .filter((b) => !b.hidden)
      .map((b) => b.dataset.screen);
    expect(shown.sort()).toEqual(["impersonation", "settings", "simple"]);
    expect(dash.el("settings-persona").textContent).toBe("Keep me safe");
  });

  it("a time-limit persona fills in Sorting but never changes Gmail until Save", async () => {
    const dash = await bootDashboard();
    const before = dash.storedSettings().autoSort;
    await choosePersona(dash, "calm");
    await vi.waitFor(() => expect(dash.storedSettings().persona).toBe("calm"));
    await vi.waitFor(() => {
      if (!(dash.el("time-limits-status").textContent ?? "").includes("Press Save")) throw new Error("not proposed yet");
    });
    expect((dash.el("time-limit-promotions") as HTMLSelectElement).value).toBe("24");
    expect((dash.el("time-limit-travel") as HTMLSelectElement).value).toBe("stay");
    expect((dash.el("time-limits-toggle") as HTMLInputElement).checked).toBe(true);
    // Nothing saved: stored time limits and Gmail filters are untouched.
    expect(dash.storedSettings().autoSort).toEqual(before);
  });
});

describe("simple mode", () => {
  it("can be switched on from Settings and off from Home", async () => {
    const dash = await bootDashboard();
    const toggle = dash.el("simple-mode-toggle") as HTMLInputElement;
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(dash.storedSettings().simpleMode).toBe(true));
    expect(document.body.classList.contains("simple")).toBe(true);

    (dash.el("simple-off") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(dash.storedSettings().simpleMode).toBe(false));
    expect(document.body.classList.contains("simple")).toBe(false);
  });
});
