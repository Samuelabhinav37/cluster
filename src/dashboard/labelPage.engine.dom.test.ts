// @vitest-environment jsdom
// Engine step 3: the label page and the weekly counts show the label the
// labeller gives in Gmail, email for email (docs/engine-design-2026-11-18.md).
import { describe, expect, it } from "vitest";
import { labelMail } from "./labelPage";
import { weeklyByBucket } from "./timeLimitsTab";
import { ctx } from "./state";
import { decideAll, sortLabelOf } from "../lib/mailEngine";
import type { ClusterSettings } from "../lib/settingsStore";
import { ALL_SORT_BUCKETS } from "../lib/sortTaxonomy";
import { build, type Template } from "../test/mailboxGen";
import { sendersOf } from "../test/sortHarness";
import { CONTACTS, TUNED, TUNED_SEED } from "../test/tunedMailbox";

const NOW = Date.UTC(2026, 10, 15, 12);

describe("every screen shows the engine's label", () => {
  it("label page and weekly counts agree with decide() for every email", async () => {
    const { cases, sent } = build(TUNED as Template[], TUNED_SEED);
    const metas = cases.map((c) => c.meta);
    const { senders } = await sendersOf(metas, { contacts: CONTACTS, sent, now: NOW });
    ctx.settings = {
      sentCorrespondents: { addresses: CONTACTS, fetchedAt: 0 },
      screenerAllowlist: [],
      sortOverrides: {},
      screenerHoldPeople: true,
      quarantineReview: {},
      securityRules: { strict: false },
    } as unknown as ClusterSettings;
    const decided = decideAll(senders, { wrote: new Set(CONTACTS), letIn: new Set(), overrides: {}, holdPeople: true });
    const want = new Map<string, number>();
    for (const s of senders) for (const m of s.messages) if (NOW - m.receivedAt < 7 * 86_400_000) {
      const b = sortLabelOf(decided.get(m.id));
      if (b) want.set(b, (want.get(b) ?? 0) + 1);
    }
    expect(want.size).toBeGreaterThan(5);
    expect(new Map([...weeklyByBucket(senders, NOW)].sort())).toEqual(new Map([...want].sort()));
    for (const bucket of ALL_SORT_BUCKETS) {
      const page = labelMail(senders, bucket, NOW, 7).reduce((n, r) => n + r.ids.length, 0);
      expect(page, bucket).toBe(want.get(bucket) ?? 0);
    }
  });
});
