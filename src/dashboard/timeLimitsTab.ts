// Organize's one list: where each kind of mail goes. A kind stays in the
// inbox, goes straight to its label, or leaves after a set time. The switch
// keeps it going for new mail: saving syncs the per-category Gmail filters and
// runs one sweep straight away; the background alarm repeats it every 5
// minutes (see lib/inboxTimeLimits.ts). Sort my inbox (sortInbox.ts) reads
// the same menus for mail already here.
import { categoryLabelName, syncGmailCategoryFilters } from "../lib/categoryFilters";
import { runInboxTimeLimits } from "../lib/inboxTimeLimitsRunner";
import { log } from "../lib/log";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { getSettings, updateSettings } from "../lib/settingsStore";
import { domainOf } from "../lib/domainGrouping";
import { deliverNewsletters, HOLD_HOURS, newsletterDayOn } from "../lib/newsletterDay";
import type { SenderSummary } from "../lib/senderModel";
import { ALL_SORT_BUCKETS, effectiveBucket, type SortBucket } from "../lib/sortTaxonomy";
import { icon } from "./homeDashboard";
import { ctx } from "./state";

const toggleEl = document.getElementById("time-limits-toggle") as HTMLInputElement | null;
const rowsEl = document.getElementById("time-limits-rows") as HTMLDivElement | null;
const statusEl = document.getElementById("time-limits-status") as HTMLParagraphElement | null;
const lastRunEl = document.getElementById("time-limits-last") as HTMLParagraphElement | null;

/** Select options: hours, or null for "stays in inbox". */
export const LIMIT_CHOICES: { label: string; hours: number | null }[] = [
  { label: "Stays in inbox", hours: null },
  { label: "Straight to label", hours: 0 },
  { label: "After 10 minutes", hours: 1 / 6 },
  { label: "After 1 hour", hours: 1 },
  { label: "After 1 day", hours: 24 },
  { label: "After 2 days", hours: 48 },
  { label: "After 3 days", hours: 72 },
  { label: "After 1 week", hours: 168 },
  { label: "After 2 weeks", hours: 336 },
  { label: "After 30 days", hours: 720 },
];

/** Round 2's picker: five steps from keep to a day. Other values stay in the
 * (hidden) menu, which is still what gets saved. */
const STEPS: { label: string; hours: number | null; name: string }[] = [
  { label: "Keep", hours: null, name: "Stays in inbox" },
  { label: "1 mo", hours: 720, name: "After 30 days" },
  { label: "1 wk", hours: 168, name: "After 1 week" },
  { label: "3 d", hours: 72, name: "After 3 days" },
  { label: "1 d", hours: 24, name: "After 1 day" },
];

function stepPicker(select: HTMLSelectElement, name: string): HTMLElement {
  const seg = document.createElement("div");
  seg.className = "step-pick";
  seg.setAttribute("role", "group");
  seg.setAttribute("aria-label", `${name}: how long it stays`);
  const paint = () => {
    for (const b of Array.from(seg.children) as HTMLButtonElement[])
      b.setAttribute("aria-pressed", String(b.dataset.value === select.value));
  };
  for (const step of STEPS) {
    const b = Object.assign(document.createElement("button"), { type: "button", textContent: step.label });
    b.dataset.value = choiceValue(step.hours);
    b.setAttribute("aria-label", `${name}: ${step.name}`);
    b.onclick = () => {
      select.value = b.dataset.value!;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      paint();
    };
    seg.append(b);
  }
  select.addEventListener("change", paint);
  paint();
  return seg;
}

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

// "N now" comes from Sort my inbox's plan (sortInbox.ts), "a week" from the scan.
let nowByBucket = new Map<SortBucket, number>();

export function setNowCounts(counts: ReadonlyMap<SortBucket, number>): void {
  nowByBucket = new Map(counts);
  renderKindSubs();
}

function kindSub(bucket: SortBucket, weekly: ReadonlyMap<SortBucket, number>): string {
  const now = nowByBucket.get(bucket) ?? 0;
  const week = weekly.get(bucket) ?? 0;
  if (now === 0 && week === 0) return "None right now";
  return week > 0 ? `${now.toLocaleString()} now · about ${week.toLocaleString()} a week` : `${now.toLocaleString()} now`;
}

function renderKindSubs(): void {
  const weekly = weeklyByBucket(presetSenders, Date.now());
  for (const bucket of ALL_SORT_BUCKETS) {
    const sub = document.getElementById(`time-limit-sub-${bucket}`);
    if (sub) sub.textContent = kindSub(bucket, weekly);
  }
}

/** Keeps a menu choice. With the switch on it also goes to Gmail. */
async function chooseLimit(): Promise<void> {
  if (toggleEl?.checked) {
    await save();
    return;
  }
  ctx.settings = await updateSettings({
    autoSort: { ...ctx.settings.autoSort, inboxHoursByBucket: limitsFromMenus() },
  });
}

export function renderTimeLimits(): void {
  if (!toggleEl || !rowsEl || !lastRunEl) return;
  const cfg = ctx.settings.autoSort;
  toggleEl.checked = cfg.timeLimitsEnabled;
  // One row per kind: icon, name, how much there is, and where it goes.
  rowsEl.replaceChildren(
    ...ALL_SORT_BUCKETS.map((bucket) => {
      const plainName = categoryLabelName(bucket, ctx.settings.labelChoices).replace(/^\S+\s/, "");
      const row = document.createElement("div");
      row.className = "glass-card kind-card";
      row.title = BUCKET_HINT[bucket];
      const mark = document.createElement("span");
      mark.className = "app-ic";
      mark.append(icon(BUCKET_ICON[bucket]));
      const words = document.createElement("span");
      words.className = "grow";
      const sub = Object.assign(document.createElement("span"), { className: "sub", id: `time-limit-sub-${bucket}` });
      words.append(plainName, sub);
      const select = document.createElement("select");
      select.id = `time-limit-${bucket}`;
      select.className = "kind-pick";
      select.setAttribute("aria-label", `${plainName}: where it goes`);
      for (const choice of limitChoicesFor(bucket)) select.add(new Option(choice.label, choiceValue(choice.hours)));
      select.value = choiceValue(cfg.inboxHoursByBucket[bucket] ?? null);
      select.onchange = () => void chooseLimit();
      select.hidden = true;
      const head = document.createElement("div");
      head.className = "kind-head";
      head.append(mark, words);
      row.append(head, stepPicker(select, plainName), select);
      return row;
    }),
  );
  renderKindSubs();
  lastRunEl.textContent =
    cfg.timeLimitsEnabled && cfg.lastSweep.at > 0
      ? `Last checked ${ago(cfg.lastSweep.at)}: moved ${plural(cfg.lastSweep.moved, "message")} into their labels.`
      : "";
  renderPresets();
}

/** Fills the menus with suggested values (from first-run setup) without
 * saving: Gmail only changes when the user turns the switch on. */
export function proposeTimeLimits(hours: Partial<Record<SortBucket, number | null>>, message: string): void {
  if (!statusEl) return;
  for (const [bucket, value] of Object.entries(hours)) {
    const select = selectFor(bucket as SortBucket);
    if (select) select.value = choiceValue(value ?? null);
  }
  // Sort my inbox recounts from the menus.
  rowsEl?.dispatchEvent(new Event("change"));
  statusEl.textContent = message;
}

/** Setup's "Tidy for me": the menus as they are, switch on, saved to Gmail. */
export async function turnOnTimeLimits(): Promise<boolean> {
  renderTimeLimits();
  if (!toggleEl) return false;
  toggleEl.checked = true;
  return save();
}

function limitsFromMenus(): Record<string, number | null> {
  const inboxHoursByBucket: Record<string, number | null> = { ...ctx.settings.autoSort.inboxHoursByBucket };
  for (const bucket of ALL_SORT_BUCKETS) {
    const select = selectFor(bucket);
    if (select) inboxHoursByBucket[bucket] = parseChoice(select.value);
  }
  return inboxHoursByBucket;
}

async function save(): Promise<boolean> {
  if (!toggleEl || !statusEl) return false;
  const inboxHoursByBucket = limitsFromMenus();
  toggleEl.disabled = true;
  statusEl.textContent = "Saving…";
  try {
    // One switch: the time limits and the filters for new mail go together.
    const on = toggleEl.checked;
    ctx.settings = await updateSettings({
      autoSort: { ...ctx.settings.autoSort, timeLimitsEnabled: on, keepSorting: on, inboxHoursByBucket },
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
    if (!on) {
      statusEl.textContent = "Off. New mail stays where it lands.";
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
    toggleEl.disabled = false;
    renderTimeLimits();
  }
}

// ── Presets: what arrives on a schedule, and one-time moves ────────────

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

type Limits = Record<string, number | null>;

/** Sets every menu and the switch, then saves. Time limits stay on while any
 * kind has one. */
async function saveLimits(hours: Limits): Promise<void> {
  if (!toggleEl) return;
  for (const bucket of ALL_SORT_BUCKETS) {
    const select = selectFor(bucket);
    if (select) select.value = choiceValue(hours[bucket] ?? null);
  }
  toggleEl.checked = Object.values(hours).some((h) => h != null);
  if (!(await save())) renderPresets();
}

/** The current limits, or all off when time limits are off, so switching one
 * kind on never turns on every default. */
function currentLimits(): Limits {
  const cfg = ctx.settings.autoSort;
  return cfg.timeLimitsEnabled ? { ...cfg.inboxHoursByBucket } : Object.fromEntries(ALL_SORT_BUCKETS.map((b) => [b, null]));
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
    const base = currentLimits();
    ctx.settings = await updateSettings({ newsletterDay: { enabled: !on, lastDelivered: Date.now() } });
    await saveLimits({ ...base, newsletter: on ? null : HOLD_HOURS });
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
  if (!presetsEl) return;
  renderKindSubs();
  const cards = [
    newsletterDayCard(),
    ...extraCards(),
  ];
  // Grouped lists, like iOS Settings: what arrives on a schedule, and
  // one-time moves out of the inbox.
  presetsEl.replaceChildren(
    ...PRESET_GROUPS.map(([head, ids]) => {
      const rows = cards.filter((c) => ids.includes(c.dataset.preset ?? ""));
      const wrap = document.createElement("section");
      wrap.className = "ios-section";
      wrap.hidden = rows.length === 0;
      const h = document.createElement("h2");
      h.className = "ios-head";
      h.textContent = head;
      const group = document.createElement("div");
      group.className = "ios-group";
      group.append(...rows);
      wrap.append(h, group);
      return wrap;
    }),
  );
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

const PRESET_GROUPS: ReadonlyArray<[head: string, ids: string[]]> = [
  ["Arrive on time", ["saturday", "no-reply"]],
  ["Move out once", ["never-opened", "keep-newest", "delivered"]],
];

const PRESET_ICONS: Record<string, string> = {
  saturday: "calendar",
  "no-reply": "reply",
  "never-opened": "mail-x",
  "keep-newest": "inbox",
  delivered: "check",
};

export function wireTimeLimits(): void {
  if (toggleEl) toggleEl.onchange = () => void save();
  renderTimeLimits();
}
