import { describe, expect, it } from "vitest";
import { buildDomainGroups, domainOf } from "./domainGrouping";
import type { SenderSummary } from "./senderModel";
import type { ProviderId } from "./providers/emailProvider";

function makeSender(overrides: Partial<SenderSummary> & { address: string }): SenderSummary {
  const provider: ProviderId = overrides.provider ?? "gmail";
  return {
    key: `${provider}:${overrides.address}`,
    provider,
    displayName: "Sender",
    count: 1,
    messageIds: ["m1"],
    protectedMessageIds: [],
    unsubscribe: {},
    messages: [],
    ...overrides,
  };
}

describe("domainOf", () => {
  it("extracts the domain from an email address", () => {
    expect(domainOf("person@example.com")).toBe("example.com");
  });

  it("lowercases the domain", () => {
    expect(domainOf("person@Example.COM")).toBe("example.com");
  });

  it("returns the whole string when there is no @", () => {
    expect(domainOf("not-an-email")).toBe("not-an-email");
  });
});

describe("buildDomainGroups", () => {
  it("groups multiple senders sharing a non-free-mail domain together", () => {
    const senders = [
      makeSender({ address: "orders@amazon.com", count: 3, messageIds: ["a1", "a2", "a3"] }),
      makeSender({ address: "shipping@amazon.com", count: 2, messageIds: ["a4", "a5"] }),
    ];
    const groups = buildDomainGroups(senders);
    expect(groups).toHaveLength(1);
    expect(groups[0].domain).toBe("amazon.com");
    expect(groups[0].totalCount).toBe(5);
    expect(groups[0].senders).toHaveLength(2);
    expect(groups[0].isFreeMailException).toBe(false);
  });

  it("categorizes known domains and falls back to other for unknown ones", () => {
    const groups = buildDomainGroups([
      makeSender({ address: "orders@amazon.com" }),
      makeSender({ address: "hello@some-random-startup.io" }),
    ]);
    const amazon = groups.find((g) => g.domain === "amazon.com");
    const unknown = groups.find((g) => g.domain === "some-random-startup.io");
    expect(amazon?.category).toBe("shopping");
    expect(unknown?.category).toBe("other");
  });

  it("keeps free-mail-provider senders ungrouped (one group per address)", () => {
    const groups = buildDomainGroups([
      makeSender({ address: "alice@gmail.com" }),
      makeSender({ address: "bob@gmail.com" }),
    ]);
    expect(groups).toHaveLength(2);
    for (const g of groups) {
      expect(g.isFreeMailException).toBe(true);
      expect(g.senders).toHaveLength(1);
    }
  });

  it("splits deletable vs protected message ids per provider", () => {
    const sender = makeSender({
      address: "orders@amazon.com",
      count: 3,
      messageIds: ["a1", "a2", "a3"],
      protectedMessageIds: ["a2"],
    });
    const [group] = buildDomainGroups([sender]);
    expect(group.protectedCount).toBe(1);
    expect(group.deletableMessageIds.get("gmail")).toEqual(["a1", "a3"]);
    expect(group.protectedMessageIds.get("gmail")).toEqual(["a2"]);
  });

  it("sorts groups by total count descending", () => {
    const groups = buildDomainGroups([
      makeSender({ address: "a@small.com", count: 1, messageIds: ["1"] }),
      makeSender({ address: "b@big.com", count: 10, messageIds: Array.from({ length: 10 }, (_, i) => `${i}`) }),
    ]);
    expect(groups.map((g) => g.domain)).toEqual(["big.com", "small.com"]);
  });
});
