// "Sort my inbox" — extracted from dashboard.ts (the first slice of the split).
// Owns its own DOM refs and module state; reads the shared scan/settings via
// `ctx` and triggers a rescan / writes the action log via the state bridge.
import { log } from "../lib/log";
import {
  buildSortPlan,
  resolvePlanLabels,
  totalPlanCount,
  type PlanLabelConflict,
  type SortPlanEntry,
  type SortPlanMessage,
} from "../lib/autoSort";
import { ALL_SORT_BUCKETS, SORT_BUCKET_LABELS, type SortBucket } from "../lib/sortTaxonomy";
import { SORT_RULE_PREFIX } from "../lib/clusterLabels";
import { syncGmailCategoryFilters } from "../lib/categoryFilters";
import { buildBucketRule, bucketMatchTerms, isServerSortBucket } from "../lib/serverSort";
import { colorClusterLabels, getOrCreateLabel, listLabels, listMessageIds } from "../lib/gmailApi";
import { categoryLabelName } from "../lib/categoryFilters";
import { runInboxTimeLimits } from "../lib/inboxTimeLimitsRunner";
import { getScan, newScan, onScanChange, setScan, type ScanState } from "../lib/scanState";
import {
  createInboxRule,
  deleteInboxRule,
  getArchiveFolderId,
  outlookProvider,
} from "../lib/providers/outlookProvider";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { recordRuleCompletions } from "../lib/ruleCompletionLedger";
import { applyLabelChoice } from "../lib/labelResolver";
import { upsertRuleByName, type ClusterRule } from "../lib/rules";
import type { MessageKind } from "../lib/messageKind";
import type { DomainCategory } from "../lib/domainCategories";
import type { ProviderId } from "../lib/providers/emailProvider";
import type { SenderSummary } from "../lib/senderModel";
import { updateSettings } from "../lib/settingsStore";
import { activeProviders, ctx, logAction, providerById, rescan } from "./state";
import { setNowCounts } from "./timeLimitsTab";
import { pruneSelection } from "./ui";
import { gmailLabelIcon } from "./homeDashboard";
import { undoEntry } from "./recentTab";
import { CLUSTER_LABEL_COLORS, type ClusterLabelKey } from "../lib/clusterLabels";
import type { ActionLogEntry } from "../lib/actionLog";

const sortInboxBtn = document.getElementById("sort-inbox-btn") as HTMLButtonElement;
const sortInboxSlot = document.getElementById("sort-inbox-slot") as HTMLSpanElement;
const sortInboxCountEl = document.getElementById("sort-inbox-count") as HTMLSpanElement;
const sortInboxPreviewEl = document.getElementById("sort-inbox-preview") as HTMLDivElement;
// The top bar's Sort inbox opens its page (data-open-screen) and builds the plan there.
const topSortBtn = document.getElementById("top-sort") as HTMLButtonElement | null;
topSortBtn?.addEventListener("click", () => setTimeout(() => renderSortChoices(), 0));

const num = (n: number) => n.toLocaleString();
/** "📦 Orders & shipping" → "Orders & shipping"; names without an emoji stay whole. */
const plainLabel = (name: string) => name.replace(/^[^\p{L}\p{N}]+\s/u, "");

// ── "Sort my inbox" (Clean up tab) ──────────────────────────────────────
// Buckets that come from the message kind (subject) rather than the sender's
// domain category -- they need a `kind` rule condition, the rest need
// `fromDomainCategory`.
const KIND_SORT_BUCKETS = new Set<SortBucket>(["otp", "receipt", "shipping", "newsletter", "social"]);

let sortPlan: SortPlanEntry[] = [];
// Message ids the user unticked in the preview — skipped when Apply runs.
// Cleared on every rescan and after a successful sort.
const excludedSortIds = new Set<string>();

function resetSortInboxSlot() {
  sortInboxSlot.innerHTML = "";
  sortInboxSlot.appendChild(sortInboxBtn);
}

function clearSortPreview() {
  sortInboxPreviewEl.innerHTML = "";
  sortInboxPreviewEl.classList.remove("sorting");
}

const HOUR_MS = 60 * 60 * 1000;

/** A kind's menu on the Organize list: hours in the inbox, Infinity when it
 * stays (labelled only), or null when it is off. */
function limitFor(bucket: SortBucket): number | null {
  const value = (document.getElementById(`time-limit-${bucket}`) as HTMLSelectElement | null)?.value;
  if (value === undefined) {
    if (ctx.settings.autoSort.labelsOff.includes(bucket)) return null;
    return ctx.settings.autoSort.inboxHoursByBucket[bucket] ?? Infinity;
  }
  if (value === "off") return null;
  return value === "stay" ? Infinity : Number(value);
}

function planPart(entry: SortPlanEntry, messages: SortPlanMessage[], fileOut: boolean): SortPlanEntry {
  const idsByProvider = new Map<ProviderId, string[]>();
  for (const m of messages) idsByProvider.set(m.provider, [...(idsByProvider.get(m.provider) ?? []), m.id]);
  return { ...entry, fileOut, messages, count: messages.length, idsByProvider };
}

/** The plan as Sort my inbox runs it: kinds that are off drop out, and each
 * other kind splits into mail past its time (moves out now) and mail that isn't yet
 * (labelled, left in the inbox for the timer). */
function chosenEntries(now = Date.now()): SortPlanEntry[] {
  return sortPlan.flatMap((entry) => {
    const hours = limitFor(entry.bucket);
    if (hours === null) return [];
    const due = entry.messages.filter((m) => now - m.receivedAt >= hours * HOUR_MS);
    const notYet = entry.messages.filter((m) => now - m.receivedAt < hours * HOUR_MS);
    return [planPart(entry, due, true), planPart(entry, notYet, false)].filter((e) => e.count > 0);
  });
}

/** The slot still holds the plain button (no confirm or progress showing). */
function sortInboxSlotIdle(): boolean {
  return sortInboxBtn.isConnected;
}

function updateSortInboxCount() {
  const chosen = chosenEntries();
  const moving = totalPlanCount(chosen.filter((e) => e.fileOut));
  const labelled = totalPlanCount(chosen) - moving;
  const emails = (n: number) => `${n.toLocaleString()} email${n === 1 ? "" : "s"}`;
  sortInboxCountEl.textContent =
    moving > 0 ? `${emails(moving)} move now` : labelled > 0 ? `${emails(labelled)} get labels` : "";
  sortInboxBtn.disabled = chosen.length === 0;
  // Nothing to sort: no button at all, rather than a disabled one.
  const bar = document.getElementById("sort-inbox-bar");
  if (bar) bar.hidden = chosen.length === 0 && sortInboxSlotIdle();
}

/** The plan changed: refresh each kind's "N now" and the button's count. */
function planChanged() {
  setNowCounts(new Map(sortPlan.map((e) => [e.bucket, e.count])));
  updateSortInboxCount();
}

/** Each sender's majority kind from its profile (senderProfile.ts). */
function senderKinds() {
  return new Map([...ctx.profiles].map(([key, profile]) => [key, profile.kind] as const));
}

function renderSortInbox(senders: SenderSummary[]) {
  sortPlan = buildSortPlan(senders, {}, ctx.settings.sortOverrides, senderKinds());
  resetSortInboxSlot();
  if (!busy) renderSortChoices();
  pruneSelection(
    excludedSortIds,
    sortPlan.flatMap((e) => e.messages.map((m) => m.id)),
  );
  planChanged();
}

// Cluster's sort-bucket labels are flat ("Shopping", …). A name the user
// already has is reused as it is (the old prompt's main choice), so a sort
// never stops to ask. Choices persist in settings.labelChoices.
async function reuseClashingLabels(conflicts: PlanLabelConflict[]) {
  const choices = { ...ctx.settings.labelChoices };
  for (const c of conflicts) choices[c.desired] = applyLabelChoice(c.desired, "reuse");
  ctx.settings = await updateSettings({ labelChoices: choices });
}

// ── Sort inbox (2026-11-06) ─────────────────────────────────────────────
// Two choices, then one run with nothing more to decide.
//  New mail: scan, sort the mail that has no Cluster label yet, then show
//    which labels it went into (each with Undo).
//  Everything: make every Cluster label, re-sort the whole inbox from the mail
//    index whether it was labelled or not, then say it's all sorted.
// Motion is one calm ring: it turns slowly while it looks, fills as it works,
// and draws a check at the end. Reduced motion keeps only the numbers.
type SortMode = "new" | "all";
let busy = false;
// Fed by the Everything run while the background relabel reports progress.
let scanProgress: ((scan: ScanState) => void) | null = null;
onScanChange((scan) => scanProgress?.(scan));

/** The ring the run lives in: `looking` turns a short arc, `set` fills it. */
function sortRing() {
  const ring = document.createElement("div");
  ring.className = "sort-ring";
  const middle = document.createElement("div");
  middle.className = "sort-ring-mid";
  ring.append(middle);
  return {
    ring,
    middle,
    looking: (on: boolean) => ring.classList.toggle("is-looking", on),
    set: (share: number) => ring.style.setProperty("--p", String(Math.min(1, Math.max(0, share)))),
  };
}

/** A check that draws itself (stroke-dashoffset), for the finished ring. */
function drawnCheck(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 52 52");
  svg.setAttribute("class", "sort-check");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M15 27l7 7 15-16");
  path.setAttribute("pathLength", "1");
  svg.append(path);
  return svg;
}

/** The page during a run: the ring, a headline, one line, the actions, then rows. */
function sortStage() {
  const { ring, middle, looking, set } = sortRing();
  const big = document.createElement("b");
  big.className = "sort-big";
  const sub = document.createElement("p");
  sub.className = "sort-sub";
  sub.setAttribute("aria-live", "polite");
  const actions = document.createElement("div");
  actions.className = "sort-actions";
  const words = document.createElement("div");
  words.className = "sort-words";
  words.append(big, sub, actions);
  const hero = document.createElement("div");
  hero.className = "sort-hero";
  hero.append(ring, words);
  const list = document.createElement("div");
  list.className = "sort-plan";
  sortInboxPreviewEl.replaceChildren(hero, list);
  sortInboxPreviewEl.classList.add("sorting");

  const stage = {
    ring,
    big,
    sub,
    actions,
    list,
    /** Working out what to do: the arc turns, no number yet. */
    look(title: string, line: string) {
      looking(true);
      middle.replaceChildren(gmailLabelIcon());
      big.textContent = title;
      sub.textContent = line;
    },
    /** Sorting: the ring fills to done/total and shows the count. */
    progress(done: number, total: number, line: string) {
      looking(false);
      const count = document.createElement("b");
      count.textContent = num(done);
      const of = document.createElement("span");
      of.textContent = `of ${num(total)}`;
      middle.replaceChildren(count, of);
      set(done / Math.max(1, total));
      big.textContent = "Sorting…";
      sub.textContent = line;
    },
    /** Finished: a full ring with a check, the result, and Done. */
    finish(title: string, line: string) {
      sortInboxPreviewEl.classList.remove("sorting");
      looking(false);
      set(1);
      ring.classList.add("is-done");
      middle.replaceChildren(drawnCheck());
      big.textContent = title;
      sub.textContent = line;
      const doneBtn = document.createElement("button");
      doneBtn.className = "btn btn-accent-solid";
      doneBtn.textContent = "Done";
      doneBtn.onclick = () => renderSortChoices();
      actions.replaceChildren(doneBtn);
    },
    /** Nothing ran: an empty ring with the label icon, no check. */
    idle() {
      set(0);
      ring.classList.remove("is-done");
      middle.replaceChildren(gmailLabelIcon());
    },
    fail() {
      sortInboxPreviewEl.classList.remove("sorting");
      looking(false);
      big.textContent = "Sort stopped";
      sub.textContent = "Something went wrong. What finished stays sorted.";
      const again = document.createElement("button");
      again.className = "btn btn-accent-solid";
      again.textContent = "Try again";
      again.onclick = () => renderSortChoices();
      actions.replaceChildren(again);
    },
  };
  return stage;
}
type SortStage = ReturnType<typeof sortStage>;

/** The start of the page: two ways to sort. Picking one starts it. */
function renderSortChoices() {
  if (busy) return;
  clearSortPreview();
  const wrap = document.createElement("div");
  wrap.className = "sort-choices";
  const choice = (mode: SortMode, title: string, line: string) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sort-choice";
    btn.dataset.mode = mode;
    const t = document.createElement("b");
    t.textContent = title;
    const l = document.createElement("span");
    l.textContent = line;
    btn.append(t, l);
    btn.onclick = () => void runSort(mode);
    return btn;
  };
  wrap.append(
    choice("new", "New mail", "Sort mail that has no label yet."),
    choice("all", "Everything", "Sort the whole inbox again, labelled or not."),
  );
  sortInboxPreviewEl.replaceChildren(wrap);
}

async function runSort(mode: SortMode) {
  if (busy) return;
  busy = true;
  const stage = sortStage();
  stage.look("Scanning", "Reading your inbox");
  try {
    if (mode === "all" && ctx.settings.autoSort.timeLimitsEnabled && (await gmailProvider.isConnected())) {
      await resortEverything(stage);
      return;
    }
    await rescan();
    const plan = await planToRun(mode);
    if (plan.labelsOff) {
      stage.finish("No labels are on", "Choose where each kind of mail goes in Labels.");
      const open = document.createElement("button");
      open.className = "btn";
      open.textContent = "Open Labels";
      open.onclick = () =>
        document.querySelector<HTMLButtonElement>('#sidebar .nav-item[data-screen="organize"]')?.click();
      stage.actions.append(open);
      stage.idle();
      return;
    }
    if (plan.chosen.length === 0) {
      stage.finish(
        mode === "new" ? "Nothing new to sort" : "Everything is sorted",
        "Every email already has its label.",
      );
      return;
    }
    await sortWithPlan(plan.chosen, plan.knownLower, stage, mode);
  } catch (err) {
    log.error("Sort inbox failed", err);
    stage.fail();
  } finally {
    busy = false;
    scanProgress = null;
  }
}

/** The plan for this run, label names settled. New mail skips anything that
 * already carries a Cluster label (asked of Gmail). */
async function planToRun(
  mode: SortMode,
): Promise<{ chosen: SortPlanEntry[]; knownLower: Set<string>; labelsOff: boolean }> {
  let labels: Array<{ id: string; name: string }> = [];
  const token = await gmailProvider.getAuthToken(false).catch(() => "");
  try {
    labels = token ? await listLabels(token) : [];
  } catch (err) {
    log.error("Couldn't list Gmail labels", err);
  }
  const names = labels.map((l) => l.name);
  sortPlan = buildSortPlan(ctx.senders, {}, ctx.settings.sortOverrides, senderKinds());
  let raw = chosenEntries();
  // Mail to sort, but every kind it belongs to is Off in Labels.
  const labelsOff = raw.length === 0 && sortPlan.length > 0;
  if (mode === "new") {
    const ours = new Set(
      [
        ...ALL_SORT_BUCKETS.map((b) => categoryLabelName(b, ctx.settings.labelChoices)),
        ...ctx.settings.clusterOwnedLabels,
      ].map((n) => n.toLowerCase()),
    );
    // Ask Gmail, not the mail index: the index only sees labels added by a
    // sort on its next sync, so a second run would pick the same mail again.
    const sorted = new Set<string>();
    for (const l of labels.filter((l) => ours.has(l.name.toLowerCase()))) {
      for (const m of await listMessageIds(token, "", 5000, ["INBOX", l.id])) sorted.add(m.id);
    }
    raw = raw
      .map((e) =>
        planPart(
          e,
          e.messages.filter((m) => !(m.provider === "gmail" && sorted.has(m.id))),
          e.fileOut,
        ),
      )
      .filter((e) => e.count > 0);
  }
  let resolved = resolvePlanLabels(raw, names, ctx.settings.clusterOwnedLabels, ctx.settings.labelChoices);
  if (resolved.conflicts.length > 0) {
    await reuseClashingLabels(resolved.conflicts);
    resolved = resolvePlanLabels(raw, names, ctx.settings.clusterOwnedLabels, ctx.settings.labelChoices);
  }
  return { chosen: resolved.plan, knownLower: new Set(names.map((n) => n.toLowerCase())), labelsOff };
}

/** Runs the plan label by label: rows go gray, then active, then ticked. */
async function sortWithPlan(
  chosen: SortPlanEntry[],
  knownLower: Set<string>,
  stage: SortStage,
  mode: SortMode,
) {
  const total = totalPlanCount(chosen);
  const started = Date.now();
  let sorted = 0;
  // One row per label, however the time limit split it (due mail files out, newer stays).
  const parts = new Map<string, SortPlanEntry[]>();
  for (const e of chosen) parts.set(e.bucket, [...(parts.get(e.bucket) ?? []), e]);
  const left = new Map<string, number>();
  for (const [bucket, group] of parts) {
    left.set(bucket, group.length);
    const row = document.createElement("div");
    row.className = "sort-preview-bucket";
    row.dataset.key = bucket;
    const count = group.reduce((n, e) => n + e.count, 0);
    row.append(
      document.createElement("i"),
      ...labelCells(
        group[0].label,
        bucket,
        count,
        whereText(
          group.map((e) => e.fileOut),
          "Files out",
          "Stays in inbox",
        ),
      ),
    );
    stage.list.append(row);
  }
  // Stop finishes the label in hand, then ends; what's done stays done.
  let stop = false;
  const stopBtn = document.createElement("button");
  stopBtn.className = "btn";
  stopBtn.textContent = "Stop";
  stopBtn.onclick = () => {
    stop = true;
    stopBtn.disabled = true;
    stopBtn.textContent = "Stopping…";
  };
  stage.progress(0, total, "Getting started");
  stage.actions.replaceChildren(stopBtn);
  const rowFor = (e: SortPlanEntry) => stage.list.querySelector<HTMLElement>(`[data-key="${e.bucket}"]`);
  const summary = await applySortPlan(
    chosen,
    knownLower,
    (e, phase) => {
      const row = rowFor(e);
      if (phase === "start") {
        row?.classList.add("active");
        stage.progress(sorted, total, `Filing ${plainLabel(e.label)}`);
      }
      if (phase === "done") {
        const rest = (left.get(e.bucket) ?? 1) - 1;
        left.set(e.bucket, rest);
        if (rest === 0) row?.classList.replace("active", "done");
        sorted += e.count;
        stage.progress(sorted, total, sorted >= total ? "Finishing up" : `Filed ${plainLabel(e.label)}`);
      }
    },
    () => stop,
  );
  if (mode === "all") {
    stage.list.replaceChildren();
    stage.finish("Everything is sorted", `${num(sorted)} email${sorted === 1 ? "" : "s"} checked`);
    return;
  }
  renderSortReport(summary, started);
}

/** Everything: make the labels, then relabel the whole inbox from the index.
 * The background pass reports done/total through the scan state. */
async function resortEverything(stage: SortStage) {
  const token = await gmailProvider.getAuthToken(false);
  stage.look("Creating labels", "Making sure every label is in Gmail");
  for (const bucket of ALL_SORT_BUCKETS.filter((b) => !ctx.settings.autoSort.labelsOff.includes(b))) {
    await getOrCreateLabel(token, categoryLabelName(bucket, ctx.settings.labelChoices));
  }
  await colorClusterLabels(token).catch((err) => log.error("Sort: label colors", err));
  stage.look("Scanning", "Reading your inbox");
  let checked = 0;
  scanProgress = (scan) => {
    if (scan.phase !== "labelling" || scan.total === 0) return;
    checked = scan.total;
    stage.progress(scan.done, scan.total, "Sorting every email");
  };
  await setScan({ ...newScan(), phase: "labelling" });
  await runInboxTimeLimits(Date.now(), { relabel: true });
  // No index yet, or nothing to do: don't leave the Overview card spinning.
  const scan = await getScan();
  if (scan?.phase !== "done") await setScan({ phase: "done", finishedAt: Date.now() });
  else checked = Math.max(checked, scan.total);
  scanProgress = null;
  await rescan();
  stage.finish(
    "Everything is sorted",
    checked > 0 ? `${num(checked)} emails checked` : "Every email has its label.",
  );
}

/** Where a label's mail went: all out, all kept, or due mail out and the rest kept. */
function whereText(filedOut: boolean[], out: string, kept: string): string {
  if (filedOut.every(Boolean)) return out;
  return filedOut.some(Boolean) ? "Older mail filed out" : kept;
}

/** A label row's cells: Gmail tag + name, the count, where the mail goes. */
function labelCells(label: string, bucket: string | undefined, count: number, where: string): HTMLElement[] {
  const name = document.createElement("span");
  name.className = "sort-name";
  name.append(
    gmailLabelIcon(CLUSTER_LABEL_COLORS[bucket as ClusterLabelKey]?.backgroundColor),
    plainLabel(label),
  );
  const n = document.createElement("b");
  n.className = "sort-count";
  n.textContent = num(count);
  const w = document.createElement("span");
  w.className = "sort-where";
  w.textContent = where;
  return [name, n, w];
}

/** After a sort: the total, then one row per label with its own Undo (from the action log). */
function renderSortReport(summary: string, started: number) {
  sortInboxPreviewEl.classList.remove("sorting");
  const logged = ctx.settings.actionLog.filter((e) => e.kind === "sort" && e.at >= started);
  const countOf = (e: ActionLogEntry) =>
    e.undo?.ids.length ?? Number(/Sorted (\d+)/.exec(e.summary)?.[1] ?? 0);
  const total = logged.reduce((n, e) => n + countOf(e), 0);
  const secs = Math.max(1, Math.round((Date.now() - started) / 1000));
  const report = document.createElement("div");
  report.className = "sort-report";
  const { ring, middle, set } = sortRing();
  ring.classList.add("is-done");
  set(1);
  middle.append(drawnCheck());
  const big = document.createElement("b");
  big.className = "sort-big";
  big.textContent = `${num(total)} email${total === 1 ? "" : "s"} sorted`;
  const sub = document.createElement("p");
  sub.className = "sort-sub";
  const groups = new Map<string, ActionLogEntry[]>();
  for (const e of logged) {
    const label = e.undo?.labelName ?? /"(.+)"/.exec(e.summary)?.[1] ?? "";
    groups.set(label, [...(groups.get(label) ?? []), e]);
  }
  sub.textContent = `${groups.size} label${groups.size === 1 ? "" : "s"} · ${secs} s`;
  sub.title = summary;
  const words = document.createElement("div");
  words.className = "sort-words";
  const hero = document.createElement("div");
  hero.className = "sort-hero";
  hero.append(ring, words);
  const list = document.createElement("div");
  list.className = "sort-plan sort-report-rows";
  const byLabel = new Map(sortPlan.map((e) => [e.label, e.bucket]));
  for (const [label, group] of groups) {
    const row = document.createElement("div");
    row.className = "sort-report-row done";
    const count = group.reduce((n, e) => n + countOf(e), 0);
    row.append(
      document.createElement("i"),
      ...labelCells(
        label,
        byLabel.get(label),
        count,
        whereText(
          group.map((e) => !!e.undo?.wasFiledOut),
          "Filed out",
          "In inbox",
        ),
      ),
    );
    const undoable = group.filter((e) => e.undo);
    if (undoable.length > 0) {
      const undo = document.createElement("button");
      undo.className = "sort-undo";
      undo.textContent = "Undo";
      undo.onclick = async () => {
        undo.disabled = true;
        undo.textContent = "Undoing…";
        try {
          for (const e of undoable) await undoEntry(e);
          undo.textContent = "Undone";
        } catch (err) {
          log.error(err);
          undo.disabled = false;
          undo.textContent = "Undo failed, try again";
        }
      };
      row.append(undo);
    }
    list.append(row);
  }
  const doneBtn = document.createElement("button");
  doneBtn.className = "btn btn-accent-solid";
  doneBtn.textContent = "Done";
  doneBtn.onclick = () => renderSortChoices();
  const actions = document.createElement("div");
  actions.className = "sort-actions";
  actions.append(doneBtn);
  words.append(big, sub, actions);
  report.append(hero, list);
  sortInboxPreviewEl.replaceChildren(report);
}

async function applySortPlan(
  chosen: SortPlanEntry[],
  knownLower: Set<string>,
  onStep?: (entry: SortPlanEntry, phase: "start" | "done") => void,
  shouldStop?: () => boolean,
): Promise<string> {
  // Drop unticked messages, then any bucket that's now empty.
  const effective = chosen
    .map((entry) => {
      const messages = entry.messages.filter((m) => !excludedSortIds.has(m.id));
      const idsByProvider = new Map<ProviderId, string[]>();
      for (const m of messages) {
        const list = idsByProvider.get(m.provider) ?? [];
        list.push(m.id);
        idsByProvider.set(m.provider, list);
      }
      return { ...entry, messages, idsByProvider, count: messages.length };
    })
    .filter((e) => e.count > 0);
  if (effective.length === 0) return "Nothing selected";

  const total = effective.reduce((sum, e) => sum + e.count, 0);
  // Any kind that isn't Off also sorts new mail.
  const keepOn = ctx.settings.autoSort.timeLimitsEnabled;

  // Apply the one-time backlog.
  for (const entry of effective) {
    if (shouldStop?.()) break;
    onStep?.(entry, "start");
    for (const [pid, ids] of entry.idsByProvider) {
      const provider = providerById.get(pid);
      if (!provider?.labelMessages || ids.length === 0) continue;
      const token = await provider.getAuthToken(false);
      await provider.labelMessages(token, ids, entry.label, !entry.fileOut);
    }
    const gmailIds = entry.idsByProvider.get("gmail") ?? [];
    await logAction(
      "sort",
      `Sorted ${entry.count} into "${entry.label}"`,
      gmailIds.length > 0
        ? {
            provider: "gmail",
            ids: gmailIds,
            via: "unsort",
            labelName: entry.label,
            wasFiledOut: entry.fileOut,
          }
        : undefined,
    );
    onStep?.(entry, "done");
  }

  // Record any label we just created so a later run reuses it without asking.
  const created = [
    ...new Set(
      effective
        .map((e) => e.label)
        .filter(
          (name) =>
            !knownLower.has(name.toLowerCase()) &&
            !ctx.settings.clusterOwnedLabels.some((o) => o.toLowerCase() === name.toLowerCase()),
        ),
    ),
  ];
  if (created.length > 0) {
    ctx.settings = await updateSettings({
      clusterOwnedLabels: [...ctx.settings.clusterOwnedLabels, ...created],
    });
  }

  // ── Keep sorting ───────────────────────────────────────────────────────
  // Which categories stay sorted is a setting, not "whatever had mail in this
  // scan": a chosen category with nothing to sort today keeps its filter, and
  // a category not shown this time keeps whatever it had.
  const shown = new Set<string>(sortPlan.map((e) => e.bucket));
  const enabledBuckets = [
    ...new Set([
      ...ctx.settings.autoSort.enabledBuckets.filter((b) => !shown.has(b)),
      ...chosen.map((e) => e.bucket),
    ]),
  ];
  ctx.settings = await updateSettings({
    autoSort: {
      ...ctx.settings.autoSort,
      enabledBuckets,
      keepSorting: keepOn,
    },
  });

  // Gmail: one filter per category, built from settings (categoryFilters.ts).
  const gmailToken = await gmailProvider.getAuthToken(false).catch((err) => {
    log.error("keep-sorting: no Gmail token", err);
    return null;
  });
  if (gmailToken) {
    try {
      const synced = await syncGmailCategoryFilters(ctx.settings, gmailToken);
      ctx.settings = await updateSettings({
        autoSort: {
          ...ctx.settings.autoSort,
          filterIdsByBucket: synced.filterIdsByBucket,
          filterSpecByBucket: synced.filterSpecByBucket,
        },
      });
    } catch (err) {
      log.error("keep-sorting: Gmail filter sync failed", err);
    }
  }

  // Outlook: an inbox rule per sender-based category, plus client rules.
  const outlookOn = activeProviders.some((p) => p.id === "outlook");
  const outlookToken = outlookOn
    ? await outlookProvider.getAuthToken(false).catch((err: unknown) => {
        log.error("keep-sorting: no Outlook token", err);
        return null;
      })
    : null;
  const archiveFolderId = outlookToken ? await getArchiveFolderId(outlookToken).catch(() => null) : null;
  const ruleIds: Record<string, string[]> = { ...ctx.settings.autoSort.ruleIdsByBucket };
  const keptOutlookBuckets = new Set(
    keepOn ? enabledBuckets.filter((b) => isServerSortBucket(b as SortBucket)) : [],
  );
  for (const bucket of Object.keys(ruleIds)) {
    if (keptOutlookBuckets.has(bucket)) continue;
    if (outlookToken) {
      for (const id of ruleIds[bucket] ?? []) {
        await deleteInboxRule(outlookToken, id).catch((err) => log.error("keep-sorting: delete rule", err));
      }
    }
    delete ruleIds[bucket];
  }

  let rules = ctx.settings.rules;
  if (keepOn) {
    const sortCompletions: Array<{ rule: ClusterRule; idsByProvider: Map<ProviderId, string[]> }> = [];

    // One standing rule per kind, however the one-time sort split it. A rule
    // has no timer, so only "Straight to label" files new mail out.
    const standing = new Map<SortBucket, (typeof effective)[number]>();
    for (const e of effective) {
      const prev = standing.get(e.bucket);
      if (!prev) {
        standing.set(e.bucket, {
          ...e,
          fileOut: limitFor(e.bucket) === 0,
          idsByProvider: new Map(e.idsByProvider),
        });
        continue;
      }
      for (const [pid, ids] of e.idsByProvider)
        prev.idsByProvider.set(pid, [...(prev.idsByProvider.get(pid) ?? []), ...ids]);
    }
    for (const entry of standing.values()) {
      const server = isServerSortBucket(entry.bucket);
      const hasOutlook = (entry.idsByProvider.get("outlook") ?? []).length > 0;
      const terms = server ? bucketMatchTerms(entry.bucket, ctx.settings.sortOverrides) : null;

      if (server && terms && outlookToken) {
        for (const id of ruleIds[entry.bucket] ?? []) {
          await deleteInboxRule(outlookToken, id).catch((err) =>
            log.error("keep-sorting: replace rule", err),
          );
        }
        const ruleBody = buildBucketRule(
          `Cluster: ${SORT_BUCKET_LABELS[entry.bucket]}`,
          entry.label,
          entry.fileOut,
          archiveFolderId,
          terms,
          20,
        );
        try {
          ruleIds[entry.bucket] = ruleBody ? [await createInboxRule(outlookToken, ruleBody)] : [];
        } catch (err) {
          log.error("keep-sorting: create Outlook rule", err);
          ruleIds[entry.bucket] = [];
        }
      }

      // Gmail filters now cover every category, so a client rule is only
      // needed for Outlook mail; an old Gmail-only one would fight the time
      // limits by filing mail out on every scan.
      const ruleName = `${SORT_RULE_PREFIX}${SORT_BUCKET_LABELS[entry.bucket]}`;
      if (!hasOutlook) {
        rules = rules.filter((rule) => rule.name !== ruleName);
        continue;
      }
      const nextRule: ClusterRule = {
        id: crypto.randomUUID(),
        name: ruleName,
        enabled: true,
        conditions: KIND_SORT_BUCKETS.has(entry.bucket)
          ? { kind: entry.bucket as MessageKind }
          : { fromDomainCategory: entry.bucket as DomainCategory },
        action: "label",
        labelName: entry.label,
        labelKeepInInbox: !entry.fileOut,
      };
      rules = upsertRuleByName(rules, nextRule);
      sortCompletions.push({
        rule: rules.find((rule) => rule.name === nextRule.name)!,
        idsByProvider: new Map(
          [...entry.idsByProvider].filter(
            ([providerId, ids]) => ids.length > 0 && providerById.get(providerId)?.labelMessages,
          ),
        ),
      });
    }
    if (ctx.settings.autoSort.expireOtp) {
      rules = upsertRuleByName(rules, {
        id: crypto.randomUUID(),
        name: `${SORT_RULE_PREFIX}expire one-time codes`,
        enabled: true,
        conditions: { kind: "otp", olderThanDays: 2 },
        action: "trash",
      });
    }
    await recordRuleCompletions(sortCompletions).catch((error) =>
      log.error("Could not seed auto-sort completion receipts", error),
    );
  }
  ctx.settings = await updateSettings({
    rules,
    autoSort: { ...ctx.settings.autoSort, ruleIdsByBucket: ruleIds },
  });
  const filterIds = ctx.settings.autoSort.filterIdsByBucket;

  excludedSortIds.clear();
  await rescan();
  const serverCount =
    Object.values(filterIds).reduce((n, ids) => n + ids.length, 0) +
    Object.values(ruleIds).reduce((n, ids) => n + ids.length, 0);
  const suffix = serverCount > 0 ? ` · ${serverCount} standing filter${serverCount === 1 ? "" : "s"}` : "";
  return `Sorted ${total} into ${effective.length} label${effective.length === 1 ? "" : "s"}${suffix}`;
}

function wireSortInbox() {
  sortInboxBtn.onclick = () => renderSortChoices();
  // A kind's menu changed: recount what moves.
  document.getElementById("time-limits-rows")?.addEventListener("change", updateSortInboxCount);
}

export { renderSortInbox, wireSortInbox };
