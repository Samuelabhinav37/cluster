import type { EmailProvider, ProviderId, ScanPurpose } from "./providers/emailProvider";
import { buildSenderSummariesFromStubs, type SenderSummary } from "./senderModel";

export interface IncrementalSyncResult {
  senders: SenderSummary[];
  cursors: Partial<Record<ProviderId, string>>;
  resetProviders: ProviderId[];
  changedMessageCount: number;
}

/**
 * Reads provider changes, but deliberately does not persist checkpoints. The
 * caller commits `cursors` only after all downstream processing succeeds.
 */
export async function buildIncrementalSenderSummaries(
  providers: EmailProvider[],
  existingCursors: Partial<Record<ProviderId, string>>,
  maxMessagesPerProvider: number,
  windowDays: number,
  purpose: ScanPurpose,
  onProgress?: (done: number, total: number) => void,
): Promise<IncrementalSyncResult> {
  const cursors: Partial<Record<ProviderId, string>> = { ...existingCursors };
  const resetProviders: ProviderId[] = [];

  const inputs = await Promise.all(
    providers.map(async (provider) => {
      const token = await provider.getAuthToken(false);
      if (!provider.listIncrementalMessages) {
        const stubs = await provider.listCandidateMessages(
          token,
          maxMessagesPerProvider,
          windowDays,
          purpose,
        );
        return { provider, token, stubs };
      }
      const result = await provider.listIncrementalMessages(
        token,
        existingCursors[provider.id],
        maxMessagesPerProvider,
        windowDays,
        purpose,
      );
      cursors[provider.id] = result.cursor;
      if (result.reset) resetProviders.push(provider.id);
      return { provider, token, stubs: result.messages };
    }),
  );

  const changedMessageCount = inputs.reduce((sum, input) => sum + input.stubs.length, 0);
  const senders = await buildSenderSummariesFromStubs(inputs, onProgress);
  return { senders, cursors, resetProviders, changedMessageCount };
}
