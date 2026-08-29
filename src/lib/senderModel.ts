import { mapWithConcurrency } from "./concurrency";
import { classifyMessageKind, type MessageKind } from "./messageKind";
import { scoreMessageAuthentication, scoreSenderIdentity, type ThreatSignal } from "./threatSignals";
import type {
  EmailProvider,
  NormalizedMessageMetadata,
  ProviderId,
  UnsubscribeInfo,
} from "./providers/emailProvider";

export interface MessageRecord {
  id: string;
  receivedAt: number;
  kind: MessageKind;
  isProtected: boolean;
  unread: boolean;
  sizeBytes: number;
}

export interface SenderSummary {
  key: string; // `${provider}:${address}` — unique across providers, unlike bare address
  provider: ProviderId;
  address: string;
  displayName: string;
  count: number;
  messageIds: string[];
  protectedMessageIds: string[];
  unsubscribe: UnsubscribeInfo;
  messages: MessageRecord[];
  /**
   * Brand-impersonation and lookalike-domain signals are computed once from
   * the sender's own address/display name -- identical across every message
   * from one sender key. The failed-authentication signal is different:
   * DMARC alignment is per-message, so buildSenderSummaries keeps checking
   * every message from the sender and adds it if any one of them fails.
   */
  threatSignals: ThreatSignal[];
}

function hasUnsubscribe(info: UnsubscribeInfo): boolean {
  return Boolean(info.postUrl || info.httpUrl || info.mailto);
}

// Union `incoming` into `existing` in place, keyed by kind+brand so re-scoring
// the same sender never double-records a signal.
function mergeSignals(existing: ThreatSignal[], incoming: ThreatSignal[]) {
  for (const signal of incoming) {
    if (!existing.some((s) => s.kind === signal.kind && s.brand === signal.brand)) {
      existing.push(signal);
    }
  }
}

function addToSenders(senders: Map<string, SenderSummary>, meta: NormalizedMessageMetadata) {
  if (!meta.fromAddress) return;
  const key = `${meta.provider}:${meta.fromAddress}`;
  const record: MessageRecord = {
    id: meta.id,
    receivedAt: meta.receivedAt,
    kind: classifyMessageKind(meta.subject, hasUnsubscribe(meta.unsubscribe)),
    isProtected: meta.isProtected,
    unread: meta.unread,
    sizeBytes: meta.sizeBytes,
  };
  const existing = senders.get(key);
  if (existing) {
    existing.count += 1;
    existing.messageIds.push(meta.id);
    existing.messages.push(record);
    if (meta.isProtected) existing.protectedMessageIds.push(meta.id);
    if (!hasUnsubscribe(existing.unsubscribe) && hasUnsubscribe(meta.unsubscribe)) {
      existing.unsubscribe = meta.unsubscribe;
    }
    // Identity signals derive from the from-address (constant for this key) and
    // the display name (NOT constant — an attacker can send some messages as
    // "PayPal" and others as themselves from one address). Re-score whenever
    // the display name differs from what we've already seen and union anything
    // new; mergeSignals dedupes so an unchanged sender costs one cheap compare.
    if (meta.fromDisplayName !== existing.displayName) {
      mergeSignals(existing.threatSignals, scoreSenderIdentity(meta));
    }
    // DMARC alignment is per-message, so keep checking until one message from
    // this sender trips it (then stop -- one is enough to flag).
    if (!existing.threatSignals.some((s) => s.kind === "failed-authentication")) {
      const authSignal = scoreMessageAuthentication(meta);
      if (authSignal) existing.threatSignals.push(authSignal);
    }
  } else {
    const authSignal = scoreMessageAuthentication(meta);
    senders.set(key, {
      key,
      provider: meta.provider,
      address: meta.fromAddress,
      displayName: meta.fromDisplayName,
      count: 1,
      threatSignals: authSignal ? [...scoreSenderIdentity(meta), authSignal] : scoreSenderIdentity(meta),
      messageIds: [meta.id],
      protectedMessageIds: meta.isProtected ? [meta.id] : [],
      unsubscribe: meta.unsubscribe,
      messages: [record],
    });
  }
}

const DEFAULT_MAX_MESSAGES = 500;
const DEFAULT_SCAN_WINDOW_DAYS = 180;

export async function buildSenderSummaries(
  providers: EmailProvider[],
  maxMessagesPerProvider = DEFAULT_MAX_MESSAGES,
  scanWindowDays = DEFAULT_SCAN_WINDOW_DAYS,
  onProgress?: (done: number, total: number) => void,
): Promise<SenderSummary[]> {
  const senders = new Map<string, SenderSummary>();

  const perProvider = await Promise.all(
    providers.map(async (provider) => {
      const token = await provider.getAuthToken(false);
      const stubs = await provider.listCandidateMessages(token, maxMessagesPerProvider, scanWindowDays);
      return { provider, token, stubs };
    }),
  );

  const total = perProvider.reduce((sum, p) => sum + p.stubs.length, 0);
  let done = 0;

  await Promise.all(
    perProvider.map(async ({ provider, token, stubs }) => {
      const metadatas = await mapWithConcurrency(stubs, 10, async (stub) => {
        const meta = await provider.getMessageMetadata(token, stub.id);
        done += 1;
        onProgress?.(done, total);
        return meta;
      });
      for (const meta of metadatas) addToSenders(senders, meta);
    }),
  );

  return [...senders.values()].sort((a, b) => b.count - a.count);
}
