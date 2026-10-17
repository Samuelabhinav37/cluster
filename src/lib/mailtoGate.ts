// Decides whether Cluster may offer to send a mailto unsubscribe for the
// user. Every check must pass; a failure gives a reason and the item goes to
// "Needs you", where the user can open the sender's page or write the email
// themselves. Unsubscribing from spam confirms the address is live, and a
// crafted header could make the user mail a stranger, so the gate is strict:
// the header must be signed by a sender the provider authenticated, and the
// address must belong to that sender or a known mailing service.
import espData from "./data/espUnsubscribeDomains.json";
import { parseAuthenticationResults, parseAuthResultEntries, selectTrustedAuthenticationResults } from "./emailAuth";
import type { UnsubscribeDetails } from "./providers/emailProvider";
import { registrableDomain } from "./registrableDomain";
import { passingSignersCovering, type MailtoParts } from "./unsubscribe";

const ESP_DOMAINS: ReadonlySet<string> = new Set(espData.domains);

export type MailtoRefusal =
  | "no-mailto"
  | "unsafe-mailto"
  | "in-spam"
  | "auth-failed"
  | "unsigned-header"
  | "unrelated-address"
  | "own-address";

export type MailtoGateResult = { ok: true; parts: MailtoParts } | { ok: false; reason: MailtoRefusal };

export const MAILTO_REFUSAL_TEXT: Record<MailtoRefusal, string> = {
  "no-mailto": "They don't offer an unsubscribe email.",
  "unsafe-mailto": "Their unsubscribe email adds other recipients or fields.",
  "in-spam": "It's in Spam. Replying to spam tells the sender your address works.",
  "auth-failed": "Their mail failed the sender checks.",
  "unsigned-header": "Their unsubscribe instructions aren't signed by the sender.",
  "unrelated-address": "The unsubscribe address doesn't belong to the sender.",
  "own-address": "The unsubscribe address is at your own domain.",
};

function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : address.slice(at + 1).toLowerCase();
}

/**
 * `ownAddresses` are the account's addresses (send-as included); a mailto to
 * any of them, or to their domain unless it is a shared free-mail domain, is
 * refused.
 */
export function checkMailtoUnsubscribe(
  provider: "gmail" | "outlook",
  details: UnsubscribeDetails,
  ownAddresses: readonly string[],
  isFreeMail: (domain: string) => boolean,
): MailtoGateResult {
  if (!details.unsubscribe.mailto) return { ok: false, reason: "no-mailto" };
  const parts = details.unsubscribe.mailtoParts;
  if (!parts) return { ok: false, reason: "unsafe-mailto" };
  if (details.inSpam) return { ok: false, reason: "in-spam" };

  const trusted = selectTrustedAuthenticationResults(provider, details.authenticationResults);
  const verdicts = parseAuthenticationResults(trusted);
  if (verdicts.dmarc === "fail" || (verdicts.dkim === "fail" && verdicts.spf === "fail")) {
    return { ok: false, reason: "auth-failed" };
  }

  const signers = passingSignersCovering(
    {
      provider,
      fromAddress: details.fromAddress,
      authenticationResults: details.authenticationResults,
      dkimSignatures: details.dkimSignatures,
    },
    ["list-unsubscribe"],
  );
  if (signers.length === 0) return { ok: false, reason: "unsigned-header" };

  const target = domainOf(parts.to);
  const targetRoot = registrableDomain(target);
  const own = new Set(ownAddresses.map((a) => a.toLowerCase()));
  if (own.has(parts.to)) return { ok: false, reason: "own-address" };
  for (const address of own) {
    const domain = domainOf(address);
    if (domain && !isFreeMail(domain) && registrableDomain(domain) === targetRoot) {
      return { ok: false, reason: "own-address" };
    }
  }

  const related = new Set<string>([registrableDomain(domainOf(details.fromAddress)), ...signers.map(registrableDomain)]);
  // The envelope domain counts only as the provider saw it pass SPF.
  for (const entry of parseAuthResultEntries(trusted)) {
    const mailFrom = entry.properties["smtp.mailfrom"];
    if (entry.method === "spf" && entry.result === "pass" && mailFrom) {
      related.add(registrableDomain(domainOf(mailFrom) || mailFrom.toLowerCase()));
    }
  }
  if (!related.has(targetRoot) && !ESP_DOMAINS.has(targetRoot)) return { ok: false, reason: "unrelated-address" };

  return { ok: true, parts };
}
