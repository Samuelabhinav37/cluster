import { beforeEach, describe, expect, it } from "vitest";
import { applySenderLedger } from "./senderLedgerStore";
import type { MessageRecord, SenderSummary } from "./senderModel";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1);

let store: Record<string, unknown> = {};
beforeEach(() => {
  store = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        async get(key: string) {
          return key in store ? { [key]: store[key] } : {};
        },
        async set(items: Record<string, unknown>) {
          store = { ...store, ...items };
        },
      },
    },
  };
});

function sender(days: number[], dkim: string, address = "billing@acme.com"): SenderSummary {
  const messages = days.map(
    (d) =>
      ({
        id: `m${d}`,
        receivedAt: T0 + d * DAY,
        kind: "other",
        isProtected: false,
        unread: false,
        sizeBytes: 1,
        providerMarkedPersonal: false,
        looksAutomated: false,
        dkimDomains: [dkim],
      }) as MessageRecord,
  );
  return {
    key: `gmail:${address}`,
    provider: "gmail",
    address,
    displayName: "Acme",
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

describe("applySenderLedger", () => {
  it("learns quietly on the first scan, then warns when a familiar sender's signing domain changes", async () => {
    const first = sender([0, 20, 40, 60], "acme.com");
    await applySenderLedger([first], T0 + 60 * DAY);
    expect(first.threatSignals).toEqual([]);

    const changed = sender([70], "acme-payments.net");
    await applySenderLedger([changed], T0 + 70 * DAY);
    expect(changed.threatSignals).toEqual([
      { kind: "identity-change", brand: "acme-payments.net", confidence: "medium" },
    ]);
  });

  it("forgets senders not heard from in over 400 days", async () => {
    await applySenderLedger([sender([0], "acme.com")], T0);
    await applySenderLedger([sender([500], "other.com", "x@other.com")], T0 + 500 * DAY);
    expect(Object.keys(store.senderLedger as object)).toEqual(["gmail:x@other.com"]);
  });
});
