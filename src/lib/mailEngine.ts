// One decision per email, read by every screen (docs/engine-design-2026-11-18.md).
// Step 0: wraps the rules the background runs today, in the same order: the
// scam hold, then labels, then Personal or the Screener. Pure and
// synchronous; computed on demand, never stored.
import { AddressSet } from "./addressIdentity";
import { bucketsFor, inboxFates, type LimitContext } from "./inboxTimeLimits";
import type { MessageKind } from "./messageKind";
import type { SenderSummary } from "./senderModel";
import { ALL_SORT_BUCKETS, type SortBucket, type SortOverride } from "./sortTaxonomy";
import { senderVerdict, type Verdict, type VerdictTier } from "./verdict";
import type { QuarantineReviewMap } from "./quarantineReview";
import { wroteToSet } from "./screener";
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
  };
}

/** The scam verdict on a sender: the one every screen and the hold use. */
export function riskOf(sender: SenderSummary, ctx: EngineContext): Verdict {
  const address = sender.address.toLowerCase();
  const known = ctx.wrote.has(address) || ctx.letIn.has(address);
  return senderVerdict(sender, { knownCorrespondent: known, review: ctx.review?.[sender.key], strict: ctx.strict });
}

/** Each of the sender's emails, decided. */
export function decide(sender: SenderSummary, ctx: EngineContext): Map<string, EmailDecision> {
  return decideWith(sender, limitContext(ctx));
}

/** decide() for many senders, building the address sets once. */
export function decideAll(senders: readonly SenderSummary[], ctx: EngineContext): Map<string, EmailDecision> {
  const lctx = limitContext(ctx);
  const out = new Map<string, EmailDecision>();
  for (const sender of senders) for (const [id, d] of decideWith(sender, lctx)) out.set(id, d);
  return out;
}

function decideWith(sender: SenderSummary, lctx: LimitContext): Map<string, EmailDecision> {
  const verdict = senderVerdict(sender, { knownCorrespondent: lctx.known.has(sender.address), review: lctx.review?.[sender.key], strict: lctx.strict });
  const place = new Map<string, Place>();
  // 1. The scam hold (starred mail never moves).
  for (const id of verdict.heldMessageIds) if (!sender.protectedMessageIds.includes(id)) place.set(id, "spam");
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
  return new Map(sender.messages.map((m) => [m.id, { kind: m.kind, place: place.get(m.id) ?? null, risk: verdict.tier }]));
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
  };
}

/** The sort label an email gets, or null (Personal, the Screener, Spam, the inbox). */
export function sortLabelOf(decision: EmailDecision | undefined): SortBucket | null {
  const place = decision?.place ?? null;
  return place === "personal" || place === "screener" || place === "spam" ? null : place;
}
