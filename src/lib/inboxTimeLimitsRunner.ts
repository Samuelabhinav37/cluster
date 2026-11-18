// Runs the inbox time limits against the live Gmail account: wires
// inboxTimeLimits.ts to the Gmail API, the shared metadata cache and the
// action log. Called by the 5-minute background alarm and by the dashboard
// right after the user saves their limits.
import { appendActionLog, makeLogId } from "./actionLog";
import { categoryLabelName, desiredCategoryFilters, syncGmailCategoryFilters } from "./categoryFilters";
import { batchModify, colorClusterLabels, findLabelIds, getOrCreateLabel, listLabels, listMessageIds } from "./gmailApi";
import { movedTo, tallyMoves, type LabelMove, type MoveTarget } from "./learnFromMoves";
import {
  holdUnsortedInbox,
  screenFirstTimeSenders,
  labelBySearch,
  labelFromIndex,
  pinInInbox,
  sweepExpiredInbox,
  TAG_BACK_DONE,
  tagOlderInbox,
  tagUntaggedInbox,
  withoutClusterLabels,
  type CategoryLimit,
  type InboxLimitsApi,
  type SweepResult,
  type TagResult,
} from "./inboxTimeLimits";
import { applyIndexedCorrespondents, indexSeededCache, mailIndexLockKey, refreshIndexForBackground } from "./indexTriage";
import { MAIL_INDEX_MAX, openMailIndex } from "./mailIndex";
import { indexNeedsBuild, syncMailIndex, type SyncOptions } from "./mailSync";
import { waitForGmailHeadroom } from "./gmailQuotaLedger";
import { log } from "./log";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";
import { tryWithStorageLock, withStorageLock } from "./storageLock";
import { getRunReports, startRun, type Run } from "./runReport";
import { notify } from "./notices";
import { getScan, newScan, setScan } from "./scanState";
import { loadMetadataCache, saveMetadataCache } from "./metadataCache";
import { gmailProvider } from "./providers/gmailProvider";
import { knownSenderSet } from "./screener";
import { buildSenderSummariesFromStubs } from "./senderModel";
import { getSettings, mutateSettings, type ClusterSettings } from "./settingsStore";
import { ALL_SORT_BUCKETS, type SortBucket } from "./sortTaxonomy";
import { clusterLabelName, showLabel } from "./clusterLabels";

/** Bump when labelling rules change (domains, kinds, phrases): the next run
 * relabels the whole indexed inbox once. */
export const LABEL_RULES_VERSION = 9;

export interface TimeLimitRun {
  tagged: number;
  moved: number;
  more: boolean;
}

const RUN_LOCK = "inbox-time-limits";

/** One tag + sweep pass, or null when time limits are off, Gmail isn't
 * connected, or (for the 5-minute alarm, `background`) another pass is still
 * going: two at once did the same work twice and ate the first read's quota.
 * Anything the user did waits its turn instead. Web Locks free the lock if
 * Chrome stops the worker mid-run. */
export async function runInboxTimeLimits(
  now = Date.now(),
  options: { relabel?: boolean; background?: boolean } = {},
): Promise<TimeLimitRun | null> {
  const pass = options.background
    ? await tryWithStorageLock(RUN_LOCK, () => runPass(now, options))
    : await withStorageLock(RUN_LOCK, () => runPass(now, options));
  if (!pass) return null;
  try {
    // Only a Rescan waits for a slow pass already going (it can take hours).
    const slow = options.relabel ? withStorageLock(SLOW_LOCK, pass.slow) : tryWithStorageLock(SLOW_LOCK, pass.slow);
    return (await slow) ?? pass.quick;
  } finally {
    await pass.run.finish();
  }
}

const SLOW_LOCK = "inbox-time-limits-slow";

async function runPass(
  now: number,
  options: { relabel?: boolean },
): Promise<{ quick: TimeLimitRun; slow: () => Promise<TimeLimitRun>; run: Run } | null> {
  const settings = await getSettings();
  if (!settings.autoSort.timeLimitsEnabled) return null;
  if (!(await gmailProvider.isConnected())) return null;
  const token = await gmailProvider.getAuthToken(false);
  // Every step lands in the run report (Settings, Diagnostics).
  const run = await startRun(options.relabel ? "rescan" : "sweep");
  // Each step stands alone: a failed filter sync or read must not stop the
  // sweep (labelled mail sat in the inbox for a week behind an earlier step).
  const step = <T>(name: string, fallback: T, fn: () => Promise<T>, counts?: (value: T) => Record<string, number>): Promise<T> =>
    run.step(
      name,
      fallback,
      () =>
        fn().catch((err: unknown) => {
          log.error(`Time limits: ${name} failed`, err);
          throw err;
        }),
      counts,
    );
  // An update can change what a category matches; Gmail's filters keep the
  // old query until rewritten. Unchanged filters cost no API calls.
  await step("filter sync", undefined, async () => {
    const synced = await syncGmailCategoryFilters(settings, token);
    if (synced.created === 0 && synced.deleted === 0) return;
    // Colours are cosmetic: a failure mustn't stop the labelling below.
    await colorClusterLabels(token).catch((err: unknown) => log.error("Time limits: label colours failed", err));
    await mutateSettings((current) => ({
      ...current,
      autoSort: { ...current.autoSort, filterIdsByBucket: synced.filterIdsByBucket, filterSpecByBucket: synced.filterSpecByBucket },
    }));
  });

  const limits = limitsFor(settings);
  const daily = now - settings.autoSort.lastRelabelAt > RELABEL_EVERY_MS;
  // The user asked (Rescan) or the rules changed: show it on the scan card.
  const shown = Boolean(options.relabel) || settings.autoSort.labelledVersion !== LABEL_RULES_VERSION;
  // First, before any read: label the inbox by each filter's own query.
  const searched =
    options.relabel || daily || settings.autoSort.searchedVersion !== LABEL_RULES_VERSION
      ? await step("search labelling", false, async () => (await searchLabelInbox(token, settings, limits, now, !shown), true))
      : true;
  // Senders come from the mail index (kept current from Gmail's change feed);
  // only inbox mail it doesn't have yet is read, then saved to it. Without
  // a built index this falls back to the old warm cache.
  const indexReady =
    (await refreshIndexForBackground([gmailProvider], settings.scanWindowDays, undefined, (moves) => learnFromLabelMoves(token, moves))).length > 0;
  const legacyCache = indexReady ? undefined : await loadMetadataCache(now);
  const api = limitsApi(token, legacyCache);
  const ctx = {
    limits,
    known: knownSenderSet(settings),
    overrides: settings.sortOverrides,
    now,
    keptIds: new Set(settings.autoSort.keptInInboxIds),
    holdPeople: settings.screenerHoldPeople,
  };

  // The quick work first: label new mail, then move out what is past its
  // time. The long read comes last, so a read that takes hours (or dies with
  // the service worker) never holds labelled mail in the inbox.
  const tag = await step<TagResult>("tagging", { tagged: 0, byBucket: {}, oldestAt: null, listed: 0 }, () => tagUntaggedInbox(ctx, api), (t) => ({ labelled: t.tagged }));
  // Before the sweep: mail from a first-time sender goes to the Screener, not its label.
  const since = settings.autoSort.screenNewSince || now;
  const screened = settings.autoSort.holdUnsorted && settings.autoSort.screenNewSince
    ? await step(
        "screen new senders",
        { heldIds: [] as string[], senders: [] as string[], vetted: [] as string[] },
        () =>
          screenFirstTimeSenders(
            ctx,
            api,
            clusterLabelName("screener"),
            since,
            new Set(settings.autoSort.vettedSenders),
            new Set(settings.screenedSenders.map((a) => a.toLowerCase())),
          ),
        (s) => ({ held: s.heldIds.length }),
      )
    : { heldIds: [], senders: [], vetted: [] };
  if (!settings.autoSort.screenNewSince || screened.senders.length > 0 || screened.vetted.length > 0) await mutateSettings((current) => ({
    ...current,
    screenedSenders: [...new Set([...current.screenedSenders, ...screened.senders])],
    autoSort: {
      ...current.autoSort,
      // The first run stamps it: everyone who wrote before now is let through.
      screenNewSince: current.autoSort.screenNewSince || since,
      vettedSenders: [...new Set([...current.autoSort.vettedSenders, ...screened.vetted])].slice(-VETTED_MAX),
    },
  }));
  if (screened.heldIds.length > 0) {
    const n = screened.heldIds.length;
    await appendActionLog([
      {
        id: makeLogId("sort"),
        at: now,
        kind: "sort",
        summary: `Held ${n} message${n === 1 ? "" : "s"} from new senders in the Screener`,
        undo: { provider: "gmail", ids: screened.heldIds, via: "unarchive" },
      },
    ]);
  }
  const sweep = await step<SweepResult>("sweep", { movedIds: [], keptIds: [], more: false }, () => sweepExpiredInbox(ctx, api), (w) => ({ moved: w.movedIds.length }));
  if (legacyCache) void saveMetadataCache(legacyCache);
  await mutateSettings((current) => ({
    ...current,
    autoSort: {
      ...current.autoSort,
      // Only a sweep that worked counts: a fresh stamp used to hide failures.
      lastSweep: run.succeeded("tagging", "sweep") ? { at: now, moved: sweep.movedIds.length } : current.autoSort.lastSweep,
      // Stamped the first run after any label is set to skip the inbox.
      skipInboxSince: Object.values(current.autoSort.inboxHoursByBucket).some((h) => h === 0)
        ? current.autoSort.skipInboxSince || now
        : 0,
      searchedVersion: searched ? LABEL_RULES_VERSION : current.autoSort.searchedVersion,
      // Stamped here, before the long read: an unfinished read must not make
      // the daily search run every five minutes.
      lastRelabelAt: daily && searched ? now : current.autoSort.lastRelabelAt,
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
  {
    const hold = settings.autoSort.holdUnsorted;
    const held = await step<{ heldIds: string[]; personalIds: string[]; senders: string[]; nextBefore: number }>(
      "hold",
      { heldIds: [], personalIds: [], senders: [], nextBefore: 0 },
      () => holdUnsortedInbox(ctx, api, clusterLabelName("screener"), settings.autoSort.holdBefore, clusterLabelName("personal"), hold),
      (h) => ({ held: h.heldIds.length, personal: h.personalIds.length }),
    );
    if (held.personalIds.length > 0) {
      const n = held.personalIds.length;
      await appendActionLog([
        {
          id: makeLogId("sort"),
          at: now,
          kind: "sort",
          summary: `Moved ${n} conversation message${n === 1 ? "" : "s"} into Personal`,
          undo: { provider: "gmail", ids: held.personalIds, via: "unarchive" },
        },
      ]);
    }
    // Listed as screened so the Screener page shows them waiting.
    await mutateSettings((current) => ({
      ...current,
      screenedSenders: [...new Set([...current.screenedSenders, ...held.senders])],
      autoSort: { ...current.autoSort, holdBefore: held.nextBefore },
    }));
    if (held.heldIds.length > 0) {
      const n = held.heldIds.length;
      // The scan card's "with no label" count goes down as they leave the inbox.
      const scan = await getScan();
      if (scan?.phase === "done") await setScan({ unsorted: Math.max(0, scan.unsorted - n) });
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

  const quick: TimeLimitRun = { tagged: tag.tagged, moved: sweep.movedIds.length, more: sweep.more };
  return { quick, slow: () => slowPass(), run };

  // Now the slow work, under its own lock so an hours-long read never holds
  // up the 5-minute sweep. A read the dashboard started and didn't finish
  // goes on here, labelling as it reads.
  async function slowPass(): Promise<TimeLimitRun> {
    const builtNow = await step("index build", false, () => continueIndexBuild(token, settings.scanWindowDays, settings.readCap, (read) => run.beat({ read })));
    // Then pages of older unlabelled inbox mail, until the whole inbox is seen.
    // A rescan (labels deleted in Gmail, say) works back through older inbox mail again.
    // So does a gap: the tagger only looks back two days, so after Chrome was
    // closed (or the run stalled) for longer, older mail would stay unlabelled.
    const gap = settings.autoSort.lastSweep.at > 0 && now - settings.autoSort.lastSweep.at > TAG_GAP_MS;
    const backFrom = options.relabel || gap ? 0 : settings.autoSort.tagBackBefore;
    const back = backFrom === TAG_BACK_DONE ? null : await step("older inbox", null, () => tagOlderPages(ctx, api, backFrom), (b) => ({ labelled: b?.tagged ?? 0 }));
    const indexDone = indexReady || builtNow;
    const relabelled =
      indexDone && (shown || builtNow || daily)
        ? await step<number | null>("relabel", null, () => relabelInbox(ctx, api, now, !shown && !builtNow), (n) => ({ labelled: n ?? 0 }))
        : null;
    // A card left on "Labelling" (its tab closed mid-pass) had no way out:
    // a finished relabel closes it, unless a Rescan is the one running.
    if (relabelled !== null && (await getScan())?.phase === "labelling") {
      const rescanning = (await getRunReports()).some((r) => r.kind === "rescan" && r.status === "running" && r.id !== run.report.id);
      if (!rescanning) await setScan({ phase: "done", finishedAt: Date.now() });
    }
    await mutateSettings((current) => ({
      ...current,
      autoSort: {
        ...current.autoSort,
        tagBackBefore: back ? back.nextBefore : current.autoSort.tagBackBefore,
        labelledVersion: relabelled !== null ? LABEL_RULES_VERSION : current.autoSort.labelledVersion,
        lastRelabelAt: relabelled !== null ? now : current.autoSort.lastRelabelAt,
      },
    }));
    return { tagged: tag.tagged + (back?.tagged ?? 0) + (relabelled ?? 0), moved: sweep.movedIds.length, more: sweep.more };
  }
}

/** The tagger's look-back (TAG_WINDOW in inboxTimeLimits.ts). */
const TAG_GAP_MS = 2 * 24 * 60 * 60 * 1000;
/** Once a day all read mail, archived too, is checked for missing labels,
 * without the scan card or a notification. */
const RELABEL_EVERY_MS = 24 * 60 * 60 * 1000;

/** Pages of older inbox mail (100 each) labelled per run, paced like the read. */
const OLDER_PAGES = 3;

/** Works back through inbox mail older than the read covers, a few paced
 * pages a run, until Gmail lists nothing older. */
async function tagOlderPages(ctx: Parameters<typeof tagOlderInbox>[0], api: InboxLimitsApi, before: number) {
  let tagged = 0;
  let nextBefore = before;
  for (let page = 0; page < OLDER_PAGES && nextBefore !== TAG_BACK_DONE; page++) {
    if (page > 0) await waitForGmailHeadroom();
    const res = await tagOlderInbox(ctx, api, nextBefore);
    tagged += res.tagged;
    // A failed read keeps its place; try again next run.
    if (res.nextBefore === nextBefore) break;
    nextBefore = res.nextBefore;
  }
  return { tagged, nextBefore };
}

function limitsFor(settings: ClusterSettings): CategoryLimit[] {
  return ALL_SORT_BUCKETS.filter((b) => !settings.autoSort.labelsOff.includes(b)).map((bucket) => ({
    bucket,
    labelName: categoryLabelName(bucket, settings.labelChoices),
    hours: settings.autoSort.inboxHoursByBucket[bucket] ?? null,
  }));
}

function limitsApi(token: string, legacyCache?: Awaited<ReturnType<typeof loadMetadataCache>>): InboxLimitsApi {
  return {
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
}

/** First-time-sender checks remembered; older ones are searched again. */
const VETTED_MAX = 2000;

/** Inbox mail read since the last flush is labelled in batches this big. */
const LABEL_BATCH = 200;

export type ReadLabeller = Required<Pick<SyncOptions, "onRead" | "onPlanned" | "onSentReady">> & { flush(): Promise<void> };

/**
 * Labels inbox mail as a mail-index build stores it, and shows the read on
 * the Overview scan card ("reading", done of total). Labelling waits until
 * some sent mail is in, so mail from people you write to is never labelled.
 * The read starts at sign-in, before setup turns labels on, so the card
 * counts from the start and labelling begins once they're on. Null when
 * there is no build to follow (the index is complete).
 */
export async function readLabeller(): Promise<ReadLabeller | null> {
  const settings = await getSettings();
  if (!(await gmailProvider.isConnected())) return null;
  const index = await openMailIndex();
  const state = await index.getState("gmail");
  if (!indexNeedsBuild(state, settings.scanWindowDays, settings.readCap)) return null;
  const token = await gmailProvider.getAuthToken(false);
  const ctx = { limits: limitsFor(settings), known: knownSenderSet(settings), overrides: settings.sortOverrides, now: Date.now() };
  const api = limitsApi(token);
  let peopleIn = (await index.sentIds("gmail")).size > 0;
  // A resumed read keeps counting on the card where it stopped.
  const before = await getScan();
  const carry = before?.phase === "reading" ? before : null;
  let read = carry?.done ?? 0;
  let total = carry?.total ?? 0;
  let labelled = carry?.labelled ?? 0;
  const byBucket: Partial<Record<SortBucket, number>> = { ...carry?.byBucket };
  let pending: NormalizedMessageMetadata[] = [];
  // A mailbox read before (a rebuild after an expired cursor or a new scan
  // range) mostly reads nothing new: don't flip a finished card back.
  if (!carry && !state?.complete) await setScan({ ...newScan(), phase: "reading" });

  const flush = async () => {
    const batch = pending.filter((r) => r.labelIds);
    pending = [];
    if (batch.length === 0) return;
    // Setup may have turned labels on (or "Ask me first" left them off) mid-read.
    const now = await getSettings();
    if (!now.autoSort.timeLimitsEnabled) return;
    ctx.limits = limitsFor(now);
    try {
      const res = await labelFromIndex(ctx, api, batch.map((r) => ({ id: r.id, labelIds: r.labelIds! })));
      const patched = batch.flatMap((r) => {
        const change = res.changes.get(r.id);
        return change ? [{ ...r, labelIds: [...r.labelIds!.filter((l) => !change.remove.includes(l)), ...change.add] }] : [];
      });
      await index.put(patched);
      labelled += res.labelled;
      for (const [bucket, count] of Object.entries(res.byBucket) as [SortBucket, number][])
        byBucket[bucket] = (byBucket[bucket] ?? 0) + count;
      await setScan({ labelled, byBucket: { ...byBucket } });
    } catch (err) {
      // The relabel after the read catches anything missed here.
      log.error("Scan: labelling while reading failed", err);
    }
  };
  return {
    onPlanned: (planned) => {
      // `planned` already holds the newest mail read before the plan, so only
      // a resumed read's earlier count is added (the card said 275 of 506 for
      // a 206-email mailbox).
      total = (carry?.done ?? 0) + planned;
      void setScan({ phase: "reading", done: read, total });
    },
    onSentReady: async () => {
      const written = await applyIndexedCorrespondents([gmailProvider], index);
      if (written) ctx.known = knownSenderSet(written);
      peopleIn = true;
    },
    onRead: async (rows, tried) => {
      // Sent mail is read to learn who you write to; the plan doesn't count it.
      read += tried - rows.filter((r) => r.labelIds?.includes("SENT") && !r.labelIds.includes("INBOX")).length;
      pending.push(...rows);
      if (peopleIn && pending.length >= LABEL_BATCH) await flush();
      await setScan({ phase: "reading", done: read, total: Math.max(total, read) });
    },
    flush: async () => {
      if (peopleIn) await flush();
    },
  };
}

/**
 * Carries on a mail-index build that isn't finished (the dashboard was closed
 * mid-read, or the user widened the window or the cap), labelling as it
 * reads. Skips when the dashboard is reading right now. True when this call
 * finished the build.
 */
async function continueIndexBuild(token: string, windowDays: number, cap: number, onRead?: (read: number) => void): Promise<boolean> {
  const index = await openMailIndex();
  if (!indexNeedsBuild(await index.getState("gmail"), windowDays, cap)) return false;
  const labeller = await readLabeller();
  const ran = await tryWithStorageLock(mailIndexLockKey(gmailProvider), () =>
    syncMailIndex(gmailProvider, token, index, {
      windowDays,
      cap,
      waitForHeadroom: waitForGmailHeadroom,
      onLabelMoves: (moves) => learnFromLabelMoves(token, moves),
      onProgress: (p) => onRead?.(p.done),
      ...labeller,
    }),
  );
  if (!ran) return false;
  await labeller?.flush();
  await applyIndexedCorrespondents([gmailProvider], index);
  return (await index.getState("gmail"))?.complete === true;
}

/** Labels (and fixes) every inbox message the mail index holds, with no
 * message reads, and reports it on the Overview scan card. */
async function relabelInbox(
  ctx: Parameters<typeof labelFromIndex>[0],
  api: Parameters<typeof labelFromIndex>[1],
  now: number,
  quiet = false,
): Promise<number> {
  const index = await openMailIndex();
  // All mail Cluster has read, not just the inbox: labels deleted in Gmail
  // come back on archived mail too, with no message reads.
  const rows = (await index.all("gmail")).filter((r) => r.labelIds);
  const all = rows.map((r) => ({ id: r.id, labelIds: r.labelIds! }));
  // Progress writes run in order, so a late one can't overwrite "done".
  let writes: Promise<unknown> = quiet ? Promise.resolve() : setScan({ phase: "labelling", done: 0, total: all.length });
  const res = await labelFromIndex(ctx, api, all, (done, total) => {
    if (!quiet) writes = writes.then(() => setScan({ done, total }));
  });
  await writes;
  // Patch the index so the next pass sees the new labels before Gmail's change feed does.
  const patched = rows.flatMap((r) => {
    const change = res.changes.get(r.id);
    if (!change) return [];
    return [{ ...r, labelIds: [...r.labelIds!.filter((l) => !change.remove.includes(l)), ...change.add] }];
  });
  await index.put(patched);
  const changed = res.labelled + res.fixed;
  if (changed > 0) {
    await appendActionLog([
      { id: makeLogId("sort"), at: now, kind: "sort", summary: `Labelled ${changed} message${changed === 1 ? "" : "s"}` },
    ]);
  }
  if (quiet) return res.labelled;
  const unsorted = rows.filter((r) => r.labelIds!.includes("INBOX") && !res.sortedIds.has(r.id)).length;
  const scan = await getScan();
  await setScan({
    phase: "done",
    byBucket: res.byBucket,
    // Every email that has its label now, including those labelled while reading.
    labelled: res.sortedIds.size,
    fixed: res.fixed,
    unsorted,
    finishedAt: now,
    dismissed: scan?.phase === "done" ? scan.dismissed : false,
  });
  // Mail labelled while reading leaves nothing new here; the scan is still done.
  if (res.sortedIds.size > 0) await notify("scan-done", `Scan done: ${res.sortedIds.size.toLocaleString()} labelled.`);
  return res.labelled;
}

/** Labels inbox mail by Gmail search (seconds, no reads) and shows the
 * counts on the scan card while the read goes on. */
async function searchLabelInbox(token: string, settings: ClusterSettings, limits: CategoryLimit[], now: number, quiet = false): Promise<void> {
  const wanted = new Set(limits.map((l) => l.bucket));
  const specs = desiredCategoryFilters(settings)
    .filter((s) => wanted.has(s.bucket))
    .map((s) => ({ bucket: s.bucket, labelName: s.labelName, queries: s.criteria.flatMap((c) => (c.query ? [c.query] : [])) }));
  const res = await labelBySearch(
    {
      findLabelId: async (name) => (await findLabelIds(token, name))[0] ?? null,
      ensureLabelId: (name) => getOrCreateLabel(token, name),
      listIds: async (labelIds, query, max) => (await listMessageIds(token, query, max, labelIds)).map((m) => m.id),
      readSenders: async () => [],
      batchModify: (ids, add, remove) => batchModify(token, ids, add, remove),
    },
    specs,
    // Archived mail too, back to the first email: a search labels thousands
    // for a few hundred quota units, with no email read.
    { allMail: true, skip: withoutClusterLabels(limits), max: MAIL_INDEX_MAX },
  );
  if (res.labelled === 0) return;
  const scan = await getScan();
  // A read under way owns the card; a relabel keeps its phase and finishes it.
  if (!quiet && scan?.phase !== "reading") {
    await setScan(
      scan?.phase === "labelling"
        ? { byBucket: res.byBucket, labelled: res.labelled }
        : { ...newScan(now), phase: "done", byBucket: res.byBucket, labelled: res.labelled, finishedAt: now },
    );
  }
  await appendActionLog([
    { id: makeLogId("sort"), at: now, kind: "sort", summary: `Labelled ${res.labelled} message${res.labelled === 1 ? "" : "s"} by search` },
  ]);
}

/** Saves a correction once a sender's Cluster label was swapped in Gmail
 * twice for the same one. The next run rewrites the filters to match. */
export async function learnFromLabelMoves(token: string, moves: LabelMove[]): Promise<void> {
  const settings = await getSettings();
  const byName = new Map<string, MoveTarget>(ALL_SORT_BUCKETS.map((b) => [categoryLabelName(b, settings.labelChoices), b]));
  byName.set(clusterLabelName("personal"), "personal");
  const labels = await listLabels(token);
  const bucketOf = new Map(labels.flatMap((l) => (byName.has(l.name) ? [[l.id, byName.get(l.name)!] as const] : [])));
  // Taking mail out of the Screener into a label teaches too.
  const fromIds = new Set([...bucketOf.keys(), ...labels.filter((l) => l.name === clusterLabelName("screener")).map((l) => l.id)]);
  const moved = movedTo(moves, bucketOf, fromIds);
  if (moved.length === 0) return;
  let learned: Array<[string, MoveTarget]> = [];
  await mutateSettings((current) => {
    const res = tallyMoves(current.autoSort.moveVotes, moved, current.sortOverrides);
    learned = res.learned;
    return {
      ...current,
      sortOverrides: { ...current.sortOverrides, ...Object.fromEntries(res.learned) },
      autoSort: { ...current.autoSort, moveVotes: res.votes },
    };
  });
  if (learned.length === 0) return;
  const now = Date.now();
  await appendActionLog(
    learned.map(([address, bucket]) => ({
      id: makeLogId("sort"),
      at: now,
      kind: "sort" as const,
      summary: `Learned from Gmail: ${address} goes to ${showLabel(bucket === "personal" ? clusterLabelName("personal") : categoryLabelName(bucket, settings.labelChoices))}`,
    })),
  );
}
