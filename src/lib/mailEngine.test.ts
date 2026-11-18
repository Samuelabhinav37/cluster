// Step 0 of the engine (docs/engine-design-2026-11-18.md): decide() must place
// every email exactly where the background's passes do today.
import { describe, expect, it } from "vitest";
import { decideAll, riskOf } from "./mailEngine";
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
