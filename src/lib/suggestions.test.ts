import { describe, expect, it } from "vitest";
import { DAY, NOW, many, meta, senders } from "../test/mailFixtures";
import { recordEngagementFeedback } from "./engagementModel";
import type { NormalizedMessageMetadata, SentRecord } from "./providers/emailProvider";
import { buildSenderProfiles } from "./senderProfile";
import { buildSuggestions, unopenedSuggestions } from "./suggestions";
import { emptySuggestionModel, learn, suggestionFeatures } from "./suggestionModel";

async function suggest(rows: NormalizedMessageMetadata[], sent: SentRecord[] = [], feedback = {}) {
  const list = await senders(rows);
  const profiles = buildSenderProfiles({ rows, sent, now: NOW });
  return buildSuggestions(list, profiles, feedback, undefined, NOW);
}

const ignored = (fromAddress: string, extra: Partial<NormalizedMessageMetadata> = {}) =>
  many(8, { fromAddress, receivedAt: NOW - 20 * DAY, listId: `l.${fromAddress}`, ...extra });

describe("buildSuggestions", () => {
  it("suggests unsubscribing from a sender you never open, with real numbers", async () => {
    const out = await suggest(ignored("deals@shop.example"));
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe("unsubscribe");
    expect(out[0].reasons[0]).toBe("You haven't opened any of their last 8.");
    expect(out[0].safeMessageIds).toHaveLength(8);
  });

  it("works on the first visit, with no earlier snapshots", async () => {
    expect(await suggest(ignored("deals@shop.example"), [], {})).toHaveLength(1);
  });

  it("offers Mute when there is no unsubscribe link", async () => {
    // Bulk mail with no link. Without a bulk header it would read as personal
    // and stay protected.
    const out = await suggest(ignored("promo@shop.example", { unsubscribe: {}, precedence: "bulk" }));
    expect(out[0]?.action).toBe("mute");
  });

  it("offers to clear old mail from a sender that stopped sending", async () => {
    const rows = many(8, {
      fromAddress: "old@shop.example",
      listId: "old.list",
      receivedAt: NOW - 200 * DAY,
    }).map((m, i) => ({ ...m, receivedAt: NOW - (200 + i * 7) * DAY }));
    const out = await suggest(rows);
    expect(out[0]?.action).toBe("clearOld");
    expect(out[0]?.reasons[0]).toMatch(/^They stopped sending in /);
  });

  it("never suggests someone you write to", async () => {
    const sent: SentRecord[] = [
      { id: "s1", provider: "gmail", sentAt: NOW - DAY, to: [{ address: "deals@shop.example", name: "" }], cc: [], bcc: [] },
    ];
    expect(await suggest(ignored("deals@shop.example"), sent)).toEqual([]);
  });

  it("leaves out a sender with a starred message", async () => {
    const rows = ignored("deals@shop.example");
    rows[0] = { ...rows[0], isProtected: true };
    expect(await suggest(rows)).toEqual([]);
  });

  it("does not count mail from the last 3 days as ignored", async () => {
    const rows = many(8, { fromAddress: "new@shop.example", listId: "n", receivedAt: NOW - DAY });
    // Old enough to not be "new", but every message is inside the grace period.
    const out = await suggest([meta({ fromAddress: "new@shop.example", receivedAt: NOW - 60 * DAY, unread: false }), ...rows]);
    expect(out).toEqual([]);
  });

  it("suggests Keep sorted for mail you read that fills the inbox", async () => {
    const rows = many(12, {
      fromAddress: "digest@news.example",
      listId: "digest",
      unread: false,
      labelIds: ["INBOX"],
      receivedAt: NOW - 20 * DAY,
    });
    const out = await suggest(rows);
    expect(out.map((s) => s.action)).toEqual(["keepSorted"]);
    expect(unopenedSuggestions(out)).toEqual([]);
  });

  it("ranks what you tend to take above a bigger pile you tend to dismiss", async () => {
    const rows = [
      ...many(12, { fromAddress: "promo@big.example", receivedAt: NOW - 20 * DAY, unsubscribe: {}, precedence: "bulk" }),
      ...ignored("deals@small.example"),
    ];
    const list = await senders(rows);
    const profiles = buildSenderProfiles({ rows, now: NOW });
    const plain = buildSuggestions(list, profiles, {}, undefined, NOW);
    expect(plain.map((s) => s.action)).toEqual(["mute", "unsubscribe"]);
    // Same order with an empty model: no history, no change.
    expect(buildSuggestions(list, profiles, {}, undefined, NOW, emptySuggestionModel(NOW))).toEqual(plain);
    let model = emptySuggestionModel(NOW);
    for (const s of plain) {
      const features = suggestionFeatures(s.sender, s.profile, s.action);
      for (let i = 0; i < 3; i++) model = learn(model, features, s.action === "mute" ? "dismiss" : "accept", NOW);
    }
    const learned = buildSuggestions(list, profiles, {}, undefined, NOW, model);
    expect(learned.map((s) => s.action)).toEqual(["unsubscribe", "mute"]);
  });

  it("hides a dismissed sender for 30 days and an undone one until accepted again", async () => {
    const rows = ignored("deals@shop.example");
    const key = "gmail:deals@shop.example";
    expect(await suggest(rows, [], recordEngagementFeedback({}, [key], "dismiss", NOW))).toEqual([]);
    expect(await suggest(rows, [], recordEngagementFeedback({}, [key], "undo", NOW))).toEqual([]);
  });
});
