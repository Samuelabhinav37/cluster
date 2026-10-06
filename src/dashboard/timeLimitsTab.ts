// "Inbox time limits" on the Organize screen: how long each category's new
// mail stays in the inbox before it moves into its label. Saving syncs the
// per-category Gmail filters and runs one sweep straight away; the background
// alarm keeps it going every 15 minutes (see lib/inboxTimeLimits.ts).
import { categoryQuery } from "../lib/categoryQueries";
import { categoryLabelName, syncGmailCategoryFilters } from "../lib/categoryFilters";
import { batchModify, getOrCreateLabel, listMessageIds } from "../lib/gmailApi";
import { runInboxTimeLimits } from "../lib/inboxTimeLimitsRunner";
import { log } from "../lib/log";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { getSettings, updateSettings } from "../lib/settingsStore";
import { ALL_SORT_BUCKETS, type SortBucket } from "../lib/sortTaxonomy";
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
  { label: "1 hour", hours: 1 },
  { label: "1 day", hours: 24 },
  { label: "2 days", hours: 48 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
  { label: "14 days", hours: 336 },
  { label: "30 days", hours: 720 },
  { label: "Stays in inbox", hours: null },
];

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
  for (const bucket of ALL_SORT_BUCKETS) {
    const row = document.createElement("label");
    row.className = "time-limit-row";
    const name = document.createElement("span");
    name.textContent = categoryLabelName(bucket, ctx.settings.labelChoices);
    const select = document.createElement("select");
    select.id = `time-limit-${bucket}`;
    for (const choice of LIMIT_CHOICES) select.add(new Option(choice.label, choiceValue(choice.hours)));
    select.value = choiceValue(cfg.inboxHoursByBucket[bucket] ?? null);
    row.append(name, select);
    rowsEl.appendChild(row);
  }
  lastRunEl.textContent =
    cfg.timeLimitsEnabled && cfg.lastSweep.at > 0
      ? `Last checked ${ago(cfg.lastSweep.at)}: moved ${plural(cfg.lastSweep.moved, "message")} into their labels.`
      : "";
  backlogBtn.hidden = !cfg.timeLimitsEnabled;
}

async function save(): Promise<void> {
  if (!toggleEl || !saveBtn || !statusEl) return;
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
  } catch (err) {
    log.error("time limits: save failed", err);
    statusEl.textContent = "Couldn't save to Gmail. Try again.";
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
    "This labels mail already in your inbox. It stays in the inbox for now; mail past its time moves into its label over the next few checks, and mail from people you write to stays.";
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

export function wireTimeLimits(): void {
  if (saveBtn) saveBtn.onclick = () => void save();
  if (backlogBtn) backlogBtn.onclick = () => void previewBacklog();
  renderTimeLimits();
}
