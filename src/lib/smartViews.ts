import type { ProviderId } from "./providers/emailProvider";
import { emptyProtectionContext, protectionDecision, type ProtectionContext } from "./protectionPolicy";
import type { MessageRecord, SenderSummary } from "./senderModel";

// Cross-cutting saved filters — Clean Email's "Smart Folders" / SaneBox's Deep
// Clean slices. Each is a pure predicate over one already-fetched MessageRecord;
// no new data, no body. Starred/flagged mail is always excluded by the
// evaluators below, whatever the predicate says.
const DAY_MS = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;

export interface SmartView {
  id: string;
  label: string;
  hint: string;
  match: (m: MessageRecord) => boolean;
}

export const SMART_VIEWS: SmartView[] = [
  {
    id: "older-1y",
    label: "Older than 1 year",
    hint: "Received more than 365 days ago",
    match: (m) => Date.now() - m.receivedAt > 365 * DAY_MS,
  },
  {
    id: "large",
    label: "Large — over 2 MB",
    hint: "Big messages taking up quota",
    match: (m) => m.sizeBytes > 2 * MB,
  },
  {
    id: "promos-unsub",
    label: "Promotions",
    hint: "Newsletter / bulk-mail kind",
    match: (m) => m.kind === "newsletter",
  },
  {
    id: "otp",
    label: "One-time codes",
    hint: "Login and verification codes",
    match: (m) => m.kind === "otp",
  },
  {
    id: "shipping",
    label: "Order & shipping",
    hint: "Delivery and order-status updates",
    match: (m) => m.kind === "shipping",
  },
];

/** Message ids matching the view, grouped by provider, excluding protected. */
export function evaluateSmartView(view: SmartView, senders: SenderSummary[]): Map<ProviderId, string[]> {
  const out = new Map<ProviderId, string[]>();
  for (const s of senders) {
    for (const m of s.messages) {
      if (m.isProtected || !view.match(m)) continue;
      const list = out.get(s.provider);
      if (list) list.push(m.id);
      else out.set(s.provider, [m.id]);
    }
  }
  return out;
}

/**
 * The subset of evaluateSmartView's matches that are also safe to *delete*
 * -- applies the full protection gate (kind/subject/known-correspondent/
 * provider-marked-personal/no-bulk-signal), not just starred/flagged. Used
 * only by the Trash action; Archive and the displayed count still use the
 * lighter evaluateSmartView, since filing something out of the inbox
 * without deleting it is much lower-stakes.
 */
export function evaluateSmartViewForTrash(
  view: SmartView,
  senders: SenderSummary[],
  ctx: ProtectionContext = emptyProtectionContext(),
): Map<ProviderId, string[]> {
  const out = new Map<ProviderId, string[]>();
  for (const s of senders) {
    for (const m of s.messages) {
      if (!view.match(m) || protectionDecision(m, s.address, ctx).protected) continue;
      const list = out.get(s.provider);
      if (list) list.push(m.id);
      else out.set(s.provider, [m.id]);
    }
  }
  return out;
}

export function smartViewMessageCount(view: SmartView, senders: SenderSummary[]): number {
  let n = 0;
  for (const ids of evaluateSmartView(view, senders).values()) n += ids.length;
  return n;
}

export function smartViewSenderCount(view: SmartView, senders: SenderSummary[]): number {
  let n = 0;
  for (const s of senders) {
    if (s.messages.some((m) => !m.isProtected && view.match(m))) n += 1;
  }
  return n;
}
