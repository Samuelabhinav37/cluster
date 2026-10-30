import { describe, expect, it } from "vitest";
import { DAY, NOW, many, senders } from "../test/mailFixtures";
import type { NormalizedMessageMetadata, SentRecord } from "./providers/emailProvider";
import {
  companyName,
  senderName,
  foldByCompany,
  groupByCompany,
  isPerson,
  senderGroup,
  mainTemplate,
  profileLine,
  sortSenders,
} from "./senderListView";
import { buildSenderProfiles } from "./senderProfile";

async function setup(rows: NormalizedMessageMetadata[], sent: SentRecord[] = []) {
  return { list: await senders(rows), profiles: buildSenderProfiles({ rows, sent, now: NOW }) };
}

const signed = (domain: string) => `mx.google.com; dkim=pass header.d=${domain}; spf=pass; dmarc=pass`;

describe("sortSenders", () => {
  it("sorts by each option", async () => {
    const rows = [
      ...many(6, { fromAddress: "big@a.example", receivedAt: NOW - 40 * DAY }),
      ...many(2, { fromAddress: "read@b.example", receivedAt: NOW - 5 * DAY, unread: false }),
      ...many(3, { fromAddress: "pal@c.example", receivedAt: NOW - 20 * DAY, unread: false }),
    ];
    const sent: SentRecord[] = [
      { id: "s", provider: "gmail", sentAt: NOW - DAY, to: [{ address: "pal@c.example", name: "" }], cc: [], bcc: [] },
    ];
    const { list, profiles } = await setup(rows, sent);
    const order = (sort: Parameters<typeof sortSenders>[2]) => sortSenders(list, profiles, sort).map((s) => s.address);
    expect(order("volume")[0]).toBe("big@a.example");
    expect(order("newest")[0]).toBe("read@b.example");
    expect(order("leastOpened")[0]).toBe("big@a.example");
    expect(order("lastOpened")[0]).toBe("big@a.example");
    expect(order("people")[0]).toBe("pal@c.example");
  });
});

describe("profileLine", () => {
  it("says one thing: how often they send", async () => {
    const { profiles } = await setup(many(8, { fromAddress: "n@news.example", receivedAt: NOW - 20 * DAY }));
    expect(profileLine(profiles.get("gmail:n@news.example"))).toBe("3 a month");
  });
});

describe("mainTemplate", () => {
  it("names the template most of their mail follows", async () => {
    const rows = many(4, { fromAddress: "ship@shop.example", subject: "Order #1 has shipped" }).map((m, i) => ({
      ...m,
      subject: `Order #${i} has shipped`,
    }));
    const { profiles } = await setup(rows);
    expect(mainTemplate(profiles.get("gmail:ship@shop.example")!)?.key).toBe("order * has shipped");
  });
});

describe("groupByCompany", () => {
  it("joins a company's authenticated addresses and leaves free mail out", async () => {
    const rows = [
      ...many(3, { fromAddress: "news@email.brand.example", authenticationResults: signed("brand.example") }),
      ...many(2, { fromAddress: "orders@brand.example", authenticationResults: signed("brand.example") }),
      ...many(2, { fromAddress: "someone@gmail.com", authenticationResults: signed("gmail.com") }),
    ];
    const { list, profiles } = await setup(rows);
    const groups = groupByCompany(list, profiles);
    expect(groups.map((g) => [g.key, g.senders.length, g.total])).toEqual([["brand.example", 2, 5]]);
  });

  it("keeps a starred receipt address in its company (PayPal stayed split)", async () => {
    const rows = [
      ...many(3, {
        fromAddress: "service@paypal.com",
        subject: "Receipt for your payment to Shop",
        isProtected: true,
        authenticationResults: signed("paypal.com"),
      }),
      ...many(3, { fromAddress: "paypal@mail.paypal.com", listId: "promo", authenticationResults: signed("paypal.com") }),
    ];
    const { list, profiles } = await setup(rows);
    expect(isPerson(profiles.get("gmail:service@paypal.com"))).toBe(false);
    expect(groupByCompany(list, profiles).map((g) => [g.key, g.senders.length])).toEqual([["paypal.com", 2]]);
  });
});

describe("foldByCompany", () => {
  it("shows LinkedIn's addresses as one LinkedIn entry", async () => {
    const li = (fromAddress: string, fromDisplayName: string, n: number) =>
      many(n, { fromAddress, fromDisplayName, authenticationResults: signed("linkedin.com") });
    const rows = [
      ...li("notifications-noreply@linkedin.com", "LinkedIn", 6),
      ...li("jobalerts-noreply@linkedin.com", "LinkedIn Job Alerts", 4),
      ...li("invitations@linkedin.com", "LinkedIn", 2),
      ...many(3, { fromAddress: "news@other.example" }),
    ];
    const { list, profiles } = await setup(rows);
    const entries = foldByCompany(sortSenders(list, profiles, "volume"), profiles);
    expect(entries.map((e) => e.kind)).toEqual(["company", "sender"]);
    const company = entries[0];
    if (company.kind !== "company") throw new Error("expected a company");
    expect(company.group.senders).toHaveLength(3);
    expect(companyName(company.group)).toBe("LinkedIn");
  });
});

describe("List-Id groups, person override, companies you talk to", () => {
  it("folds one signed newsletter across addresses, but not an unsigned copy", async () => {
    const list = { listId: "weekly.letter.example", listIdSigned: true, authenticationResults: "" };
    const rows = [
      ...many(3, { fromAddress: "a@send1.example", ...list }),
      ...many(2, { fromAddress: "b@send2.example", ...list }),
      ...many(2, { fromAddress: "fake@other.example", listId: "weekly.letter.example", authenticationResults: "" }),
    ];
    const { list: senderList, profiles } = await setup(rows);
    const groups = groupByCompany(senderList, profiles);
    expect(groups.map((g) => [g.key, g.senders.length])).toEqual([["list:weekly.letter.example", 2]]);
  });

  it("lets the user's call win over the guess", async () => {
    const { profiles } = await setup(many(3, { fromAddress: "pat@gmail.com", unread: false }));
    const p = profiles.get("gmail:pat@gmail.com")!;
    expect(isPerson({ ...p, personOverride: true })).toBe(true);
    expect(isPerson({ ...p, personOverride: false })).toBe(false);
  });

  it("counts only personal accounts as people, not someone at a company", async () => {
    const known = { tier: "known", machine: false, kind: "person" } as const;
    const { profiles } = await setup(many(3, { fromAddress: "pat@gmail.com", unread: false }));
    const p = profiles.get("gmail:pat@gmail.com")!;
    expect(isPerson({ ...p, ...known })).toBe(true);
    expect(isPerson({ ...p, ...known, address: "prof@cs.stanford.edu" })).toBe(true);
    expect(isPerson({ ...p, ...known, address: "recruiting@mercor.com" })).toBe(false);
  });

  it("puts each sender in one list: people, companies or subscriptions", async () => {
    const unsub = { httpUrl: "https://shop.example/u" };
    const rows = [
      ...many(3, { fromAddress: "news@shop.example", subject: "New arrivals", unsubscribe: unsub }),
      ...many(3, { fromAddress: "orders@shop.example", subject: "Your receipt", unsubscribe: unsub }),
      ...many(3, { fromAddress: "alerts@bank.example", subject: "Balance update", unsubscribe: {} }),
    ];
    const { list, profiles } = await setup(rows);
    const group = (address: string) => {
      const s = list.find((x) => x.address === address)!;
      return senderGroup(s, profiles.get(s.key));
    };
    expect([group("news@shop.example"), group("orders@shop.example"), group("alerts@bank.example")]).toEqual([
      "subs",
      "companies",
      "companies",
    ]);
  });
});

describe("senderName", () => {
  it("shows the platform for a person writing through it", () => {
    expect(senderName({ displayName: "Suhas Nayak via LinkedIn", address: "invitations@linkedin.com" })).toBe("LinkedIn");
    expect(senderName({ displayName: "Ann (via Google Docs)", address: "comments-noreply@docs.google.com" })).toBe("Google Docs");
  });

  it("keeps the full name when the address isn't that platform's", () => {
    expect(senderName({ displayName: "Billing via PayPal", address: "alerts@evil.example" })).toBe("Billing via PayPal");
    expect(senderName({ displayName: "", address: "a@b.com" })).toBe("a@b.com");
  });

  it("names a company by its brand over a person carrying more mail", () => {
    const s = (displayName: string, address: string, count: number) =>
      ({ displayName, address, count, messages: [], messageIds: [] }) as unknown as Parameters<typeof companyName>[0]["senders"][number];
    expect(
      companyName({
        key: "linkedin.com",
        senders: [s("Suhas Nayak", "messages-noreply@linkedin.com", 9), s("LinkedIn Job Alerts", "jobs@linkedin.com", 3)],
      }),
    ).toBe("LinkedIn Job Alerts");
  });
});
