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

/** No mail to practise on, so setup starts at "What should always stay?". */
async function bootSetup(opts: Parameters<typeof bootDashboard>[0] = {}) {
  const dash = await bootDashboard({ mailbox: [], ...opts });
  if (!dash.el("setup-flow").closest("section")!.hidden)
    await vi.waitFor(() => expect(document.querySelector(".onb-title")?.textContent).toBe("What should always stay?"));
  return dash;
}

const setupSection = (dash: Dash) => dash.el("setup-flow").closest("section")!;

const navButton = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>(".onb-nav button")).find((b) => b.textContent === text)!;

/** Keeps the defaults for "what stays", answers "how hands-on" if given, and presses Start. */
async function runSetup(dash: Dash, hands?: string) {
  expect(setupSection(dash).hidden).toBe(false);
  (dash.el("setup-next") as HTMLButtonElement).click();
  if (hands) {
    Array.from(document.querySelectorAll<HTMLButtonElement>(".onb-opt"))
      .find((b) => b.textContent?.includes(hands))!
      .click();
  }
  (dash.el("setup-next") as HTMLButtonElement).click();
  (dash.el("setup-go") as HTMLButtonElement).click();
}

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

  it("starts on the defaults in three steps, and Kai never repeats the title", async () => {
    const dash = await bootSetup();
    expect(document.querySelector(".onb-title")!.textContent).toBe("What should always stay?");
    // Sign-in counts as the first dot, already done.
    expect(document.querySelector(".onb-dots")!.children).toHaveLength(4);
    expect(document.querySelector(".onb-dots")!.children[0].className).toBe("on");
    expect((dash.el("setup-next") as HTMLButtonElement).disabled).toBe(false);
    expect(navButton("Skip")).toBeUndefined();
    await vi.waitFor(() => expect(dash.el("setup-kai-line").textContent).toBe("Hi, I'm Kai. Pick what stays."));
    (dash.el("setup-next") as HTMLButtonElement).click();
    expect(document.querySelector('.onb-opt[aria-pressed="true"]')!.textContent).toContain("Tidy for me");
    await vi.waitFor(() => expect(dash.el("setup-kai-line").textContent).toBe("Should I sort, or ask first?"));
  });

  it("first asks where three of your own senders go, and saves only the answers that differ", async () => {
    const now = Date.now();
    const mail = (id: string, fromAddress: string, fromDisplayName: string, subject: string) => ({
      id, provider: "gmail" as const, fromAddress, fromDisplayName, subject, replyToAddress: "",
      isProtected: false, unread: true, sizeBytes: 1, unsubscribe: {}, receivedAt: now,
    });
    const dash = await bootDashboard({
      mailbox: [
        mail("a1", "ship-confirm@amazon.com", "Amazon", "Your order has shipped"),
        mail("a2", "ship-confirm@amazon.com", "Amazon", "Delivered: your package"),
        mail("c1", "alerts@chase.com", "Chase", "Your statement is ready"),
      ],
    });
    await vi.waitFor(() => expect(document.querySelector(".onb-title")?.textContent).toBe("Where does Amazon go?"));
    expect(document.querySelector(".onb-got")).toBeNull();
    expect((dash.el("setup-next") as HTMLButtonElement).disabled).toBe(true);
    (document.querySelector('[data-pick="p-keep"]') as HTMLButtonElement).click();
    expect(document.querySelector(".onb-got")!.textContent).toBe("Got it. Amazon stays in your inbox.");
    (dash.el("setup-next") as HTMLButtonElement).click();
    expect(document.querySelector(".onb-title")!.textContent).toBe("Where does Chase go?");
    (document.querySelector('[data-pick="p-guess"]') as HTMLButtonElement).click();
    (dash.el("setup-next") as HTMLButtonElement).click();
    expect(document.querySelector(".onb-title")!.textContent).toBe("What should always stay?");
    (dash.el("setup-next") as HTMLButtonElement).click();
    (dash.el("setup-next") as HTMLButtonElement).click();
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
    (big.el("setup-next") as HTMLButtonElement).click();
    (big.el("setup-next") as HTMLButtonElement).click();
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
