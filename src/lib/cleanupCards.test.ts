import { describe, expect, it } from "vitest";
import { DAY, NOW, many, senders } from "../test/mailFixtures";
import { buildCleanupCards } from "./cleanupCards";
import { buildExpiryBuckets } from "./expiryTriage";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";
import { buildSenderProfiles } from "./senderProfile";
import { buildSuggestions, unopenedSuggestions } from "./suggestions";

async function cards(rows: NormalizedMessageMetadata[]) {
  const list = await senders(rows);
  const profiles = buildSenderProfiles({ rows, sent: [], now: NOW });
  const never = unopenedSuggestions(buildSuggestions(list, profiles, {}, undefined, NOW));
  return buildCleanupCards(list, profiles, never, buildExpiryBuckets(list));
}

const newsletter = (fromAddress: string, unread: boolean) =>
  many(8, { fromAddress, listId: `l.${fromAddress}`, subject: "This week's newsletter", unread }).map((m, i) => ({
    ...m,
    receivedAt: NOW - (40 + i * 7) * DAY,
  }));

describe("buildCleanupCards", () => {
  it("never counts an email in two cards", async () => {
    // Unopened and past its date: it belongs to "never" only.
    const out = await cards([...newsletter("ignored@news.example", true), ...newsletter("read@news.example", false)]);
    const neverIds = new Set(out.never.flatMap((s) => s.safeMessageIds));
    const oldIds = out.old.flatMap((b) => [...b.messageIdsByProvider.values()].flat());
    expect(neverIds.size).toBeGreaterThan(0);
    expect(oldIds.some((id) => neverIds.has(id))).toBe(false);
    expect(out.total).toBe(out.neverCount + out.oldCount);
  });

  it("lists a mailing list you don't open, and not one you read", async () => {
    const out = await cards([...newsletter("ignored@news.example", true), ...newsletter("read@news.example", false)]);
    expect(out.lists.map((s) => s.address)).toEqual(["ignored@news.example"]);
  });

  it("leaves a list out when one of its emails is starred", async () => {
    const rows = newsletter("ignored@news.example", true);
    rows[0] = { ...rows[0], isProtected: true };
    expect((await cards(rows)).lists).toEqual([]);
  });
});
