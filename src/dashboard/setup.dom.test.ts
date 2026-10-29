// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// First-run setup, simple mode and the Settings page.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard } from "./testHarness";

beforeEach(() => {
  vi.restoreAllMocks();
});

type Dash = Awaited<ReturnType<typeof bootDashboard>>;

const setupSection = (dash: Dash) => dash.el("setup-flow").closest("section")!;

/** Picks "who", then skips the practice inbox and the next two questions, and presses Start. */
async function runSetup(dash: Dash, who: string) {
  expect(setupSection(dash).hidden).toBe(false);
  (document.querySelector(`[data-who="${who}"]`) as HTMLButtonElement).click();
  (dash.el("setup-next") as HTMLButtonElement).click();
  for (let i = 0; i < 3; i++)
    Array.from(document.querySelectorAll<HTMLButtonElement>(".onb-nav button"))
      .find((b) => b.textContent === "Skip")!
      .click();
  (dash.el("setup-go") as HTMLButtonElement).click();
}

describe("first-run setup", () => {
  it("opens on setup the first time, and on Home once it's skipped", async () => {
    const dash = await bootDashboard();
    expect(setupSection(dash).hidden).toBe(false);
    (dash.el("setup-not-now") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(dash.storedSettings().setupDone).toBe(true));
    await vi.waitFor(() => expect(setupSection(dash).hidden).toBe(true));
    const again = await bootDashboard({ settings: { setupDone: true } });
    expect(setupSection(again).hidden).toBe(true);
  });

  it("Continue waits for an answer, and Kai says what each step is for", async () => {
    const dash = await bootDashboard();
    expect((dash.el("setup-next") as HTMLButtonElement).disabled).toBe(true);
    (document.querySelector('[data-who="me"]') as HTMLButtonElement).click();
    (dash.el("setup-next") as HTMLButtonElement).click();
    expect(document.querySelectorAll(".onb-mail")).toHaveLength(5);
    await vi.waitFor(() => expect(dash.el("setup-kai-line").textContent).toContain("Practice mail"));
  });

  it("Keep me safe turns on scam holding and simple mode", async () => {
    const dash = await bootDashboard();
    await runSetup(dash, "safe");
    await vi.waitFor(() => expect(dash.storedSettings().simpleMode).toBe(true));
    expect(dash.storedSettings().autoQuarantineHighRisk).toBe(true);
    expect(dash.storedSettings().persona).toBe("safe");
    expect(dash.storedSettings().onboarding?.answers.who).toBe("safe");
    expect(document.body.classList.contains("simple")).toBe(true);
    const shown = Array.from(document.querySelectorAll<HTMLButtonElement>("#sidebar button[data-screen]"))
      .filter((b) => !b.hidden)
      .map((b) => b.dataset.screen);
    expect(shown.sort()).toEqual(["impersonation", "simple"]);
    expect(dash.el("settings-persona").textContent).toBe("Keep me safe");
  });

  it("Ask me first saves the answers but never turns on Gmail filters", async () => {
    const dash = await bootDashboard();
    await runSetup(dash, "me");
    await vi.waitFor(() => expect(dash.storedSettings().persona).toBe("calm"));
    expect(dash.storedSettings().setupDone).toBe(true);
    expect((dash.el("time-limits-toggle") as HTMLInputElement).checked).toBe(false);
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
