// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// First-run setup: hello, "This is a label", the scan, "I found these".
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard } from "./testHarness";

beforeEach(() => {
  vi.restoreAllMocks();
});

type Dash = Awaited<ReturnType<typeof bootDashboard>>;

const setupSection = (dash: Dash) => dash.el("setup-flow").closest("section")!;
const title = () => document.querySelector(".onb-title")?.textContent;
const click = (id: string) => (document.getElementById(id) as HTMLButtonElement).click();

/** Show me, Got it, then wait out the scan (it shows for at least 5 s). */
async function toFound(dash: Dash, hasMail = true) {
  expect(setupSection(dash).hidden).toBe(false);
  click("setup-next");
  expect(title()).toBe("This is a label");
  click("setup-next");
  expect(title()).toBe("Reading your mail");
  // The mail streams in with its label, and the count says how far.
  if (hasMail) {
    await vi.waitFor(() => expect(document.querySelector("#scan-list .ss-row .ss-tag")).not.toBeNull());
    expect(document.getElementById("scan-count")?.textContent).toMatch(/^\d+ of \d+$/);
  }
  await vi.waitFor(() => expect(title()).toMatch(/^(I found these|Ready to sort)$/), { timeout: 10000 });
}

/** No company mail: the last screen has no board, just Yes or Ask me first. */
const bootEmpty = (opts: Parameters<typeof bootDashboard>[0] = {}) => bootDashboard({ mailbox: [], ...opts });

const mail = (id: string, fromAddress: string, fromDisplayName: string, subject: string) => ({
  id, provider: "gmail" as const, fromAddress, fromDisplayName, subject, replyToAddress: "",
  isProtected: false, unread: true, sizeBytes: 1, unsubscribe: {}, receivedAt: Date.now(),
});

describe("first-run setup", () => {
  it("opens on setup the first time, and on Home once it's skipped", async () => {
    const dash = await bootEmpty();
    expect(setupSection(dash).hidden).toBe(false);
    click("setup-not-now");
    await vi.waitFor(() => expect(dash.storedSettings().setupDone).toBe(true));
    await vi.waitFor(() => expect(setupSection(dash).hidden).toBe(true));
    const again = await bootEmpty({ settings: { setupDone: true } });
    expect(setupSection(again).hidden).toBe(true);
  });

  it("Kai says hi by name, shows a label, scans, and saves only the companies moved", async () => {
    const dash = await bootDashboard({
      settings: { userName: "Samuel" },
      mailbox: [
        mail("a1", "ship-confirm@amazon.com", "Amazon", "Your order has shipped"),
        mail("a2", "ship-confirm@amazon.com", "Amazon", "Delivered: your package"),
        mail("c1", "alerts@chase.com", "Chase", "Your statement is ready"),
        mail("f1", "friend@gmail.com", "Friend", "dinner?"),
      ],
    });
    expect(title()).toBe("You're in, Samuel.");
    await vi.waitFor(() => expect(dash.el("setup-kai-line").textContent).toContain("Hi Samuel! I'm Kai."), { timeout: 3000 });
    await toFound(dash);
    expect(title()).toBe("I found these");
    // Free mail is a person, not a company: two companies on the board.
    const chip = (host: string) => document.querySelector<HTMLButtonElement>(`.board-chip[data-host="${host}"]`)!;
    const col = (spot: string) => document.querySelector<HTMLElement>(`.board-col[data-spot="${spot}"]`)!;
    expect(document.querySelectorAll(".board-chip")).toHaveLength(2);
    expect(col("shipping").contains(chip("amazon.com"))).toBe(true);

    click("setup-change");
    expect(title()).toBe("Move any that are wrong");
    expect(chip("amazon.com").draggable).toBe(true);
    // Tap a company, then a column.
    chip("amazon.com").click();
    expect(chip("amazon.com").getAttribute("aria-pressed")).toBe("true");
    col("keep").click();
    expect(col("keep").contains(chip("amazon.com"))).toBe(true);
    await vi.waitFor(() => expect(dash.el("setup-kai-line").textContent).toBe("Got it. Amazon stays in your inbox."));
    click("setup-next"); // Done
    expect(title()).toBe("I found these");

    click("setup-go");
    await vi.waitFor(() => expect(dash.storedSettings().setupDone).toBe(true));
    expect(dash.storedSettings().sortOverrides).toEqual({ "@amazon.com": "never" });
    await vi.waitFor(() => expect(dash.el("setup-kai-line").textContent).toBe("Okay, let's go to your dashboard!"));
  });

  it("asks how much to read only when the mailbox is over 20,000, with a time for each", async () => {
    const small = await bootEmpty({ mailboxCount: 12_000 });
    await toFound(small, false);
    click("setup-go");
    await vi.waitFor(() => expect(small.storedSettings().setupDone).toBe(true));
    expect(small.storedSettings().readCap).toBe(20_000);

    const big = await bootEmpty({ mailboxCount: 48_210 });
    await toFound(big, false);
    await vi.waitFor(() => expect(document.querySelector(".onb-read-title")?.textContent).toBe("You have 48,210 emails"));
    const all = document.querySelector<HTMLButtonElement>('[data-pick="read-all"]')!;
    expect(all.textContent).toContain("All 48,210");
    expect(all.textContent).toContain("about 4 h 5 min");
    all.click();
    click("setup-go");
    await vi.waitFor(() => expect(big.storedSettings().readCap).toBe(100_000));
    // Boots two dashboards: past the 15 s default under a loaded full suite.
  }, 30_000);

  it("Yes turns everything on: filters for every label, every label waits an hour in the inbox, scams held", async () => {
    const dash = await bootEmpty();
    await toFound(dash, false);
    click("setup-go");
    await vi.waitFor(() => expect(Object.keys(dash.storedSettings().autoSort.filterIdsByBucket)).toHaveLength(13));
    const stored = dash.storedSettings();
    expect(stored.onboarding?.answers.hands).toBe("tidy");
    expect(stored.autoSort.timeLimitsEnabled).toBe(true);
    expect(stored.autoSort.labelsOff).toEqual([]);
    expect(stored.autoSort.inboxHoursByBucket).toMatchObject({ promotions: 1, newsletter: 1, social: 1, finance: 1, jobs: 1 });
    expect(stored.autoQuarantineHighRisk).toBe(true);
    const calls = dash.gmailApi.createFilter.mock.calls as [string, { query?: string }, { removeLabelIds: string[] }][];
    // The filters only label; the sweep moves mail out after its hour.
    expect(calls.filter((c) => c[2].removeLabelIds.includes("INBOX")).length).toBe(0);
    expect(document.getElementById("settings-change-setup")).toBeNull();
  });

  it("No, ask me first saves the answers but never turns on Gmail filters", async () => {
    const dash = await bootEmpty();
    await toFound(dash, false);
    click("setup-ask");
    await vi.waitFor(() => expect(dash.storedSettings().persona).toBe("calm"));
    expect(dash.storedSettings().setupDone).toBe(true);
    expect(dash.storedSettings().autoSort.timeLimitsEnabled).toBe(false);
    expect(dash.storedSettings().autoQuarantineHighRisk).toBe(false);
  });
});
