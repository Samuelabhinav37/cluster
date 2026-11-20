// One decision per email, read by every screen (docs/engine-design-2026-11-18.md).
// Step 0: wraps the rules the background runs today, in the same order: the
// scam hold, then labels, then Personal or the Screener. Pure and
// synchronous; computed on demand, never stored.
import { AddressSet } from "./addressIdentity";
import { failsSenderChecks } from "./emailAuth";
import { bucketsFor, inboxFates, type LimitContext } from "./inboxTimeLimits";
import type { MessageKind } from "./messageKind";
import type { SenderSummary } from "./senderModel";
import { ALL_SORT_BUCKETS, type SortBucket, type SortOverride } from "./sortTaxonomy";
import { senderVerdict, type Verdict, type VerdictTier } from "./verdict";
import type { QuarantineReviewMap } from "./quarantineReview";
import { wroteToSet } from "./screener";
import { unsureLabels } from "./correctionRate";
import type { ClusterSettings } from "./settingsStore";

/** Where an email goes. null: it stays in the inbox. */
export type Place = SortBucket | "personal" | "screener" | "spam" | null;

export interface EmailDecision {
  kind: MessageKind;
  place: Place;
  risk: VerdictTier;
}

export interface EngineContext {
  /** People you've written to. */
  wrote: ReadonlySet<string>;
  /** Senders let in from the Screener: not screened, still labelled. */
  letIn: ReadonlySet<string>;
  overrides: Record<string, SortOverride>;
  /** "Hold people too": strangers on free mail wait in the Screener. Default on. */
  holdPeople?: boolean;
  /** The user's "not a scam" answers, by sender key. */
  review?: QuarantineReviewMap;
  /** Security's Strict switch: mail that only earns a warning is held too. */
  strict?: boolean;
  // The switches that decide whether anything really moves. Left out, each
  // acts as on (holdAuthFails as off), which is what the background does with
  // every switch on. engineContext() always sets all four from settings.
  /** Sorting ("Tidy for me", autoSort.timeLimitsEnabled). Off: no Screener; labels stay as a preview. */
  sorting?: boolean;
  /** The Screener holds mail that fits no label (autoSort.holdUnsorted). */
  holdUnsorted?: boolean;
  /** The scam hold moves held mail to Spam (autoQuarantineHighRisk). */
  holdScams?: boolean;
  /** Mail from strangers failing DMARC, or SPF and DKIM, goes to Spam (securityRules.holdAuthFails). */
  holdAuthFails?: boolean;
  /** Labels too often wrong for you (unsureLabels): their mail goes to the Screener as "Not sure". */
  unsure?: ReadonlySet<SortBucket>;
}

const EVERY_LABEL = ALL_SORT_BUCKETS.map((bucket) => ({ bucket, labelName: bucket, hours: 0 }));

function limitContext(ctx: EngineContext): LimitContext {
  return {
    limits: EVERY_LABEL,
    known: new AddressSet([...ctx.wrote, ...ctx.letIn]),
    wrote: new AddressSet([...ctx.wrote]),
    overrides: ctx.overrides,
    now: 0,
    holdPeople: ctx.holdPeople,
    review: ctx.review,
    strict: ctx.strict,
    unsure: ctx.unsure,
  };
}

/** The scam verdict on a sender: the one every screen and the hold use. */
export function riskOf(sender: SenderSummary, ctx: EngineContext): Verdict {
  const address = sender.address.toLowerCase();
  const known = ctx.wrote.has(address) || ctx.letIn.has(address);
  return senderVerdict(sender, { knownCorrespondent: known, review: ctx.review?.[sender.key], strict: ctx.strict });
}

/** The sender's emails the scam hold moves to Spam: the ones the verdict
 * holds (when the hold is on), and a stranger's mail that fails the sender
 * checks (when that rule is on). Starred and protected mail never moves.
 * The background's hold (runQuarantine) moves exactly these. */
export function heldIdsOf(sender: SenderSummary, ctx: EngineContext): string[] {
  return heldWith(sender, riskOf(sender, ctx), ctx.wrote.has(sender.address.toLowerCase()) || ctx.letIn.has(sender.address.toLowerCase()), ctx);
}

function heldWith(sender: SenderSummary, verdict: Verdict, known: boolean, ctx: EngineContext): string[] {
  const ids = [
    ...(ctx.holdScams === false ? [] : verdict.heldMessageIds),
    ...(ctx.holdAuthFails && !known && failsSenderChecks(sender) ? sender.messageIds : []),
  ];
  return [...new Set(ids)].filter((id) => !sender.protectedMessageIds.includes(id));
}

/** Each of the sender's emails, decided. */
export function decide(sender: SenderSummary, ctx: EngineContext): Map<string, EmailDecision> {
  return decideWith(sender, limitContext(ctx), ctx);
}

/** decide() for many senders, building the address sets once. */
export function decideAll(senders: readonly SenderSummary[], ctx: EngineContext): Map<string, EmailDecision> {
  const lctx = limitContext(ctx);
  const out = new Map<string, EmailDecision>();
  for (const sender of senders) for (const [id, d] of decideWith(sender, lctx, ctx)) out.set(id, d);
  return out;
}

function decideWith(sender: SenderSummary, lctx: LimitContext, ctx: EngineContext): Map<string, EmailDecision> {
  const known = lctx.known.has(sender.address);
  const verdict = senderVerdict(sender, { knownCorrespondent: known, review: lctx.review?.[sender.key], strict: lctx.strict });
  const place = new Map<string, Place>();
  // 1. The scam hold (starred mail never moves).
  for (const id of heldWith(sender, verdict, known, ctx)) place.set(id, "spam");
  const rest = () => ({ ...sender, messages: sender.messages.filter((m) => !place.has(m.id)) });
  // 2. Labels.
  for (const [bucket, ids] of bucketsFor([rest()], lctx)) for (const id of ids) place.set(id, bucket);
  // 3. Personal or the Screener, for what's left.
  const left = rest();
  if (left.messages.length > 0) {
    for (const [id, fate] of inboxFates(left, lctx)) {
      if (fate === "personal") place.set(id, "personal");
      else if (fate === "risky" || fate === "screener") place.set(id, "screener");
    }
  }
  // The holds count only when they really run: the Screener needs sorting
  // and its own switch, so with either off its mail stays in the inbox.
  // Labels and Personal stay as they are: with sorting off they're the
  // preview the Labels page and Sort my inbox show, not a claim mail moved.
  const screenerRuns = ctx.sorting !== false && ctx.holdUnsorted !== false;
  const real = (p: Place | undefined): Place => (p === "screener" && !screenerRuns ? null : (p ?? null));
  return new Map(sender.messages.map((m) => [m.id, { kind: m.kind, place: real(place.get(m.id)), risk: verdict.tier }]));
}

/** The engine's context from the user's settings. */
export function engineContext(settings: ClusterSettings): EngineContext {
  return {
    wrote: wroteToSet(settings),
    letIn: new AddressSet(settings.screenerAllowlist),
    overrides: settings.sortOverrides,
    holdPeople: settings.screenerHoldPeople,
    review: settings.quarantineReview,
    strict: settings.securityRules.strict,
    sorting: settings.autoSort.timeLimitsEnabled,
    holdUnsorted: settings.autoSort.holdUnsorted,
    holdScams: settings.autoQuarantineHighRisk,
    holdAuthFails: settings.securityRules.holdAuthFails,
    unsure: unsureLabels(settings.autoSort.fixesByLabel, settings.autoSort.labelledByLabel, Date.now()) as Set<SortBucket>,
  };
}

/** The sort label an email gets, or null (Personal, the Screener, Spam, the inbox). */
export function sortLabelOf(decision: EmailDecision | undefined): SortBucket | null {
  const place = decision?.place ?? null;
  return place === "personal" || place === "screener" || place === "spam" ? null : place;
}
