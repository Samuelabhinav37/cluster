// Step 0 of the engine (docs/engine-design-2026-11-18.md): decide() must place
// every email exactly where the background's passes do today.
import { describe, expect, it } from "vitest";
import { decideAll, heldIdsOf, riskOf } from "./mailEngine";
import { build, type Template } from "../test/mailboxGen";
import { HELD_OUT, HELD_OUT_SEED } from "../test/heldOutMailbox";
import { HELD_OUT_B, HELD_OUT_B_SEED } from "../test/heldOutMailboxB";
import { HELD_OUT_C, HELD_OUT_C_SEED } from "../test/heldOutMailboxC";
import { HELD_OUT_D, HELD_OUT_D_SEED } from "../test/heldOutMailboxD";
import { sendersOf, sortMailbox } from "../test/sortHarness";
import { CONTACTS, TUNED, TUNED_SEED } from "../test/tunedMailbox";

describe("mailEngine matches today's passes, email for email", () => {
  it.each([
    ["Tuned", TUNED, TUNED_SEED],
    ["Held-out A", HELD_OUT, HELD_OUT_SEED],
    ["Held-out B", HELD_OUT_B, HELD_OUT_B_SEED],
    ["Held-out C", HELD_OUT_C, HELD_OUT_C_SEED],
    ["Held-out D", HELD_OUT_D, HELD_OUT_D_SEED],
  ] as const)("%s", async (_name, templates, seed) => {
    const { cases, sent } = build(templates as Template[], seed);
    const metas = cases.map((c) => c.meta);
    const setup = { contacts: CONTACTS, sent, now: Date.UTC(2026, 10, 15, 12) };
    const today = await sortMailbox(metas, setup);
    const { senders } = await sendersOf(metas, setup);
    const engine = decideAll(senders, { wrote: new Set(CONTACTS), letIn: new Set(), overrides: {} });
    const diff = metas.filter((m) => (engine.get(m.id)?.place ?? "inbox") !== today.get(m.id));
    expect(diff.map((m) => `${m.fromAddress} "${m.subject}": ${engine.get(m.id)?.place} vs ${today.get(m.id)}`).slice(0, 5)).toEqual([]);
    expect(engine.size).toBe(metas.length);
  });
});

describe("one personal-account check (engine step 1)", () => {
  it("a professor writing from a school address is a person; the school's shared mailboxes stay Education", async () => {
    const { mail } = await import("../test/mailboxGen");
    const metas = [
      mail("j.rivera@westbrook.edu", "Julia Rivera", "Office hours moved to Thursday", { tab: "primary", via: "person" }),
      mail("advising@westbrook.edu", "Westbrook Advising", "Spring course list"),
      mail("registrar@westbrook.edu", "Westbrook Registrar", "Spring course list"),
    ];
    const { senders } = await sendersOf(metas, { contacts: [], now: Date.UTC(2026, 10, 15, 12) });
    const d = decideAll(senders, { wrote: new Set(), letIn: new Set(), overrides: {} });
    expect(metas.map((m) => d.get(m.id)?.place)).toEqual(["personal", "education", "education"]);
  });
});

describe("one risk context (engine step 5)", () => {
  it("Strict holds warned senders' mail in riskOf and in decide alike, as the scam hold does", async () => {
    const { cases, sent } = build(TUNED as Template[], TUNED_SEED);
    const { senders } = await sendersOf(cases.map((c) => c.meta), { contacts: CONTACTS, sent, now: 0 });
    const base = { wrote: new Set(CONTACTS), letIn: new Set<string>(), overrides: {} };
    const warned = senders.filter((s) => riskOf(s, base).tier === "warn");
    const strict = { ...base, strict: true };
    const held = warned.flatMap((s) => riskOf(s, strict).heldMessageIds.filter((id) => !s.protectedMessageIds.includes(id)));
    expect(held.length).toBeGreaterThan(0);
    const on = decideAll(warned, strict);
    const off = decideAll(warned, base);
    for (const id of held) {
      expect(on.get(id)?.place).toBe("spam");
      expect(off.get(id)?.place).not.toBe("spam");
    }
  });
});

describe("the engine counts only what really moves (plan step 1.1)", () => {
  async function tuned() {
    const { cases, sent } = build(TUNED as Template[], TUNED_SEED);
    const { senders } = await sendersOf(cases.map((c) => c.meta), { contacts: CONTACTS, sent, now: Date.UTC(2026, 10, 15, 12) });
    return senders;
  }
  const base = { wrote: new Set(CONTACTS), letIn: new Set<string>(), overrides: {} };
  const places = (d: Map<string, { place: unknown }>) => new Set([...d.values()].map((x) => x.place));

  it("with sorting off, the Screener holds nothing; labels stay as the preview and held scams still go to Spam", async () => {
    const senders = await tuned();
    const on = decideAll(senders, base);
    const off = decideAll(senders, { ...base, sorting: false });
    expect(places(off).has("screener")).toBe(false);
    for (const [id, d] of on) expect(off.get(id)?.place).toBe(d.place === "screener" ? null : d.place);
  });

  it("with the Screener off, its mail stays in the inbox and labels are untouched", async () => {
    const senders = await tuned();
    const on = decideAll(senders, base);
    const off = decideAll(senders, { ...base, holdUnsorted: false });
    expect([...on.values()].some((d) => d.place === "screener")).toBe(true);
    for (const [id, d] of on) expect(off.get(id)?.place).toBe(d.place === "screener" ? null : d.place);
  });

  it("with the scam hold off, nothing goes to Spam; heldIdsOf agrees with decide", async () => {
    const senders = await tuned();
    const on = decideAll(senders, base);
    const spam = [...on].filter(([, d]) => d.place === "spam").map(([id]) => id);
    expect(spam.length).toBeGreaterThan(0);
    expect(senders.flatMap((s) => heldIdsOf(s, base)).sort()).toEqual(spam.sort());
    const off = decideAll(senders, { ...base, holdScams: false });
    expect([...off.values()].some((d) => d.place === "spam")).toBe(false);
    expect(senders.flatMap((s) => heldIdsOf(s, { ...base, holdScams: false }))).toEqual([]);
  });

  it("holdAuthFails sends a stranger's failing mail to Spam, never a known sender's", async () => {
    const senders = await tuned();
    const failing = senders.filter((s) => s.authVerdicts.dmarc === "fail" || (s.authVerdicts.spf === "fail" && s.authVerdicts.dkim === "fail"));
    expect(failing.length).toBeGreaterThan(0);
    const ctx = { ...base, holdScams: false, holdAuthFails: true };
    const d = decideAll(failing, ctx);
    for (const s of failing) {
      const known = base.wrote.has(s.address.toLowerCase());
      for (const m of s.messages)
        if (!s.protectedMessageIds.includes(m.id)) expect(d.get(m.id)?.place === "spam").toBe(!known);
    }
  });

  it("engineContext reads all four switches from settings", async () => {
    const { defaultSettings } = await import("./settingsStore");
    const { engineContext } = await import("./mailEngine");
    const s = defaultSettings();
    const ctx = engineContext({
      ...s,
      autoQuarantineHighRisk: true,
      securityRules: { ...s.securityRules, holdAuthFails: true },
      autoSort: { ...s.autoSort, timeLimitsEnabled: true, holdUnsorted: false },
    });
    expect([ctx.sorting, ctx.holdUnsorted, ctx.holdScams, ctx.holdAuthFails]).toEqual([true, false, true, true]);
  });
});
