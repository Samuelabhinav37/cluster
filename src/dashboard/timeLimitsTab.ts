// Organize's one list: where each kind of mail goes. A kind is off, labelled
// in the inbox, or moved out after a set time. Anything but Off also covers
// new mail: saving syncs the per-category Gmail filters and runs one sweep
// straight away; the background alarm repeats it every 5
// minutes (see lib/inboxTimeLimits.ts). Sort my inbox (sortInbox.ts) reads
// the same menus for mail already here.
import { categoryLabelName, syncGmailCategoryFilters } from "../lib/categoryFilters";
import { runInboxTimeLimits } from "../lib/inboxTimeLimitsRunner";
import { HOLD_UNSORTED_HOURS } from "../lib/inboxTimeLimits";
import { log } from "../lib/log";
import { CLUSTER_LABEL_COLORS } from "../lib/clusterLabels";
import { colorClusterLabels, getLabel, listLabels } from "../lib/gmailApi";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { getSettings, updateSettings } from "../lib/settingsStore";
import { domainOf } from "../lib/domainGrouping";
import { deliverNewsletters, HOLD_HOURS, newsletterDayOn } from "../lib/newsletterDay";
import type { SenderSummary } from "../lib/senderModel";
import { ALL_SORT_BUCKETS, SKIP_INBOX_BUCKETS, effectiveBucket, type SortBucket } from "../lib/sortTaxonomy";
import { icon } from "./homeDashboard";
import { ctx } from "./state";

const rowsEl = document.getElementById("time-limits-rows") as HTMLDivElement | null;
const statusEl = document.getElementById("time-limits-status") as HTMLParagraphElement | null;

/** Menu choices after Off: hours, or null for "label only". */
export const LIMIT_CHOICES: { label: string; hours: number | null }[] = [
  { label: "Label only", hours: null },
  { label: "Skip the inbox", hours: 0 },
  { label: "Move after 10 minutes", hours: 1 / 6 },
  { label: "Move after 1 hour", hours: 1 },
  { label: "Move after 3 hours", hours: 3 },
  { label: "Move after 1 day", hours: 24 },
  { label: "Move after 2 days", hours: 48 },
  { label: "Move after 3 days", hours: 72 },
  { label: "Move after 1 week", hours: 168 },
  { label: "Move after 2 weeks", hours: 336 },
  { label: "Move after 30 days", hours: 720 },
];

/** "Keep in inbox": one menu that sets every label's time at once. */
const WINDOW_CHOICES = [
  { label: "1 hour", value: "1" },
  { label: "3 hours", value: "3" },
  { label: "1 day", value: "24" },
];
const PER_LABEL = "per";

/** Off: no label, no Gmail filter, never moved. */
const OFF = "off";

/** "Skip the inbox" means never seeing it, so it's offered only where
 * missing one costs nothing (SKIP_INBOX_BUCKETS). */
export function limitChoicesFor(bucket: SortBucket) {
  return SKIP_INBOX_BUCKETS.includes(bucket) ? LIMIT_CHOICES : LIMIT_CHOICES.filter((c) => c.hours !== 0);
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
  accounts: "Sign-in alerts and password changes",
  jobs: "Job alerts and applications",
};

const BUCKET_ICON: Record<SortBucket, string> = {
  otp: "key",
  receipt: "receipt",
  shipping: "package",
  newsletter: "news",
  social: "users",
  promotions: "tag",
  shopping: "bag",
  travel: "plane",
  finance: "card",
  productivity: "briefcase",
  education: "cap",
  accounts: "shield-check",
  jobs: "user",
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

/** A kind's stored choice as a menu value. */
function storedValue(bucket: SortBucket): string {
  const cfg = ctx.settings.autoSort;
  if (!cfg.timeLimitsEnabled || cfg.labelsOff.includes(bucket)) return OFF;
  return choiceValue(cfg.inboxHoursByBucket[bucket] ?? null);
}

// "N now" comes from Sort my inbox's plan (sortInbox.ts), "a week" from the scan.
let nowByBucket = new Map<SortBucket, number>();

export function setNowCounts(counts: ReadonlyMap<SortBucket, number>): void {
  nowByBucket = new Map(counts);
  renderKindSubs();
}

// Gmail's own count of each label, read when Organize draws. Missing until it answers.
let gmailCounts = new Map<SortBucket, number>();
let countsAt = 0;
const COUNTS_TTL_MS = 5 * 60 * 1000;

/** Reads each Cluster label's message count from Gmail (labels.get), so the
 * list shows what Gmail shows. */
async function refreshGmailCounts(): Promise<void> {
  if (Date.now() - countsAt < COUNTS_TTL_MS) return;
  countsAt = Date.now();
  try {
    const token = await gmailProvider.getAuthToken(false);
    const byName = new Map((await listLabels(token)).map((l) => [l.name, l.id]));
    const next = new Map<SortBucket, number>();
    await Promise.all(
      ALL_SORT_BUCKETS.map(async (bucket) => {
        const id = byName.get(categoryLabelName(bucket, ctx.settings.labelChoices));
        if (!id) return;
        const total = (await getLabel(token, id)).messagesTotal;
        if (typeof total === "number") next.set(bucket, total);
      }),
    );
    gmailCounts = next;
    renderKindSubs();
  } catch (err) {
    log.error("organize: label counts failed", err);
  }
}

/** The muted number on a label's row: Gmail's count, else what Sort would label now. */
export function labelCount(bucket: SortBucket): number {
  return gmailCounts.get(bucket) ?? nowByBucket.get(bucket) ?? 0;
}

function renderKindSubs(): void {
  const weekly = weeklyByBucket(presetSenders, Date.now());
  for (const bucket of ALL_SORT_BUCKETS) {
    const count = document.getElementById(`time-limit-count-${bucket}`);
    if (count) count.textContent = labelCount(bucket).toLocaleString();
    const row = count?.closest<HTMLElement>(".ios-row");
    const week = weekly.get(bucket) ?? 0;
    if (row) row.title = week > 0 ? `${BUCKET_HINT[bucket]}. About ${week.toLocaleString()} a week.` : BUCKET_HINT[bucket];
  }
}

export function renderTimeLimits(): void {
  if (!rowsEl) return;
  const cfg = ctx.settings.autoSort;
  // One list of Cluster's labels, in Gmail's order (by name), each icon in
  // its Gmail label color. Anything but Off also sorts new mail.
  const labelName = (b: SortBucket) => categoryLabelName(b, ctx.settings.labelChoices);
  const buckets = [...ALL_SORT_BUCKETS].sort((a, b) => (labelName(a) < labelName(b) ? -1 : 1));
  const rows = buckets.map((bucket) => {
    const name = labelName(bucket).replace(/^\S+\s/, "");
    const row = document.createElement("div");
    row.className = "ios-row org-row";
    row.title = BUCKET_HINT[bucket];
    const mark = document.createElement("span");
    mark.className = "app-ic label-ic";
    const color = CLUSTER_LABEL_COLORS[bucket];
    if (color) Object.assign(mark.style, { background: color.backgroundColor, color: color.textColor });
    mark.append(icon(BUCKET_ICON[bucket]));
    const words = document.createElement("span");
    words.className = "grow";
    words.append(name);
    const count = Object.assign(document.createElement("span"), {
      className: "ios-value",
      id: `time-limit-count-${bucket}`,
    });
    const select = document.createElement("select");
    select.id = `time-limit-${bucket}`;
    select.className = "kind-pick";
    select.setAttribute("aria-label", `${name}: where it goes`);
    select.add(new Option("Off", OFF));
    for (const choice of limitChoicesFor(bucket)) select.add(new Option(choice.label, choiceValue(choice.hours)));
    select.value = storedValue(bucket);
    select.onchange = () => void queueSave();
    row.append(mark, words, count, select);
    return row;
  });
  const wrap = document.createElement("section");
  wrap.className = "ios-section";
  const group = document.createElement("div");
  group.className = "ios-group";
  group.append(...rows);
  wrap.append(Object.assign(document.createElement("h2"), { className: "ios-head", textContent: "Labels" }), group);
  rowsEl.replaceChildren(wrap);
  renderWindow();
  renderKindSubs();
  void refreshGmailCounts();
  // No standing "Last checked / Moved N" line: meta lines are clutter.
  if (statusEl && !saveNote) statusEl.textContent = "";
  renderPresets();
}

/** Setup's "Tidy for me": every kind that is off takes its stored choice,
 * then all of it goes to Gmail. */
export async function turnOnTimeLimits(): Promise<boolean> {
  renderTimeLimits();
  for (const bucket of ALL_SORT_BUCKETS) {
    const select = selectFor(bucket);
    if (select?.value === OFF) select.value = choiceValue(ctx.settings.autoSort.inboxHoursByBucket[bucket] ?? null);
  }
  return queueSave();
}

/** Menus the window sets: every label that is on (all of them when none
 * is), except those set to skip the inbox. */
function windowTargets(): HTMLSelectElement[] {
  const menus = ALL_SORT_BUCKETS.map(selectFor).filter(
    (m): m is HTMLSelectElement => m !== null && m.value !== "0",
  );
  const on = menus.filter((m) => m.value !== OFF);
  return on.length > 0 ? on : menus;
}

/** The window shows the shared time when every label it sets agrees. */
export function windowValue(values: string[]): string {
  const unique = new Set(values);
  const only = unique.size === 1 ? [...unique][0] : "";
  return WINDOW_CHOICES.some((c) => c.value === only) ? only : PER_LABEL;
}

function renderWindow(): void {
  let select = document.getElementById("time-limits-window") as HTMLSelectElement | null;
  if (!select && rowsEl) {
    select = document.createElement("select");
    select.id = "time-limits-window";
    select.className = "kind-pick";
    select.setAttribute("aria-label", "Time in inbox");
    for (const c of WINDOW_CHOICES) select.add(new Option(c.label, c.value));
    select.add(new Option("Per label", PER_LABEL));
    select.onchange = () => {
      if (select!.value === PER_LABEL) return;
      for (const menu of windowTargets()) menu.value = select!.value;
      void queueSave();
    };
    const row = document.createElement("div");
    row.className = "ios-row org-row";
    const mark = Object.assign(document.createElement("span"), { className: "app-ic label-ic" });
    mark.append(icon("clock"));
    row.append(mark, Object.assign(document.createElement("span"), { className: "grow", textContent: "Time in inbox" }), select);
    const group = Object.assign(document.createElement("div"), { className: "ios-group" });
    group.append(row, holdRow());
    const wrap = Object.assign(document.createElement("section"), { className: "ios-section org-window" });
    wrap.append(group);
    rowsEl.before(wrap);
  }
  if (!select) return;
  const on = windowTargets().filter((m) => m.value !== OFF);
  select.value = windowValue(on.map((m) => m.value));
}

/** "Hold mail with no label": unsorted inbox mail goes to the Screener. */
function holdRow(): HTMLElement {
  const row = Object.assign(document.createElement("label"), { className: "ios-row org-row" });
  const mark = Object.assign(document.createElement("span"), { className: "app-ic label-ic" });
  mark.append(icon("inbox"));
  const toggle = Object.assign(document.createElement("input"), { type: "checkbox", className: "switch", id: "hold-unsorted" });
  toggle.setAttribute("role", "switch");
  toggle.checked = ctx.settings.autoSort.holdUnsorted;
  toggle.onchange = async () => {
    ctx.settings = await updateSettings({ autoSort: { ...ctx.settings.autoSort, holdUnsorted: toggle.checked } });
  };
  row.title = `After ${HOLD_UNSORTED_HOURS} hours, mail that fits no label waits in the Screener for you`;
  row.append(mark, Object.assign(document.createElement("span"), { className: "grow", textContent: "Hold mail with no label" }), toggle);
  return row;
}

function limitsFromMenus(): Record<string, number | null> {
  const inboxHoursByBucket: Record<string, number | null> = { ...ctx.settings.autoSort.inboxHoursByBucket };
  for (const bucket of ALL_SORT_BUCKETS) {
    const select = selectFor(bucket);
    // Off keeps the last time, so turning a kind back on restores it.
    if (select && select.value !== OFF) inboxHoursByBucket[bucket] = parseChoice(select.value);
  }
  return inboxHoursByBucket;
}

// Menu changes save one at a time, so two quick picks can't race on Gmail's filters.
let saving: Promise<boolean> = Promise.resolve(true);

function queueSave(): Promise<boolean> {
  saving = saving.then(save, save);
  return saving;
}

// What the last save said; shown in place of "Last checked" until the page is left.
let saveNote = "";

function note(text: string) {
  saveNote = text;
  if (statusEl) statusEl.textContent = text;
}

async function save(): Promise<boolean> {
  if (!statusEl) return false;
  const inboxHoursByBucket = limitsFromMenus();
  const labelsOff = ALL_SORT_BUCKETS.filter((b) => selectFor(b)?.value === OFF);
  const on = labelsOff.length < ALL_SORT_BUCKETS.length;
  note("Saving…");
  try {
    ctx.settings = await updateSettings({
      autoSort: { ...ctx.settings.autoSort, timeLimitsEnabled: on, keepSorting: on, inboxHoursByBucket, labelsOff },
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
    if (!on) {
      note("Off. New mail stays where it lands.");
    } else {
      await colorClusterLabels(token).catch((err) => log.error("time limits: label colors failed", err));
      note("Saved. Checking your inbox…");
      const run = await runInboxTimeLimits();
      // The run recorded lastSweep in storage; pick it up for the render.
      ctx.settings = await getSettings();
      note(run && run.moved > 0 ? `Saved. Moved ${plural(run.moved, "email")}${run.more ? ", more soon" : ""}.` : "Saved.");
    }
    return true;
  } catch (err) {
    log.error("time limits: save failed", err);
    note("Couldn't save to Gmail. Try again.");
    return false;
  } finally {
    renderTimeLimits();
  }
}

// ── Presets: what arrives on a schedule, and one-time moves ────────────

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

/** Sets the given kinds' menus, then saves. Other kinds keep their choice. */
async function saveLimits(hours: Record<string, number | null>): Promise<void> {
  for (const [bucket, h] of Object.entries(hours)) {
    const select = selectFor(bucket as SortBucket);
    if (select) select.value = choiceValue(h);
  }
  if (!(await queueSave())) renderPresets();
}

/** An iOS-style switch for a preset row. Flipping it back is the undo. */
export function presetSwitch(label: string, on: boolean, flip: () => void | Promise<void>): HTMLInputElement {
  const sw = document.createElement("input");
  sw.type = "checkbox";
  sw.className = "switch";
  sw.setAttribute("role", "switch");
  sw.setAttribute("aria-label", label);
  sw.checked = on;
  sw.onchange = () => {
    sw.disabled = true;
    void flip();
  };
  return sw;
}

/** Newsletters held out of the inbox, delivered Saturday (or every day) at
 * 8 am. Off brings the held ones back now. */
function newsletterDayCard(): HTMLElement {
  const on = newsletterDayOn(ctx.settings);
  const card = document.createElement("div");
  card.className = "rec-card";
  card.dataset.preset = "saturday";
  const name = document.createElement("div");
  name.className = "rec-name";
  name.textContent = "Saturday newsletters";
  const fact = document.createElement("div");
  fact.className = "rec-fact";
  fact.textContent = on ? "On" : "All at once, 8 am Saturday";
  if (on) {
    const when = document.createElement("select");
    when.className = "newsletter-when";
    when.setAttribute("aria-label", "When newsletters arrive");
    for (const [value, label] of [
      ["saturday", "Saturday"],
      ["daily", "Every day"],
    ]) when.add(new Option(label, value, false, (value === "daily") === Boolean(ctx.settings.newsletterDay.daily)));
    when.onchange = async () => {
      ctx.settings = await updateSettings({
        newsletterDay: { ...ctx.settings.newsletterDay, daily: when.value === "daily" },
      });
    };
    fact.append(", ", when);
  }
  const sw = presetSwitch("Saturday newsletters", on, async () => {
    ctx.settings = await updateSettings({ newsletterDay: { enabled: !on, lastDelivered: Date.now() } });
    await saveLimits({ newsletter: on ? null : HOLD_HOURS });
    if (on) await deliverNewsletters(Date.now(), true).catch((err) => log.error("Newsletter delivery failed", err));
  });
  card.append(name, fact, sw);
  return card;
}

let presetSenders: readonly SenderSummary[] = [];
let extraCards: () => HTMLElement[] = () => [];

/** Cards for one-time actions (dashboard.ts), shown after the time-limit ones. */
export function setPresetActions(cards: () => HTMLElement[]): void {
  extraCards = cards;
}

export function renderPresets(senders: readonly SenderSummary[] = presetSenders): void {
  presetSenders = senders;
  renderKindSubs();
  const cards = [
    newsletterDayCard(),
    ...extraCards(),
  ];
  // Each Clean up card's page shows the switches that belong to it.
  for (const [holder, ids] of PRESET_GROUPS) {
    document.getElementById(holder)?.replaceChildren(...cards.filter((c) => ids.includes(c.dataset.preset ?? "")));
  }
  // Each preset wears its own colored icon, like a Reminders list.
  for (const card of cards) {
    const glyph = PRESET_ICONS[card.dataset.preset!];
    if (!glyph) continue;
    const mark = document.createElement("span");
    mark.className = `app-ic preset-${card.dataset.preset}`;
    mark.append(icon(glyph));
    card.prepend(mark);
  }
}

const PRESET_GROUPS: ReadonlyArray<[holder: string, ids: string[]]> = [
  ["presets-lists", ["saturday", "no-reply"]],
  ["presets-never", ["never-opened"]],
  ["presets-old", ["keep-newest", "delivered"]],
];

const PRESET_ICONS: Record<string, string> = {
  saturday: "calendar",
  "no-reply": "reply",
  "never-opened": "mail-x",
  "keep-newest": "inbox",
  delivered: "check",
};

export function wireTimeLimits(): void {
  renderTimeLimits();
}
