import { describe, expect, it } from "vitest";
import type { NormalizedMessageMetadata, SentRecord } from "./providers/emailProvider";
import { buildSenderProfiles, templateKey, filedByClusterFrom } from "./senderProfile";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

let seq = 0;
function msg(from: string, ageDays: number, extra: Partial<NormalizedMessageMetadata> = {}): NormalizedMessageMetadata {
  seq += 1;
  return {
    id: `m${seq}`,
    provider: "gmail",
    fromAddress: from,
    fromDisplayName: from,
    replyToAddress: "",
    subject: `Hello ${seq}`,
    isProtected: false,
    unread: false,
    sizeBytes: 1,
    unsubscribe: {},
    receivedAt: NOW - ageDays * DAY,
    labelIds: ["INBOX"],
    ...extra,
  };
}

const bulk = (extra: Partial<NormalizedMessageMetadata> = {}) => ({
  unsubscribe: { httpUrl: "https://x.example/u" },
  listId: "news.x.example",
  ...extra,
});

function sent(to: string, ageDays: number, extra: Partial<SentRecord> = {}): SentRecord {
  seq += 1;
  return {
    id: `s${seq}`,
    provider: "gmail",
    sentAt: NOW - ageDays * DAY,
    to: [{ address: to, name: "" }],
    cc: [],
    bcc: [],
    ...extra,
  };
}

const profile = (rows: NormalizedMessageMetadata[], extra: Parameters<typeof buildSenderProfiles>[0] = { rows }) =>
  buildSenderProfiles({ now: NOW, ...extra, rows });

describe("templateKey", () => {
  it("masks numbers, amounts, dates and quoted names", () => {
    expect(templateKey("Your order #1234 has shipped")).toBe(templateKey("Your order #98 has shipped"));
    expect(templateKey("Receipt for $12.99 on Oct 3")).toBe(templateKey("Receipt for $4.00 on Nov 21st"));
    expect(templateKey('"Lisa" commented on your post')).toBe(templateKey('"Bob" commented on your post'));
    expect(templateKey("Re: Fwd: Weekly digest")).toBe("weekly digest");
    expect(templateKey("Weekly digest")).not.toBe(templateKey("Your invoice"));
  });
});

describe("buildSenderProfiles", () => {
  it("leaves new mail out of the open rate", () => {
    const rows = [
      msg("news@shop.example", 1, { ...bulk(), unread: true }),
      msg("news@shop.example", 10, { ...bulk(), unread: false }),
      msg("news@shop.example", 20, { ...bulk(), unread: true }),
    ];
    const p = profile(rows).get("gmail:news@shop.example")!;
    expect(p.judged).toBe(2);
    expect(p.openRate).toBe(0.5);
    expect(p.lastOpenedAt).toBe(NOW - 10 * DAY);
  });

  it("marks a machine sender you rarely open as ignored", () => {
    const rows = Array.from({ length: 8 }, (_, i) => msg("deals@shop.example", 20 + i * 7, { ...bulk(), unread: true }));
    const p = profile(rows).get("gmail:deals@shop.example")!;
    expect(p.machine).toBe(true);
    expect(p.kind).toBe("list");
    expect(p.tier).toBe("ignored");
    expect(p.stillSending).toBe(true);
  });

  it("calls a sender regular when you open most of it", () => {
    const rows = Array.from({ length: 6 }, (_, i) => msg("digest@news.example", 20 + i * 7, bulk()));
    expect(profile(rows).get("gmail:digest@news.example")!.tier).toBe("regular");
  });

  it("protects people you write to, whatever they send", () => {
    const rows = Array.from({ length: 6 }, (_, i) => msg("lisa@x.example", 20 + i, { ...bulk(), unread: true }));
    const out = profile(rows, { rows, sent: [sent("lisa@x.example", 5), sent("lisa@x.example", 50), sent("lisa@x.example", 90)] });
    expect(out.get("gmail:lisa@x.example")!.tier).toBe("close");

    const once = profile(rows, { rows, sent: [sent("lisa@x.example", 400)] });
    expect(once.get("gmail:lisa@x.example")!.tier).toBe("known");
  });

  it("treats starred mail and trusted senders as known", () => {
    const starred = [
      msg("a@co.example", 30, { ...bulk(), unread: true, isProtected: true }),
      ...Array.from({ length: 6 }, (_, i) => msg("a@co.example", 40 + i, { ...bulk(), unread: true })),
    ];
    expect(profile(starred).get("gmail:a@co.example")!.tier).toBe("known");

    const trusted = Array.from({ length: 6 }, (_, i) => msg("b@co.example", 40 + i, { ...bulk(), unread: true }));
    expect(profile(trusted, { rows: trusted, knownSenders: new Set(["b@co.example"]) }).get("gmail:b@co.example")!.tier).toBe(
      "known",
    );
  });

  it("finds replies in both directions", () => {
    const theirs = msg("pat@x.example", 30, { messageIdHeader: "<their-1@x>" });
    const answer = msg("pat@x.example", 20, { inReplyTo: "<mine-1@me>" });
    const out = profile([theirs, answer], {
      rows: [theirs, answer],
      sent: [sent("someone@else.example", 25, { inReplyTo: "<their-1@x>", messageIdHeader: "<mine-1@me>" })],
    });
    const p = out.get("gmail:pat@x.example")!;
    expect(p.replied).toBe(true);
    expect(p.kind).toBe("person");
    expect(p.tier).toBe("known");
  });

  it("calls a sender mixed when no kind wins most of the votes", () => {
    const rows = [
      msg("hello@brand.example", 30, { ...bulk(), subject: "Your order has shipped" }),
      msg("hello@brand.example", 31, { ...bulk(), subject: "Your receipt" }),
      msg("hello@brand.example", 32, { ...bulk(), gmailPromotion: true, subject: "Big sale" }),
    ];
    expect(profile(rows).get("gmail:hello@brand.example")!.kind).toBe("mixed");

    const shipping = Array.from({ length: 4 }, (_, i) =>
      msg("ship@brand.example", 30 + i, { ...bulk(), subject: `Order #${i} has shipped` }),
    );
    const p = profile(shipping).get("gmail:ship@brand.example")!;
    expect(p.kind).toBe("shipping");
    expect(p.templates).toEqual([expect.objectContaining({ key: "order * has shipped", count: 4 })]);
  });

  it("notices when a sender has gone quiet", () => {
    const weekly = Array.from({ length: 5 }, (_, i) => msg("w@news.example", 100 + i * 7, bulk()));
    expect(profile(weekly).get("gmail:w@news.example")!.stillSending).toBe(false);

    const quarterly = Array.from({ length: 4 }, (_, i) => msg("q@news.example", 60 + i * 90, bulk()));
    expect(profile(quarterly).get("gmail:q@news.example")!.stillSending).toBe(true);
  });

  it("sets a company key only for an authenticated, non free-mail domain", () => {
    const signed = msg("news@email.brand.example", 30, {
      authenticationResults: "mx.google.com; dkim=pass header.d=brand.example; spf=pass",
    });
    const unsigned = msg("news@other.example", 30);
    const free = msg("someone@gmail.com", 30, {
      authenticationResults: "mx.google.com; dkim=pass header.d=gmail.com",
    });
    const out = profile([signed, unsigned, free]);
    expect(out.get("gmail:news@email.brand.example")!.companyKey).toBe("brand.example");
    expect(out.get("gmail:news@other.example")!.companyKey).toBeNull();
    expect(out.get("gmail:someone@gmail.com")!.companyKey).toBeNull();
  });

  it("counts a copy delivered twice once", () => {
    const a = msg("n@news.example", 30, { messageIdHeader: "<same@n>" });
    const b = msg("n@news.example", 30, { messageIdHeader: "<same@n>" });
    const p = profile([a, b]).get("gmail:n@news.example")!;
    expect(p.sampled).toBe(1);
    expect(p.duplicates).toBe(1);
  });

  it("uses census totals when they counted more than was read", () => {
    const rows = [msg("big@news.example", 30, { ...bulk(), unread: true })];
    const p = profile(rows, {
      rows,
      census: [{ provider: "gmail", address: "big@news.example", ids: ["1", "2", "3"], unread: 3, starred: 0, countedAt: NOW }],
    }).get("gmail:big@news.example")!;
    expect(p.received).toBe(3);
    expect(p.unread).toBe(3);
    expect(p.sampled).toBe(1);
  });

  it("keeps brand-new senders out of every judging tier", () => {
    const rows = Array.from({ length: 6 }, (_, i) => msg("fresh@shop.example", 4 + i, { ...bulk(), unread: true }));
    expect(profile(rows).get("gmail:fresh@shop.example")!.tier).toBe("new");
  });
});

describe("engagement v2: mail Cluster filed away isn't neglect", () => {
  it("leaves unread mail Cluster moved out of the inbox out of the open rate", () => {
    const filedIds = ["f1", "f2", "f3", "f4"];
    const rows = [
      ...filedIds.map((id, i) => msg("news@brand.example", 10 + i, { id, unread: true, labelIds: ["UNREAD", "Label_9"] })),
      msg("news@brand.example", 20, { id: "seen", unread: false, labelIds: ["INBOX"] }),
    ];
    const without = buildSenderProfiles({ rows, now: NOW }).get("gmail:news@brand.example")!;
    expect(without.openRate).toBeCloseTo(0.2);
    const filedByCluster = filedByClusterFrom([{ kind: "sort", undo: { ids: filedIds } }], []);
    const withFiled = buildSenderProfiles({ rows, now: NOW, filedByCluster }).get("gmail:news@brand.example")!;
    expect(withFiled.openRate).toBe(1);
    expect(withFiled.judged).toBe(1);
  });

  it("counts mail still in the inbox, and ignores undone actions", () => {
    const rows = [msg("news@brand.example", 10, { id: "a", unread: true, labelIds: ["INBOX", "UNREAD"] })];
    const filedByCluster = filedByClusterFrom(
      [
        { kind: "sort", undo: { ids: ["a"] } },
        { kind: "archive", undone: true, undo: { ids: ["b"] } },
      ],
      ["News@Brand.example"],
    );
    expect(filedByCluster.ids.has("b")).toBe(false);
    expect(filedByCluster.senders.has("news@brand.example")).toBe(true);
    expect(buildSenderProfiles({ rows, now: NOW, filedByCluster }).get("gmail:news@brand.example")!.openRate).toBe(0);
  });
});
