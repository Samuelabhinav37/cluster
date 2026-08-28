import { describe, expect, it, vi } from "vitest";
import {
  executeBulkDeleteDomains,
  executeBulkKeepSorted,
  executeBulkSnooze,
  executeBulkUnsubscribe,
  mergeDeletableIdsByProvider,
  partitionForKeepSorted,
  partitionForSnooze,
  partitionForUnsubscribe,
  safeDomainGroupKeys,
  safeSenderKeys,
  totalDeletableAcrossGroups,
} from "./bulkActions";
import type { DomainGroup } from "./domainGrouping";
import type { EmailProvider, ProviderId } from "./providers/emailProvider";
import type { SenderSummary } from "./senderModel";

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
    threatSignals: [],
    ...overrides,
  };
}

function makeGroup(overrides: Partial<DomainGroup> & { key: string }): DomainGroup {
  return {
    domain: "example.com",
    category: "other",
    isFreeMailException: false,
    senders: [],
    totalCount: 0,
    protectedCount: 0,
    deletableMessageIds: new Map(),
    protectedMessageIds: new Map(),
    ...overrides,
  };
}

describe("safeSenderKeys / safeDomainGroupKeys", () => {
  it("includes only senders with zero protected messages", () => {
    const senders = [
      makeSender({ address: "a@x.com", protectedMessageIds: [] }),
      makeSender({ address: "b@x.com", protectedMessageIds: ["m1"] }),
    ];
    expect(safeSenderKeys(senders)).toEqual(new Set(["gmail:a@x.com"]));
  });

  it("includes only domain groups with zero protected count", () => {
    const groups = [
      makeGroup({ key: "d1", protectedCount: 0 }),
      makeGroup({ key: "d2", protectedCount: 2 }),
    ];
    expect(safeDomainGroupKeys(groups)).toEqual(new Set(["d1"]));
  });
});

describe("partitionForUnsubscribe / executeBulkUnsubscribe", () => {
  it("splits senders into automatable (verified one-click) vs manual", () => {
    const senders = [
      makeSender({ address: "a@x.com", unsubscribe: { postUrl: "https://x.com/u" } }),
      makeSender({ address: "b@x.com", unsubscribe: { httpUrl: "https://x.com/page" } }),
      makeSender({ address: "c@x.com", unsubscribe: {} }),
    ];
    const { automatable, manual } = partitionForUnsubscribe(senders);
    expect(automatable.map((s) => s.address)).toEqual(["a@x.com"]);
    expect(manual.map((s) => s.address)).toEqual(["b@x.com", "c@x.com"]);
  });

  it("counts successes and failures from the injected fire function", async () => {
    const senders = [
      makeSender({ address: "a@x.com", unsubscribe: { postUrl: "https://x.com/u1" } }),
      makeSender({ address: "b@x.com", unsubscribe: { postUrl: "https://x.com/u2" } }),
    ];
    const fireOneClick = vi.fn(async (url: string) => url.endsWith("u1"));
    const { succeeded, failed } = await executeBulkUnsubscribe(senders, fireOneClick);
    expect(succeeded.map((s) => s.address)).toEqual(["a@x.com"]);
    expect(failed.map((s) => s.address)).toEqual(["b@x.com"]);
  });
});

describe("partitionForKeepSorted / executeBulkKeepSorted", () => {
  function makeProvider(id: ProviderId, withKeepSorted: boolean): EmailProvider {
    return {
      id,
      isConnected: vi.fn(async () => true),
      getAuthToken: vi.fn(async () => "token"),
      listCandidateMessages: vi.fn(async () => []),
      getMessageMetadata: vi.fn(),
      trashMessages: vi.fn(async () => {}),
      keepSorted: withKeepSorted ? vi.fn(async () => {}) : undefined,
    };
  }

  it("splits senders by whether their provider supports keep-sorted", () => {
    const providerById = new Map<ProviderId, EmailProvider>([
      ["gmail", makeProvider("gmail", true)],
      ["outlook", makeProvider("outlook", false)],
    ]);
    const senders = [
      makeSender({ address: "a@x.com", provider: "gmail" }),
      makeSender({ address: "b@x.com", provider: "outlook" }),
    ];
    const { eligible, unsupported } = partitionForKeepSorted(senders, providerById);
    expect(eligible.map((s) => s.address)).toEqual(["a@x.com"]);
    expect(unsupported.map((s) => s.address)).toEqual(["b@x.com"]);
  });

  it("calls keepSorted for each eligible sender and reports failures separately", async () => {
    const gmail = makeProvider("gmail", true);
    (gmail.keepSorted as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    const providerById = new Map<ProviderId, EmailProvider>([["gmail", gmail]]);
    const senders = [
      makeSender({ address: "a@x.com", provider: "gmail" }),
      makeSender({ address: "b@x.com", provider: "gmail" }),
    ];
    const { succeeded, failed } = await executeBulkKeepSorted(senders, providerById);
    expect(succeeded).toBe(1);
    expect(failed).toBe(1);
  });
});

describe("partitionForSnooze / executeBulkSnooze", () => {
  function makeProvider(id: ProviderId, withSnooze: boolean): EmailProvider {
    return {
      id,
      isConnected: vi.fn(async () => true),
      getAuthToken: vi.fn(async () => "token"),
      listCandidateMessages: vi.fn(async () => []),
      getMessageMetadata: vi.fn(),
      trashMessages: vi.fn(async () => {}),
      snoozeMessages: withSnooze ? vi.fn(async () => {}) : undefined,
    };
  }

  it("splits senders by whether their provider supports snooze (Gmail-only)", () => {
    const providerById = new Map<ProviderId, EmailProvider>([
      ["gmail", makeProvider("gmail", true)],
      ["outlook", makeProvider("outlook", false)],
    ]);
    const senders = [
      makeSender({ address: "a@x.com", provider: "gmail" }),
      makeSender({ address: "b@x.com", provider: "outlook" }),
    ];
    const { eligible, unsupported } = partitionForSnooze(senders, providerById);
    expect(eligible.map((s) => s.address)).toEqual(["a@x.com"]);
    expect(unsupported.map((s) => s.address)).toEqual(["b@x.com"]);
  });

  it("calls snoozeMessages for each eligible sender with its message ids, reporting failures separately", async () => {
    const gmail = makeProvider("gmail", true);
    (gmail.snoozeMessages as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    const providerById = new Map<ProviderId, EmailProvider>([["gmail", gmail]]);
    const senders = [
      makeSender({ address: "a@x.com", provider: "gmail", messageIds: ["m1"] }),
      makeSender({ address: "b@x.com", provider: "gmail", messageIds: ["m2"] }),
    ];
    const { succeeded, failed } = await executeBulkSnooze(senders, providerById);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(gmail.snoozeMessages).toHaveBeenCalledWith("token", ["m1"]);
    expect(gmail.snoozeMessages).toHaveBeenCalledWith("token", ["m2"]);
  });
});

describe("mergeDeletableIdsByProvider / totalDeletableAcrossGroups", () => {
  it("merges per-provider deletable ids across multiple groups", () => {
    const groups = [
      makeGroup({
        key: "d1",
        deletableMessageIds: new Map<ProviderId, string[]>([["gmail", ["a1", "a2"]]]),
      }),
      makeGroup({
        key: "d2",
        deletableMessageIds: new Map<ProviderId, string[]>([
          ["gmail", ["a3"]],
          ["outlook", ["o1"]],
        ]),
      }),
    ];
    const merged = mergeDeletableIdsByProvider(groups);
    expect(merged.get("gmail")).toEqual(["a1", "a2", "a3"]);
    expect(merged.get("outlook")).toEqual(["o1"]);
    expect(totalDeletableAcrossGroups(groups)).toBe(4);
  });
});

describe("executeBulkDeleteDomains", () => {
  it("calls trashMessages once per provider present in the merged map", async () => {
    const gmailTrash = vi.fn(async () => {});
    const outlookTrash = vi.fn(async () => {});
    const providerById = new Map<ProviderId, EmailProvider>([
      [
        "gmail",
        {
          id: "gmail",
          isConnected: vi.fn(async () => true),
          getAuthToken: vi.fn(async () => "gmail-token"),
          listCandidateMessages: vi.fn(async () => []),
          getMessageMetadata: vi.fn(),
          trashMessages: gmailTrash,
        },
      ],
      [
        "outlook",
        {
          id: "outlook",
          isConnected: vi.fn(async () => true),
          getAuthToken: vi.fn(async () => "outlook-token"),
          listCandidateMessages: vi.fn(async () => []),
          getMessageMetadata: vi.fn(),
          trashMessages: outlookTrash,
        },
      ],
    ]);
    const merged = new Map<ProviderId, string[]>([
      ["gmail", ["a1", "a2"]],
      ["outlook", ["o1"]],
    ]);
    await executeBulkDeleteDomains(merged, providerById);
    expect(gmailTrash).toHaveBeenCalledWith("gmail-token", ["a1", "a2"]);
    expect(outlookTrash).toHaveBeenCalledWith("outlook-token", ["o1"]);
  });
});
