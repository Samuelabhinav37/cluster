// Metamorphic tests: change an email in a way that must not change where it
// goes (or must not make it less safe), rerun the whole mailbox, compare.
// No answer key is needed, so these catch mistakes in the generator as well
// as in Cluster (Ma et al., IJCAI 2020, for the idea on NLP models).
import { describe, expect, it } from "vitest";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";
import { build, type Case } from "../test/mailboxGen";
import { HELD_OUT, HELD_OUT_SEED } from "../test/heldOutMailbox";
import { sortMailbox, type Where } from "../test/sortHarness";
import { CONTACTS, TUNED, TUNED_SEED } from "../test/tunedMailbox";

const NOW = Date.UTC(2026, 10, 15, 12);

for (const [name, templates, seed] of [["held-out", HELD_OUT, HELD_OUT_SEED], ["tuned", TUNED, TUNED_SEED]] as const) {
  describe(`metamorphic: ${name} mailbox`, () => {
    const { cases, sent } = build(templates, seed);
    const sort = (metas: NormalizedMessageMetadata[]) => sortMailbox(metas, { contacts: CONTACTS, sent, now: NOW });
    const change = (pick: (c: Case) => boolean, f: (m: NormalizedMessageMetadata) => Partial<NormalizedMessageMetadata>) =>
      cases.map((c) => (pick(c) ? { ...c.meta, ...f(c.meta) } : c.meta));
    const isPerson = (c: Case) => c.t.accept[0] === "personal";
    const isScam = (c: Case) => c.t.accept[0] === "spam";
    const moved = (a: Map<string, Where>, b: Map<string, Where>, ids: string[]) =>
      ids.filter((id) => a.get(id) !== b.get(id)).map((id) => `${id}: ${a.get(id)} → ${b.get(id)}`);
    let base: Map<string, Where>;

    it("the order mail arrives in changes nothing", async () => {
      base = await sort(cases.map((c) => c.meta));
      const reversed = await sort(cases.map((c) => c.meta).reverse());
      expect(moved(base, reversed, cases.map((c) => c.meta.id))).toEqual([]);
    });

    it("another spelling of a Gmail address goes to the same place", async () => {
      // Gmail ignores dots and case: a.lice@gmail.com is alice@gmail.com.
      const gmail = (c: Case) => isPerson(c) && c.meta.fromAddress.endsWith("@gmail.com");
      const respelled = await sort(change(gmail, (m) => ({ fromAddress: `${m.fromAddress[0]}.${m.fromAddress.slice(1)}`.toUpperCase() })));
      expect(moved(base, respelled, cases.filter(gmail).map((c) => c.meta.id))).toEqual([]);
    });

    it("a person's mail that reached Personal stays there as a reply", async () => {
      // A real reply carries In-Reply-To and References.
      const inPersonal = (c: Case) => isPerson(c) && base.get(c.meta.id) === "personal";
      const replies = await sort(change(inPersonal, (m) => ({ subject: `Re: ${m.subject}`, inReplyTo: `<p-${m.id}@mail.gmail.com>`, referencesCount: 1 })));
      expect(moved(base, replies, cases.filter(inPersonal).map((c) => c.meta.id))).toEqual([]);
    });

    it("a stranger's \"Re:\" with no thread behind it never reaches Personal", async () => {
      const contacts = new Set(CONTACTS);
      const stranger = (c: Case) => !contacts.has(c.meta.fromAddress) && !sent.some((s) => s.threadId === c.meta.threadId);
      const faked = await sort(change(stranger, (m) => ({ subject: `Re: ${m.subject}`, inReplyTo: undefined, referencesCount: 0 })));
      const leaked = cases.filter((c) => stranger(c) && !(c.meta.ccAddresses ?? []).some((a) => contacts.has(a)) && faked.get(c.meta.id) === "personal");
      expect(leaked.map((c) => `${c.t.group}: ${c.meta.subject}`)).toEqual([]);
    });

    it("without Gmail tabs or sending headers, no person goes to Spam and no extra scam reaches Personal", async () => {
      const bare = await sort(
        change(() => true, (m) => ({
          labelIds: (m.labelIds ?? []).filter((l) => !l.startsWith("CATEGORY_")),
          returnPathDomain: undefined,
          messageIdHeader: undefined,
          feedbackId: undefined,
        })),
      );
      expect(cases.filter((c) => isPerson(c) && bare.get(c.meta.id) === "spam")).toEqual([]);
      const scamsInPersonal = (w: Map<string, Where>) => cases.filter((c) => isScam(c) && w.get(c.meta.id) === "personal").length;
      expect(scamsInPersonal(bare)).toBeLessThanOrEqual(scamsInPersonal(base));
    });

    it("a scam faking a person's mail-app headers is held just the same", async () => {
      // Return-Path and Message-ID are the sender's to write; they never lower a scam check.
      const faked = await sort(change(isScam, (m) => ({ returnPathDomain: m.fromAddress.split("@")[1], messageIdHeader: `<CA+x${m.id}@mail.gmail.com>`, feedbackId: undefined })));
      const spam = cases.filter((c) => isScam(c) && base.get(c.meta.id) === "spam").map((c) => c.meta.id);
      expect(moved(base, faked, spam)).toEqual([]);
    });
  });
}
