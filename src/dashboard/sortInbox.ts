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
import {
  ALL_SORT_BUCKETS,
  SORT_BUCKET_LABELS,
  type SortBucket,
  type SortOverride,
} from "../lib/sortTaxonomy";
import { SORT_RULE_PREFIX } from "../lib/clusterLabels";
import { syncGmailCategoryFilters } from "../lib/categoryFilters";
import {
  buildBucketRule,
  bucketMatchTerms,
  isServerSortBucket,
} from "../lib/serverSort";
import { domainOf } from "../lib/domainGrouping";
import { listLabelNames } from "../lib/gmailApi";
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
import { formatRelativeTime, pruneSelection } from "./ui";
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
topSortBtn?.addEventListener("click", () =>
  setTimeout(() => {
    if (sortInboxPreviewEl.classList.contains("sorting")) return;
    if (!sortInboxBtn.disabled) sortInboxBtn.click();
    else showNothingToSort();
  }, 0),
);

const num = (n: number) => n.toLocaleString();
/** "📦 Orders & shipping" → "Orders & shipping"; names without an emoji stay whole. */
const plainLabel = (name: string) => name.replace(/^[^\p{L}\p{N}]+\s/u, "");

function showNothingToSort() {
  const empty = document.createElement("div");
  empty.className = "sort-empty";
  const go = document.createElement("button");
  go.className = "btn";
  go.textContent = "Open Labels";
  go.onclick = () => document.querySelector<HTMLButtonElement>('#sidebar .nav-item[data-screen="organize"]')?.click();
  const p = document.createElement("p");
  p.textContent = "Nothing to sort. Choose where each label goes in Labels.";
  empty.append(p, go);
  sortInboxPreviewEl.replaceChildren(empty);
}

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
  clearSortPreview();
  pruneSelection(
    excludedSortIds,
    sortPlan.flatMap((e) => e.messages.map((m) => m.id)),
  );
  planChanged();
}

// Cluster's sort-bucket labels are flat ("Shopping", …). A name the user
// already has is reused, which was the old prompt's main choice ("Use mine for
// all"), so the page never stops to ask. Review first offers "Keep Cluster's
// separate" for those names. Choices persist in settings.labelChoices.
let reusedLabels: Array<{ desired: string; shown: string }> = [];

async function reuseClashingLabels(conflicts: PlanLabelConflict[], retry: () => void) {
  const choices = { ...ctx.settings.labelChoices };
  for (const c of conflicts) choices[c.desired] = applyLabelChoice(c.desired, "reuse");
  ctx.settings = await updateSettings({ labelChoices: choices });
  retry();
}

// Labels the mailbox already has, captured on the "Sort my inbox" click so a
// "wrong bucket?" correction can re-resolve names without another fetch.
let lastKnownLabelNames: string[] = [];

// Re-derive the plan with the current per-sender overrides, refresh the counts,
// resolve label names, and show either the collision prompt or the
// preview. Called by the button and after every override change.
function rebuildSortPreview() {
  sortPlan = buildSortPlan(ctx.senders, {}, ctx.settings.sortOverrides, senderKinds());
  planChanged();
  pruneSelection(
    excludedSortIds,
    sortPlan.flatMap((e) => e.messages.map((m) => m.id)),
  );

  const rawChosen = chosenEntries();
  if (rawChosen.length === 0) {
    clearSortPreview();
    return;
  }

  const { plan: chosen, conflicts } = resolvePlanLabels(
    rawChosen,
    lastKnownLabelNames,
    ctx.settings.clusterOwnedLabels,
    ctx.settings.labelChoices,
  );
  if (conflicts.length > 0) {
    void reuseClashingLabels(conflicts, rebuildSortPreview);
    return;
  }

  // Names the user already had and Cluster now uses as they are (choice "reuse").
  const known = new Set(lastKnownLabelNames.map((n) => n.toLowerCase()));
  const owned = new Set(ctx.settings.clusterOwnedLabels.map((n) => n.toLowerCase()));
  reusedLabels = Object.entries(ctx.settings.labelChoices)
    .filter(([desired, name]) => name === desired && known.has(name.toLowerCase()) && !owned.has(name.toLowerCase()))
    .filter(([desired]) => rawChosen.some((e) => e.label === desired))
    .map(([desired]) => ({ desired, shown: plainLabel(desired) }));
  renderSortPreview(chosen, known);
}

async function startSortFlow() {
  try {
    const token = await gmailProvider.getAuthToken(false);
    lastKnownLabelNames = await listLabelNames(token);
  } catch (err) {
    log.error("Couldn't list Gmail labels for the collision check", err);
    lastKnownLabelNames = [];
  }
  rebuildSortPreview();
}

/** Saves a correction for this address, or for its whole domain ("@host"),
 * clearing the other so only one of them speaks for this sender. */
async function changeSortOverride(address: string, value: "" | SortOverride, wholeDomain = false) {
  const key = address.toLowerCase();
  const domainKey = `@${domainOf(key)}`;
  const next = { ...ctx.settings.sortOverrides };
  delete next[key];
  delete next[domainKey];
  if (value !== "") next[wholeDomain ? domainKey : key] = value;
  ctx.settings = await updateSettings({ sortOverrides: next });
  rebuildSortPreview();
}

// Sort inbox, laid out like a scan (research/2026-11-06-panels-and-scans.md):
// Ready (a ring, one number, Sort inbox, Review first), Sorting (the ring fills
// as each label's batch finishes, rows go gray -> pulse -> tick, Stop), then Done.
// Review first opens each label to its senders and emails: bucket -> sender ->
// message, with a "wrong bucket?" menu per sender. Nothing moves until Sort.
let reviewing = false;

/** The scan ring: fills to `share` (0-1) around whatever sits in its middle. */
function sortRing(): { ring: HTMLElement; middle: HTMLElement; set: (share: number) => void } {
  const ring = document.createElement("div");
  ring.className = "sort-ring";
  const middle = document.createElement("div");
  middle.className = "sort-ring-mid";
  ring.append(middle);
  return { ring, middle, set: (share) => ring.style.setProperty("--p", String(Math.min(1, Math.max(0, share)))) };
}

function renderSortPreview(chosen: SortPlanEntry[], knownLower: Set<string>) {
  clearSortPreview();
  resetSortInboxSlot();

  const includedCount = () =>
    chosen.flatMap((e) => e.messages).filter((m) => !excludedSortIds.has(m.id)).length;

  const { ring, middle, set } = sortRing();
  middle.append(gmailLabelIcon());
  const big = document.createElement("b");
  big.className = "sort-big";
  const sub = document.createElement("p");
  sub.className = "sort-sub";
  sub.setAttribute("aria-live", "polite");
  const applyBtn = document.createElement("button");
  applyBtn.className = "btn btn-accent-solid";
  applyBtn.textContent = "Sort inbox";
  const reviewBtn = document.createElement("button");
  reviewBtn.className = "link sort-review";
  const actions = document.createElement("div");
  actions.className = "sort-actions";
  actions.append(applyBtn, reviewBtn);
  const words = document.createElement("div");
  words.className = "sort-words";
  words.append(big, sub, actions);
  const hero = document.createElement("div");
  hero.className = "sort-hero";
  hero.append(ring, words);

  const refresh = () => {
    const n = includedCount();
    big.textContent = `${num(n)} email${n === 1 ? "" : "s"}`;
    sub.textContent = `go into ${chosen.length} label${chosen.length === 1 ? "" : "s"}`;
    applyBtn.disabled = n === 0;
    reviewBtn.textContent = reviewing ? "Hide review" : "Review first";
    reviewBtn.setAttribute("aria-expanded", String(reviewing));
  };

  // One row per label: a step marker, the label, its count, where it goes.
  const list = document.createElement("div");
  list.className = `sort-plan${reviewing ? " reviewing" : ""}`;
  for (const entry of chosen) {
    const bucketEl = document.createElement("details");
    bucketEl.className = "sort-preview-bucket";
    bucketEl.dataset.key = `${entry.bucket}:${entry.fileOut}`;
    const summary = document.createElement("summary");
    summary.append(
      document.createElement("i"),
      ...labelCells(entry.label, entry.bucket, entry.count, entry.fileOut ? "Files out" : "Stays in inbox"),
    );
    // Closed and inert until Review first: the plan reads as a list of steps.
    summary.onclick = (e) => {
      if (!reviewing) e.preventDefault();
    };
    bucketEl.appendChild(summary);

    const bySender = new Map<string, SortPlanMessage[]>();
    for (const m of entry.messages) {
      const group = bySender.get(m.address) ?? [];
      group.push(m);
      bySender.set(m.address, group);
    }

    for (const [address, msgs] of bySender) {
      const senderEl = document.createElement("details");
      senderEl.className = "sort-preview-sender";
      const sSummary = document.createElement("summary");
      sSummary.append(document.createTextNode(`${msgs[0].displayName || address}: ${msgs.length} `));

      const select = document.createElement("select");
      select.title = "Sort this sender differently";
      select.add(new Option(`keep as ${SORT_BUCKET_LABELS[entry.bucket]}`, ""));
      for (const b of ALL_SORT_BUCKETS) {
        if (b !== entry.bucket) select.add(new Option(`move to ${SORT_BUCKET_LABELS[b]}`, b));
      }
      select.add(new Option("never sort this sender", "never"));
      const overrides = ctx.settings.sortOverrides;
      const domainKey = `@${domainOf(address.toLowerCase())}`;
      select.value = overrides[address.toLowerCase()] ?? overrides[domainKey] ?? "";
      // "All @host": the correction covers every sender at this domain.
      const wide = document.createElement("input");
      wide.type = "checkbox";
      wide.checked = !(address.toLowerCase() in overrides) && domainKey in overrides;
      const wideLabel = document.createElement("label");
      wideLabel.append(wide, ` All ${domainKey}`);
      const save = () => void changeSortOverride(address, select.value as "" | SortOverride, wide.checked);
      select.onchange = save;
      wide.onchange = save;
      // A control inside a <summary> would also toggle the <details>; don't.
      select.onclick = (e) => e.stopPropagation();
      wideLabel.onclick = (e) => e.stopPropagation();
      sSummary.append(select, wideLabel);
      senderEl.appendChild(sSummary);

      for (const m of msgs) {
        const row = document.createElement("label");
        row.className = "sort-preview-row";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !excludedSortIds.has(m.id);
        cb.onchange = () => {
          if (cb.checked) excludedSortIds.delete(m.id);
          else excludedSortIds.add(m.id);
          refresh();
        };
        const text = document.createElement("span");
        const sensitive = entry.fileOut && m.sensitiveWhenFiled ? " · sensitive?" : "";
        text.textContent = ` ${m.subject || "(no subject)"} · ${formatRelativeTime(m.receivedAt)}${sensitive}`;
        row.append(cb, text);
        senderEl.appendChild(row);
      }
      bucketEl.appendChild(senderEl);
    }
    list.appendChild(bucketEl);
  }

  // Names the user already had are used as they are; one switch back, in review.
  const reused = document.createElement("p");
  reused.className = "sort-reused";
  if (reusedLabels.length > 0) {
    const keep = document.createElement("button");
    keep.className = "link";
    keep.textContent = "Keep Cluster's separate";
    keep.onclick = async () => {
      const choices = { ...ctx.settings.labelChoices };
      for (const { desired } of reusedLabels) choices[desired] = applyLabelChoice(desired, "suffix");
      ctx.settings = await updateSettings({ labelChoices: choices });
      reusedLabels = [];
      rebuildSortPreview();
    };
    reused.append(`Uses your labels: ${reusedLabels.map((r) => r.shown).join(", ")}. `, keep);
  }
  const showReused = () => (reused.hidden = !reviewing || reusedLabels.length === 0);
  showReused();

  reviewBtn.onclick = () => {
    reviewing = !reviewing;
    list.classList.toggle("reviewing", reviewing);
    showReused();
    if (!reviewing) for (const d of Array.from(list.querySelectorAll("details"))) d.open = false;
    refresh();
  };

  let stop = false;
  applyBtn.onclick = async () => {
    const total = includedCount();
    const started = Date.now();
    let sorted = 0;
    reviewing = false;
    list.classList.remove("reviewing");
    reused.hidden = true;
    for (const d of Array.from(list.querySelectorAll("details"))) d.open = false;
    sortInboxPreviewEl.classList.add("sorting");
    // Stop finishes the label in hand, then ends; what's done stays done.
    const stopBtn = document.createElement("button");
    stopBtn.className = "btn";
    stopBtn.textContent = "Stop";
    stopBtn.onclick = () => {
      stop = true;
      stopBtn.disabled = true;
      stopBtn.textContent = "Stopping…";
    };
    actions.replaceChildren(stopBtn);
    big.textContent = "Sorting…";
    const count = document.createElement("b");
    const of = document.createElement("span");
    middle.replaceChildren(count, of);
    const paint = () => {
      count.textContent = num(sorted);
      of.textContent = `of ${num(total)}`;
      set(sorted / Math.max(1, total));
    };
    paint();
    const rowFor = (e: SortPlanEntry) =>
      list.querySelector<HTMLElement>(`[data-key="${e.bucket}:${e.fileOut}"]`);
    try {
      const done = await applySortPlan(
        chosen,
        knownLower,
        (e, phase) => {
          const row = rowFor(e);
          row?.classList.toggle("active", phase === "start");
          if (phase === "start") sub.textContent = `Filing ${plainLabel(e.label)}`;
          if (phase === "done") {
            row?.classList.add("done");
            sorted += e.count;
            paint();
          }
        },
        () => stop,
      );
      renderSortReport(done, started);
    } catch (err) {
      log.error(err);
      sortInboxPreviewEl.classList.remove("sorting");
      big.textContent = "Sort stopped";
      sub.textContent = "Something went wrong. What finished stays sorted.";
      applyBtn.textContent = "Try again";
      applyBtn.onclick = () => rebuildSortPreview();
      actions.replaceChildren(applyBtn);
    }
  };

  sortInboxPreviewEl.replaceChildren(hero, reused, list);
  set(0);
  refresh();
}

/** A label row's cells: Gmail tag + name, the count, where the mail goes. */
function labelCells(label: string, bucket: string | undefined, count: number, where: string): HTMLElement[] {
  const name = document.createElement("span");
  name.className = "sort-name";
  name.append(gmailLabelIcon(CLUSTER_LABEL_COLORS[bucket as ClusterLabelKey]?.backgroundColor), plainLabel(label));
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
  const countOf = (e: ActionLogEntry) => e.undo?.ids.length ?? Number(/Sorted (\d+)/.exec(e.summary)?.[1] ?? 0);
  const total = logged.reduce((n, e) => n + countOf(e), 0);
  const secs = Math.max(1, Math.round((Date.now() - started) / 1000));
  const report = document.createElement("div");
  report.className = "sort-report";
  const { ring, middle, set } = sortRing();
  ring.classList.add("is-done");
  set(1);
  middle.append(Object.assign(document.createElement("i"), { className: "sort-check" }));
  const big = document.createElement("b");
  big.className = "sort-big";
  big.textContent = `${num(total)} email${total === 1 ? "" : "s"} sorted`;
  const sub = document.createElement("p");
  sub.className = "sort-sub";
  sub.textContent = `${logged.length} label${logged.length === 1 ? "" : "s"} · ${secs} s`;
  sub.title = summary;
  const words = document.createElement("div");
  words.className = "sort-words";
  const hero = document.createElement("div");
  hero.className = "sort-hero";
  hero.append(ring, words);
  const list = document.createElement("div");
  list.className = "sort-plan sort-report-rows";
  const byLabel = new Map(sortPlan.map((e) => [e.label, e.bucket]));
  for (const e of logged) {
    const label = e.undo?.labelName ?? /"(.+)"/.exec(e.summary)?.[1] ?? "";
    const row = document.createElement("div");
    row.className = "sort-report-row done";
    row.append(document.createElement("i"), ...labelCells(label, byLabel.get(label), countOf(e), e.undo?.wasFiledOut ? "Filed out" : "In inbox"));
    if (e.undo) {
      const undo = document.createElement("button");
      undo.className = "sort-undo";
      undo.textContent = "Undo";
      undo.onclick = async () => {
        undo.disabled = true;
        undo.textContent = "Undoing…";
        try {
          await undoEntry(e);
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
  doneBtn.onclick = () => {
    clearSortPreview();
    document.querySelector<HTMLButtonElement>('#sidebar .nav-item[data-screen="organize"]')?.click();
  };
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
        standing.set(e.bucket, { ...e, fileOut: limitFor(e.bucket) === 0, idsByProvider: new Map(e.idsByProvider) });
        continue;
      }
      for (const [pid, ids] of e.idsByProvider) prev.idsByProvider.set(pid, [...(prev.idsByProvider.get(pid) ?? []), ...ids]);
    }
    for (const entry of standing.values()) {
      const server = isServerSortBucket(entry.bucket);
      const hasOutlook = (entry.idsByProvider.get("outlook") ?? []).length > 0;
      const terms = server ? bucketMatchTerms(entry.bucket, ctx.settings.sortOverrides) : null;

      if (server && terms && outlookToken) {
        for (const id of ruleIds[entry.bucket] ?? []) {
          await deleteInboxRule(outlookToken, id).catch((err) => log.error("keep-sorting: replace rule", err));
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
  sortInboxBtn.onclick = () => void startSortFlow();
  // A kind's menu changed: recount what moves.
  document.getElementById("time-limits-rows")?.addEventListener("change", updateSortInboxCount);
}

export { renderSortInbox, wireSortInbox };
