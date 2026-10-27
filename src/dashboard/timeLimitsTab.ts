// "Inbox time limits" on the Organize screen: how long each category's new
// mail stays in the inbox before it moves into its label. Saving syncs the
// per-category Gmail filters and runs one sweep straight away; the background
// alarm keeps it going every 5 minutes (see lib/inboxTimeLimits.ts).
import { categoryQuery } from "../lib/categoryQueries";
import { categoryLabelName, syncGmailCategoryFilters } from "../lib/categoryFilters";
import { batchModify, getOrCreateLabel, listMessageIds } from "../lib/gmailApi";
import { runInboxTimeLimits } from "../lib/inboxTimeLimitsRunner";
import { log } from "../lib/log";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { getSettings, updateSettings } from "../lib/settingsStore";
import { domainOf } from "../lib/domainGrouping";
import type { SenderSummary } from "../lib/senderModel";
import { ALL_SORT_BUCKETS, effectiveBucket, type SortBucket } from "../lib/sortTaxonomy";
import { logAction } from "./recentTab";
import { ctx } from "./state";

const toggleEl = document.getElementById("time-limits-toggle") as HTMLInputElement | null;
const rowsEl = document.getElementById("time-limits-rows") as HTMLDivElement | null;
const saveBtn = document.getElementById("time-limits-save") as HTMLButtonElement | null;
const statusEl = document.getElementById("time-limits-status") as HTMLSpanElement | null;
const lastRunEl = document.getElementById("time-limits-last") as HTMLParagraphElement | null;
const backlogBtn = document.getElementById("time-limits-backlog-btn") as HTMLButtonElement | null;
const backlogEl = document.getElementById("time-limits-backlog") as HTMLDivElement | null;

/** Select options: hours, or null for "stays in inbox". */
export const LIMIT_CHOICES: { label: string; hours: number | null }[] = [
  { label: "Straight to label", hours: 0 },
  { label: "10 minutes", hours: 1 / 6 },
  { label: "1 hour", hours: 1 },
  { label: "1 day", hours: 24 },
  { label: "2 days", hours: 48 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
  { label: "14 days", hours: 336 },
  { label: "30 days", hours: 720 },
  { label: "Stays in inbox", hours: null },
];

/** "Straight to label" skips the inbox entirely, so it's offered only for
 * Promotions, where missing one ad costs nothing. */
export function limitChoicesFor(bucket: SortBucket) {
  return bucket === "promotions" ? LIMIT_CHOICES : LIMIT_CHOICES.filter((c) => c.hours !== 0);
}

/** What each kind of mail is, shown on hover over its name. */
const BUCKET_HINT: Record<SortBucket, string> = {
  otp: "Sign-in and verification codes",
  receipt: "Orders, invoices, payments",
  shipping: "Tracking and delivery",
  newsletter: "Lists you subscribed to",
  social: "LinkedIn, Strava and similar",
  promotions: "Sales and marketing",
  shopping: "Stores you buy from",
  travel: "Airlines, hotels, bookings",
  finance: "Banks, cards, statements",
  productivity: "Slack, GitHub, Notion and similar",
  education: "Courses and school",
};

function choiceValue(hours: number | null): string {
  return hours === null ? "stay" : String(hours);
}

function parseChoice(value: string): number | null {
  return value === "stay" ? null : Number(value);
}

function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

function ago(at: number): string {
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : new Date(at).toLocaleDateString();
}

function selectFor(bucket: SortBucket): HTMLSelectElement | null {
  return document.getElementById(`time-limit-${bucket}`) as HTMLSelectElement | null;
}

export function renderTimeLimits(): void {
  if (!toggleEl || !rowsEl || !lastRunEl || !backlogBtn) return;
  const cfg = ctx.settings.autoSort;
  toggleEl.checked = cfg.timeLimitsEnabled;
  rowsEl.innerHTML = "";
  // One compact row per kind: its label and how long it stays in the inbox.
  for (const bucket of ALL_SORT_BUCKETS) {
    const labelName = categoryLabelName(bucket, ctx.settings.labelChoices);
    const plainName = labelName.replace(/^\S+\s/, "");
    const row = document.createElement("label");
    row.className = "limit-row";
    row.title = BUCKET_HINT[bucket];
    const name = document.createElement("span");
    name.className = "limit-name";
    name.textContent = labelName;
    const select = document.createElement("select");
    select.id = `time-limit-${bucket}`;
    select.setAttribute("aria-label", `${plainName}: time in your inbox`);
    for (const choice of limitChoicesFor(bucket)) select.add(new Option(choice.label, choiceValue(choice.hours)));
    select.value = choiceValue(cfg.inboxHoursByBucket[bucket] ?? null);
    row.append(name, select);
    rowsEl.appendChild(row);
  }
  lastRunEl.textContent =
    cfg.timeLimitsEnabled && cfg.lastSweep.at > 0
      ? `Last checked ${ago(cfg.lastSweep.at)}: moved ${plural(cfg.lastSweep.moved, "message")} into their labels.`
      : "";
  backlogBtn.hidden = !cfg.timeLimitsEnabled;
  renderPresets();
}

/** Fills the rows with suggested values (from first-run setup) and turns the
 * switch on, without saving: Gmail only changes when the user presses Save. */
export function proposeTimeLimits(hours: Partial<Record<SortBucket, number | null>>, message: string): void {
  if (!toggleEl || !statusEl) return;
  for (const [bucket, value] of Object.entries(hours)) {
    const select = selectFor(bucket as SortBucket);
    if (!select) continue;
    select.value = choiceValue(value ?? null);
    select.dispatchEvent(new Event("change"));
  }
  toggleEl.checked = true;
  statusEl.textContent = message;
}

async function save(): Promise<boolean> {
  if (!toggleEl || !saveBtn || !statusEl) return false;
  const inboxHoursByBucket: Record<string, number | null> = { ...ctx.settings.autoSort.inboxHoursByBucket };
  for (const bucket of ALL_SORT_BUCKETS) {
    const select = selectFor(bucket);
    if (select) inboxHoursByBucket[bucket] = parseChoice(select.value);
  }
  saveBtn.disabled = true;
  statusEl.textContent = "Saving…";
  try {
    ctx.settings = await updateSettings({
      autoSort: { ...ctx.settings.autoSort, timeLimitsEnabled: toggleEl.checked, inboxHoursByBucket },
    });
    const token = await gmailProvider.getAuthToken(false);
    const synced = await syncGmailCategoryFilters(ctx.settings, token);
    ctx.settings = await updateSettings({
      autoSort: {
        ...ctx.settings.autoSort,
        filterIdsByBucket: synced.filterIdsByBucket,
        filterSpecByBucket: synced.filterSpecByBucket,
      },
    });
    const filters = Object.keys(synced.filterIdsByBucket).length;
    if (!toggleEl.checked) {
      statusEl.textContent = filters > 0 ? `Time limits off. ${plural(filters, "Gmail filter")} kept for Sort my inbox.` : "Time limits off.";
    } else {
      statusEl.textContent = `Saved. ${plural(filters, "Gmail filter")} label new mail as it arrives. Checking your inbox…`;
      const run = await runInboxTimeLimits();
      // The run recorded lastSweep in storage; pick it up for the render.
      ctx.settings = await getSettings();
      statusEl.textContent = run
        ? `Saved. ${plural(filters, "Gmail filter")} label new mail as it arrives. Moved ${plural(run.moved, "message")} that ${run.moved === 1 ? "was" : "were"} past ${run.moved === 1 ? "its" : "their"} time${run.more ? ", more on the next check" : ""}.`
        : `Saved. ${plural(filters, "Gmail filter")} label new mail as it arrives.`;
    }
    return true;
  } catch (err) {
    log.error("time limits: save failed", err);
    statusEl.textContent = "Couldn't save to Gmail. Try again.";
    return false;
  } finally {
    saveBtn.disabled = false;
    renderTimeLimits();
  }
}

interface BacklogRow {
  bucket: SortBucket;
  labelName: string;
  ids: string[];
}

/** Mail already in the inbox that matches each category's Gmail query: a
 * server-side search, so no message is read. */
async function previewBacklog(): Promise<void> {
  if (!backlogEl || !backlogBtn) return;
  backlogBtn.disabled = true;
  backlogEl.hidden = false;
  backlogEl.textContent = "Looking through your inbox…";
  try {
    const token = await gmailProvider.getAuthToken(false);
    const rows: BacklogRow[] = [];
    for (const bucket of ALL_SORT_BUCKETS) {
      const query = categoryQuery(bucket, ctx.settings.sortOverrides);
      if (!query) continue;
      const stubs = await listMessageIds(token, `in:inbox -is:starred ${query}`, 5000);
      if (stubs.length === 0) continue;
      rows.push({ bucket, labelName: categoryLabelName(bucket, ctx.settings.labelChoices), ids: stubs.map((s) => s.id) });
    }
    renderBacklogPreview(token, rows);
  } catch (err) {
    log.error("time limits: backlog preview failed", err);
    backlogEl.textContent = "Couldn't search your inbox. Try again.";
    backlogBtn.disabled = false;
  }
}

function renderBacklogPreview(token: string, rows: BacklogRow[]): void {
  if (!backlogEl || !backlogBtn) return;
  backlogEl.innerHTML = "";
  if (rows.length === 0) {
    backlogEl.textContent = "Nothing in your inbox matches a category yet.";
    backlogBtn.disabled = false;
    return;
  }
  const intro = document.createElement("p");
  intro.className = "hint";
  intro.textContent =
    "This labels mail already in your inbox. Mail past its time moves out over the next few checks.";
  backlogEl.appendChild(intro);

  const boxes = new Map<SortBucket, HTMLInputElement>();
  for (const row of rows) {
    const line = document.createElement("label");
    line.className = "tidy-row";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = true;
    boxes.set(row.bucket, box);
    const text = document.createElement("span");
    text.textContent = `${row.labelName} · ${plural(row.ids.length, "message")}`;
    line.append(box, text);
    backlogEl.appendChild(line);
  }

  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "btn btn-accent";
  apply.textContent = "Label them";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn";
  cancel.textContent = "Cancel";
  const status = document.createElement("span");
  status.className = "hint";
  status.setAttribute("role", "status");
  const actions = document.createElement("div");
  actions.className = "tidy-actions";
  actions.append(apply, cancel, status);
  backlogEl.appendChild(actions);

  cancel.onclick = () => {
    backlogEl.hidden = true;
    backlogBtn.disabled = false;
  };
  apply.onclick = async () => {
    apply.disabled = true;
    cancel.disabled = true;
    status.textContent = "Labelling…";
    let total = 0;
    try {
      for (const row of rows) {
        if (!boxes.get(row.bucket)?.checked) continue;
        const labelId = await getOrCreateLabel(token, row.labelName);
        await batchModify(token, row.ids, [labelId], []);
        total += row.ids.length;
        await logAction("sort", `Labelled ${plural(row.ids.length, "inbox message")} "${row.labelName}"`, {
          provider: "gmail",
          ids: row.ids,
          via: "unsort",
          labelName: row.labelName,
          wasFiledOut: false,
        });
      }
      status.textContent = `Labelled ${plural(total, "message")}. Ones past their time move out on the next checks.`;
      cancel.disabled = false;
      cancel.textContent = "Close";
      backlogBtn.disabled = false;
    } catch (err) {
      log.error("time limits: backlog apply failed", err);
      status.textContent = `Stopped after ${plural(total, "message")}. Try again to continue.`;
      apply.disabled = false;
      cancel.disabled = false;
    }
  };
}

// ── Presets (Track 4): one tap turns on one kind's time limit ──────────
// Each is a ready-made value for one row of the editor below, saved through
// the same path, so "Make your own" and a preset never disagree.

export const PRESETS: ReadonlyArray<{ id: string; hours: Partial<Record<SortBucket, number>>; name: string }> = [
  { id: "codes", hours: { otp: 24 }, name: "Codes leave after a day" },
  { id: "promotions", hours: { promotions: 0 }, name: "Promotions skip the inbox" },
  { id: "newsletters", hours: { newsletter: 168 }, name: "Newsletters leave after a week" },
  // One place for your paper trail, like HEY's Paper Trail and Apple's Transactions.
  { id: "receipts", hours: { receipt: 168, shipping: 168 }, name: "Receipts and tracking leave after a week" },
  { id: "social", hours: { social: 24 }, name: "Social leaves after a day" },
  { id: "shopping", hours: { shopping: 72 }, name: "Shopping leaves after 3 days" },
  // Slack, GitHub, Notion and other app notices.
  { id: "updates", hours: { productivity: 168 }, name: "App updates leave after a week" },
];

const presetsEl = document.getElementById("presets") as HTMLDivElement | null;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** How many of each kind arrived in the last 7 days, by the sort taxonomy. */
export function weeklyByBucket(senders: readonly SenderSummary[], now: number): Map<SortBucket, number> {
  const out = new Map<SortBucket, number>();
  for (const s of senders) {
    for (const m of s.messages) {
      if (now - m.receivedAt >= WEEK_MS) continue;
      const bucket = effectiveBucket(m.kind, domainOf(s.address), s.address, ctx.settings.sortOverrides, m.promotion ?? m.tab === "promotions");
      if (bucket) out.set(bucket, (out.get(bucket) ?? 0) + 1);
    }
  }
  return out;
}

/** The last preset change, so its card can offer Undo after the re-render. */
type Limits = Record<string, number | null>;
let undoable: { id: string; hours: Limits; on: boolean } | null = null;

/** Sets every row and the switch, saves, and remembers `after` for Undo. */
async function saveLimits(hours: Limits, on: boolean, after: typeof undoable): Promise<void> {
  if (!toggleEl) return;
  for (const bucket of ALL_SORT_BUCKETS) {
    const select = selectFor(bucket);
    if (select) select.value = choiceValue(hours[bucket] ?? null);
  }
  toggleEl.checked = on;
  undoable = after;
  if (await save()) return;
  // The editor's status line says why; show it.
  undoable = null;
  document.getElementById("time-limits-section")?.setAttribute("open", "");
  renderPresets();
}

let presetSenders: readonly SenderSummary[] = [];

export function renderPresets(senders: readonly SenderSummary[] = presetSenders): void {
  presetSenders = senders;
  if (!presetsEl) return;
  const cfg = ctx.settings.autoSort;
  const weekly = weeklyByBucket(senders, Date.now());
  presetsEl.replaceChildren(
    ...PRESETS.map((p) => {
      const kinds = Object.entries(p.hours) as Array<[SortBucket, number]>;
      const on = cfg.timeLimitsEnabled && kinds.every(([b, h]) => cfg.inboxHoursByBucket[b] === h);
      const card = document.createElement("div");
      card.className = "rec-card";
      const name = document.createElement("div");
      name.className = "rec-name";
      name.textContent = p.name;
      const fact = document.createElement("div");
      fact.className = "rec-fact";
      const n = kinds.reduce((sum, [b]) => sum + (weekly.get(b) ?? 0), 0);
      fact.textContent = on ? "On" : n > 0 ? `About ${plural(n, "email")} a week` : "None this week";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-sm";
      btn.textContent = on ? "Turn off" : "Turn on";
      btn.onclick = () => {
        btn.disabled = true;
        const cfgNow = ctx.settings.autoSort;
        // Switching on from off turns on this kind alone, not every default.
        const base: Limits = cfgNow.timeLimitsEnabled
          ? { ...cfgNow.inboxHoursByBucket }
          : Object.fromEntries(ALL_SORT_BUCKETS.map((b) => [b, null]));
        const next = Object.fromEntries(kinds.map(([b, h]) => [b, on ? null : h]));
        void saveLimits({ ...base, ...next }, true, {
          id: p.id,
          hours: { ...cfgNow.inboxHoursByBucket },
          on: cfgNow.timeLimitsEnabled,
        });
      };
      const actions = document.createElement("div");
      actions.className = "rec-actions";
      actions.append(btn);
      card.append(name, fact, actions);
      const last = undoable;
      if (last?.id === p.id) {
        const undo = document.createElement("button");
        undo.type = "button";
        undo.className = "btn btn-sm btn-ghost";
        undo.textContent = "Undo";
        undo.onclick = () => {
          undo.disabled = true;
          void saveLimits(last.hours, last.on, null);
        };
        actions.append(undo);
      }
      return card;
    }),
  );
}

export function wireTimeLimits(): void {
  if (saveBtn) saveBtn.onclick = () => void save();
  if (backlogBtn) backlogBtn.onclick = () => void previewBacklog();
  renderTimeLimits();
}
