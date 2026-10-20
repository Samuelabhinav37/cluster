import { afterEach, describe, expect, it } from "vitest";
import { cyrb53, HashedDomainSet } from "./domainHash";
import { isPhishingDomain, setPhishingListForTests } from "./phishingList";
import { scoreMessageForThreats } from "./threatSignals";
import { senderVerdict } from "./verdict";
import { meta, senders } from "../test/mailFixtures";

const listOf = (...domains: string[]) =>
  new HashedDomainSet(new Float64Array(domains.map((d) => cyrb53(d)).sort((a, b) => a - b)));

afterEach(() => setPhishingListForTests(null));

describe("isPhishingDomain", () => {
  it("matches a listed domain and its subdomains, never a bare TLD", () => {
    setPhishingListForTests(listOf("evil.example", "com"));
    expect(isPhishingDomain("evil.example")).toBe(true);
    expect(isPhishingDomain("Mail.Evil.Example.")).toBe(true);
    expect(isPhishingDomain("good.com")).toBe(false);
  });

  it("matches nothing before the dataset has loaded", () => {
    expect(isPhishingDomain("evil.example")).toBe(false);
  });
});

describe("phishing-list signal", () => {
  it("fires for a listed sender, and alone it warns but doesn't hold", async () => {
    setPhishingListForTests(listOf("evil.example"));
    const m = meta({ fromAddress: "billing@evil.example", fromDisplayName: "Billing", unsubscribe: {} });
    expect(scoreMessageForThreats(m).map((s) => s.kind)).toEqual(["phishing-list"]);
    const [sender] = await senders([m]);
    expect(senderVerdict(sender, { knownCorrespondent: false }).tier).toBe("warn");
  });
});
