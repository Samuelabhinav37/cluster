// Per-sender history kept on the device: how familiar a sender is, and which
// domains normally sign their mail (DKIM d=) and receive replies (Reply-To).
//
// It exists for the attacks that pass every authentication check: a supplier
// whose account was taken over, or a thread hijacked to say "our bank details
// changed". Those usually show up as a familiar sender suddenly signed by a
// different domain, or asking for replies somewhere new. identityChanges()
// reports exactly that, and only for senders with real history, so the first
// scan never floods the user with warnings.
//
// A new domain doesn't become "normal" the moment it's seen. It waits in
// `pending` and is promoted only when it shows up again at least
// PROMOTE_AFTER_MS later, so a scammer's first email can't teach the baseline
// and silence its own warning. Pure functions only; storage lives in
// senderLedgerStore.ts.
import { registrableDomain } from "./registrableDomain";
import type { SenderSummary } from "./senderModel";
import type { ThreatSignal } from "./threatSignals";

export interface DomainBaseline {
  /** Domains seen as normal for this sender, most recent last. */
  known: string[];
  /** Domain → receivedAt of the first message that used it, awaiting promotion. */
  pending: Record<string, number>;
}

export interface SenderLedgerEntry {
  firstSeen: number;
  /** receivedAt of the newest message counted so far; also the counting watermark. */
  lastSeen: number;
  messages: number;
  /** Distinct months with mail, as yyyymm numbers, newest last. */
  months: number[];
  dkim: DomainBaseline;
  replyTo: DomainBaseline;
}

/** Keyed by SenderSummary.key (`${provider}:${address}`). */
export type SenderLedger = Record<string, SenderLedgerEntry>;

const DAY_MS = 24 * 60 * 60 * 1000;
export const PROMOTE_AFTER_MS = 7 * DAY_MS;
const FAMILIAR_MIN_MESSAGES = 3;
const FAMILIAR_MIN_SPAN_MS = 30 * DAY_MS;
const MAX_KNOWN = 5;
const MAX_PENDING = 5;
const MAX_MONTHS = 24;

/** Enough history that a change in identity means something. */
export function isFamiliar(entry: SenderLedgerEntry | undefined): entry is SenderLedgerEntry {
  return Boolean(
    entry && entry.messages >= FAMILIAR_MIN_MESSAGES && entry.lastSeen - entry.firstSeen >= FAMILIAR_MIN_SPAN_MS,
  );
}

function monthOf(ms: number): number {
  const d = new Date(ms);
  return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1;
}

function emptyBaseline(): DomainBaseline {
  return { known: [], pending: {} };
}

function senderDomain(sender: SenderSummary): string {
  return registrableDomain(sender.address.slice(sender.address.lastIndexOf("@") + 1));
}

/** The Reply-To domain of a message, unless it's the sender's own domain. */
function foreignReplyTo(replyToDomain: string | undefined, fromDomain: string): string | null {
  return replyToDomain && replyToDomain !== fromDomain ? replyToDomain : null;
}

function learn(baseline: DomainBaseline, domain: string, receivedAt: number, bootstrapping: boolean): DomainBaseline {
  if (baseline.known.includes(domain)) {
    // Move to the end so the cap drops the least recently used domain.
    return { ...baseline, known: [...baseline.known.filter((d) => d !== domain), domain] };
  }
  const firstPending = baseline.pending[domain];
  const promote = bootstrapping || (firstPending !== undefined && receivedAt - firstPending >= PROMOTE_AFTER_MS);
  if (promote) {
    const pending = { ...baseline.pending };
    delete pending[domain];
    return { known: [...baseline.known, domain].slice(-MAX_KNOWN), pending };
  }
  if (firstPending !== undefined && firstPending <= receivedAt) return baseline;
  const pending = { ...baseline.pending, [domain]: receivedAt };
  const entries = Object.entries(pending).sort(([, a], [, b]) => a - b).slice(-MAX_PENDING);
  return { ...baseline, pending: Object.fromEntries(entries) };
}

/**
 * The ledger after seeing `senders`' messages. Counts only messages newer
 * than each entry's watermark, so re-scanning an overlapping window doesn't
 * double count. A sender seen for the first time is "bootstrapping": the
 * domains on its first batch of mail become its baseline directly, since
 * there's nothing earlier to compare them with.
 */
export function observeSenders(ledger: SenderLedger, senders: SenderSummary[]): SenderLedger {
  const next: SenderLedger = { ...ledger };
  for (const sender of senders) {
    const previous = ledger[sender.key];
    const bootstrapping = !previous || previous.messages === 0;
    const fromDomain = senderDomain(sender);
    let entry: SenderLedgerEntry = previous
      ? { ...previous, months: [...previous.months] }
      : { firstSeen: Infinity, lastSeen: 0, messages: 0, months: [], dkim: emptyBaseline(), replyTo: emptyBaseline() };
    const fresh = sender.messages
      .filter((m) => m.receivedAt > (previous?.lastSeen ?? 0))
      .sort((a, b) => a.receivedAt - b.receivedAt);
    // Baselines look at every message in the window, not only fresh ones, so
    // a pending domain seen again on an older message still gets promoted.
    for (const message of [...sender.messages].sort((a, b) => a.receivedAt - b.receivedAt)) {
      for (const domain of message.dkimDomains ?? []) {
        entry = { ...entry, dkim: learn(entry.dkim, domain, message.receivedAt, bootstrapping) };
      }
      const replyTo = foreignReplyTo(message.replyToDomain, fromDomain);
      if (replyTo) entry = { ...entry, replyTo: learn(entry.replyTo, replyTo, message.receivedAt, bootstrapping) };
    }
    for (const message of fresh) {
      entry.messages += 1;
      entry.firstSeen = Math.min(entry.firstSeen, message.receivedAt);
      entry.lastSeen = Math.max(entry.lastSeen, message.receivedAt);
      const month = monthOf(message.receivedAt);
      if (!entry.months.includes(month)) entry.months = [...entry.months, month].sort((a, b) => a - b).slice(-MAX_MONTHS);
    }
    if (entry.messages > 0) next[sender.key] = entry;
  }
  return next;
}

/**
 * "identity-change" signals for a sender whose mail now comes signed by, or
 * asks for replies at, a domain its history doesn't have. Checked against
 * the ledger as it was *before* this scan. A message with no DKIM pass at all
 * isn't a change here (failed authentication is its own signal), and a
 * familiar sender that never signed before isn't flagged for starting to.
 */
export function identityChanges(entry: SenderLedgerEntry | undefined, sender: SenderSummary): ThreatSignal[] {
  if (!isFamiliar(entry)) return [];
  const fromDomain = senderDomain(sender);
  const found = new Set<string>();
  for (const message of sender.messages) {
    const dkim = message.dkimDomains ?? [];
    if (entry.dkim.known.length > 0 && dkim.length > 0 && !dkim.some((d) => entry.dkim.known.includes(d))) {
      found.add(dkim[0]);
    }
    const replyTo = foreignReplyTo(message.replyToDomain, fromDomain);
    if (replyTo && !entry.replyTo.known.includes(replyTo)) found.add(replyTo);
  }
  return [...found].map((domain) => ({ kind: "identity-change", brand: domain, confidence: "medium" }));
}
