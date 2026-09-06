import { mapWithConcurrency } from "./concurrency";
import { classifyMessageKind, type MessageKind } from "./messageKind";
import {
  scoreMessageAuthentication,
  scoreMessageContext,
  scoreSenderIdentity,
  type ThreatSignal,
} from "./threatSignals";
import { parseAuthenticationResults, type AuthenticationVerdicts, type AuthVerdict } from "./emailAuth";
import type {
  EmailProvider,
  NormalizedMessageMetadata,
  NormalizedMessageStub,
  ProviderId,
  ScanPurpose,
  UnsubscribeInfo,
} from "./providers/emailProvider";

export interface MessageRecord {
  id: string;
  /** Subject is retained in memory for explainable protection decisions. */
  subject?: string;
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
   * from one sender key. The failed-authentication and context signals are
   * different: they're per-message, so buildSenderSummaries keeps checking
   * every message from the sender and unions anything new.
   */
  threatSignals: ThreatSignal[];
  /** Most alarming SPF / DKIM / DMARC verdict seen across this sender's
   * messages (fail > pass > softfail/neutral/none > unknown) -- surfaced in
   * the Security tab as a plain-language "is this really from who it says"
   * indicator. */
  authVerdicts: AuthenticationVerdicts;
  /** True when this sender is new since Cluster initialized its local ledger
   * (set by firstContact.ts, not by buildSenderSummaries). */
  firstContact: boolean;
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

// Keep the most alarming verdict per mechanism across all of a sender's
// messages: a "fail" on any one message is what a user needs to see, even if
// an earlier message passed. Only "fail" is treated as a real negative signal
// (see emailAuth.ts); a "pass" anywhere still beats a benign softfail/neutral
// on a forwarded copy, and any stated verdict beats "unknown" (no header).
const VERDICT_RANK: Record<AuthVerdict, number> = {
  fail: 3,
  pass: 2,
  softfail: 1,
  neutral: 1,
  none: 1,
  unknown: 0,
};
function mergeVerdicts(into: AuthenticationVerdicts, next: AuthenticationVerdicts) {
  for (const m of ["spf", "dkim", "dmarc"] as const) {
    if (VERDICT_RANK[next[m]] > VERDICT_RANK[into[m]]) into[m] = next[m];
  }
}

function addToSenders(senders: Map<string, SenderSummary>, meta: NormalizedMessageMetadata) {
  if (!meta.fromAddress) return;
  const key = `${meta.provider}:${meta.fromAddress}`;
  const record: MessageRecord = {
    id: meta.id,
    subject: meta.subject,
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
    // Per-message context signals (lure subject, redirected Reply-To) -- union
    // anything new, deduped by kind+brand.
    mergeSignals(existing.threatSignals, scoreMessageContext(meta));
    mergeVerdicts(existing.authVerdicts, parseAuthenticationResults(meta.authenticationResults));
  } else {
    const authSignal = scoreMessageAuthentication(meta);
    senders.set(key, {
      key,
      provider: meta.provider,
      address: meta.fromAddress,
      displayName: meta.fromDisplayName,
      count: 1,
      threatSignals: [
        ...scoreSenderIdentity(meta),
        ...(authSignal ? [authSignal] : []),
        ...scoreMessageContext(meta),
      ],
      authVerdicts: parseAuthenticationResults(meta.authenticationResults),
      firstContact: false,
      messageIds: [meta.id],
      protectedMessageIds: meta.isProtected ? [meta.id] : [],
      unsubscribe: meta.unsubscribe,
      messages: [record],
    });
  }
}

const DEFAULT_MAX_MESSAGES = 500;
const DEFAULT_SCAN_WINDOW_DAYS = 180;

interface ProviderScanInput {
  provider: EmailProvider;
  token: string;
  stubs: NormalizedMessageStub[];
}

export async function buildSenderSummariesFromStubs(
  perProvider: ProviderScanInput[],
  onProgress?: (done: number, total: number) => void,
  // Optional cross-scan dedupe. The dashboard runs a cleanup scan and a
  // security scan back to back; their message sets overlap (recent
  // promotional mail still in the inbox). Passing one shared Map across both
  // calls fetches each message's metadata once. Key: `${providerId}:${id}`.
  metadataCache?: Map<string, NormalizedMessageMetadata>,
): Promise<SenderSummary[]> {
  const senders = new Map<string, SenderSummary>();
  const total = perProvider.reduce((sum, item) => sum + item.stubs.length, 0);
  let done = 0;

  await Promise.all(
    perProvider.map(async ({ provider, token, stubs }) => {
      const metadatas = await mapWithConcurrency(stubs, 10, async (stub) => {
        const cacheKey = `${provider.id}:${stub.id}`;
        const cached = metadataCache?.get(cacheKey);
        const meta = cached ?? (await provider.getMessageMetadata(token, stub.id));
        if (!cached) metadataCache?.set(cacheKey, meta);
        done += 1;
        onProgress?.(done, total);
        return meta;
      });
      for (const meta of metadatas) addToSenders(senders, meta);
    }),
  );

  return [...senders.values()].sort((a, b) => b.count - a.count);
}

export async function buildSenderSummaries(
  providers: EmailProvider[],
  maxMessagesPerProvider = DEFAULT_MAX_MESSAGES,
  scanWindowDays = DEFAULT_SCAN_WINDOW_DAYS,
  onProgress?: (done: number, total: number) => void,
  purpose: ScanPurpose = "cleanup",
  metadataCache?: Map<string, NormalizedMessageMetadata>,
): Promise<SenderSummary[]> {
  const perProvider = await Promise.all(
    providers.map(async (provider) => {
      const token = await provider.getAuthToken(false);
      const stubs = await provider.listCandidateMessages(
        token,
        maxMessagesPerProvider,
        scanWindowDays,
        purpose,
      );
      return { provider, token, stubs };
    }),
  );
  return buildSenderSummariesFromStubs(perProvider, onProgress, metadataCache);
}
