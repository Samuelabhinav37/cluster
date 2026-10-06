// Runs the inbox time limits against the live Gmail account: wires
// inboxTimeLimits.ts to the Gmail API, the shared metadata cache and the
// action log. Called by the 15-minute background alarm and by the dashboard
// right after the user saves their limits.
import { appendActionLog, makeLogId } from "./actionLog";
import { categoryLabelName } from "./categoryFilters";
import { batchModify, findLabelIds, getOrCreateLabel, listMessageIds } from "./gmailApi";
import { sweepExpiredInbox, tagUntaggedInbox, type CategoryLimit, type InboxLimitsApi } from "./inboxTimeLimits";
import { loadMetadataCache, saveMetadataCache } from "./metadataCache";
import { gmailProvider } from "./providers/gmailProvider";
import { knownSenderSet } from "./screener";
import { buildSenderSummariesFromStubs } from "./senderModel";
import { getSettings, mutateSettings } from "./settingsStore";
import { ALL_SORT_BUCKETS } from "./sortTaxonomy";

const KEPT_IDS_CAP = 2000;

export interface TimeLimitRun {
  tagged: number;
  moved: number;
  more: boolean;
}

/** One tag + sweep pass, or null when time limits are off or Gmail isn't
 * connected. */
export async function runInboxTimeLimits(now = Date.now()): Promise<TimeLimitRun | null> {
  const settings = await getSettings();
  if (!settings.autoSort.timeLimitsEnabled) return null;
  if (!(await gmailProvider.isConnected())) return null;
  const token = await gmailProvider.getAuthToken(false);

  const limits: CategoryLimit[] = ALL_SORT_BUCKETS.map((bucket) => ({
    bucket,
    labelName: categoryLabelName(bucket, settings.labelChoices),
    hours: settings.autoSort.inboxHoursByBucket[bucket] ?? null,
  }));
  const cache = await loadMetadataCache(now);
  const api: InboxLimitsApi = {
    findLabelId: async (name) => (await findLabelIds(token, name))[0] ?? null,
    ensureLabelId: (name) => getOrCreateLabel(token, name),
    listIds: async (labelIds, query, max) =>
      (await listMessageIds(token, query, max, labelIds)).map((m) => m.id),
    readSenders: (ids) =>
      buildSenderSummariesFromStubs(
        [{ provider: gmailProvider, token, stubs: ids.map((id) => ({ id, provider: "gmail" as const })) }],
        undefined,
        cache,
      ),
    batchModify: (ids, add, remove) => batchModify(token, ids, add, remove),
  };
  const ctx = {
    limits,
    known: knownSenderSet(settings),
    overrides: settings.sortOverrides,
    now,
    keptIds: new Set(settings.autoSort.keptInInboxIds),
  };

  const tag = await tagUntaggedInbox(ctx, api);
  const sweep = await sweepExpiredInbox(ctx, api);
  void saveMetadataCache(cache);

  await mutateSettings((current) => ({
    ...current,
    autoSort: {
      ...current.autoSort,
      lastSweep: { at: now, moved: sweep.movedIds.length },
      keptInInboxIds: [...new Set([...current.autoSort.keptInInboxIds, ...sweep.keptIds])].slice(-KEPT_IDS_CAP),
    },
  }));
  if (sweep.movedIds.length > 0) {
    const n = sweep.movedIds.length;
    await appendActionLog([
      {
        id: makeLogId("archive"),
        at: now,
        kind: "archive",
        summary: `Time limits moved ${n} message${n === 1 ? "" : "s"} out of the inbox into their labels`,
        undo: { provider: "gmail", ids: sweep.movedIds, via: "unarchive" },
      },
    ]);
  }
  return { tagged: tag.tagged, moved: sweep.movedIds.length, more: sweep.more };
}
