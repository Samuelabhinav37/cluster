import { describe, expect, it } from "vitest";
import { identityChanges, isFamiliar, observeSenders, PROMOTE_AFTER_MS, type SenderLedger } from "./senderLedger";
import type { MessageRecord, SenderSummary } from "./senderModel";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1);

function msg(day: number, extra: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: `m${day}-${extra.dkimDomains?.join(",") ?? ""}-${extra.replyToDomain ?? ""}`,
    receivedAt: T0 + day * DAY,
    kind: "other",
    isProtected: false,
    unread: false,
    sizeBytes: 1000,
    providerMarkedPersonal: false,
    looksAutomated: false,
    ...extra,
  } as MessageRecord;
}

function sender(messages: MessageRecord[], address = "billing@acme.com"): SenderSummary {
  return {
    key: `gmail:${address}`,
    provider: "gmail",
    address,
    displayName: "Acme Billing",
    count: messages.length,
    messageIds: messages.map((m) => m.id),
    protectedMessageIds: [],
    unsubscribe: {},
    messages,
    threatSignals: [],
    authVerdicts: { spf: "pass", dkim: "pass", dmarc: "pass" },
    firstContact: false,
  };
}

/** A supplier that has signed as acme.com for two months. */
function establishedLedger(): SenderLedger {
  const history = [0, 20, 40, 60].map((d) => msg(d, { dkimDomains: ["acme.com"] }));
  return observeSenders({}, [sender(history)]);
}

describe("observeSenders", () => {
  it("records familiarity: count, first and last seen, months", () => {
    const entry = establishedLedger()["gmail:billing@acme.com"];
    expect(entry.messages).toBe(4);
    expect(entry.firstSeen).toBe(T0);
    expect(entry.lastSeen).toBe(T0 + 60 * DAY);
    expect(entry.months).toEqual([202601, 202602, 202603]);
    expect(isFamiliar(entry)).toBe(true);
  });

  it("takes a brand-new sender's first batch as its baseline", () => {
    expect(establishedLedger()["gmail:billing@acme.com"].dkim.known).toEqual(["acme.com"]);
  });

  it("doesn't double count when the same window is scanned again", () => {
    const history = [0, 20, 40, 60].map((d) => msg(d, { dkimDomains: ["acme.com"] }));
    const again = observeSenders(establishedLedger(), [sender(history)]);
    expect(again["gmail:billing@acme.com"].messages).toBe(4);
  });

  it("keeps a new domain pending, then promotes it once it's still in use a week later", () => {
    let ledger = establishedLedger();
    ledger = observeSenders(ledger, [sender([msg(70, { dkimDomains: ["acme-mail.net"] })])]);
    expect(ledger["gmail:billing@acme.com"].dkim.known).toEqual(["acme.com"]);
    expect(ledger["gmail:billing@acme.com"].dkim.pending).toEqual({ "acme-mail.net": T0 + 70 * DAY });

    const laterDay = 70 + PROMOTE_AFTER_MS / DAY;
    ledger = observeSenders(ledger, [sender([msg(laterDay, { dkimDomains: ["acme-mail.net"] })])]);
    expect(ledger["gmail:billing@acme.com"].dkim.known).toEqual(["acme.com", "acme-mail.net"]);
    expect(ledger["gmail:billing@acme.com"].dkim.pending).toEqual({});
  });

  it("never records the sender's own domain as a Reply-To baseline", () => {
    const ledger = observeSenders({}, [sender([msg(0, { replyToDomain: "acme.com" })])]);
    expect(ledger["gmail:billing@acme.com"].replyTo.known).toEqual([]);
  });
});

describe("identityChanges", () => {
  it("flags a familiar sender now signed by a different domain (account takeover, invoice fraud)", () => {
    const entry = establishedLedger()["gmail:billing@acme.com"];
    const now = sender([msg(70, { dkimDomains: ["acme-payments.net"] })]);
    expect(identityChanges(entry, now)).toEqual([
      { kind: "identity-change", brand: "acme-payments.net", confidence: "medium", messageIds: [now.messages[0].id] },
    ]);
  });

  it("flags a familiar sender suddenly asking for replies at another domain (hijacked thread)", () => {
    const entry = establishedLedger()["gmail:billing@acme.com"];
    const now = sender([msg(70, { dkimDomains: ["acme.com"], replyToDomain: "gmail.com" })]);
    expect(identityChanges(entry, now)).toEqual([
      { kind: "identity-change", brand: "gmail.com", confidence: "medium", messageIds: [now.messages[0].id] },
    ]);
  });

  it("keeps warning while the new domain is only pending", () => {
    let ledger = establishedLedger();
    ledger = observeSenders(ledger, [sender([msg(70, { dkimDomains: ["acme-payments.net"] })])]);
    const twoDaysLater = sender([msg(72, { dkimDomains: ["acme-payments.net"] })]);
    expect(identityChanges(ledger["gmail:billing@acme.com"], twoDaysLater)).toHaveLength(1);
  });

  it("doesn't flag mail also signed by a known domain (an extra mailing-service signature)", () => {
    const entry = establishedLedger()["gmail:billing@acme.com"];
    const now = sender([msg(70, { dkimDomains: ["sendgrid.net", "acme.com"] })]);
    expect(identityChanges(entry, now)).toEqual([]);
  });

  it("doesn't flag a sender without enough history", () => {
    const ledger = observeSenders({}, [
      sender([msg(0, { dkimDomains: ["acme.com"] }), msg(5, { dkimDomains: ["acme.com"] })]),
    ]);
    const now = sender([msg(6, { dkimDomains: ["other.net"] })]);
    expect(identityChanges(ledger["gmail:billing@acme.com"], now)).toEqual([]);
    expect(identityChanges(undefined, now)).toEqual([]);
  });

  it("doesn't flag a familiar sender that starts signing when it never did before", () => {
    const history = [0, 20, 40, 60].map((d) => msg(d));
    const entry = observeSenders({}, [sender(history)])["gmail:billing@acme.com"];
    expect(identityChanges(entry, sender([msg(70, { dkimDomains: ["acme.com"] })]))).toEqual([]);
  });

  it("doesn't flag a message with no DKIM pass at all (failed authentication is its own signal)", () => {
    const entry = establishedLedger()["gmail:billing@acme.com"];
    expect(identityChanges(entry, sender([msg(70, { dkimDomains: [] })]))).toEqual([]);
  });
});
