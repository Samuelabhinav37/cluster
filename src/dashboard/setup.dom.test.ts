// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// First-run setup and the Settings page.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard } from "./testHarness";

beforeEach(() => {
  vi.restoreAllMocks();
});

type Dash = Awaited<ReturnType<typeof bootDashboard>>;

const setupSection = (dash: Dash) => dash.el("setup-flow").closest("section")!;

const navButton = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>(".onb-nav button")).find((b) => b.textContent === text)!;

/** Picks "who", skips "what stays", answers "how hands-on" (or skips it), and presses Start. */
async function runSetup(dash: Dash, who: string, hands?: string) {
  expect(setupSection(dash).hidden).toBe(false);
  (document.querySelector(`[data-who="${who}"]`) as HTMLButtonElement).click();
  (dash.el("setup-next") as HTMLButtonElement).click();
  navButton("Skip").click();
  if (hands) {
    Array.from(document.querySelectorAll<HTMLButtonElement>(".onb-opt"))
      .find((b) => b.textContent?.includes(hands))!
      .click();
    (dash.el("setup-next") as HTMLButtonElement).click();
  } else navButton("Skip").click();
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
    expect(document.querySelector(".onb-title")!.textContent).toBe("What should always stay?");
    await vi.waitFor(() => expect(dash.el("setup-kai-line").textContent).toContain("never move"));
  });

  it("Keep me safe turns on scam holding and lands on Home", async () => {
    const dash = await bootDashboard();
    await runSetup(dash, "safe");
    await vi.waitFor(() => expect(dash.storedSettings().autoQuarantineHighRisk).toBe(true));
    expect(dash.storedSettings().persona).toBe("safe");
    expect(dash.storedSettings().onboarding?.answers.who).toBe("safe");
    expect(document.getElementById("settings-change-setup")).toBeNull();
  });

  it("by default turns everything on: filters for every label, promotions and newsletters skip the inbox, scams held", async () => {
    const dash = await bootDashboard();
    await runSetup(dash, "me");
    await vi.waitFor(() => expect(Object.keys(dash.storedSettings().autoSort.filterIdsByBucket)).toHaveLength(13));
    const stored = dash.storedSettings();
    expect(stored.autoSort.timeLimitsEnabled).toBe(true);
    expect(stored.autoSort.labelsOff).toEqual([]);
    expect(stored.autoSort.inboxHoursByBucket).toMatchObject({ promotions: 0, newsletter: 0, social: 3, finance: null });
    expect(stored.autoQuarantineHighRisk).toBe(true);
    const calls = dash.gmailApi.createFilter.mock.calls as [string, { query?: string }, { removeLabelIds: string[] }][];
    const skipping = calls.filter((c) => c[2].removeLabelIds.includes("INBOX")).length;
    expect(skipping).toBe(2);
  });

  it("Ask me first saves the answers but never turns on Gmail filters", async () => {
    const dash = await bootDashboard();
    await runSetup(dash, "me", "Ask me first");
    await vi.waitFor(() => expect(dash.storedSettings().persona).toBe("calm"));
    expect(dash.storedSettings().setupDone).toBe(true);
    expect(dash.storedSettings().autoSort.timeLimitsEnabled).toBe(false);
    expect(dash.storedSettings().autoQuarantineHighRisk).toBe(false);
  });
});
