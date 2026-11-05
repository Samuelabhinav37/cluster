// Runs the inbox time limits against the live Gmail account: wires
// inboxTimeLimits.ts to the Gmail API, the shared metadata cache and the
// action log. Called by the 5-minute background alarm and by the dashboard
// right after the user saves their limits.
import { appendActionLog, makeLogId } from "./actionLog";
import { categoryLabelName, syncGmailCategoryFilters } from "./categoryFilters";
import { batchModify, colorClusterLabels, findLabelIds, getOrCreateLabel, listMessageIds } from "./gmailApi";
import {
  holdUnsortedInbox,
  labelFromIndex,
  pinInInbox,
  sweepExpiredInbox,
  TAG_BACK_DONE,
  tagOlderInbox,
  tagUntaggedInbox,
  type CategoryLimit,
  type InboxLimitsApi,
} from "./inboxTimeLimits";
import { indexSeededCache, refreshIndexForBackground } from "./indexTriage";
import { openMailIndex } from "./mailIndex";
import { notify } from "./notices";
import { getScan, setScan } from "./scanState";
import { loadMetadataCache, saveMetadataCache } from "./metadataCache";
import { gmailProvider } from "./providers/gmailProvider";
import { knownSenderSet } from "./screener";
import { buildSenderSummariesFromStubs } from "./senderModel";
import { getSettings, mutateSettings } from "./settingsStore";
import { ALL_SORT_BUCKETS } from "./sortTaxonomy";
import { clusterLabelName } from "./clusterLabels";

/** Bump when labelling rules change (domains, kinds, phrases): the next run
 * relabels the whole indexed inbox once. */
export const LABEL_RULES_VERSION = 1;

export interface TimeLimitRun {
  tagged: number;
  moved: number;
  more: boolean;
}

/** One tag + sweep pass, or null when time limits are off or Gmail isn't
 * connected. */
export async function runInboxTimeLimits(now = Date.now(), options: { relabel?: boolean } = {}): Promise<TimeLimitRun | null> {
  const settings = await getSettings();
  if (!settings.autoSort.timeLimitsEnabled) return null;
  if (!(await gmailProvider.isConnected())) return null;
  const token = await gmailProvider.getAuthToken(false);
  // An update can change what a category matches; Gmail's filters keep the
  // old query until rewritten. Unchanged filters cost no API calls.
  const synced = await syncGmailCategoryFilters(settings, token);
  if (synced.created > 0 || synced.deleted > 0) {
    await colorClusterLabels(token);
    await mutateSettings((current) => ({
      ...current,
      autoSort: { ...current.autoSort, filterIdsByBucket: synced.filterIdsByBucket, filterSpecByBucket: synced.filterSpecByBucket },
    }));
  }

  const limits: CategoryLimit[] = ALL_SORT_BUCKETS.filter((b) => !settings.autoSort.labelsOff.includes(b)).map((bucket) => ({
    bucket,
    labelName: categoryLabelName(bucket, settings.labelChoices),
    hours: settings.autoSort.inboxHoursByBucket[bucket] ?? null,
  }));
  // Senders come from the mail index (kept current from Gmail's change feed);
  // only inbox mail it doesn't have yet is read, then saved to it. Without
  // a built index this falls back to the old warm cache.
  const indexReady = (await refreshIndexForBackground([gmailProvider], settings.scanWindowDays)).length > 0;
  const legacyCache = indexReady ? undefined : await loadMetadataCache(now);
  const api: InboxLimitsApi = {
    findLabelId: async (name) => (await findLabelIds(token, name))[0] ?? null,
    ensureLabelId: (name) => getOrCreateLabel(token, name),
    listIds: async (labelIds, query, max) =>
      (await listMessageIds(token, query, max, labelIds)).map((m) => m.id),
    readSenders: async (ids) => {
      const seeded = legacyCache ? undefined : await indexSeededCache(gmailProvider, ids);
      const senders = await buildSenderSummariesFromStubs(
        [{ provider: gmailProvider, token, stubs: ids.map((id) => ({ id, provider: "gmail" as const })) }],
        undefined,
        seeded?.cache ?? legacyCache,
      );
      await seeded?.saveFetched();
      return senders;
    },
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
  // Then one page of older unlabelled inbox mail, until the whole inbox is seen.
  const back = settings.autoSort.tagBackBefore === TAG_BACK_DONE ? null : await tagOlderInbox(ctx, api, settings.autoSort.tagBackBefore);
  const relabelled =
    indexReady && (options.relabel || settings.autoSort.labelledVersion !== LABEL_RULES_VERSION) ? await relabelInbox(ctx, api, now) : 0;
  const sweep = await sweepExpiredInbox(ctx, api);
  if (legacyCache) void saveMetadataCache(legacyCache);

  await mutateSettings((current) => ({
    ...current,
    autoSort: {
      ...current.autoSort,
      lastSweep: { at: now, moved: sweep.movedIds.length },
      tagBackBefore: back ? back.nextBefore : current.autoSort.tagBackBefore,
      labelledVersion: indexReady ? LABEL_RULES_VERSION : current.autoSort.labelledVersion,
      keptInInboxIds: pinInInbox(current.autoSort.keptInInboxIds, sweep.keptIds),
    },
  }));
  if (sweep.movedIds.length > 0) {
    const n = sweep.movedIds.length;
    await appendActionLog([
      {
        // Sorting, not a cleanup: Overview counts "archive" entries as
        // cleanups the user did.
        id: makeLogId("sort"),
        at: now,
        kind: "sort",
        summary: `Time limits moved ${n} message${n === 1 ? "" : "s"} out of the inbox into their labels`,
        undo: { provider: "gmail", ids: sweep.movedIds, via: "unarchive" },
      },
    ]);
  }
  if (settings.autoSort.holdUnsorted) {
    const held = await holdUnsortedInbox(ctx, api, clusterLabelName("screener"));
    if (held.heldIds.length > 0) {
      // Listed as screened so the Screener page shows them waiting.
      await mutateSettings((current) => ({
        ...current,
        screenedSenders: [...new Set([...current.screenedSenders, ...held.senders])],
      }));
      const n = held.heldIds.length;
      await appendActionLog([
        {
          id: makeLogId("sort"),
          at: now,
          kind: "sort",
          summary: `Held ${n} message${n === 1 ? "" : "s"} with no label in the Screener`,
          undo: { provider: "gmail", ids: held.heldIds, via: "unarchive" },
        },
      ]);
    }
  }
  return { tagged: tag.tagged + (back?.tagged ?? 0) + relabelled, moved: sweep.movedIds.length, more: sweep.more };
}

/** Labels (and fixes) every inbox message the mail index holds, with no
 * message reads, and reports it on the Overview scan card. */
async function relabelInbox(
  ctx: Parameters<typeof labelFromIndex>[0],
  api: Parameters<typeof labelFromIndex>[1],
  now: number,
): Promise<number> {
  const index = await openMailIndex();
  const rows = (await index.all("gmail")).filter((r) => r.labelIds?.includes("INBOX"));
  const inbox = rows.map((r) => ({ id: r.id, labelIds: r.labelIds! }));
  // Progress writes run in order, so a late one can't overwrite "done".
  let writes = setScan({ phase: "labelling", done: 0, total: inbox.length });
  const res = await labelFromIndex(ctx, api, inbox, (done, total) => {
    writes = writes.then(() => setScan({ done, total }));
  });
  await writes;
  // Patch the index so the next pass sees the new labels before Gmail's change feed does.
  const patched = rows.flatMap((r) => {
    const change = res.changes.get(r.id);
    if (!change) return [];
    return [{ ...r, labelIds: [...r.labelIds!.filter((l) => !change.remove.includes(l)), ...change.add] }];
  });
  await index.put(patched);
  const sorted = Object.values(res.byBucket).reduce((n, c) => n + (c ?? 0), 0);
  const scan = await getScan();
  await setScan({
    phase: "done",
    byBucket: res.byBucket,
    labelled: res.labelled,
    fixed: res.fixed,
    unsorted: inbox.length - sorted,
    finishedAt: now,
    dismissed: scan?.phase === "done" ? scan.dismissed : false,
  });
  const changed = res.labelled + res.fixed;
  if (changed > 0) {
    await appendActionLog([
      { id: makeLogId("sort"), at: now, kind: "sort", summary: `Labelled ${changed} message${changed === 1 ? "" : "s"} in the inbox` },
    ]);
    await notify("scan-done", `Scan done: ${changed.toLocaleString()} labelled.`);
  }
  return res.labelled;
}
