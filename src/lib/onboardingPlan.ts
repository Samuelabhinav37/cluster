// What the first-run setup's answers turn into (research/2026-10-29-onboarding.md).
// Pure: the setup screen shows `lines` as the plan, and applies the rest on Start.
import type { SortBucket } from "./sortTaxonomy";

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
  lines: { text: string; sub?: string }[];
  /** Organize's "where it goes and when" menus, in hours; null stays in the inbox. */
  hours: Partial<Record<SortBucket, number | null>>;
  holdScams: boolean;
  simpleMode: boolean;
  /** Turn on "Keep doing this for new mail" (Gmail filters) on Start. */
  tidy: boolean;
  persona: "calm" | "business" | "safe" | "busy";
}

const DAY = 24;

/** Question 1 pre-ticks the later screens, like Apple Music's artists from your genres. */
export const SEEDS: Record<Who, Pick<OnboardingAnswers, "keep" | "hands">> = {
  me: { keep: ["people", "bank", "receipts"] },
  business: { keep: ["people", "bank", "work", "receipts"], hands: "ask" },
  safe: { keep: ["people", "bank"], hands: "ask" },
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

// Keep stays, Later waits a week, Let go leaves soon.
function hoursFor(choice: PracticeChoice | undefined, soon: number): number | null | undefined {
  if (choice === "keep") return null;
  if (choice === "later") return 7 * DAY;
  if (choice === "trash") return soon;
  return undefined;
}

export function buildOnboardingPlan(a: OnboardingAnswers): OnboardingPlan {
  const lines: OnboardingPlan["lines"] = [];
  const hours: OnboardingPlan["hours"] = {};
  const set = (bucket: SortBucket, value: number | null | undefined) => {
    if (value !== undefined) hours[bucket] = value;
  };

  set("promotions", hoursFor(a.sorted.promo, DAY));
  if (a.sorted.promo === "trash") {
    set("otp", DAY);
    lines.push({ text: "Promotions leave your inbox after a day", sub: "They stay in Gmail's Promotions" });
  } else if (a.sorted.promo === "later") lines.push({ text: "Promotions leave your inbox after a week" });

  set("newsletter", hoursFor(a.sorted.news, 3 * DAY));
  if (a.sorted.news === "trash")
    lines.push({ text: "Newsletters leave after 3 days", sub: "Stop the ones you skip in Stop mail" });
  else if (a.sorted.news === "later") lines.push({ text: "Newsletters leave after a week" });

  set("social", hoursFor(a.sorted.social, DAY));
  if (a.sorted.social === "trash") lines.push({ text: "App and social alerts leave after a day" });
  else if (a.sorted.social === "later") lines.push({ text: "App and social alerts leave after a week" });

  // Sorting the fake at all means scams matter; keeping it means they matter most.
  const holdScams = a.who === "safe" || a.who === "business" || a.sorted.scam !== undefined;
  if (a.sorted.scam === "keep")
    lines.push({
      text: "That Account Team email was fake",
      sub: "Cluster will hold mail like it and say why",
    });
  else if (holdScams)
    lines.push({ text: "Likely scams are held out of your inbox", sub: "Each one says why" });

  // What always stays wins over anything above. Bank mail never leaves on a practice click.
  const keep = new Set<KeepKind>(["people", ...a.keep]);
  if (keep.has("bank") || a.sorted.bank === "keep") set("finance", null);
  if (keep.has("work")) set("productivity", null);
  if (keep.has("travel")) set("travel", null);
  if (keep.has("receipts")) {
    set("receipt", null);
    set("shipping", null);
  }
  lines.push({ text: `Always stays: ${[...keep].map((k) => KEEP_NAMES[k]).join(", ")}` });

  const tidy = a.hands === "tidy";
  lines.push(
    tidy
      ? { text: "New mail sorts itself", sub: "Undo anything in Activity" }
      : { text: "Nothing moves until you press Sort my inbox" },
  );

  const simpleMode = a.who === "safe";
  if (simpleMode)
    lines.push({ text: "Simple mode: bigger text, fewer screens", sub: "Turn it off in Settings" });

  return { lines, hours, holdScams, simpleMode, tidy, persona: PERSONA_OF[a.who ?? "me"] };
}
