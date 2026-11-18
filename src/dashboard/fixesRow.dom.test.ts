// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { filedIn } from "../lib/correctionRate";
import { decideAll, engineContext } from "../lib/mailEngine";
import { defaultSettings } from "../lib/settingsStore";
import { build, type Template } from "../test/mailboxGen";
import { sendersOf } from "../test/sortHarness";
import { CONTACTS, TUNED, TUNED_SEED } from "../test/tunedMailbox";
import { ctx } from "./state";
import { fixesRow } from "./timeLimitsTab";

const NOW = Date.UTC(2026, 10, 15, 12);

describe("Fixes this week", () => {
  it("shows fixes per 100 emails the engine filed in the last 7 days, and nothing before there's a fix", async () => {
    const { cases, sent } = build(TUNED as Template[], TUNED_SEED);
    const { senders } = await sendersOf(cases.map((c) => c.meta), { contacts: CONTACTS, sent, now: NOW });
    ctx.senders = senders;
    ctx.settings = { ...defaultSettings(), sentCorrespondents: { addresses: CONTACTS, fetchedAt: 0 } };
    expect(fixesRow(NOW)).toBeNull(); // no fixes yet
    const filed = filedIn(senders, decideAll(senders, engineContext(ctx.settings)), NOW);
    expect(filed).toBeGreaterThan(20);
    ctx.settings = { ...ctx.settings, autoSort: { ...ctx.settings.autoSort, fixesByDay: { "2026-11-14": 6 } } };
    expect(fixesRow(NOW)?.querySelector(".ios-value")?.textContent).toBe(`${Math.round((1000 * 6) / filed) / 10} per 100`);
    ctx.senders = [];
    expect(fixesRow(NOW)).toBeNull();
  });
});
