// One wording from many strangers. Scam runs (sextortion, callback-phishing
// "renewals") send one subject from many throwaway free-mail addresses; Talos
// counted about four messages per bitcoin wallet, Sophos tens of thousands of
// addresses in five months. No single email shows it, but the mailbox does.
// Yahoo groups machine mail the same way, by sender and subject template
// (Gamzu, Maarek et al., WWW 2015).
//
// Friends rarely send the very same long subject from separate addresses, so
// only subjects of six words or more, from three or more unknown free-mail
// senders with one or two messages each, count, and only from senders whose
// name isn't in their address: a person's free-mail address is usually made
// from their name (Lena Khan, lena.khan@), a run's sender is "Anonymous" or
// "Billing Department". Alone it is a warning (the
// Screener); with a lure subject or another kind of evidence it holds.
import { domainOf } from "./domainGrouping";
import { isFreeMailDomain } from "./freeMail";
import { cleanText } from "./normalize";
import type { SenderSummary } from "./senderModel";

const MIN_WORDS = 6;
const MIN_SENDERS = 3;

/** A subject with its changing parts (numbers, amounts, times) masked. */
export function subjectTemplate(subject: string): string {
  return cleanText(subject).toLowerCase().replace(/\$?\d[\d.,:]*/g, "#").replace(/\s+/g, " ").trim();
}

/** A word of three letters or more from the name appears in the address. */
export function nameInAddress(name: string, address: string): boolean {
  const local = address.slice(0, address.indexOf("@")).toLowerCase().replace(/[^a-z]/g, "");
  return cleanText(name).toLowerCase().split(/[^a-z]+/).some((w) => w.length >= 3 && local.includes(w));
}

/** Adds a "campaign" signal to each stranger sending a subject that at least
 * two other strangers send too. Returns how many senders were marked. */
export function markCampaigns(senders: SenderSummary[], known: ReadonlySet<string>): number {
  const bySubject = new Map<string, SenderSummary[]>();
  for (const s of senders) {
    if (known.has(s.address) || s.messages.length > 2 || !isFreeMailDomain(domainOf(s.address)) || nameInAddress(s.displayName, s.address)) continue;
    for (const t of new Set(s.messages.filter((m) => !m.repliesToYou).map((m) => subjectTemplate(m.subject ?? "")))) {
      if (/^(re|fwd?|fw):/.test(t) || t.split(" ").length < MIN_WORDS) continue;
      bySubject.set(t, [...(bySubject.get(t) ?? []), s]);
    }
  }
  let marked = 0;
  for (const [t, list] of bySubject) {
    if (list.length < MIN_SENDERS) continue;
    for (const s of list) {
      if (s.threatSignals.some((x) => x.kind === "campaign")) continue;
      const ids = s.messages.filter((m) => subjectTemplate(m.subject ?? "") === t).map((m) => m.id);
      s.threatSignals.push({ kind: "campaign", brand: `${list.length} senders`, confidence: "medium", messageIds: ids });
      marked++;
    }
  }
  return marked;
}
