// Event linking (3.13): a sender's shipping mail about one order (same order
// or booking number, else the same thread) is one event. Once the event says
// "delivered", its in-transit updates have done their job and can leave the
// inbox. The order confirmation and the delivered note stay.
import type { ProviderId } from "./providers/emailProvider";
import { emptyProtectionContext, protectionDecision, type ProtectionContext } from "./protectionPolicy";
import type { MessageRecord, SenderSummary } from "./senderModel";

const ORDER_REF_RE = /\b(?:order|booking|reservation|shipment|package)\s*(?:#|no\.?|number|ref\.?)?\s*:?\s*#?\s*([A-Z0-9][A-Z0-9-]{4,})\b/i;
const DELIVERED_RE = /\b(?:has been |was )?delivered\b/i;
const NOT_YET_RE = /\b(?:will be|to be|being|get|getting|be) delivered\b|\bdelivered (?:by|on|tomorrow|today|soon)\b|\bout for delivery\b/i;
const IN_TRANSIT_RE =
  /\b(shipped|has shipped|out for delivery|on its way|arriving|in transit|delivery (update|attempt|scheduled)|tracking (number|info|information|update|details)|track your (order|package|parcel|shipment))\b/i;

/** The event a shipping message belongs to, or undefined when nothing links it. */
export function eventKey(m: MessageRecord): string | undefined {
  const ref = ORDER_REF_RE.exec(m.subject ?? "")?.[1];
  // A ref needs a digit: "Order confirmed" must not read "confirmed" as one.
  if (ref && /\d/.test(ref)) return `ref:${ref.toUpperCase()}`;
  return m.threadId ? `thread:${m.threadId}` : undefined;
}

export function isDelivered(subject: string): boolean {
  return DELIVERED_RE.test(subject) && !NOT_YET_RE.test(subject);
}

/** In-transit updates of delivered orders, per provider, minus protected mail. */
export function deliveredUpdates(
  senders: readonly SenderSummary[],
  ctx: ProtectionContext = emptyProtectionContext(),
): Map<ProviderId, string[]> {
  const out = new Map<ProviderId, string[]>();
  for (const s of senders) {
    const events = new Map<string, MessageRecord[]>();
    for (const m of s.messages) {
      if (m.kind !== "shipping") continue;
      const key = eventKey(m);
      if (key) events.set(key, [...(events.get(key) ?? []), m]);
    }
    for (const msgs of events.values()) {
      const delivered = msgs.find((m) => isDelivered(m.subject ?? ""));
      if (!delivered) continue;
      const done = msgs.filter(
        (m) =>
          m !== delivered &&
          m.receivedAt <= delivered.receivedAt &&
          IN_TRANSIT_RE.test(m.subject ?? "") &&
          !isDelivered(m.subject ?? "") &&
          // Shipping mail is protected as transactional; this one move is
          // about exactly that mail, and it archives, never trashes.
          !protectionDecision(m, s.address, ctx, { contentHeuristics: false }).protected,
      );
      if (done.length > 0) out.set(s.provider, [...(out.get(s.provider) ?? []), ...done.map((m) => m.id)]);
    }
  }
  return out;
}
