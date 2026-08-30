// Turns the spam / malware domain lists into "you might want to delete these"
// suggestions for the Clean up tab. Pure and metadata-only: it looks at each
// sender's address domain and nothing else. It never deletes -- the dashboard
// shows the list with per-row checkboxes and a confirm step, and the user
// decides.
import { isBlockedDomain } from "./blocklist";
import { isSpamDomain } from "./spamList";
import type { SenderSummary } from "./senderModel";

export type SpamReason = "known-bad-domain" | "listed-spam-domain";

export interface SpamSuggestion {
  sender: SenderSummary;
  domain: string;
  reason: SpamReason;
  /** Messages that would be trashed -- the whole sender, since senders with any
   * starred/flagged message are excluded entirely. */
  messageCount: number;
}

export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  if (at === -1) return "";
  return address
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
}

export interface SpamMatchers {
  isBlocked: (domain: string) => boolean;
  isSpam: (domain: string) => boolean;
}

const DEFAULT_MATCHERS: SpamMatchers = { isBlocked: isBlockedDomain, isSpam: isSpamDomain };

/**
 * Senders whose address domain is on the malware/phishing blocklist or the
 * spam/throwaway list. Any sender with a starred or flagged message is left
 * out completely -- consistent with every other bulk path in the app. Sorted
 * by message count, most first.
 */
export function suggestSpamSenders(
  senders: SenderSummary[],
  matchers: SpamMatchers = DEFAULT_MATCHERS,
): SpamSuggestion[] {
  const out: SpamSuggestion[] = [];
  for (const sender of senders) {
    if (sender.protectedMessageIds.length > 0) continue;
    const domain = domainOf(sender.address);
    if (!domain) continue;
    const blocked = matchers.isBlocked(domain);
    const spam = blocked ? false : matchers.isSpam(domain);
    if (!blocked && !spam) continue;
    out.push({
      sender,
      domain,
      reason: blocked ? "known-bad-domain" : "listed-spam-domain",
      messageCount: sender.messageIds.length,
    });
  }
  return out.sort((a, b) => b.messageCount - a.messageCount);
}

export function reasonLabel(reason: SpamReason): string {
  return reason === "known-bad-domain" ? "known-bad domain" : "spam / throwaway domain";
}
