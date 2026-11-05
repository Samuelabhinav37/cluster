// What the first-run setup's answers turn into (research/2026-10-29-onboarding.md).
// Pure: the setup screen shows `lines` as the plan, and applies the rest on Start.
import { ALL_SORT_BUCKETS, SKIP_INBOX_BUCKETS, type SortBucket } from "./sortTaxonomy";

export type Who = "me" | "business" | "safe" | "busy";
/** The practice inbox: one made-up email of each kind. */
export type PracticeKind = "promo" | "news" | "scam" | "bank" | "social";
export type PracticeChoice = "keep" | "later" | "trash";
export type KeepKind = "bank" | "work" | "travel" | "receipts" | "people";

export interface OnboardingAnswers {
  who?: Who;
  sorted: Partial<Record<PracticeKind, PracticeChoice>>;
  keep: KeepKind[];
  hands?: "ask" | "tidy";
}

export interface OnboardingPlan {
  /** `icon` names a Lucide icon in homeDashboard's set. */
  lines: { text: string; sub?: string; icon: string }[];
  /** Organize's "where it goes and when" menus, in hours; null stays in the inbox. */
  hours: Partial<Record<SortBucket, number | null>>;
  holdScams: boolean;
  /** Turn every Organize label on (Gmail filters for new mail) on Start. */
  tidy: boolean;
  persona: "calm" | "business" | "safe" | "busy";
}

/** Hours mail stays in the inbox before it goes to its label, unless kept. */
export const FOCUS_HOURS = 3;

/** Question 1 pre-ticks the later screens, like Apple Music's artists from your genres. */
export const SEEDS: Record<Who, Pick<OnboardingAnswers, "keep" | "hands">> = {
  me: { keep: ["people", "bank", "receipts"], hands: "tidy" },
  business: { keep: ["people", "bank", "work", "receipts"], hands: "tidy" },
  safe: { keep: ["people", "bank"], hands: "tidy" },
  busy: { keep: ["people", "work"], hands: "tidy" },
};

export const PERSONA_OF: Record<Who, OnboardingPlan["persona"]> = {
  me: "calm",
  business: "business",
  safe: "safe",
  busy: "busy",
};

const KEEP_NAMES: Record<KeepKind, string> = {
  bank: "bank and bills",
  work: "work",
  travel: "travel",
  receipts: "receipts and orders",
  people: "people you write to",
};

const KEEP_BUCKETS: Record<KeepKind, SortBucket[]> = {
  bank: ["finance"],
  work: ["productivity"],
  travel: ["travel"],
  receipts: ["receipt", "shipping"],
  people: [],
};

/**
 * Setup's defaults: Promotions and Newsletters skip the inbox (a Gmail filter
 * does it, so phones see it too), what the user keeps stays, everything else
 * leaves after FOCUS_HOURS, and likely scams are held. "Ask me first" saves
 * the same times but moves nothing.
 */
export function buildOnboardingPlan(a: OnboardingAnswers): OnboardingPlan {
  const keep = new Set<KeepKind>(["people", ...a.keep]);
  // Sign-in and password notices always stay: they may need action now.
  const stays = new Set<SortBucket>(["accounts", ...[...keep].flatMap((k) => KEEP_BUCKETS[k])]);
  const hours: OnboardingPlan["hours"] = {};
  for (const b of ALL_SORT_BUCKETS) hours[b] = stays.has(b) ? null : SKIP_INBOX_BUCKETS.includes(b) ? 0 : FOCUS_HOURS;

  const tidy = a.hands !== "ask";
  const lines: OnboardingPlan["lines"] = tidy
    ? [
        { icon: "tag", text: "Promotions and newsletters skip your inbox", sub: "They wait in their labels" },
        { icon: "clock", text: `Other mail goes to its label after ${FOCUS_HOURS} hours` },
        { icon: "shield-check", text: "Likely scams are held out of your inbox", sub: "Each one says why" },
      ]
    : [];
  lines.push({ icon: "inbox", text: `Always stays: ${[...keep].map((k) => KEEP_NAMES[k]).join(", ")}` });
  lines.push(
    tidy
      ? { icon: "sparkles", text: "New mail sorts itself", sub: "Undo anything in Activity" }
      : { icon: "eye", text: "Nothing moves until you press Sort my inbox" },
  );

  return { lines, hours, holdScams: tidy, tidy, persona: PERSONA_OF[a.who ?? "me"] };
}
