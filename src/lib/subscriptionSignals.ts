import { domainOf } from "./domainGrouping";
import type { SenderSummary } from "./senderModel";

// A distinct concern from domainCategories.ts's topical buckets (shopping,
// travel, ...): this list is specifically "known recurring-billing
// services", so a domain can legitimately appear in both files. Hand-curated
// for the same reason domainCategories.ts is -- no free/reliable
// domain->subscription-service dataset fits this project's metadata-only,
// no-server-calls stance.
const SUBSCRIPTION_DOMAINS = [
  // Streaming / media
  "crunchyroll.com",
  "deezer.com",
  "disneyplus.com",
  "espn.com",
  "hbomax.com",
  "hulu.com",
  "max.com",
  "netflix.com",
  "paramountplus.com",
  "patreon.com",
  "peacocktv.com",
  "spotify.com",
  "substack.com",
  "youtube.com",
  // Big-tech bundles (also cover cloud storage / app-store subscriptions)
  "amazon.com",
  "apple.com",
  "google.com",
  "icloud.com",
  // Productivity / AI / creative tools
  "adobe.com",
  "anthropic.com",
  "canva.com",
  "chatgpt.com",
  "dropbox.com",
  "github.com",
  "grammarly.com",
  "notion.so",
  "openai.com",
  "squarespace.com",
  // Security / VPN
  "expressvpn.com",
  "nordvpn.com",
  "onepassword.com",
  "surfshark.com",
  // Fitness / wellness / learning
  "calm.com",
  "duolingo.com",
  "headspace.com",
  "masterclass.com",
  "peloton.com",
  // News
  "nytimes.com",
  "washingtonpost.com",
  // Gaming / social
  "discord.com",
  "linkedin.com",
  "playstation.com",
  "xbox.com",
];

const SUBSCRIPTION_DOMAIN_SET = new Set(SUBSCRIPTION_DOMAINS);

// Same normalize-then-parent-walk approach as domainCategories.categorizeDomain,
// duplicated rather than shared because the two lists answer different
// questions (topical bucket vs. "is this a paid-subscription sender") and
// have no other coupling.
function isSubscriptionDomain(domain: string): boolean {
  const normalized = domain.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!normalized) return false;
  if (SUBSCRIPTION_DOMAIN_SET.has(normalized)) return true;
  const labels = normalized.split(".");
  for (let i = 1; i < labels.length - 1; i++) {
    if (SUBSCRIPTION_DOMAIN_SET.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

export type SubscriptionSignalKind = "trial-ending" | "renewal" | "domain-match";

export const SUBSCRIPTION_SIGNAL_LABELS: Record<SubscriptionSignalKind, string> = {
  "trial-ending": "Trial ending",
  renewal: "Renews",
  "domain-match": "Seen",
};

// Rank for sorting: most actionable/urgent first.
const SIGNAL_RANK: Record<SubscriptionSignalKind, number> = {
  "trial-ending": 0,
  renewal: 1,
  "domain-match": 2,
};

const TRIAL_ENDING_RE =
  /\b(trial ends|trial is ending|trial expir(?:es|ing)|your free trial)\b/i;
const RENEWAL_RE =
  /\b(renews on|auto[- ]renew(?:s|al)?|subscription (?:has been )?renewed|payment for your subscription|your subscription renews)\b/i;
// "Welcome to your subscription"-style confirmation language is deliberately
// NOT its own regex/branch: alone it's too generic to trust (could just as
// easily be a free newsletter's "you're subscribed"), and it only ever
// matters alongside mail from a sender whose domain is already in
// SUBSCRIPTION_DOMAINS -- which reports "domain-match" regardless of subject
// wording. The useful boundary to test is that this kind of weak phrase,
// from a sender NOT in the curated list, must NOT flag anything (see
// subscriptionSignals.test.ts).

/**
 * Subject-only heuristic, same spirit as messageKind.classifyMessageKind:
 * trial/renewal language is a strong enough signal to flag on its own even
 * for a sender we don't otherwise recognize; a generic "you're subscribed"
 * is not, and only ever counts by way of the sender's domain already being
 * a known subscription service (domain-match).
 */
export function detectSubscriptionSignal(subject: string, domain: string): SubscriptionSignalKind | null {
  const s = subject || "";
  if (TRIAL_ENDING_RE.test(s)) return "trial-ending";
  if (RENEWAL_RE.test(s)) return "renewal";
  if (isSubscriptionDomain(domain)) return "domain-match";
  return null;
}

export interface SubscriptionCandidate {
  sender: SenderSummary;
  signal: SubscriptionSignalKind;
  lastSeenAt: number;
}

/**
 * Pure aggregation over an existing scan's SenderSummary[] -- no new fetch,
 * no new OAuth scope, nothing persisted. Recomputed on every render, same as
 * subscriptionsTab.ts's dominantKind().
 */
export function buildSubscriptionCandidates(senders: SenderSummary[]): SubscriptionCandidate[] {
  const candidates: SubscriptionCandidate[] = [];
  for (const sender of senders) {
    const domain = domainOf(sender.address);
    let best: SubscriptionSignalKind | null = null;
    let lastSeenAt = 0;
    for (const message of sender.messages) {
      const signal = detectSubscriptionSignal(message.subject ?? "", domain);
      if (!signal) continue;
      if (best === null || SIGNAL_RANK[signal] < SIGNAL_RANK[best]) best = signal;
      if (message.receivedAt > lastSeenAt) lastSeenAt = message.receivedAt;
    }
    if (best) candidates.push({ sender, signal: best, lastSeenAt });
  }
  return candidates.sort(
    (a, b) => SIGNAL_RANK[a.signal] - SIGNAL_RANK[b.signal] || b.lastSeenAt - a.lastSeenAt,
  );
}
