// Test-only fixtures (never imported by shipping code). Builds senders
// through the real pipeline — NormalizedMessageMetadata → senderModel — so
// message-kind classification, grouping and threat scoring run exactly as in
// production instead of being hand-assembled per test file.
import { buildSenderSummariesFromStubs, type SenderSummary } from "../lib/senderModel";
import type { EmailProvider, NormalizedMessageMetadata } from "../lib/providers/emailProvider";

export const DAY = 86_400_000;
export const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);

let seq = 0;

/** Google's own authserv-id result, passing or failing all three mechanisms. */
export function authResults(domain: string, pass = true): string {
  return pass
    ? `mx.google.com; dkim=pass header.i=@${domain}; spf=pass smtp.mailfrom=${domain}; dmarc=pass header.from=${domain}`
    : `mx.google.com; dkim=fail header.i=@${domain}; spf=fail smtp.mailfrom=${domain}; dmarc=fail header.from=${domain}`;
}

/** One message. Defaults: an unread, authenticated bulk newsletter, 10 days old. */
export function meta(over: Partial<NormalizedMessageMetadata> & { fromAddress: string }): NormalizedMessageMetadata {
  const domain = over.fromAddress.split("@")[1] ?? "example.com";
  return {
    id: `m${++seq}`,
    provider: "gmail",
    fromDisplayName: "Sender",
    replyToAddress: "",
    subject: "This week's update",
    isProtected: false,
    unread: true,
    sizeBytes: 20_000,
    unsubscribe: { httpUrl: `https://${domain}/unsubscribe` },
    receivedAt: NOW - 10 * DAY,
    authenticationResults: authResults(domain),
    providerMarkedPersonal: false,
    ...over,
  };
}

/** `n` messages from one sender, one day apart, sharing `over`. */
export function many(
  n: number,
  over: Partial<NormalizedMessageMetadata> & { fromAddress: string },
): NormalizedMessageMetadata[] {
  return Array.from({ length: n }, (_, i) =>
    meta({ ...over, receivedAt: (over.receivedAt ?? NOW - 10 * DAY) - i * DAY }),
  );
}

/** A provider whose getMessageMetadata serves `metas` by id (optionally
 * throwing for some ids, to simulate mail deleted mid-scan). */
export function fakeProvider(
  metas: NormalizedMessageMetadata[],
  failIds: Set<string> = new Set(),
): EmailProvider {
  const byId = new Map(metas.map((m) => [m.id, m]));
  return {
    id: "gmail",
    getMessageMetadata: async (_token: string, id: string) => {
      if (failIds.has(id)) throw new Error(`Gmail API /users/me/messages/${id} failed: 404`);
      const m = byId.get(id);
      if (!m) throw new Error(`no fixture for ${id}`);
      return m;
    },
  } as unknown as EmailProvider;
}

/** Run metas through the real metadata→sender pipeline. */
export async function senders(
  metas: NormalizedMessageMetadata[],
  failIds?: Set<string>,
): Promise<SenderSummary[]> {
  return buildSenderSummariesFromStubs([
    {
      provider: fakeProvider(metas, failIds),
      token: "t",
      stubs: metas.map((m) => ({ id: m.id, provider: "gmail" as const })),
    },
  ]);
}

export function bySender(list: SenderSummary[], address: string): SenderSummary {
  const s = list.find((x) => x.address === address);
  if (!s) throw new Error(`no sender ${address}`);
  return s;
}
