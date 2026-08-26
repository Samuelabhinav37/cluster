import { mapWithConcurrency } from "./concurrency";
import { classifyMessageKind, type MessageKind } from "./messageKind";
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
}

function hasUnsubscribe(info: UnsubscribeInfo): boolean {
  return Boolean(info.postUrl || info.httpUrl || info.mailto);
}

function addToSenders(senders: Map<string, SenderSummary>, meta: NormalizedMessageMetadata) {
  if (!meta.fromAddress) return;
  const key = `${meta.provider}:${meta.fromAddress}`;
  const record: MessageRecord = {
    id: meta.id,
    receivedAt: meta.receivedAt,
    kind: classifyMessageKind(meta.subject, hasUnsubscribe(meta.unsubscribe)),
    isProtected: meta.isProtected,
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
  } else {
    senders.set(key, {
      key,
      provider: meta.provider,
      address: meta.fromAddress,
      displayName: meta.fromDisplayName,
      count: 1,
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
