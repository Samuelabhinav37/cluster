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

/** No company mail, so setup goes from the scan straight to "How hands-on?". */
async function bootSetup(opts: Parameters<typeof bootDashboard>[0] = {}) {
  const dash = await bootDashboard({ mailbox: [], ...opts });
  if (!dash.el("setup-flow").closest("section")!.hidden)
    await vi.waitFor(() => expect(document.querySelector(".onb-title")?.textContent).toBe("How hands-on?"), { timeout: 5000 });
  return dash;
}

const setupSection = (dash: Dash) => dash.el("setup-flow").closest("section")!;

const navButton = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>(".onb-nav button")).find((b) => b.textContent === text)!;

/** Answers "how hands-on" if given, and presses Start. */
async function runSetup(dash: Dash, hands?: string) {
  expect(setupSection(dash).hidden).toBe(false);
  if (hands) {
    Array.from(document.querySelectorAll<HTMLButtonElement>(".onb-opt"))
      .find((b) => b.textContent?.includes(hands))!
      .click();
  }
  (dash.el("setup-go") as HTMLButtonElement).click();
}

const mail = (id: string, fromAddress: string, fromDisplayName: string, subject: string) => ({
  id, provider: "gmail" as const, fromAddress, fromDisplayName, subject, replyToAddress: "",
  isProtected: false, unread: true, sizeBytes: 1, unsubscribe: {}, receivedAt: Date.now(),
});

describe("first-run setup", () => {
  it("opens on setup the first time, and on Home once it's skipped", async () => {
    const dash = await bootSetup();
    expect(setupSection(dash).hidden).toBe(false);
    (dash.el("setup-not-now") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(dash.storedSettings().setupDone).toBe(true));
    await vi.waitFor(() => expect(setupSection(dash).hidden).toBe(true));
    const again = await bootSetup({ settings: { setupDone: true } });
    expect(setupSection(again).hidden).toBe(true);
  });

  it("scans, shows the companies on a board in Cluster's guess, and saves only the moves", async () => {
    const dash = await bootDashboard({
      settings: { userName: "Samuel" },
      mailbox: [
        mail("a1", "ship-confirm@amazon.com", "Amazon", "Your order has shipped"),
        mail("a2", "ship-confirm@amazon.com", "Amazon", "Delivered: your package"),
        mail("c1", "alerts@chase.com", "Chase", "Your statement is ready"),
        mail("f1", "friend@gmail.com", "Friend", "dinner?"),
      ],
    });
    expect(document.querySelector(".onb-title")!.textContent).toBe("Reading your mail");
    await vi.waitFor(() => expect(dash.el("setup-kai-line").textContent).toContain("Hi Samuel!"));
    await vi.waitFor(() => expect(document.querySelectorAll(".scan-tile")).toHaveLength(2));
    await vi.waitFor(() => expect(document.querySelector(".onb-title")?.textContent).toBe("Here's how I'd sort them"), { timeout: 6000 });
    const chip = (host: string) => document.querySelector<HTMLButtonElement>(`.board-chip[data-host="${host}"]`)!;
    const col = (spot: string) => document.querySelector<HTMLElement>(`.board-col[data-spot="${spot}"]`)!;
    expect(col("shipping").contains(chip("amazon.com"))).toBe(true);
    expect(col("keep")).not.toBeNull();
    // Tap a sender, then a column.
    chip("amazon.com").click();
    expect(chip("amazon.com").getAttribute("aria-pressed")).toBe("true");
    col("keep").click();
    expect(col("keep").contains(chip("amazon.com"))).toBe(true);
    await vi.waitFor(() => expect(dash.el("setup-kai-line").textContent).toBe("Got it. Amazon stays in your inbox."));
    (dash.el("setup-next") as HTMLButtonElement).click();
    expect(document.querySelector(".onb-title")!.textContent).toBe("How hands-on?");
    expect(navButton("Sort my inbox")).toBeDefined();
    (dash.el("setup-go") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(dash.storedSettings().setupDone).toBe(true));
    expect(dash.storedSettings().sortOverrides).toEqual({ "@amazon.com": "never" });
  });

  it("asks how much to read only when the mailbox is over 20,000, with a time for each", async () => {
    const small = await bootSetup({ mailboxCount: 12_000 });
    await runSetup(small);
    await vi.waitFor(() => expect(small.storedSettings().setupDone).toBe(true));
    expect(small.storedSettings().readCap).toBe(20_000);

    const big = await bootSetup({ mailboxCount: 48_210 });
    await vi.waitFor(() => expect(document.querySelector(".onb-read-title")?.textContent).toBe("You have 48,210 emails"));
    const all = Array.from(document.querySelectorAll<HTMLButtonElement>(".onb-read .onb-opt")).find((b) =>
      b.textContent?.startsWith("All 48,210"),
    )!;
    expect(all.textContent).toContain("about 4 h 5 min");
    all.click();
    (big.el("setup-go") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(big.storedSettings().readCap).toBe(100_000));
  });
  it("Tidy for me turns on scam holding and lands on Home", async () => {
    const dash = await bootSetup();
    await runSetup(dash);
    await vi.waitFor(() => expect(dash.storedSettings().autoQuarantineHighRisk).toBe(true));
    expect(dash.storedSettings().onboarding?.answers.hands).toBe("tidy");
    expect(document.getElementById("settings-change-setup")).toBeNull();
  });

  it("by default turns everything on: filters for every label, every label skips the inbox, scams held", async () => {
    const dash = await bootSetup();
    await runSetup(dash);
    // The milestone: every label lands as a chip and Kai cheers, before Home opens.
    await vi.waitFor(() => expect(document.querySelectorAll(".onb-labels li")).toHaveLength(13));
    expect(document.querySelector(".onb-labels")!.textContent).toContain("Travel");
    await vi.waitFor(() => expect(dash.el("setup-kai-line").textContent).toBe("All 13 labels ready."));
    await vi.waitFor(() => expect(Object.keys(dash.storedSettings().autoSort.filterIdsByBucket)).toHaveLength(13));
    const stored = dash.storedSettings();
    expect(stored.autoSort.timeLimitsEnabled).toBe(true);
    expect(stored.autoSort.labelsOff).toEqual([]);
    expect(stored.autoSort.inboxHoursByBucket).toMatchObject({ promotions: 0, newsletter: 0, social: 0, finance: 0, jobs: 0 });
    expect(stored.autoQuarantineHighRisk).toBe(true);
    const calls = dash.gmailApi.createFilter.mock.calls as [string, { query?: string }, { removeLabelIds: string[] }][];
    const skipping = calls.filter((c) => c[2].removeLabelIds.includes("INBOX")).length;
    expect(skipping).toBe(calls.length);
  });

  it("Ask me first saves the answers but never turns on Gmail filters", async () => {
    const dash = await bootSetup();
    await runSetup(dash, "Ask me first");
    await vi.waitFor(() => expect(dash.storedSettings().persona).toBe("calm"));
    expect(dash.storedSettings().setupDone).toBe(true);
    expect(dash.storedSettings().autoSort.timeLimitsEnabled).toBe(false);
    expect(dash.storedSettings().autoQuarantineHighRisk).toBe(false);
  });
});
