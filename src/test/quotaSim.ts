// Gmail quota simulator (test-only). A synthetic mailbox behind a fake
// EmailProvider that charges each call what Gmail charges it
// (gmailApi.gmailQuotaCost: messages.get 20, list pages 5, history 2, ...),
// driven through the real syncMailIndex. quotaBudget.test.ts asserts the
// totals; `npm run bench:quota` prints them per mailbox size.
import { vi } from "vitest";
import { createMemoryMailIndex } from "../lib/mailIndex";
import { syncMailIndex } from "../lib/mailSync";
import type { EmailProvider, NormalizedMessageMetadata, SentRecord } from "../lib/providers/emailProvider";

/** Gmail's per-user ceiling for new projects. */
export const UNITS_PER_MINUTE = 6_000;
/** What the dashboard paces a build to, leaving headroom for user actions. */
export const PACED_UNITS_PER_MINUTE = 4_500;

const COST = { get: 20, listPage: 5, history: 2, profile: 1 } as const;
const PAGE = 500;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 20);

export interface MailboxShape {
  /** Received messages in the scan window. */
  messages: number;
  /** Distinct senders. Volume per sender follows a Zipf curve. */
  senders: number;
  /** Share of senders that are people (no bulk headers). */
  personalShare: number;
  /** Sent messages. */
  sent: number;
}

export const SHAPES: Record<string, MailboxShape> = {
  "5k": { messages: 5_000, senders: 400, personalShare: 0.2, sent: 1_000 },
  "20k": { messages: 20_000, senders: 1_200, personalShare: 0.15, sent: 5_000 },
  "100k": { messages: 100_000, senders: 3_000, personalShare: 0.1, sent: 5_000 },
};

export interface QuotaReport {
  units: number;
  gets: number;
  listCalls: number;
  /** Minutes at Gmail's ceiling and at the dashboard's pace. */
  minutesAtCeiling: number;
  minutesPaced: number;
  /** Units spent before the first screen could render. */
  unitsToFirstScreen: number;
}

/** Zipf weights for `n` senders, normalised to sum to `total`, at least 1 each. */
function zipfCounts(n: number, total: number): number[] {
  const raw = Array.from({ length: n }, (_, i) => 1 / (i + 1));
  const sum = raw.reduce((a, b) => a + b, 0);
  const counts = raw.map((w) => Math.max(1, Math.round((w / sum) * total)));
  let diff = total - counts.reduce((a, b) => a + b, 0);
  for (let i = 0; diff !== 0; i = (i + 1) % n) {
    if (diff > 0) {
      counts[i]++;
      diff--;
    } else if (counts[i] > 1) {
      counts[i]--;
      diff++;
    }
  }
  return counts;
}

export function buildMailbox(shape: MailboxShape): NormalizedMessageMetadata[] {
  const counts = zipfCounts(shape.senders, shape.messages);
  const out: NormalizedMessageMetadata[] = [];
  let seq = 0;
  counts.forEach((count, s) => {
    // Interleave people across the volume curve rather than all at the tail.
    const personal = s % Math.round(1 / shape.personalShare) === 0;
    const address = personal ? `person${s}@gmail.com` : `news${s}@brand${s}.example`;
    for (let m = 0; m < count; m++) {
      const id = `m${seq++}`;
      out.push({
        id,
        provider: "gmail",
        fromAddress: address,
        fromDisplayName: personal ? `Person ${s}` : `Brand ${s}`,
        replyToAddress: "",
        subject: personal ? "hello" : "This week's update",
        isProtected: false,
        unread: m % 3 !== 0,
        sizeBytes: 20_000,
        unsubscribe: personal ? {} : { httpUrl: `https://brand${s}.example/u` },
        receivedAt: 0,
        labelIds: personal ? ["INBOX"] : ["CATEGORY_PROMOTIONS"],
        gmailPromotion: !personal,
      });
    }
  });
  // Newest first, senders interleaved the way a real inbox mixes them.
  const shuffled = out.sort((a, b) => hash(a.id) - hash(b.id));
  shuffled.forEach((row, i) => (row.receivedAt = NOW - Math.floor((i / shuffled.length) * 365) * DAY - i));
  return shuffled;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A fake Gmail provider over `mailbox`, metering every call. */
export function meteredGmail(mailbox: NormalizedMessageMetadata[], sentCount: number) {
  const byId = new Map(mailbox.map((m) => [m.id, m]));
  const bySender = new Map<string, string[]>();
  for (const m of mailbox) bySender.set(m.fromAddress, [...(bySender.get(m.fromAddress) ?? []), m.id]);
  const sentIds = Array.from({ length: sentCount }, (_, i) => `s${i}`);
  const meter = { units: 0, gets: 0, listCalls: 0 };
  const listed = (n: number) => {
    const pages = Math.max(1, Math.ceil(n / PAGE));
    meter.units += pages * COST.listPage;
    meter.listCalls += pages;
  };

  const provider = {
    id: "gmail",
    getAccountId: vi.fn(async () => {
      meter.units += COST.profile;
      return "me@example.com";
    }),
    getChangeCursor: vi.fn(async () => {
      meter.units += COST.profile;
      return "h1";
    }),
    listChangesSince: vi.fn(async (_t: string, cursor: string) => {
      meter.units += COST.history;
      return { added: [], removed: [], labelUpdates: [], cursor, expired: false };
    }),
    listCandidateMessages: vi.fn(async (_t: string, max: number) => {
      const ids = mailbox.slice(0, max).map((m) => ({ id: m.id, provider: "gmail" as const }));
      listed(ids.length);
      return ids;
    }),
    getMessageMetadata: vi.fn(async (_t: string, id: string) => {
      meter.units += COST.get;
      meter.gets++;
      const row = byId.get(id);
      if (!row) throw new Error(`404 ${id}`);
      return row;
    }),
    listSentMessageIds: vi.fn(async (_t: string, max: number) => {
      const ids = sentIds.slice(0, max);
      listed(ids.length);
      return ids;
    }),
    getSentRecord: vi.fn(async (_t: string, id: string): Promise<SentRecord> => {
      meter.units += COST.get;
      meter.gets++;
      return { id, provider: "gmail", sentAt: NOW, to: [], cc: [], bcc: [] } as unknown as SentRecord;
    }),
    listMessageIdsFrom: vi.fn(async (_t: string, address: string, max: number) => {
      const ids = (bySender.get(address) ?? []).slice(0, max);
      listed(ids.length);
      return ids;
    }),
    listLabelledIds: vi.fn(async (_t: string, label: "unread" | "starred") => {
      const ids = mailbox.filter((m) => (label === "unread" ? m.unread : m.isProtected)).map((m) => m.id);
      listed(ids.length);
      return new Set(ids);
    }),
    listRiskyAttachmentMessageIds: vi.fn(async () => {
      listed(0);
      return new Set<string>();
    }),
    applyLabelIds: (row: NormalizedMessageMetadata) => row,
    isSentLabels: () => false,
  };
  return { provider: provider as unknown as EmailProvider, meter };
}

/** A first build of a fresh index for `shape`. */
export async function simulateFirstBuild(shape: MailboxShape): Promise<QuotaReport> {
  const mailbox = buildMailbox(shape);
  const { provider, meter } = meteredGmail(mailbox, shape.sent);
  const store = createMemoryMailIndex();
  let unitsToFirstScreen = -1;
  await syncMailIndex(provider, "t", store, {
    windowDays: 365,
    cap: shape.messages,
    now: () => NOW,
    onQuickReady: () => {
      if (unitsToFirstScreen < 0) unitsToFirstScreen = meter.units;
    },
  });
  return {
    ...meter,
    minutesAtCeiling: meter.units / UNITS_PER_MINUTE,
    minutesPaced: meter.units / PACED_UNITS_PER_MINUTE,
    unitsToFirstScreen,
  };
}

export function formatReport(name: string, r: QuotaReport): string {
  return (
    `${name.padEnd(5)} units ${r.units.toLocaleString("en-US").padStart(9)}  gets ${r.gets.toLocaleString("en-US").padStart(7)}` +
    `  lists ${String(r.listCalls).padStart(5)}  first screen ${r.unitsToFirstScreen.toLocaleString("en-US")} u` +
    `  ${r.minutesAtCeiling.toFixed(0)} min at ceiling, ${r.minutesPaced.toFixed(0)} min paced`
  );
}
