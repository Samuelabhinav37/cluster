// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { DetailSender } from "./detailsPanel";
import { askIntents, gmailSearchUrl, initAskKai, searchGroups, type AskFacts } from "./askKai";

const linkedin = { key: "gmail:jobs@linkedin.com", name: "LinkedIn", address: "jobs@linkedin.com", emails: 12, opened: 2 } as DetailSender;
const facts: AskFacts = { senders: [linkedin], kinds: { primary: 5, trans: 3, updates: 9, promo: 40 }, scams: 2, waiting: 4 };
const act = () => ({ details: vi.fn(), go: vi.fn() });

describe("askIntents", () => {
  it("finds a sender by name and opens that week's mail in Details", () => {
    const a = act();
    const [best] = askIntents("linkedin emails this week", facts, a);
    expect(best.title).toBe("LinkedIn emails this week");
    best.run();
    expect(a.details).toHaveBeenCalledWith({ view: "emails", senderKey: linkedin.key, week: 7 });
  });

  it("answers how many of a kind", () => {
    const [best] = askIntents("how many promotions", facts, act());
    expect(best.title).toBe("Promotions");
    expect(best.sub).toBe("40 emails");
  });

  it("sends actions to their place's own confirm, never runs them", () => {
    const a = act();
    askIntents("delete old codes", facts, a)[0].run();
    expect(a.go).toHaveBeenCalledWith("delete", "trash-past-date");
    askIntents("mail i never open", facts, a)[0].run();
    expect(a.go).toHaveBeenLastCalledWith("delete", "trash-never-opened");
  });

  it("names places and says nothing for gibberish", () => {
    expect(askIntents("security", facts, act()).map((h) => h.title)).toContain("Security");
    expect(askIntents("zzzz", facts, act())).toEqual([]);
  });
});

describe("searchGroups", () => {
  const mom = { key: "gmail:mom@gmail.com", name: "Mom", address: "mom@gmail.com", emails: 6, opened: 6 } as DetailSender;
  const withPeople: AskFacts = { ...facts, senders: [linkedin, mom], people: new Set([mom.key]) };

  it("puts companies and people in their own groups, then emails, then Gmail", () => {
    expect(searchGroups("linked", withPeople, act(), vi.fn()).map((g) => g.heading)).toEqual(["Companies", "Emails", "Gmail"]);
    const groups = searchGroups("mom", withPeople, act(), vi.fn());
    expect(groups.find((g) => g.heading === "People")?.hits.map((h) => h.title)).toEqual(["Mom"]);
    expect(groups.find((g) => g.heading === "Companies")).toBeUndefined();
  });

  it("sends a word search to Details and the last row to Gmail's own search", () => {
    const a = act();
    const open = vi.fn();
    const groups = searchGroups("invoice march", withPeople, a, open);
    groups.find((g) => g.heading === "Emails")!.hits[0].run();
    expect(a.details).toHaveBeenCalledWith({ view: "emails", q: "invoice march" });
    groups.at(-1)!.hits[0].run();
    expect(open).toHaveBeenCalledWith(gmailSearchUrl("invoice march"));
    expect(gmailSearchUrl("a b")).toBe("https://mail.google.com/mail/u/0/#search/a%20b");
  });
});

describe("Ask Kai box", () => {
  it("opens from the bar, runs the chosen hit on Enter and closes", () => {
    document.body.innerHTML = '<button id="t"></button>';
    const a = act();
    initAskKai(document.getElementById("t")!, () => facts, a);
    document.getElementById("t")!.click();
    const box = document.querySelector<HTMLElement>(".ask")!;
    expect(box.hidden).toBe(false);
    const input = box.querySelector<HTMLInputElement>("input")!;
    input.value = "scams";
    input.dispatchEvent(new Event("input"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(a.go).toHaveBeenCalledWith("impersonation");
    expect(box.hidden).toBe(true);
  });
});
