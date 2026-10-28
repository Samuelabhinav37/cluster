import { describe, expect, it } from "vitest";
import { DAY, NOW, many, senders } from "../test/mailFixtures";
import type { NormalizedMessageMetadata, SentRecord } from "./providers/emailProvider";
import { companyName, foldByCompany, groupByCompany, isPerson, mainTemplate, profileLine, sortSenders } from "./senderListView";
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
    expect(isPerson(profiles.get("gmail:service@paypal.com"))).toBe(true);
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
