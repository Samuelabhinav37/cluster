import type { ProviderId } from "./providers/emailProvider";
import { RETENTION_DAYS, RETENTION_LABELS } from "./retentionPolicy";
import type { MessageKind } from "./messageKind";
import type { SenderSummary } from "./senderModel";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ExpiryBucket {
  kind: MessageKind;
  label: string;
  retentionDays: number;
  count: number;
  messageIdsByProvider: Map<ProviderId, string[]>;
}

// Age-since-received only — never a date read out of the message body. A
// kind with no entry in RETENTION_DAYS (receipt, other) never appears here.
export function buildExpiryBuckets(senders: SenderSummary[]): ExpiryBucket[] {
  const now = Date.now();
  const buckets = new Map<MessageKind, ExpiryBucket>();

  for (const sender of senders) {
    for (const msg of sender.messages) {
      if (msg.isProtected) continue;
      const retentionDays = RETENTION_DAYS[msg.kind];
      if (!retentionDays) continue;
      if (now - msg.receivedAt < retentionDays * DAY_MS) continue;

      let bucket = buckets.get(msg.kind);
      if (!bucket) {
        bucket = {
          kind: msg.kind,
          label: RETENTION_LABELS[msg.kind],
          retentionDays,
          count: 0,
          messageIdsByProvider: new Map(),
        };
        buckets.set(msg.kind, bucket);
      }
      bucket.count += 1;
      const existing = bucket.messageIdsByProvider.get(sender.provider);
      if (existing) existing.push(msg.id);
      else bucket.messageIdsByProvider.set(sender.provider, [msg.id]);
    }
  }

  return [...buckets.values()].sort((a, b) => b.count - a.count);
}

export function mergeExpiryBuckets(buckets: ExpiryBucket[]): Map<ProviderId, string[]> {
  const merged = new Map<ProviderId, string[]>();
  for (const bucket of buckets) {
    for (const [providerId, ids] of bucket.messageIdsByProvider) {
      const existing = merged.get(providerId);
      if (existing) existing.push(...ids);
      else merged.set(providerId, [...ids]);
    }
  }
  return merged;
}

export function totalExpiryCount(buckets: ExpiryBucket[]): number {
  return buckets.reduce((sum, b) => sum + b.count, 0);
}
