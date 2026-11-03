// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Organize's one list: each label's menu says where it goes, anything but Off
// turns on its Gmail filter, and Sort my inbox counts from the menus.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard, fixtureMailbox } from "./testHarness";

beforeEach(() => {
  vi.restoreAllMocks();
});

async function openOrganize(dash: Awaited<ReturnType<typeof bootDashboard>>) {
  dash.showScreen("organize");
  await vi.waitFor(() => {
    if (!document.getElementById("time-limit-otp")) throw new Error("rows not rendered yet");
  });
}

const pick = (id: string, value: string) => {
  const select = document.getElementById(id) as HTMLSelectElement;
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
};

describe("Where each kind of mail goes", () => {
  it("lists every label once, in Gmail's order and colors, Off until chosen", async () => {
    const dash = await bootDashboard();
    await openOrganize(dash);
    const kinds = Array.from(document.querySelectorAll<HTMLSelectElement>("#time-limits-rows select"));
    expect(kinds).toHaveLength(11);
    expect(kinds.every((k) => k.value === "off")).toBe(true);
    expect(document.querySelectorAll("#time-limits-rows .ios-group")).toHaveLength(1);
    expect(document.getElementById("time-limits-toggle")).toBeNull();
    const text = dash.el("time-limits-rows").textContent!;
    expect(text.indexOf("Education")).toBeLessThan(text.indexOf("Promotions"));
    const icon = dash.el("time-limit-receipt").closest(".ios-row")!.querySelector<HTMLElement>(".app-ic")!;
    expect(icon.style.background).not.toBe("");
    // A muted count sits on each row; the weekly rate is on hover.
    expect(dash.el("time-limit-count-travel").textContent).toMatch(/^\d+$/);
    // "Skip the inbox" means never seeing it, so only Promotions offers it.
    const values = (id: string) => Array.from((dash.el(id) as HTMLSelectElement).options).map((o) => o.value);
    expect(values("time-limit-otp")).toEqual(expect.arrayContaining(["off", "stay", "24"]));
    expect(values("time-limit-otp")).not.toContain("0");
    expect(values("time-limit-promotions")).toContain("0");
  });

  it("anything but Off turns that label on for new mail, alone", async () => {
    const dash = await bootDashboard();
    await openOrganize(dash);
    pick("time-limit-promotions", "0");
    await vi.waitFor(() => {
      if (!dash.el("time-limits-status").textContent?.startsWith("Saved.")) throw new Error("not saved yet");
    });
    const calls = dash.gmailApi.createFilter.mock.calls as [string, { query?: string }, { removeLabelIds: string[] }][];
    expect(calls).toHaveLength(1);
    expect(calls[0][1].query).toMatch(/^category:promotions/);
    expect(calls[0][2].removeLabelIds).toEqual(["INBOX"]);
    const stored = dash.storedSettings().autoSort;
    expect(stored.timeLimitsEnabled).toBe(true);
    expect(stored.keepSorting).toBe(true);
    expect(stored.inboxHoursByBucket.promotions).toBe(0);
    expect(stored.labelsOff).toHaveLength(10);
    expect(stored.labelsOff).not.toContain("promotions");

    pick("time-limit-promotions", "off");
    await vi.waitFor(() => expect(dash.storedSettings().autoSort.timeLimitsEnabled).toBe(false));
    expect(dash.storedSettings().autoSort.inboxHoursByBucket.promotions).toBe(0);
  });

  it("every label on makes a filter per category that labels and keeps mail in the inbox", async () => {
    const dash = await bootDashboard();
    await openOrganize(dash);
    for (const k of Array.from(document.querySelectorAll<HTMLSelectElement>("#time-limits-rows select"))) pick(k.id, "stay");
    await vi.waitFor(() => {
      const stored = dash.storedSettings().autoSort;
      expect(stored.labelsOff).toEqual([]);
      expect(Object.keys(stored.filterIdsByBucket)).toHaveLength(11);
    });
    const calls = dash.gmailApi.createFilter.mock.calls as [string, { query?: string }, { removeLabelIds: string[] }][];
    const otp = calls.find(([, c]) => c.query?.startsWith('subject:("verification code"'));
    expect(otp?.[2].removeLabelIds).toEqual([]);
  });

  it("Keep in inbox sets every label's time at once, Promotions' skip stays", async () => {
    const dash = await bootDashboard();
    await openOrganize(dash);
    expect((dash.el("time-limits-window") as HTMLSelectElement).value).toBe("per");
    pick("time-limit-promotions", "0");
    await vi.waitFor(() => expect(dash.storedSettings().autoSort.inboxHoursByBucket.promotions).toBe(0));
    pick("time-limits-window", "3");
    await vi.waitFor(() => expect(dash.storedSettings().autoSort.labelsOff).toEqual([]));
    const hours = dash.storedSettings().autoSort.inboxHoursByBucket;
    expect(hours.productivity).toBe(3);
    expect(hours.receipt).toBe(3);
    expect(hours.promotions).toBe(0);
    expect((dash.el("time-limits-window") as HTMLSelectElement).value).toBe("3");

    pick("time-limit-receipt", "24");
    await vi.waitFor(() => expect(dash.storedSettings().autoSort.inboxHoursByBucket.receipt).toBe(24));
    expect((dash.el("time-limits-window") as HTMLSelectElement).value).toBe("per");
  });

  it("Sort my inbox counts what moves now from the menus", async () => {
    const dash = await bootDashboard();
    await openOrganize(dash);
    const kinds = Array.from(document.querySelectorAll<HTMLSelectElement>("#time-limits-rows select"));
    // Nothing to sort: the button isn't there at all.
    expect(dash.el("sort-inbox-bar").hidden).toBe(true);

    // The fixture's mail is all older than 10 minutes, so all of a kind moves.
    const count = (k: HTMLSelectElement) => Number(dash.el(k.id.replace("time-limit-", "time-limit-count-")).textContent);
    const busy = kinds.find((k) => count(k) > 0)!;
    const n = count(busy);
    const emails = `${n} email${n === 1 ? "" : "s"}`;
    pick(busy.id, "stay");
    expect(dash.el("sort-inbox-count").textContent).toBe(`${emails} get labels`);
    pick(busy.id, String(1 / 6));
    expect(dash.el("sort-inbox-count").textContent).toBe(`${emails} move now`);
    expect((dash.el("sort-inbox-btn") as HTMLButtonElement).disabled).toBe(false);
    expect(dash.el("sort-inbox-bar").hidden).toBe(false);
  });
});

describe("Organize action cards", () => {
  it("Keep each sender's newest 3 moves only the older ones out of the inbox, never to Trash", async () => {
    const mailbox = fixtureMailbox();
    const shop = mailbox.filter((m) => m.fromAddress === "deals@shop.example");
    mailbox.push({ ...shop[0], id: "s4", subject: "Oldest deal", receivedAt: shop[2].receivedAt - 86_400_000 });
    const dash = await bootDashboard({ mailbox });
    await openOrganize(dash);
    const card = document.querySelector<HTMLElement>('[data-preset="keep-newest"]')!;
    expect(card.textContent).toContain("1 older email moves out");
    card.querySelector("button")!.click();
    const archive = dash.gmail.archiveMessages as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(archive).toHaveBeenCalledTimes(1));
    expect(archive.mock.calls[0][1]).toEqual(["s4"]);
    expect(dash.gmail.trashMessages).not.toHaveBeenCalled();
  });
});

describe("Never opened skips the inbox", () => {
  it("sends each never-opened sender to Read later, and Undo from Activity removes the filter", async () => {
    // A list you have ignored for months: twelve unread, one every ten days.
    const mailbox = fixtureMailbox();
    const shop = mailbox.find((m) => m.fromAddress === "deals@shop.example")!;
    for (let i = 0; i < 12; i++)
      mailbox.push({ ...shop, id: `n${i}`, fromAddress: "news@ignored.example", fromDisplayName: "Ignored",
        subject: `Issue ${i}`, receivedAt: Date.now() - (i + 1) * 10 * 86_400_000 });
    const dash = await bootDashboard({ mailbox });
    await openOrganize(dash);
    const card = document.querySelector<HTMLElement>('[data-preset="never-opened"]');
    expect(card, "no never-opened card for the fixture").toBeTruthy();
    card!.querySelector("button")!.click();
    const keepSorted = dash.gmail.keepSorted as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(keepSorted).toHaveBeenCalled());
    const [, address, label] = keepSorted.mock.calls[0];
    expect(label).toBe("📖 Read later");

    dash.showScreen("recent");
    const undo = await vi.waitFor(() => {
      const b = Array.from(dash.el("recent-list").querySelectorAll("button")).find((x) => x.textContent === "Undo");
      if (!b) throw new Error("no Undo in Activity yet");
      return b;
    });
    undo.click();
    await vi.waitFor(() => expect(dash.gmail.unkeepSorted).toHaveBeenCalled());
    const undone = (dash.gmail.unkeepSorted as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(keepSorted.mock.calls.map((c) => c[1])).toContain(undone);
    expect(address).toBeTruthy();
  });
});

describe("Newsletters on Saturday", () => {
  it("holds newsletters through the sweep (10 minutes) and shows On", async () => {
    const dash = await bootDashboard();
    await openOrganize(dash);
    const card = () => document.querySelector<HTMLElement>('[data-preset="saturday"]')!;
    card().querySelector<HTMLInputElement>("input.switch")!.click();
    await vi.waitFor(() => {
      const s = dash.storedSettings();
      expect(s.newsletterDay.enabled).toBe(true);
      expect(s.autoSort.inboxHoursByBucket.newsletter).toBeCloseTo(1 / 6);
      expect(s.autoSort.labelsOff).toContain("otp");
    });
    await vi.waitFor(() => expect(card().querySelector(".rec-fact")!.textContent).toMatch(/^On, /));
    const when = card().querySelector<HTMLSelectElement>("select.newsletter-when")!;
    when.value = "daily";
    when.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(dash.storedSettings().newsletterDay.daily).toBe(true));
  });
});
