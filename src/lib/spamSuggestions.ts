// Turns the spam / malware domain lists into "you might want to delete these"
// suggestions for the Clean up tab. Pure and metadata-only: it looks at each
// sender's address domain and nothing else. It never deletes -- the dashboard
// shows the list with per-row checkboxes and a confirm step, and the user
// decides.
import { isBlockedDomain } from "./blocklist";
import { emptyProtectionContext, protectionDecision, type ProtectionContext } from "./protectionPolicy";
import { isSpamDomain } from "./spamList";
import type { SenderSummary } from "./senderModel";

export type SpamReason = "known-bad-domain" | "listed-spam-domain" | "provider-spam";

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
 * spam/throwaway list. Any sender with a starred/flagged/provider-marked-
 * personal/known-correspondent message is left out completely -- consistent
 * with every other bulk path in the app. Deliberately does NOT apply the
 * kind/subject/no-bulk-signal heuristics (contentHeuristics: false): a
 * domain already confirmed malicious is stronger evidence than those
 * headers, and phishing routinely impersonates receipts and omits proper
 * bulk headers -- applying those checks here would suppress the exact mail
 * this feature exists to catch. Sorted by message count, most first.
 */
export function suggestSpamSenders(
  senders: SenderSummary[],
  matchers: SpamMatchers = DEFAULT_MATCHERS,
  ctx: ProtectionContext = emptyProtectionContext(),
): SpamSuggestion[] {
  const out: SpamSuggestion[] = [];
  for (const sender of senders) {
    if (
      sender.messages.some(
        (m) => protectionDecision(m, sender.address, ctx, { contentHeuristics: false }).protected,
      )
    ) {
      continue;
    }
    const domain = domainOf(sender.address);
    if (!domain) continue;
    const blocked = matchers.isBlocked(domain);
    const spam = blocked ? false : matchers.isSpam(domain);
    // Every message from them that the provider judged was spam to it (the
    // user moved some back to the inbox, or a rule kept them there).
    const providerSpam = !blocked && !spam && sender.messages.length > 0 && sender.messages.every((m) => m.providerSpam);
    if (!blocked && !spam && !providerSpam) continue;
    out.push({
      sender,
      domain,
      reason: blocked ? "known-bad-domain" : spam ? "listed-spam-domain" : "provider-spam",
      messageCount: sender.messageIds.length,
    });
  }
  return out.sort((a, b) => b.messageCount - a.messageCount);
}

export function reasonLabel(reason: SpamReason): string {
  if (reason === "known-bad-domain") return "known-bad domain";
  if (reason === "provider-spam") return "Microsoft's filter marked it spam";
  return "spam / throwaway domain";
}
