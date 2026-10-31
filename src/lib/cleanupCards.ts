// Clean up's three cards. Each email sits in at most one card, so the
// numbers add up: mail from senders you never open goes to "never", and
// "old" is only what's left past its date. "lists" counts senders, not emails.
import type { ExpiryBucket } from "./expiryTriage";
import type { ProviderId } from "./providers/emailProvider";
import { emptyProtectionContext, protectionDecision, type ProtectionContext } from "./protectionPolicy";
import type { SenderProfile } from "./senderProfile";
import type { SenderSummary } from "./senderModel";
import type { Suggestion } from "./suggestions";

export interface CleanupCards {
  never: Suggestion[];
  /** Past its date, minus anything already in `never`. Empty buckets dropped. */
  old: ExpiryBucket[];
  lists: SenderSummary[];
  neverCount: number;
  oldCount: number;
  /** Emails across never and old (they never overlap). */
  total: number;
}

const idKey = (provider: ProviderId, id: string) => `${provider}:${id}`;

/** A mailing list worth leaving: an unsubscribe link, not a receipt, code or
 * delivery sender, nothing protected, and mail you mostly don't open. */
export function leavableList(
  sender: SenderSummary,
  profile: SenderProfile | undefined,
  ctx: ProtectionContext = emptyProtectionContext(),
): boolean {
  const { postUrl, httpUrl, mailto } = sender.unsubscribe;
  if (!profile || !(postUrl || httpUrl || mailto)) return false;
  if (profile.kind === "receipt" || profile.kind === "shipping" || profile.kind === "otp") return false;
  if (sender.messages.some((m) => protectionDecision(m, sender.address, ctx).protected)) return false;
  const rate = profile.openRate;
  if (rate === null) return false;
  return (profile.judged >= 5 && rate < 0.25) || (profile.perMonth >= 8 && rate < 0.5);
}

export function buildCleanupCards(
  senders: readonly SenderSummary[],
  profiles: ReadonlyMap<string, SenderProfile>,
  never: Suggestion[],
  expiry: ExpiryBucket[],
  ctx: ProtectionContext = emptyProtectionContext(),
): CleanupCards {
  const taken = new Set<string>();
  for (const s of never) for (const id of s.safeMessageIds) taken.add(idKey(s.sender.provider, id));
  const neverCount = taken.size;

  const old: ExpiryBucket[] = [];
  let oldCount = 0;
  for (const b of expiry) {
    const byProvider = new Map<ProviderId, string[]>();
    for (const [provider, ids] of b.messageIdsByProvider) {
      const left = ids.filter((id) => !taken.has(idKey(provider, id)));
      if (left.length > 0) byProvider.set(provider, left);
    }
    const count = [...byProvider.values()].reduce((n, ids) => n + ids.length, 0);
    if (count === 0) continue;
    old.push({ ...b, count, messageIdsByProvider: byProvider });
    oldCount += count;
  }

  const lists = senders.filter((s) => leavableList(s, profiles.get(s.key), ctx));
  return { never, old, lists, neverCount, oldCount, total: neverCount + oldCount };
}
