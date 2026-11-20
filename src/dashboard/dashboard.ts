import { NUMBER_SCREENS } from "../lib/keymap";
import { installCrashHandlers } from "../lib/crashLog";
import { clearCountBadge } from "../lib/supervisor";
import { scanCheckCounts, scanFound } from "../lib/securityScan";
import { correctionKey } from "../lib/addressIdentity";
import { executeBulkDeleteDomains, filterOutProtected } from "../lib/bulkActions";
import { loadPublicSuffixList } from "../lib/publicSuffix";
import { applyBrandVerdicts, loadBrandRegistry } from "../lib/brandRegistry";
import { applySenderLedger } from "../lib/senderLedgerStore";
import {
  buildExpiryBuckets,
  mergeExpiryBuckets,
  totalExpiryCount,
  type ExpiryBucket,
} from "../lib/expiryTriage";
import { buildProtectionContext, idsSafeToMoveOut } from "../lib/protectionPolicy";
import { matchRule, upsertRuleByName, type ClusterRule } from "../lib/rules";
import { clusterLabelName, showLabel } from "../lib/clusterLabels";
import { categoryLabelName } from "../lib/categoryFilters";
import { learnFromLabelMoves, readLabeller, runInboxTimeLimits } from "../lib/inboxTimeLimitsRunner";
import { getScan, newScan, onScanChange, setScan, type ScanState } from "../lib/scanState";
import { describeRun, getRunReports, onRunReportsChange, startRun, type RunReport } from "../lib/runReport";
import { ALL_SORT_BUCKETS, bucketLabelName, effectiveBucket, kindKey, labelReason, SCOPED_KINDS } from "../lib/sortTaxonomy";
import { domainOf } from "../lib/domainGrouping";
import { runReplyReminders } from "../lib/replyReminders";
import { markRepliesToYou } from "../lib/correspondents";
import {
  batchModify,
  getLabel,
  getMessageMetadata,
  getOrCreateLabel,
  getProfileEmail,
  GmailApiError,
  listLabels,
  listMessageIds,
  listSendAs,
} from "../lib/gmailApi";
import { parseAddressList } from "../lib/headerFields";
import { clearMetadataCache } from "../lib/metadataCache";
import { openMailIndex } from "../lib/mailIndex";
import { exportReplay } from "./replayExport";
import {
  catchUpIndex,
  DEFAULT_QUICK_COUNT,
  readMailIndex,
  syncChangedIndex,
  syncMailIndex,
  type SyncProgress,
  type SyncResult,
} from "../lib/mailSync";
import { waitForGmailHeadroom } from "../lib/gmailQuotaLedger";
import { applyIndexedCorrespondents, mailIndexLockKey } from "../lib/indexTriage";
import { withStorageLock } from "../lib/storageLock";
import type { EmailProvider, ProviderId } from "../lib/providers/emailProvider";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { outlookProvider } from "../lib/providers/outlookProvider";
import { OutlookReauthRequired } from "../lib/providers/msalAuth";
import { summarizeCombined, type SenderSummary } from "../lib/senderModel";
import { applyCensus } from "../lib/census";
import { buildSenderProfiles } from "../lib/senderProfile";
import { groupKeyFor, isPerson, senderName } from "../lib/senderListView";
import { ALL_MAIL_DAYS, getSettings, mutateSettings, pullSyncedSettings, updateSettings, type ClusterSettings } from "../lib/settingsStore";
import { activeProviders, ctx, decisions, providerById, setBridge } from "./state";
import { jobCard, renderSortInbox, wireSortInbox } from "./sortInbox";
import { maybeShowLabelTidyCard } from "./labelTidy";
import {
  presetSwitch,
  renderPresets,
  renderTimeLimits,
  setPresetActions,
  weeklyByBucket,
  wireTimeLimits,
} from "./timeLimitsTab";
import { excludeSnoozedMessages } from "../lib/snoozeFilter";
import { resurfaceDueSnoozed } from "../lib/snoozeResurface";
import { athenaOriginPatterns, getAthenaConfig } from "../lib/athenaIntegration";
import { recordEngagementFeedback, type EngagementFeedback } from "../lib/engagementModel";
import { readUnsubscribeReplies } from "./unsubscribeRecord";
import {
  buildSuggestions,
  unopenedSuggestions,
  type Suggestion,
} from "../lib/suggestions";
import { markFirstContact } from "../lib/firstContact";
import { learnPick, matchKai, rememberMiss } from "../lib/kaiMatch";
import { renderKaiMissed } from "./settingsMore";
import { recordUnread, unreadDays, unreadWeekAgo } from "../lib/inboxTrend";
import { markNameMatches } from "../lib/nameMatch";
import { knownSenderSet } from "../lib/screener";
import { engineContext, riskOf } from "../lib/mailEngine";
import { log } from "../lib/log";
import { initSuggestionModel, learnFromFeedback, suggestionModel } from "./suggestionLearning";
import { initKindModel, kindModel } from "./kindLearning";
import { markLearnedTransactional } from "../lib/kindModel";
import { isAuthCancelled } from "../lib/chromeError";
import { pruneSelection, renderConfirmStep, runNow } from "./ui";
import { buildCleanupCards } from "../lib/cleanupCards";
import { createRangePicker } from "./rangePicker";
import { barsSvg, downloadBytes, emailRows, emailsCsv, emailsXlsx, oneLine, periodFacts, printReport, reportHtml, wireDownloadMenu, type LabelOf, type ReportSpec } from "./reportDownload";
import { changeChip, dailyCounts, pageRows, renderCleanupPage, renderSenderTable, setTableFilter, type PageItem } from "./cleanupPage";
import { keepNewestExcess, olderReadExcess } from "../lib/keepNewest";
import { deliveredUpdates } from "../lib/orderEvents";
import { appendUndoButton, logAction, renderRecentTab } from "./recentTab";
import { renderRulesTab, wireRulesTab } from "./rulesTab";
import { renderLearned, SIGNED_OUT_KEY, wireSettingsMore } from "./settingsMore";
import { initBodyChecks, rankFlagged, renderSecuritySection } from "./securityTab";
import { paintChecks, renderSecurityCharts, wireProtectPages } from "./reportTab";
import { setLabelSenders, wireLabelPage } from "./labelPage";
import { renderSecurityTrend } from "./securityTrend";
import { heldByWeek } from "../lib/scamHistory";
import { setupSignedIn, wireSetup } from "./setupTab";
import { firstName, showWelcome } from "./welcome";
import { renderScreenerTab, wireScreenerTab } from "./screenerTab";
import { preselectLists, renderSubscriptionsTab, wireSubscriptionsTab } from "./subscriptionsTab";
import { buildInboxHealth, inboxHealthScore, recordHealthSnapshot } from "../lib/inboxHealth";
import { wireAccountMenu } from "./accountMenu";
import { initAskKai, type AskFacts } from "./askKai";
import {
  clearedByDay,
  mailByKind,
  HOME_KINDS,
  receivedInRange,
  paintHomeRead,
  readingView,
  renderHomeDashboard,
  STALE_SWEEP_MS,
  filedByDay,
  type HomeAct,
  type HomeFacts,
  chartLegend,
  chartStats,
  dayChart,
} from "./homeDashboard";
import {
  detailSenders,
  idsByProvider,
  initDetailsPanel,
  WEEKS,
  type DetailsPanel,
} from "./detailsPanel";
import { createDurableJob, runDurableJob } from "../lib/durableJobs";
import { CLUSTER_FIRST_ON, CLUSTER_QUESTIONS, firstVisitTip, initKaiGuide, type KaiGuide } from "./kaiGuide";

installCrashHandlers("dashboard");

const selectedSenderKeys = new Set<string>();
let currentExpiryBuckets: ExpiryBucket[] = [];
// True when the cleanup scan filled its per-account candidate cap — every
// derived count is then a sample of the most-recent N, not an inbox total.
let lastScanCapHit = false;
let engagementSuggestions: Suggestion[] = [];
// The security lane re-uses messages already fetched for cleanup (no extra
// quota) — cap how many feed the per-sender threat scoring, newest first.
const SECURITY_SCAN_MAX_MESSAGES = 250;

const statusEl = document.getElementById("status") as HTMLParagraphElement;
const overviewContentEl = document.getElementById("overview-content") as HTMLDivElement;
const overviewHeadlineEl = document.getElementById("overview-headline") as HTMLParagraphElement;
const connectOutlookBtn = document.getElementById("connect-outlook") as HTMLButtonElement;



const expiryCleanupSlot = document.getElementById("expiry-cleanup-slot") as HTMLSpanElement;
const expiryCleanupBtn = document.getElementById("expiry-cleanup-btn") as HTMLButtonElement;

const themeSelect = document.getElementById("theme-select") as HTMLSelectElement;
const autoQuarantineToggle = document.getElementById("auto-quarantine-toggle") as HTMLInputElement;

const scanWindowInput = document.getElementById("scan-window-input") as HTMLInputElement;
const applyScanSettingsBtn = document.getElementById("apply-scan-settings-btn") as HTMLButtonElement;

const onboardingBanner = document.getElementById("onboarding-banner") as HTMLDivElement;
const onboardingDismissBtn = document.getElementById("onboarding-dismiss-btn") as HTMLButtonElement;

const athenaSectionEl = document.getElementById("athena-section") as HTMLElement;
const athenaConnectBtn = document.getElementById("athena-connect-btn") as HTMLButtonElement;
const athenaStatusEl = document.getElementById("athena-status") as HTMLSpanElement;

const navButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("#sidebar button[data-screen]"));
// Each section's number key (1-4) in its tooltip and for screen readers.
for (const [i, screen] of NUMBER_SCREENS.entries()) {
  const b = navButtons.find((n) => n.dataset.screen === screen);
  if (!b) continue;
  b.title = `${b.dataset.label ?? b.textContent!.trim()} (${i + 1})`;
  b.setAttribute("aria-keyshortcuts", `${i + 1} Alt+${i + 1}`);
}
const screenPanels = Array.from(document.querySelectorAll<HTMLElement>("section.screen[data-screen]"));

// Old stored activeTab values → the new screen ids they map to.
const SCREEN_ALIASES: Record<string, string> = {
  cleanup: "delete",
  suggested: "delete",
  security: "impersonation",
  // Rules live in Organize now.
  rules: "organize",
};
function resolveScreen(name: string): string {
  const target = SCREEN_ALIASES[name] ?? name;
  // Setup, Activity and Settings have no sidebar item; any screen with a panel is fine.
  return screenPanels.some((p) => p.dataset.screen === target) ? target : "overview";
}

const neverReadTrashSlot = document.getElementById("never-read-trash-slot") as HTMLSpanElement;
const neverReadTrashBtn = document.getElementById("never-read-trash-btn") as HTMLButtonElement;



// ── Sidebar navigation (WAI-ARIA tabs pattern, vertical) ────────────────

/** Pages outside the sidebar light up the section they belong to. */
const PARENT_SCREEN: Record<string, string> = { subscriptions: "delete", sort: "organize" };
/** The last sidebar section shown, for the Back link on pages outside the sidebar. */
let lastPlace = "overview";

/** "‹ Back to Security" on a page with no sidebar item of its own; gone on the sidebar's pages. */
function paintBackLink(target: string) {
  for (const old of Array.from(document.querySelectorAll(".page-back"))) old.remove();
  const own = navButtons.some((b) => b.dataset.screen === target && !b.hidden);
  if (own || target === "subscriptions" || target === "settings" || target === "setup" || target === lastPlace) return;
  const to = navButtons.find((b) => b.dataset.screen === lastPlace);
  const panel = screenPanels.find((p) => p.dataset.screen === target);
  const head = panel?.querySelector(".page-titles") ?? panel?.querySelector(".page-head");
  if (!to || !head) return;
  const back = document.createElement("button");
  back.type = "button";
  back.className = "cu-back page-back";
  back.textContent = `‹ ${to.dataset.label ?? to.textContent!.trim()}`;
  back.onclick = () => void selectScreen(lastPlace);
  head.prepend(back);
}

function showScreen(name: string) {
  const target = resolveScreen(name);
  // A new page opens at its top; re-showing the same page keeps the scroll.
  if (screenPanels.some((p) => !p.hidden && p.dataset.screen !== target)) window.scrollTo(0, 0);
  document.body.dataset.screen = target;
  if (target === "settings") renderLearned();
  for (const panel of screenPanels) {
    const active = panel.dataset.screen === target;
    panel.hidden = !active;
    panel.tabIndex = active ? 0 : -1;
  }
  // Subscriptions is Cleanup's second tab: Cleanup stays lit, and the KPI row and tabs move with it.
  const place = PARENT_SCREEN[target] ?? target;
  paintBackLink(target);
  if (navButtons.some((b) => b.dataset.screen === place && !b.hidden)) lastPlace = place;
  if (place === "delete") {
    const head = document.getElementById("cu-head");
    const panel = screenPanels.find((p) => p.dataset.screen === target);
    if (head && panel) panel.querySelector(".page-head")?.after(head);
    paintCleanupChart(target === "subscriptions" ? "lists" : cuKpi);
    for (const t of Array.from(document.querySelectorAll<HTMLElement>("#cu-head [data-tab-for]"))) {
      t.classList.toggle("active", t.dataset.tabFor === target);
      t.setAttribute("aria-selected", String(t.dataset.tabFor === target));
    }
  }
  for (const btn of navButtons) {
    const active = btn.dataset.screen === place;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
    // Roving tabindex: only the selected item is in the Tab order; arrows
    // move between the rest.
    btn.tabIndex = active ? 0 : -1;
  }
  // On a screen from the account menu, keep the sidebar reachable by Tab.
  if (!navButtons.some((b) => b.dataset.screen === target)) {
    const first = navButtons.find(navItemShown);
    if (first) first.tabIndex = 0;
  }
  // A place's sub-pages show only while one of its screens is open.
  for (const area of Array.from(document.querySelectorAll<HTMLElement>("#sidebar .nav-area"))) {
    area.classList.toggle("open", Boolean(area.querySelector(`button[data-screen="${target}"]`)));
  }
  renderCrumbs(
    navButtons.find((b) => b.dataset.screen === target) ??
      document.querySelector<HTMLButtonElement>(`#account-menu [data-open="${target}"]`) ??
      undefined,
  );
  // Last, so listeners (Kai) read the page that's now showing.
  document.dispatchEvent(new CustomEvent("cluster:screen", { detail: target }));
}

/** "Clean up › Stop mail" above a sub-page: its place, then its own name. */
function renderCrumbs(btn: HTMLButtonElement | undefined) {
  const crumbs = document.getElementById("crumbs");
  if (!crumbs) return;
  // The item's own text nodes only, so a count badge is left out.
  const label = (b: HTMLButtonElement | null | undefined) =>
    b
      ? Array.from(b.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent)
          .join("")
          .trim()
      : "";
  const name = label(btn);
  const group = btn?.classList.contains("nav-child")
    ? label(btn.closest(".nav-area")?.querySelector<HTMLButtonElement>(":scope > .nav-item"))
    : "";
  // A place's own page needs no crumb; its title says where you are.
  crumbs.replaceChildren(
    ...(group ? [group, name] : []).map((text) => {
      const span = document.createElement("span");
      span.textContent = text;
      return span;
    }),
  );
}

/** A sidebar item that is neither hidden nor tucked inside a closed area. */
function navItemShown(btn: HTMLButtonElement): boolean {
  return !btn.hidden && !btn.closest(".nav-area:not(.open) .nav-children");
}

/** Details starts closed on every screen; a row, a number or the top-bar button opens it. */
function fitDetailsTo(_screen: string) {
  if (details?.isOpen()) details.rest(true);
}

/** Kai's one line the first time a page opens. */
function showPageTip(screen: string) {
  if (!ctx.settings.showKai || !kaiGuide) return;
  let tip: string | null = null;
  try {
    tip = firstVisitTip(screen, localStorage);
  } catch {
    return; // Storage blocked: no tips rather than the same tip every time.
  }
  if (tip) window.setTimeout(() => kaiGuide?.tip(tip), 400);
}

async function selectScreen(name: string) {
  const target = resolveScreen(name);
  showScreen(target);
  fitDetailsTo(target);
  showPageTip(target);
  ctx.settings = await updateSettings({ activeTab: target });
}

/** Security's Scams and Held tiles scroll to the one table that lists both. */
function wireSecurityTabs() {
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-sec-jump]")))
    b.addEventListener("click", () => document.getElementById("security-section")?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function wireNav() {
  wireSecurityTabs();
  // Settings > Advanced opens places that left the sidebar.
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-open-screen]")))
    b.onclick = () => void selectScreen(b.dataset.openScreen!);
  const list = document.getElementById("sidebar");
  list?.setAttribute("role", "tablist");
  list?.setAttribute("aria-orientation", "vertical");
  for (const btn of navButtons) {
    const name = btn.dataset.screen!;
    const panel = screenPanels.find((p) => p.dataset.screen === name);
    btn.setAttribute("role", "tab");
    btn.id ||= `nav-${name}`;
    if (panel) {
      panel.id ||= `screen-${name}`;
      btn.setAttribute("aria-controls", panel.id);
      panel.setAttribute("aria-labelledby", btn.id);
    }
    btn.onclick = () => void selectScreen(name);
    // The narrow sidebar shows icons only; this is its tooltip text (CSS).
    btn.dataset.label = Array.from(btn.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join("")
      .trim();
  }
  for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>("#account-menu [data-open]"))) {
    const panel = screenPanels.find((p) => p.dataset.screen === btn.dataset.open);
    panel?.setAttribute("aria-label", btn.textContent!.trim());
    btn.onclick = () => void selectScreen(btn.dataset.open!);
  }

  list?.addEventListener("keydown", (event) => {
    const keyed = event as KeyboardEvent;
    const delta =
      keyed.key === "ArrowDown" || keyed.key === "ArrowRight"
        ? 1
        : keyed.key === "ArrowUp" || keyed.key === "ArrowLeft"
          ? -1
          : 0;
    let next: number | undefined;
    // Arrow keys skip nav items that aren't shown.
    const shown = navButtons.filter(navItemShown);
    if (delta !== 0) {
      const current = shown.findIndex((b) => b.getAttribute("aria-selected") === "true");
      next = (current + delta + shown.length) % shown.length;
    } else if (keyed.key === "Home") {
      next = 0;
    } else if (keyed.key === "End") {
      next = shown.length - 1;
    }
    if (next === undefined) return;
    keyed.preventDefault();
    const btn = shown[next];
    btn.focus();
    void selectScreen(btn.dataset.screen!);
  });

  wireCleanupCards();
  wireRangePicker();
  // The logo always goes back to the Dashboard.
  const brand = document.getElementById("brand-home");
  if (brand) {
    brand.onclick = () => void selectScreen("overview");
    brand.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        void selectScreen("overview");
      }
    };
  }

  void showReloadBanner();

  // First run opens on setup; skipping or answering it sets setupDone.
  showScreen(ctx.settings.setupDone ? ctx.settings.activeTab : "setup");
}

/** The worker writes its build on start. A different one means Chrome is
 * still running old background code against these new pages. */
async function showReloadBanner() {
  const banner = document.getElementById("reload-banner");
  if (!banner) return;
  const { workerBuild } = await chrome.storage.local.get("workerBuild").catch(() => ({ workerBuild: undefined }));
  if (typeof workerBuild !== "string" || workerBuild === __BUILD__) return;
  banner.hidden = false;
  document.getElementById("reload-btn")!.onclick = () => chrome.runtime.reload();
}

// `accentWhenPositive` keeps the "Clean up" group's badges on one shared
// rule (quiet at zero, some visual weight once there's something to review)
// instead of a badge that's permanently styled regardless of content. Screens
// outside that group (senders/rules/screener) keep their plain always-neutral
// count, unchanged. `ariaSuffix`, when given, sets an accessible name (e.g.
// "4 to review") so a screen reader doesn't just hear a bare number — a color
// change alone (accent/alert classes) carries no meaning without it.
function setNavCount(screen: string, value: number, accentWhenPositive = false, ariaSuffix?: string) {
  const el = document.getElementById(`nav-count-${screen}`);
  if (!el) return;
  el.textContent = value > 0 ? String(value) : "";
  if (accentWhenPositive) el.classList.toggle("accent", value > 0);
  if (ariaSuffix) {
    if (value > 0) el.setAttribute("aria-label", `${value} ${ariaSuffix}`);
    else el.removeAttribute("aria-label");
  }
}

/** Fill and reveal the header account pill with the signed-in Gmail address.
 * Best-effort — a failure just leaves the pill hidden. */
// ── Connect gate ─────────────────────────────────────────────────────────
// The Google consent popup used to fire the moment the dashboard opened, on
// top of a page that still said "Connecting…", and a cancelled popup ended in
// "Something went wrong". Now: try for a token silently; if there isn't one
// (first run, or a sign-in that expired), show what Cluster reads and doesn't,
// and only open Google's prompt when the user presses Connect.
async function connectGmail(): Promise<string> {
  try {
    return await gmailProvider.getAuthToken(false);
  } catch {
    // Not connected yet (or the grant expired). Fall through to the gate.
  }
  return showConnectGate();
}

/** Kai peeks up from the bottom of the photo and waves, once per showing. */
function greetOnGate(returning: boolean) {
  const host = document.getElementById("connect-kai");
  const line = document.getElementById("connect-kai-line");
  if (!host || !line || !ctx.settings.showKai || typeof window.Kai !== "function") {
    host?.parentElement?.setAttribute("hidden", "");
    return;
  }
  if (returning) line.textContent = "Welcome back.";
  if (host.childElementCount > 0) return;
  const kai = window.Kai(host, { src: "/characters/", imgWidth: 320, calm: true });
  kai.do("peek");
  kai.do("wave");
  kai.talk(1400);
}

function showConnectGate(): Promise<string> {
  const gate = document.getElementById("connect-gate") as HTMLElement;
  const btn = document.getElementById("connect-gmail-btn") as HTMLButtonElement;
  const errorEl = document.getElementById("connect-error") as HTMLElement;
  const titleEl = document.getElementById("connect-title") as HTMLElement;

  // Anyone with a recorded health score has completed a scan before, so a
  // missing token means the sign-in expired rather than a first run.
  if (ctx.settings.healthHistory.length > 0) {
    titleEl.textContent = "Welcome back";
    btn.textContent = "Sign in with Gmail";
    const lead = document.getElementById("connect-lead") as HTMLElement;
    let signedOut = false;
    try {
      signedOut = sessionStorage.getItem(SIGNED_OUT_KEY) === "1";
    } catch {
      // Storage blocked: assume the sign-in expired.
    }
    lead.textContent = signedOut
      ? "You signed out. Connect again any time. Your settings are kept."
      : "Your Google sign-in expired. Reconnect to continue. Your settings are kept.";
  }
  void showPinTip();

  document.body.dataset.state = "connect";
  gate.hidden = false;
  // A first run gets Kai's welcome (name, then email); a returning user the plain gate.
  if (ctx.settings.healthHistory.length === 0) showWelcome(gate, btn);
  else {
    btn.focus();
    greetOnGate(true);
  }

  const label = btn.textContent;
  return new Promise((resolve) => {
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = "Waiting for Google…";
      errorEl.textContent = "";
      try {
        const token = await gmailProvider.getAuthToken(true);
        gate.hidden = true;
        delete document.body.dataset.state;
        // The gate already explained what Cluster reads, so the old trust
        // banner would only repeat it.
        if (!ctx.settings.onboardingDismissed) {
          ctx.settings = await updateSettings({ onboardingDismissed: true });
          onboardingBanner.hidden = true;
        }
        resolve(token);
      } catch (err) {
        log.error("Gmail connect failed", err);
        btn.disabled = false;
        btn.textContent = label;
        if (!navigator.onLine) {
          errorEl.textContent = "You're offline. Reconnect to the internet and try again.";
        } else if (isAuthCancelled(err)) {
          errorEl.textContent =
            "Google sign-in was cancelled. Cluster can't see your mail until you allow access.";
        } else {
          const message = err instanceof Error ? err.message : String(err);
          errorEl.textContent = `Couldn't connect to Gmail (${message}). Try again.`;
        }
      }
    };
  });
}

// chrome.action.getUserSettings() (Chrome 91+) says whether the toolbar icon
// is pinned. Only nudge when it isn't; stay quiet if the API is missing.
async function showPinTip() {
  const tip = document.getElementById("connect-pin-tip") as HTMLElement;
  try {
    const settings = await chrome.action?.getUserSettings?.();
    tip.hidden = !settings || settings.isOnToolbar;
  } catch {
    tip.hidden = true;
  }
}

let greetName = "";
/** The signed-in Gmail address, so Dashboard links open this account. */
let accountEmail: string | undefined;
/** "Good morning, Samuel!" by the hour, and the dates the Dashboard's charts cover. */
function paintGreeting(now = new Date()) {
  const h = now.getHours();
  const part = h < 5 ? "evening" : h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  const greeting = document.getElementById("overview-greeting");
  if (greeting) greeting.textContent = greetName ? `Good ${part}, ${greetName}!` : `Good ${part}!`;
  const label = document.getElementById("overview-range");
  if (label) label.textContent = rangeText(range);
}

// ── Dashboard date range: the picker under the date pill drives Received Mails ──
const DAY_MS = 86_400_000;
/** Local midnights of the first and last day shown (both included). */
let range = lastDays(30);

function lastDays(n: number): { start: number; end: number } {
  const end = new Date().setHours(0, 0, 0, 0);
  return { start: new Date(end).setDate(new Date(end).getDate() - (n - 1)), end };
}

function rangeLength(r: { start: number; end: number }): number {
  return Math.round((r.end - r.start) / DAY_MS) + 1;
}

function rangeText(r: { start: number; end: number }): string {
  const year = new Date(r.start).getFullYear() !== new Date(r.end).getFullYear();
  const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) });
  return `${fmt(r.start)} to ${fmt(r.end)}`;
}

/** "Last 30 days" while the range ends today, else the dates. */
function rangeLabel(r: { start: number; end: number }): string {
  return r.end === new Date().setHours(0, 0, 0, 0) ? `Last ${rangeLength(r)} days` : rangeText(r);
}

function wireRangePicker(): void {
  const button = document.getElementById("overview-range-btn") as HTMLButtonElement | null;
  const pop = document.getElementById("range-pop");
  if (!button || !pop) return;
  createRangePicker({
    button,
    pop,
    current: () => range,
    // Only days Cluster has read can be picked.
    oldest: () => (lastOverview ? oldestRead(lastOverview[2]) : undefined),
    onPick: (r) => {
      range = r;
      paintGreeting();
      if (lastOverview) renderOverview(...lastOverview);
    },
  });
  // Download: the Dashboard as a report, or the range's emails as a CSV.
  const dl = document.getElementById("overview-dl") as HTMLButtonElement | null;
  const menu = document.getElementById("overview-dl-menu");
  if (!dl || !menu) return;
  const rows = () => {
    const end = new Date(range.end);
    end.setDate(end.getDate() + 1);
    const senders = lastOverview?.[2] ?? [];
    return emailRows(senders.map((sender) => ({ sender })), range.start, end.getTime(), decisions(senders), placeName);
  };
  const name = () => `cluster-emails-${isoDay(range.start)}-to-${isoDay(range.end)}`;
  wireDownloadMenu(dl, menu, {
    pdf: () => printReport(reportHtml(mailReportSpec(), brandSvg())),
    xlsx: () => downloadBytes(`${name()}.xlsx`, emailsXlsx(rows(), "Emails"), XLSX_TYPE),
    csv: () => downloadBytes(`${name()}.csv`, emailsCsv(rows()), "text/csv;charset=utf-8"),
  });
}

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const brandSvg = () => document.querySelector(".panel-brand .brand-mark")?.outerHTML ?? "";
const REPORT_SOURCE = "Counts come from the mail Cluster has read in this Gmail account, on this computer. Nothing in this report left your device.";
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "0%");

/** Where an email lives, by name: its label, Personal, the Screener, Spam, or the inbox. */
const placeName: LabelOf = (d) => {
  const p = d?.place ?? null;
  if (p === null) return "Inbox";
  if (p === "personal") return showLabel(clusterLabelName("personal"));
  if (p === "screener") return "Screener";
  if (p === "spam") return "Spam";
  return showLabel(categoryLabelName(p, ctx.settings.labelChoices));
};

const DID_WORDS: Partial<Record<string, string>> = { sort: "Sorted", trash: "Moved to Trash", archive: "Archived", unsubscribe: "Unsubscribed", screener: "Held for review", quarantine: "Held as scams", mute: "Muted" };

/** Activity in [start, end): one row per kind of action, with times and emails moved. */
function didInPeriod(start: number, end: number): string[][] {
  const by = new Map<string, { times: number; emails: number }>();
  for (const e of ctx.settings.actionLog) {
    if (e.at < start || e.at >= end || e.undone) continue;
    const k = DID_WORDS[e.kind] ?? e.kind;
    const row = by.get(k) ?? { times: 0, emails: 0 };
    row.times += 1;
    row.emails += e.undo?.ids.length ?? 0;
    by.set(k, row);
  }
  return [...by]
    .sort((a, b) => b[1].emails - a[1].emails || b[1].times - a[1].times)
    .map(([k, v]) => [k, v.times.toLocaleString(), v.emails ? v.emails.toLocaleString() : ""]);
}

/** The Dashboard's report: the picked range's mail, then the inbox as it is today. */
function mailReportSpec(): ReportSpec {
  const senders = lastOverview?.[2] ?? [];
  const len = rangeLength(range);
  const end = new Date(range.end);
  end.setDate(end.getDate() + 1);
  const decided = decisions(senders);
  const f = periodFacts(senders, range.start, end.getTime(), decided, placeName);
  const before = periodFacts(senders, new Date(range.start).setDate(new Date(range.start).getDate() - len), range.start, decided);
  // Same rule as Overview's tile: no change until the days before are read.
  const change = before.total && lastFacts?.receivedPrev !== undefined ? Math.round(((f.total - before.total) / before.total) * 100) : null;
  const n = (v: number) => v.toLocaleString();
  const top = topSendersByCompany(senders, range.start, end.getTime(), 15);
  return {
    title: "Mail report",
    period: rangeText(range),
    account: accountEmail,
    sections: [
      {
        kind: "kpis",
        items: [
          { label: "Emails received", value: n(f.total), note: change === null ? undefined : `${change > 0 ? "+" : ""}${change}% on the ${len} days before` },
          { label: "Per day", value: (Math.round(f.perDay * 10) / 10).toLocaleString(), note: `Over ${len} days` },
          { label: "Busiest day", value: f.total ? `${f.busiest}s` : "None", note: "Most mail on average" },
          { label: "Still unread", value: n(f.unread), note: `${pct(f.unread, f.total)} of the period's mail` },
          { label: "Senders", value: n(f.senders.length), note: "Wrote to you in this period" },
          { label: "From people", value: n(f.kinds.primary), note: `${pct(f.kinds.primary, f.total)} of the period's mail` },
        ],
      },
      { kind: "chart", title: "Emails received each day", svg: barsSvg([{ color: "#1f5fd6", counts: f.daily }], range.start) },
      {
        kind: "table",
        title: "By category",
        columns: [{ label: "Category" }, { label: "Emails", num: true }, { label: "Share", num: true }],
        rows: HOME_KINDS.map((k) => [k.label, n(f.kinds[k.key]), pct(f.kinds[k.key], f.total)]),
      },
      {
        kind: "table",
        title: "By label",
        note: "Where Cluster files each email, the same as the Label column in the CSV.",
        columns: [{ label: "Label" }, { label: "Emails", num: true }, { label: "Share", num: true }],
        rows: f.labels.map(([l, c]) => [l, n(c), pct(c, f.total)]),
      },
      {
        kind: "table",
        title: "What Cluster did",
        note: "From Activity, for the same days. Undone actions are left out.",
        columns: [{ label: "Action" }, { label: "Times", num: true }, { label: "Emails", num: true }],
        rows: didInPeriod(range.start, end.getTime()),
        empty: "Nothing in this period.",
      },
      {
        kind: "table",
        title: "Top senders",
        note: `The ${top.length} senders with the most mail in this period, grouped by company as on the Dashboard.`,
        columns: [{ label: "#", num: true }, { label: "Sender" }, { label: "Address" }, { label: "Emails", num: true }, { label: "Unread", num: true }],
        rows: top.map((t, i) => [String(i + 1), oneLine(t.name), t.address, n(t.count), n(t.unread)]),
      },
      {
        kind: "table",
        title: "Inbox today",
        columns: [{ label: "" }, { label: "Emails", num: true }],
        rows: [
          ...(lastFacts?.inboxUnread !== undefined ? [["Unread in the inbox", n(lastFacts.inboxUnread)]] : []),
          ["Waiting in the Screener", n(lastFacts?.waiting ?? 0)],
          ["Ready to clean up", n(lastFacts?.clearable ?? 0)],
        ],
      },
    ],
    source: REPORT_SOURCE,
  };
}

const isoDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function showAccountPill(token: string) {
  try {
    const email = await getProfileEmail(token);
    if (!email) return;
    const pill = document.getElementById("account-pill");
    const emailEl = document.getElementById("account-email");
    if (!pill || !emailEl) return;
    emailEl.textContent = email;
    accountEmail = email;
    pill.hidden = false;
    // Overview greets by first name, from the name Gmail sends under.
    const name =
      (await listSendAs(token).catch(() => [])).find((i) => i.isPrimary)?.displayName ??
      // Gmail leaves the send-as name blank unless set: read it off the latest sent email.
      (await sentFromName(token).catch(() => undefined));
    // Pill shows the name (email until Gmail gives one); the menu head keeps the email.
    const nameEl = document.getElementById("account-name");
    if (nameEl) nameEl.textContent = name || email;
    pill.title = email;
    // The name they gave Kai beats the one Gmail sends under.
    greetName = ctx.settings.userName || (name ? firstName(name) : "");
    paintGreeting();
  } catch (err) {
    log.error("Could not load the account email", err);
  }
}

async function sentFromName(token: string): Promise<string | undefined> {
  const [last] = await listMessageIds(token, "in:sent", 1);
  if (!last) return undefined;
  const from = (await getMessageMetadata(token, last.id)).headers.From ?? "";
  return parseAddressList(from)[0]?.name.replace(/^"|"$/g, "").trim() || undefined;
}

async function wireAthenaConnection() {
  const config = await getAthenaConfig();
  if (!config) return;
  athenaSectionEl.hidden = false;
  const origins = athenaOriginPatterns(config);
  const granted = await chrome.permissions.contains({ origins });
  athenaStatusEl.textContent = granted
    ? "Connected to your organization's Athena origin."
    : "Permission required.";
  athenaConnectBtn.hidden = granted;
  athenaConnectBtn.onclick = async () => {
    const allowed = await chrome.permissions.request({ origins });
    athenaConnectBtn.hidden = allowed;
    athenaStatusEl.textContent = allowed ? "Connection enabled." : "Connection permission was not granted.";
  };
}

// "system" leaves prefers-color-scheme in charge (no data-theme attribute);
// "light"/"dark" force the palette via :root[data-theme=…] in dashboard.css.
function applyTheme(theme: ClusterSettings["theme"]) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function wireThemeSelect() {
  themeSelect.value = ctx.settings.theme;
  themeSelect.onchange = async () => {
    const theme = themeSelect.value as ClusterSettings["theme"];
    applyTheme(theme);
    ctx.settings = await updateSettings({ theme });
  };
}

let kaiGuide: KaiGuide | null = null;
const KAI_DOCS = CLUSTER_QUESTIONS.map((q) => ({ id: q.id, texts: [q.ask, ...(q.phrases ?? [])] }));
let search: { open(): void } | null = null;

async function main() {
  // DevTools only: saves the mail index for the replay test (replayExport.ts).
  (globalThis as { clusterExportReplay?: () => Promise<number> }).clusterExportReplay = exportReplay;
  kaiGuide = initKaiGuide(document, {
    questions: CLUSTER_QUESTIONS,
    firstOn: CLUSTER_FIRST_ON,
    // globalThis: Kai reads this on a timer that can outlive a test's DOM
    currentScreen: () =>
      globalThis.document?.querySelector<HTMLElement>("#sidebar .nav-item.active")?.dataset.screen ?? "overview",
    match: (text) => {
      const byId = new Map(CLUSTER_QUESTIONS.map((q) => [q.id, q]));
      return matchKai(text, KAI_DOCS, ctx.settings.kaiLearned ?? {}).map((r) => byId.get(r.id)!);
    },
    go: (screen) => void selectScreen(screen),
    picked: (text, id) =>
      void updateSettings({ kaiLearned: learnPick(ctx.settings.kaiLearned ?? {}, text, id) }).then((s) => {
        ctx.settings = s;
      }),
    missed: (text) =>
      void updateSettings({ kaiMissed: rememberMiss(ctx.settings.kaiMissed ?? [], text) }).then((s) => {
        ctx.settings = s;
        renderKaiMissed();
      }),
  });
  // Domain matching needs the Public Suffix List and the brand registry (local files, quick to load).
  // Choices made on another computer (or before a reinstall) come first.
  await pullSyncedSettings().catch((err) => log.error("Settings sync pull failed", err));
  const [settings] = await Promise.all([
    getSettings(),
    loadPublicSuffixList(),
    loadBrandRegistry(),
    initSuggestionModel(),
    initKindModel(),
    initBodyChecks(),
  ]);
  ctx.settings = settings;
  applyBrandVerdicts(settings.brandVerdicts);
  applyTheme(ctx.settings.theme);
  wireSetup(selectScreen);
  wireThemeSelect();
  wireSettingsMore(showScreen, {
    search: () => search?.open(),
    kai: () => kaiGuide?.open(),
  });
  wireNav();
  wireDetails();
  wireAccountMenu();
  search = initAskKai(
    document.getElementById("ask-kai-open")!,
    () => askFacts,
    { details: (filter) => details?.open(filter), go: goAndAct },
  );
  wireProtectPages((key) => details?.open({ view: "emails", senderKey: key }));
  wireLabelPage({
    open: (key) => details?.open({ view: "emails", senderKey: key }),
    rowKeyOf: detailRowKey,
    trash: (merged, picked, slot, reset) => trashFromPage("table", merged, picked, slot, reset),
    archive: archiveFromPage,
  });
  autoQuarantineToggle.checked = ctx.settings.autoQuarantineHighRisk;
  autoQuarantineToggle.onchange = async () => {
    ctx.settings = await updateSettings({ autoQuarantineHighRisk: autoQuarantineToggle.checked });
    renderProtectTiles(...protectTileArgs);
  };
  // Protect's rules: they run with the background hold (background.ts runQuarantine).
  for (const [id, key] of [
    ["rule-auth-fails", "holdAuthFails"],
    ["rule-to-spam", "toSpam"],
    ["rule-strict", "strict"],
  ] as const) {
    const sw = document.getElementById(id) as HTMLInputElement;
    sw.checked = ctx.settings.securityRules[key] === true;
    sw.onchange = async () => {
      ctx.settings = await updateSettings({
        securityRules: { ...ctx.settings.securityRules, [key]: sw.checked },
      });
    };
  }
  wireScanNow();
  scanWindowInput.value = String(ctx.settings.scanWindowDays);
  wireScanSettings();
  await wireAthenaConnection();

  onboardingBanner.hidden = ctx.settings.onboardingDismissed;
  onboardingDismissBtn.onclick = async () => {
    onboardingBanner.hidden = true;
    ctx.settings = await updateSettings({ onboardingDismissed: true });
  };

  const gmailToken = await connectGmail();
  setupSignedIn();
  // Start reading mail into the local index right away, so it's ready (or
  // nearly) by the time setup is done and the first screen renders.
  startIndexSync(gmailProvider, gmailToken);
  resurfaceDueSnoozed(gmailProvider).catch((err) => log.error("Resurfacing snoozed mail failed", err));
  void showAccountPill(gmailToken);

  if (await outlookProvider.isConnected()) {
    activeProviders.push(outlookProvider);
    connectOutlookBtn.hidden = true;
    startIndexSync(outlookProvider);
  }

  connectOutlookBtn.onclick = async () => {
    connectOutlookBtn.disabled = true;
    connectOutlookBtn.textContent = "Connecting…";
    try {
      await outlookProvider.getAuthToken(true);
      activeProviders.push(outlookProvider);
      connectOutlookBtn.hidden = true;
      await scanAndRender();
    } catch (err) {
      connectOutlookBtn.disabled = false;
      connectOutlookBtn.textContent = "Add Outlook";
      log.error(err);
    }
  };

  wireBulkHandlers();
  wireSubscriptionsTab((key) => details?.open({ view: "emails", senderKey: key }));
  wireSortInbox();
  wireTimeLimits();
  setPresetActions(() =>
    [getToZeroCard(), replyReminderCard(), neverOpenedSkipsInboxCard(), keepNewestInInboxCard(), deliveredOrdersCard()].filter(
      (c): c is HTMLElement => c !== null,
    ),
  );
  wireScreenerTab();
  wireOfflineHandling();
  wireRulesTab();
  // Rules render from settings, but the dry-run inside needs a scan; let
  // scanAndRender() below do the render so it isn't done twice on load.
  renderRecentTab();
  maybeShowLabelTidyCard().catch((err) => log.error("label tidy-up card failed", err));
  await scanAndRender({ instant: true });
}

// ── Offline handling ─────────────────────────────────────────────────────
// This tool only ever shows live mail metadata — there's no offline-first
// cache to fall back to, so the only real requirement is not leaving the
// user staring at confusing failed-fetch errors while disconnected.
function wireOfflineHandling() {
  const setActionsDisabled = (disabled: boolean) => {
    connectOutlookBtn.disabled = disabled;
    expiryCleanupBtn.disabled = disabled;
    applyScanSettingsBtn.disabled = disabled;
  };

  window.addEventListener("offline", () => {
    delete statusEl.dataset.loading;
    statusEl.hidden = false;
    statusEl.textContent = "You're offline. Reconnect to continue.";
    setActionsDisabled(true);
  });

  window.addEventListener("online", () => {
    statusEl.hidden = true;
    setActionsDisabled(false);
  });
}

// ── Local mail index ─────────────────────────────────────────────────────
// Mail is read once into the on-device index (mailIndex.ts) and kept current
// from Gmail's change history (mailSync.ts). The first build starts the
// moment Gmail access is granted, so it runs while the person answers the
// setup question; screens render from the index as soon as the newest mail
// is in, and older mail keeps arriving behind them.
interface IndexRun {
  quick: Promise<void>;
  done: Promise<SyncResult | null>;
  error?: unknown;
  progress?: SyncProgress;
  /** When progress last moved, to tell a quota pause from a stall. */
  progressAt?: number;
  settled?: boolean;
  /** Read mail this run, not just checked for changes. */
  didRead?: boolean;
  /** A full build, not a catch-up on changes. */
  built?: boolean;
  /** The newest message in the last batch read, and every sender read, for the first-read stage. */
  latest?: { name: string; address: string; receivedAt: number };
  senders: Set<string>;
}
const indexRuns = new Map<ProviderId, IndexRun>();
const indexStatusEl = document.getElementById("index-status") as HTMLParagraphElement;
const QUICK_READY_COUNT = DEFAULT_QUICK_COUNT;
// No progress for this long while reading means Gmail's rate limit is pacing us.
const QUOTA_PAUSE_MS = 4000;
const CHANGES_WAIT_MS = 4000;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function startIndexSync(provider: EmailProvider, token?: string): IndexRun {
  const existing = indexRuns.get(provider.id);
  if (existing) return existing;
  let resolveQuick: () => void = () => {};
  const run: IndexRun = {
    quick: new Promise<void>((resolve) => (resolveQuick = resolve)),
    done: Promise.resolve(null),
    senders: new Set(),
  };
  run.done = (async () => {
    // The read's own entry in Settings, Diagnostics (runReport.ts).
    const report = await startRun("read");
    try {
      const store = await openMailIndex();
      const authToken = token ?? (await provider.getAuthToken(false));
      // Label inbox mail as it's read, not after the whole read.
      const labeller = provider.id === "gmail" ? await readLabeller().catch(() => null) : null;
      const result = await report.track(
        "index build",
        () => withStorageLock(mailIndexLockKey(provider), () =>
        syncMailIndex(provider, authToken, store, {
          windowDays: ctx.settings.scanWindowDays,
          cap: ctx.settings.readCap,
          quickCount: QUICK_READY_COUNT,
          onQuickReady: resolveQuick,
          onProgress: (progress) => {
            run.progress = progress;
            run.progressAt = Date.now();
            if (progress.phase === "reading" || progress.phase === "sent") run.didRead = true;
            report.beat({ read: progress.done });
            updateIndexStatus();
          },
          waitForHeadroom: provider.id === "gmail" ? waitForGmailHeadroom : undefined,
          onLabelMoves: provider.id === "gmail" ? (moves) => learnFromLabelMoves(authToken, moves) : undefined,
          onSentReady: async () => {
            await updateCorrespondentsFromIndex(provider).catch((err) =>
              log.error("Could not update people you write to", err),
            );
            await labeller?.onSentReady();
          },
          onRead: (rows, tried) => {
            noteRead(run, rows);
            return labeller?.onRead(rows, tried);
          },
          onPlanned: labeller?.onPlanned,
        }),
        ),
        (r) => ({ read: r?.read ?? 0 }),
      );
      await labeller?.flush();
      await updateCorrespondentsFromIndex(provider).catch((err) =>
        log.error("Could not update people you write to", err),
      );
      run.built = result?.mode === "build";
      return result;
    } catch (err) {
      run.error = err;
      log.error(`Mail index sync failed for ${provider.id}`, err);
      return null;
    } finally {
      await report.finish();
      run.settled = true;
      resolveQuick();
      indexRuns.delete(provider.id);
      updateIndexStatus();
      // Only a real read (not a quick check for changes) earns "done".
      if (!run.error && run.didRead && indexRuns.size === 0) showReadDone();
      // Reading done: put the labels it worked out on the mail.
      if (!run.error && run.built && provider.id === "gmail") void startLabelScan();
    }
  })();
  indexRuns.set(provider.id, run);
  updateIndexStatus();
  return run;
}

// ── Scan card (Overview): labelling after a read, then what landed where ──
let scan: ScanState | null = null;
void getScan().then((s) => {
  scan = s;
  paintScanCard();
});
onScanChange((s) => {
  scan = s;
  paintScanCard();
});
// The newest run that did something, for the card's "what went wrong" line.
let lastRun: RunReport | undefined;
const pickLastRun = (all: RunReport[]) => {
  lastRun = [...all].reverse().find((r) => !r.quiet);
  sortRunning = all.some((r) => r.kind === "sweep" && r.status === "running");
  paintScanCard();
  updateIndexStatus();
};
void getRunReports().then(pickLastRun);
onRunReportsChange(pickLastRun);

/** Labels the whole inbox from the mail index; the card follows along. */
async function startLabelScan() {
  if (!ctx.settings.autoSort.timeLimitsEnabled) {
    // Labels off ("Ask me first"): the read is the whole scan.
    if ((await getScan())?.phase === "reading" && (await readFinished())) await setScan({ phase: "done", finishedAt: Date.now() });
    return;
  }
  await setScan({ ...newScan(), phase: "labelling" });
  try {
    await runInboxTimeLimits(Date.now(), { relabel: true });
  } catch (err) {
    log.error("Scan: labelling failed", err);
  }
  // Nothing left to do: don't leave the card spinning. While the read is
  // unfinished it stays open: "done" there claimed every email was sorted.
  if ((await getScan())?.phase !== "done" && (await readFinished())) await setScan({ phase: "done", finishedAt: Date.now() });
}

/** The Gmail read is complete, so a scan card may say done. */
async function readFinished(): Promise<boolean> {
  const state = await openMailIndex().then((index) => index.getState("gmail")).catch(() => undefined);
  return state?.complete === true;
}

function paintScanCard() {
  // Labelling reports in the sidebar card, like Check mail and Sort; the Dashboard stays as it is.
  if (!scan || !ctx.settings || scan.dismissed || scan.phase === "reading") return;
  const note =
    lastRun && lastRun.startedAt >= scan.startedAt && lastRun.status === "stalled" ? describeRun(lastRun) : undefined;
  if (note) {
    jobCard({
      title: "Labelling paused",
      line: note,
      finished: true,
      action: { label: "Label again", run: () => void startLabelScan() },
    });
    return;
  }
  if (scan.phase !== "done") return;
  const labelled = Object.values(scan.byBucket).reduce((n, c) => n + (c ?? 0), 0);
  // Said once, then closed, so opening Cluster later doesn't repeat it.
  void setScan({ dismissed: true });
  if (labelled === 0 || Date.now() - scan.finishedAt > 60_000) return;
  jobCard({
    title: `Labelled ${labelled.toLocaleString()} email${labelled === 1 ? "" : "s"}`,
    line: scan.unsorted > 0 ? `${scan.unsorted.toLocaleString()} have no label` : undefined,
    finished: true,
  });
}

/** Says reading finished, and marks the tab with a dot until you look at it. */
function showReadDone() {
  paintScanCard();
  // A running Check mail or sort keeps the card; the tab dot below still says reading finished.
  if (indexStatusEl.dataset.job !== "run") {
    indexStatusEl.replaceChildren("All your mail is read");
    indexStatusEl.classList.add("done");
    indexStatusEl.hidden = false;
    setTimeout(() => {
      if (indexRuns.size > 0) return;
      indexStatusEl.hidden = true;
      indexStatusEl.classList.remove("done");
    }, 8_000);
  }
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  const title = document.title.replace(/^● /, "");
  document.title = `● ${title}`;
  const clear = () => {
    document.title = title;
    window.removeEventListener("focus", clear);
  };
  window.addEventListener("focus", clear);
}

// Rate sample for the time estimate, reset when the phase changes.
let paceSample: { phase: string; at: number; done: number } | undefined;
// Messages read when the screens were last redrawn from the index.
let viewDone = 0;
const VIEW_REFRESH_EVERY = 500;

/** When the current read began, so a short catch-up never shows the card. */
let readSince = 0;
/** A sort is labelling the inbox; it shares Gmail's per-minute budget, so the read waits between steps. */
let sortRunning = false;

/** Bar pinned to the bottom while mail is still being read. */
/** What the first-read stage shows besides the count: who was just read, and how many senders so far. */
function noteRead(run: IndexRun, rows: readonly { fromAddress: string; fromDisplayName: string; receivedAt: number }[]) {
  for (const row of rows) run.senders.add(row.fromAddress.toLowerCase());
  const newest = rows.reduce<(typeof rows)[number] | undefined>((a, b) => (!a || b.receivedAt > a.receivedAt ? b : a), undefined);
  if (newest) run.latest = { name: newest.fromDisplayName, address: newest.fromAddress, receivedAt: newest.receivedAt };
}

function readSeen() {
  const runs = [...indexRuns.values()];
  const latest = runs.map((r) => r.latest).filter((l) => l !== undefined).at(-1);
  return { latest, senders: runs.reduce((sum, r) => sum + r.senders.size, 0) };
}

function updateIndexStatus() {
  const active = [...indexRuns.values()]
    .map((run) => run.progress)
    .filter((p): p is SyncProgress => p?.phase === "reading" || p?.phase === "sent" || p?.phase === "detail");
  // A running Check mail or sort owns the card until it finishes.
  if (indexStatusEl.dataset.job === "run") return;
  if (active.length === 0) readSince = 0;
  if (active.length === 0 || !statusEl.hidden) {
    // A finished job's card stays for its few seconds.
    if (!indexStatusEl.dataset.job) indexStatusEl.hidden = true;
    return;
  }
  delete indexStatusEl.dataset.job;
  const done = active.reduce((sum, p) => sum + p.done, 0);
  const total = Math.max(
    done,
    active.reduce((sum, p) => sum + p.total, 0),
  );
  // The detail read after the sender count starts again from 0: its own pace, not the count's.
  const phase = active.some((p) => p.phase === "sent") ? "sent" : active.every((p) => p.phase === "detail") ? "detail" : "mail";
  if (paceSample?.phase !== phase || done < paceSample.done) paceSample = { phase, at: Date.now(), done };
  const elapsed = Date.now() - paceSample.at;
  const rate = (done - paceSample.done) / elapsed;
  // No time until 20 s of real pace exists: a guess from the quota share ran low and then
  // went up once the sort shared Gmail's budget, and a rising estimate reads as going backwards.
  // Counting by sender skips ahead in jumps, so its pace says nothing about the time left.
  const counting = active.some((p) => p.counting);
  const minutes = !counting && rate > 0 && elapsed > 20_000 ? Math.ceil((total - done) / rate / 60_000) : 0;
  // Gmail's per-minute pauses are normal pacing, already in the estimate: no
  // "paused" line, which read like an error.
  const eta =
    done < total && minutes > 0
        ? minutes >= 60
          ? `about ${Math.round(minutes / 60)} h left`
          : `about ${minutes} min left`
        : "";
  const parts = [
    // Between steps with no count to show, say what is using the time instead of looking stuck.
    done >= total && sortRunning ? "Putting labels on your inbox" : phase === "sent" ? "Reading your sent mail" : "Reading your mail",
    // Between phases the last one reads "150 of 150", which looks finished.
    done < total ? `${done.toLocaleString()} of ${total.toLocaleString()}` : "",
    eta,
  ].filter(Boolean);
  // Home's first-read card carries the progress there; the bar hides on Home (CSS).
  const homeRead = overviewContentEl.querySelector(".home-read");
  const firstRead = active.some((p) => p.phase !== "detail");
  if (homeRead && firstRead) paintHomeRead(homeRead, done, total, eta, parts[0], readSeen());
  if (homeRead && !firstRead) void refreshView();
  indexStatusEl.classList.toggle("home-shows", !!homeRead && firstRead);
  const fill = document.createElement("div");
  fill.style.width = `${total > 0 ? Math.round((done / total) * 100) : 0}%`;
  const track = document.createElement("div");
  track.className = "scan-track";
  track.appendChild(fill);
  indexStatusEl.classList.remove("done");
  // The card: what's being read and how far, the bar, then "1,240 of 5,000 · about 6 min left".
  const head = document.createElement("div");
  head.className = "rc-head";
  const pct = document.createElement("span");
  pct.textContent = done < total && total > 0 ? `${Math.floor((done / total) * 100)}%` : "";
  head.append(Object.assign(document.createElement("b"), { textContent: parts[0] }), pct);
  const line = parts.slice(1).join(" · ");
  const left = Object.assign(document.createElement("span"), { className: "rc-eta", textContent: line });
  readSince ||= Date.now();
  // Opening Cluster fetches the few emails since last time in a moment; the card is for reads that take a while.
  const longRead = Date.now() - readSince > 5_000 || total - done >= 300;
  if (longRead) {
    // Labelling has no count: the bar moves on its own instead of disappearing.
    if (done >= total && sortRunning) track.classList.add("is-busy");
    indexStatusEl.replaceChildren(head, ...(done < total || sortRunning ? [track] : []), ...(line ? [left] : []));
    indexStatusEl.hidden = false;
  } else if (!indexStatusEl.dataset.job) indexStatusEl.hidden = true;
  // A new phase counts from zero again.
  if (done < viewDone) viewDone = done;
  if (phase === "mail" && done - viewDone >= VIEW_REFRESH_EVERY) void refreshView();
}

let refreshing = false;

/**
 * Redraws every screen from the index without the loading state, keeping the
 * scroll position and any open review section. Waits while a confirm step is
 * open, so nothing you're about to act on changes under you.
 */
async function refreshView() {
  if (refreshing || !statusEl.hidden) return;
  const confirming = Array.from(document.querySelectorAll<HTMLButtonElement>(".btn")).some(
    // A finished confirm leaves its disabled button behind; only a live one waits.
    (b) => b.textContent === "Confirm" && !b.disabled && !b.closest("[hidden]"),
  );
  if (confirming) {
    setTimeout(() => void refreshView(), 5_000);
    return;
  }
  refreshing = true;
  const scroll = window.scrollY;
  try {
    viewDone = [...indexRuns.values()].reduce((sum, run) => sum + (run.progress?.done ?? 0), 0);
    await scanAndRender({ quiet: true });
    window.scrollTo(0, scroll);
  } finally {
    refreshing = false;
  }
}

/** Everyone in the sent store joins the "people you write to" list that
 * protection, the Screener and scam checks read. */
async function updateCorrespondentsFromIndex(provider: EmailProvider) {
  const written = await applyIndexedCorrespondents([provider]);
  if (written) ctx.settings = written;
}

const refreshOnDone = new WeakSet<IndexRun>();

/** Redraws once more when a still-running read finishes. */
function refreshWhenDone(run: IndexRun) {
  // Already finished: this render includes everything it read.
  if (run.settled || refreshOnDone.has(run)) return;
  refreshOnDone.add(run);
  void run.done.then((result) => {
    if (result && syncChangedIndex(result)) void refreshView();
  });
}

/** "Updating…" beside the date range while Gmail's changes arrive, shown only
 * after a second so a quick sync doesn't flicker. */
function showSyncing(pending: IndexRun[]) {
  const el = document.getElementById("overview-sync");
  const open = pending.filter((run) => !run.settled);
  if (!el || open.length === 0) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    el.textContent = "Updating…";
    el.hidden = false;
  }, 1000);
  void Promise.allSettled(open.map((run) => run.done)).then(() => {
    clearTimeout(syncTimer);
    if (el.hidden) return;
    el.textContent = "Updated just now";
    syncTimer = setTimeout(() => (el.hidden = true), 3000);
  });
}
let syncTimer: ReturnType<typeof setTimeout> | undefined;

async function scanAndRender({
  refresh = false,
  quiet = false,
  fresh = false,
  instant = false,
}: { refresh?: boolean; quiet?: boolean; fresh?: boolean; instant?: boolean } = {}) {
  if (!quiet) {
    statusEl.hidden = false;
    indexStatusEl.hidden = true;
    statusEl.textContent = "Getting your mailbox ready…";
    // Still "busy" for the guards that read it, but out of sight: the Dashboard's scan card shows reading.
    statusEl.dataset.loading = "";
  }

  const store = await openMailIndex();
  // "Rescan" no longer throws the index away: the sync below picks up every
  // change, and a new scan window re-lists. Only the old warm cache, still
  // used by the background scans, is dropped.
  if (refresh) await clearMetadataCache();

  const providers = [...activeProviders];
  const builtBefore = await Promise.all(
    providers.map(async (provider) => Boolean((await store.getState(provider.id))?.complete)),
  );
  // A first read shows the reading stage at once, not an empty page until the
  // first batch lands; updateIndexStatus moves it (the status line stays out of sight).
  if (!quiet && builtBefore.some((built) => !built) && !overviewContentEl.querySelector(".home-read")) {
    overviewContentEl.replaceChildren(readingView());
    statusEl.hidden = true;
  }
  const runs = providers.map((provider, i) => {
    const wasRunning = indexRuns.has(provider.id);
    const run = startIndexSync(provider);
    return { provider, run, wasRunning, builtBefore: builtBefore[i] };
  });
  const showProgress = () => {
    const paused = runs.some(
      ({ run }) => run.progressAt !== undefined && Date.now() - run.progressAt > QUOTA_PAUSE_MS,
    );
    if (paused) {
      statusEl.textContent = "Gmail limits how fast apps can read mail. Cluster will continue in a moment…";
      return;
    }
    const reading = runs.map(({ run }) => run.progress).filter((p) => p?.phase === "reading");
    if (reading.length === 0) return;
    const done = reading.reduce((sum, p) => sum + Math.min(p!.done, QUICK_READY_COUNT), 0);
    const total = reading.reduce((sum, p) => sum + Math.min(p!.total, QUICK_READY_COUNT), 0);
    const fill = document.createElement("div");
    fill.style.width = `${total > 0 ? Math.round((done / total) * 100) : 0}%`;
    const track = document.createElement("div");
    track.className = "scan-track";
    track.appendChild(fill);
    statusEl.replaceChildren(
      `Reading your mail · ${done.toLocaleString()} of ${total.toLocaleString()}`,
      track,
    );
  };
  const progressTimer = setInterval(showProgress, 250);
  try {
    await Promise.all(
      runs.map(({ run, wasRunning, builtBefore: built }) =>
        // A built index only needs the changes since last time, which is
        // usually a moment. Wait briefly for them so an action's result shows.
        // Check mail (fresh) waits for all of them, however long Gmail takes.
        // Opening the dashboard (instant) doesn't wait at all: it draws from the
        // index and refreshWhenDone redraws when the changes land (showSyncing).
        built && !wasRunning
          ? fresh
            ? run.done
            : instant
              ? undefined
              : Promise.race([run.done, delay(CHANGES_WAIT_MS)])
          : run.quick,
      ),
    );
  } finally {
    clearInterval(progressTimer);
  }
  if (instant) showSyncing(runs.filter((r) => r.builtBefore && !r.wasRunning).map((r) => r.run));

  try {
    for (const { provider, run, wasRunning } of runs) {
      // A failure before anything was read is the old scan error.
      if (run.error && (await store.ids(provider.id)).size === 0) throw run.error;
      // A build already in progress hasn't replayed the person's own recent
      // actions yet; apply them so trashed mail doesn't reappear.
      if (wasRunning && indexRuns.has(provider.id)) {
        const token = await provider.getAuthToken(false);
        await catchUpIndex(provider, token, store).catch((err) =>
          log.error("Could not catch up the mail index", err),
        );
      }
    }
  } catch (err) {
    showScanError(err);
    return;
  }

  const metas = (await readMailIndex(store, providers)).sort((a, b) => b.receivedAt - a.receivedAt);
  const combined = summarizeCombined(
    metas,
    SECURITY_SCAN_MAX_MESSAGES,
    metas.length >= ctx.settings.readCap * providers.length,
  );
  // Real per-sender totals, counted by search, for senders not fully read yet.
  const censusRows = (await Promise.all(providers.map((p) => store.allCensus(p.id)))).flat();
  applyCensus(combined.cleanup, censusRows);
  applyCensus(combined.security, censusRows);
  applyCensus(combined.all, censusRows);
  const sent = (await Promise.all(providers.map((p) => store.allSent(p.id)))).flat();
  markRepliesToYou([...combined.cleanup, ...combined.security, ...combined.all], metas, sent);
  markLearnedTransactional([...combined.cleanup, ...combined.security, ...combined.all], kindModel());
  ctx.profiles = buildSenderProfiles({
    rows: metas,
    sent,
    census: censusRows,
    ownAddresses: (await Promise.all(providers.map((p) => store.getState(p.id))))
      .map((state) => state?.accountId ?? "")
      .filter(Boolean),
    knownSenders: buildProtectionContext(ctx.settings).knownSenders,
    skipInboxSince: ctx.settings.autoSort.skipInboxSince,
  });
  for (const [key, isPersonCall] of Object.entries(ctx.settings.personOverrides)) {
    const profile = ctx.profiles.get(key);
    if (profile) profile.personOverride = isPersonCall;
  }
  readUnsubscribeReplies(metas);
  for (const { run } of runs) refreshWhenDone(run);
  let senders = combined.cleanup;
  const securitySenders = combined.security;
  const allSenders = combined.all;

  const activeSnoozedIds = new Set(
    Object.entries(ctx.settings.snoozedMessages)
      .filter(([, v]) => v.resurfaceAt > Date.now())
      .map(([id]) => id),
  );
  senders = excludeSnoozedMessages(senders, activeSnoozedIds);

  const firstContact = markFirstContact(
    securitySenders,
    ctx.settings.knownSenders,
    Date.now(),
    ctx.settings.knownSendersInitialized,
  );
  const newlySeenKeys = new Set(
    securitySenders.filter((sender) => sender.firstContact).map((sender) => sender.key),
  );
  for (const sender of senders) sender.firstContact = newlySeenKeys.has(sender.key);
  markNameMatches(securitySenders, knownSenderSet(ctx.settings));
  await applySenderLedger(securitySenders);
  if (!ctx.settings.knownSendersInitialized || firstContact.firstContactCount > 0) {
    ctx.settings = await mutateSettings((current) => ({
      ...current,
      knownSenders: { ...current.knownSenders, ...firstContact.updatedKnownSenders },
      knownSendersInitialized: true,
    }));
  }

  statusEl.hidden = true;

  // Record this week's inbox-health score for the Overview trend chart (once
  // per ISO week; a same-week rescan overwrites it).
  const weeklyScore = inboxHealthScore(senders, ctx.settings.autoSort.skipInboxSince);
  const nextHistory = recordHealthSnapshot(ctx.settings.healthHistory, weeklyScore, Date.now());
  if (
    nextHistory.length !== ctx.settings.healthHistory.length ||
    nextHistory[nextHistory.length - 1]?.score !==
      ctx.settings.healthHistory[ctx.settings.healthHistory.length - 1]?.score
  ) {
    ctx.settings = await updateSettings({ healthHistory: nextHistory });
  }

  lastScanCapHit = combined.capHit;
  // The scan itself succeeded — a throw in one render must not blank the rest
  // (or trip the global "couldn't load your mail"). Each block is isolated.
  updateSenderState(senders);
  safeRender("overview", () => renderOverview(senders, securitySenders, allSenders));
  safeRender("details", () => details?.update(allSenders));
  safeRender("delete", () => renderDeleteScreen(senders));
  safeRender("rules", () => renderRulesTab());
  safeRender("delete", () => renderExpirySection(senders));
  safeRender("impersonation", () => renderSecuritySection(securitySenders));
  safeRender("security charts", () => renderSecurityCharts(securitySenders));
  safeRender("security trend", () => renderSecurityTrend(securitySenders, (key) => details?.open({ view: "emails", senderKey: key })));
  safeRender("subscriptions", () => renderSubscriptionsTab(senders));
  safeRender("delete", () => renderNeverReadSection(senders));
  safeRender("organize", () => renderSortInbox(senders));
  safeRender("organize", () => renderTimeLimits());
  safeRender("organize", () => renderPresets(securitySenders));
  safeRender("label page", () => setLabelSenders(allSenders));
  safeRender("screener", () => renderScreenerTab(senders));
  safeRender("overview", () => updateNavCounts(senders, securitySenders, allSenders));
}

// One render block failing must not take down the others — the scan already
// succeeded. Logs, and drops a one-time notice into the screen it belongs to.
function safeRender(screen: string, fn: () => void) {
  try {
    fn();
  } catch (err) {
    log.error(`render for "${screen}" failed`, err);
    const el = document.querySelector<HTMLElement>(`section.screen[data-screen="${screen}"]`);
    if (el && !el.querySelector(".screen-error")) {
      const note = document.createElement("p");
      note.className = "screen-error empty-state";
      note.textContent = "Part of this screen didn't load. Try Check mail, or reload the page.";
      el.appendChild(note);
    }
  }
}

let askFacts: AskFacts = {
  senders: [],
  kinds: { primary: 0, trans: 0, updates: 0, promo: 0 },
  scams: 0,
  waiting: 0,
};

/** Open a place and, for an Ask Kai hit, the page that does it: its senders ticked, Trash ready. */
function goAndAct(screen: string, act?: HomeAct) {
  void selectScreen(screen).then(() => {
    if (act === "trash-never-opened") showCleanupPage("never");
    if (act === "trash-past-date") showCleanupPage("old");
    if (act === "stop-never-opened") preselectLists(stopListKeys);
  });
}

/** Emails the engine places in the Screener: what Gmail's Screener label holds (Rule 2). */
function inScreener(allSenders: readonly SenderSummary[]): number {
  let n = 0;
  for (const d of decisions(allSenders).values()) if (d.place === "screener") n++;
  return n;
}

function updateNavCounts(
  senders: SenderSummary[],
  securitySenders: SenderSummary[],
  allSenders: SenderSummary[],
) {
  const health = buildInboxHealth({ senders, securitySenders, settings: ctx.settings });
  const byId = new Map(health.metrics.map((m) => [m.id, m.value]));
  // Security's own row count, so the badge, Ask Kai and the tile agree with its list.
  const flaggedHigh = rankFlagged(securitySenders).high;
  const scams = flaggedHigh.length;
  // Rule 2: the Scams tile counts emails; senders are its second line.
  const scamEmails = flaggedHigh.reduce((n, f) => n + f.sender.messages.length, 0);
  setNavCount("delete", clearOutPlan(senders).total, true, "emails to clear out");
  setNavCount("subscriptions", byId.get("unsubscribe-capable") ?? 0, true);
  setNavCount("impersonation", scams);
  setPhishingNavSeverity(securitySenders);
  const people = new Set(
    allSenders.filter((s) => isPerson(ctx.profiles.get(s.key))).map((s) => detailRowKey(s)),
  );
  askFacts = {
    senders: detailSenders(allSenders, decisions(allSenders), detailRowKey),
    people,
    kinds: mailByKind(allSenders, Date.now(), decisions(allSenders)).kinds,
    scams,
    waiting: inScreener(allSenders),
  };
  setNavCount("screener", inScreener(allSenders));
  const held = heldByWeek(ctx.settings.scamHistory, 8).reduce((n, w) => n + w.held, 0);
  renderProtectTiles(scams, inScreener(allSenders), held, scamEmails);
}

// Protect's head line, shared by its three screens.
let protectTileArgs: [scams: number, waiting: number, held: number, scamEmails: number] = [0, 0, 0, 0];
function renderProtectTiles(scams: number, waiting: number, held: number, scamEmails = scams) {
  protectTileArgs = [scams, waiting, held, scamEmails];
  const put = (id: string, v: number, blank = false) => {
    const node = document.getElementById(id);
    if (node) node.textContent = blank && v === 0 ? "" : v.toLocaleString();
  };
  put("kpi-held", held);
  put("kpi-threats", scamEmails);
  const scamFoot = document.getElementById("kpi-threats")?.nextElementSibling;
  if (scamFoot) scamFoot.textContent = `emails from ${scams.toLocaleString()} sender${scams === 1 ? "" : "s"} faking a name`;
  put("kpi-waiting", waiting);
  // No link to an empty list: at 0, Scams and Held lose their arrow and stop scrolling to the table.
  for (const [id, v] of [["kpi-threats", scams], ["kpi-held", held]] as const) {
    const tile = document.getElementById(id)?.closest<HTMLButtonElement>("[data-sec-jump]");
    if (!tile) continue;
    tile.disabled = v === 0;
    const go = tile.querySelector<HTMLElement>(".mt-go");
    if (go) go.hidden = v === 0;
  }
  const sub =
    scams > 0
      ? `${scams} ${scams === 1 ? "sender needs" : "senders need"} a look.`
      : waiting > 0
        ? `${waiting} ${waiting === 1 ? "email" : "emails"} from new senders waiting.`
        : "Nothing looks wrong.";
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-protect-sub]")))
    el.textContent = sub;
  const scan = document.getElementById("sec-kpis");
  if (scan) scan.dataset.state = scams > 0 ? "warn" : "clean";
  const title = document.getElementById("sec-title");
  if (title) title.textContent = scams > 0 ? `${scams.toLocaleString()} ${scams === 1 ? "scam" : "scams"} found` : "Nothing looks wrong";
}

function paintLastScan() {
  const el = document.getElementById("sec-last");
  const last = ctx.settings.lastSecurityScan;
  if (!el || !last) return;
  const when = new Date(last.at);
  const day = when.toDateString() === new Date().toDateString() ? "today" : when.toLocaleDateString();
  el.textContent = `Last scan ${day} at ${when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  document.getElementById("top-rescan")?.setAttribute("title", `Check for new mail. ${el.textContent}`);
}

/** Security's Scan now: reads new mail into the index, then walks each check
 * over it in turn. The background runs the same scan once a day. */
function wireScanNow() {
  const btn = document.getElementById("top-rescan") as HTMLButtonElement | null;
  if (!btn) return;
  const word = btn.querySelector("span");
  paintLastScan();
  btn.onclick = async () => {
    btn.disabled = true;
    btn.classList.add("is-busy");
    if (word) word.textContent = "Checking";
    jobCard({ title: "Checking for new mail" });
    const list = document.getElementById("report-kinds");
    if (list) paintChecks(list, null);
    const last = document.getElementById("sec-last");
    try {
      if (last) last.textContent = "Reading new mail";
      // Waits for Gmail's changes in full, then redraws every screen (refreshView can skip or
      // stop waiting after 4 s, which left Check mail showing the old mail).
      const scroll = window.scrollY;
      await scanAndRender({ quiet: true, fresh: true });
      window.scrollTo(0, scroll);
      const senders = lastOverview?.[1] ?? [];
      const known = engineContext(ctx.settings);
      const counts = scanCheckCounts(senders, known);
      if (list) paintChecks(list, counts);
      ctx.settings = await updateSettings({
        lastSecurityScan: { at: Date.now(), found: scanFound(senders, known) },
      });
      paintLastScan();
      jobCard({ title: "Up to date", line: "Updated just now", finished: true });
    } catch (err) {
      log.error("Rescan failed", err);
      if (last) last.textContent = "Scan failed, try again.";
      jobCard({ title: "Couldn't check for mail", finished: true, action: { label: "Try again", run: () => btn.click() } });
    } finally {
      btn.disabled = false;
      btn.classList.remove("is-busy");
      if (word) word.textContent = "Check mail";
    }
  };
}

// Quiet by default (no badge at zero, per the phishing-UX research this
// screen followed — see research/2026-09-18-phishing-security-ux-separation.md):
// strong "alert" red only when a HIGH-tier finding exists, a milder "accent"
// treatment for ELEVATED/LOW-only findings, so the sidebar doesn't cry wolf.
function setPhishingNavSeverity(securitySenders: SenderSummary[]) {
  const el = document.getElementById("nav-count-impersonation");
  if (!el) return;
  const risk = engineContext(ctx.settings);
  const tiers = securitySenders.map((s) => riskOf(s, risk).tier).filter((t) => t !== "none");
  el.classList.remove("alert", "accent");
  if (tiers.includes("hold")) {
    el.classList.add("alert");
    el.setAttribute("aria-label", `${el.textContent}, high severity`);
  } else if (tiers.length > 0) {
    el.classList.add("accent");
    el.setAttribute("aria-label", `${el.textContent}, needs review`);
  } else {
    el.removeAttribute("aria-label");
  }
}

/** Brands flagged senders pretend to be, most-faked first. */
function fakedBrands(senders: SenderSummary[]): string[] {
  const counts = new Map<string, number>();
  for (const s of senders) {
    const brand = s.threatSignals.find((x) => x.brand)?.brand;
    if (brand) counts.set(brand, (counts.get(brand) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([brand]) => brand);
}

/** Home's Top senders: the five with the most mail in the picked range, one row per company as in Cleanup. */
/** Top senders grouped by company, as Overview and the report both show them. */
function topSendersByCompany(all: readonly SenderSummary[], start: number, end: number, limit = 5) {
  const inRange = (m: { receivedAt: number }) => m.receivedAt >= start && m.receivedAt < end;
  const items = all.map((sender) => ({ sender, ids: sender.messages.filter(inRange).map((m) => m.id) }));
  return pageRows(items, detailRowKey)
    .slice(0, limit)
    .map((r) => ({
      key: r.key,
      address: r.lead.address,
      name: senderName(r.lead),
      count: r.count,
      unread: r.senders.reduce((n, s) => n + s.messages.filter((m) => inRange(m) && m.unread).length, 0),
    }));
}

/** Today's sweep entries: what Cluster filed out of the inbox since midnight. */
function movedTodayEntries() {
  const today = new Date().setHours(0, 0, 0, 0);
  return ctx.settings.actionLog.filter(
    (e) => e.kind === "sort" && !e.undone && e.undo?.via === "unarchive" && e.at >= today,
  );
}

// Never-opened lists Today's line hands to Stop mail's Unsubscribe confirm.
let stopListKeys: string[] = [];

/** Messages read so far in the first read (not the slow detail pass), or undefined. */
function firstReadProgress(): { done: number; total: number } | undefined {
  const runs = [...indexRuns.values()]
    .map((r) => r.progress)
    .filter((p) => p?.phase === "reading" || p?.phase === "sent");
  if (runs.length === 0) return undefined;
  return { done: runs.reduce((n, p) => n + p!.done, 0), total: runs.reduce((n, p) => n + p!.total, 0) };
}

/** The oldest message read so far, or undefined when none is. */
function oldestRead(senders: SenderSummary[]): number | undefined {
  let oldest = Infinity;
  for (const s of senders) for (const m of s.messages) if (m.receivedAt < oldest) oldest = m.receivedAt;
  return Number.isFinite(oldest) ? oldest : undefined;
}

// Gmail's inbox unread count for Home's Inbox tile, read at most every 5 minutes.
let inboxUnread: number | undefined;
let unreadAt = 0;
let lastOverview: Parameters<typeof renderOverview> | null = null;
/** The Dashboard's last numbers, for its report. */
let lastFacts: HomeFacts | null = null;
let staleSweepKicked = false;
async function refreshInboxUnread(): Promise<void> {
  if (Date.now() - unreadAt < 5 * 60 * 1000 || !providerById.has("gmail")) return;
  unreadAt = Date.now();
  try {
    const token = await providerById.get("gmail")!.getAuthToken(false);
    const unread = (await getLabel(token, "INBOX")).messagesUnread;
    if (typeof unread !== "number") return;
    ctx.settings = await updateSettings({
      unreadSnapshots: recordUnread(ctx.settings.unreadSnapshots ?? {}, unread, Date.now()),
    });
    if (unread === inboxUnread) return;
    inboxUnread = unread;
    if (lastOverview) renderOverview(...lastOverview);
  } catch (err) {
    log.error("home: inbox unread failed", err);
  }
}

// ── Overview screen (v3) ────────────────────────────────────────────────
// Home: the total, the kind bar and up to three next steps (homeDashboard.ts).
function renderOverview(
  senders: SenderSummary[],
  securitySenders: SenderSummary[],
  allSenders: SenderSummary[],
) {
  const health = buildInboxHealth({ senders, securitySenders, settings: ctx.settings });
  overviewHeadlineEl.textContent = `Scanned ${health.scannedSenders} sender${
    health.scannedSenders === 1 ? "" : "s"
  } · ${health.scannedMessages} message${health.scannedMessages === 1 ? "" : "s"}`;

  const plan = clearOutPlan(senders);
  const unopened = unopenedSuggestions(currentSuggestions(senders));
  stopListKeys = unopened
    .filter((x) => x.sender.unsubscribe.postUrl && !ctx.settings.unsubscribeRequests[x.sender.key])
    .map((x) => x.sender.key);

  overviewContentEl.innerHTML = "";
  paintGreeting();
  const received = receivedInRange(allSenders, range.end, rangeLength(range));
  // Rule 2: the picked range drives every period number on the page.
  const rangeEndExcl = new Date(range.end).setDate(new Date(range.end).getDate() + 1);
  const period = periodFacts(allSenders, range.start, rangeEndExcl, decisions(allSenders));
  const facts: HomeFacts = {
    account: accountEmail,
    receivedDays: received.days,
    // No change badge until the days before the range are read: a half-read
    // earlier period showed "+196%" on the first visit.
    receivedPrev: (oldestRead(allSenders) ?? Infinity) <= range.start - rangeLength(range) * DAY_MS ? received.prev : undefined,
    rangeEnd: range.end,
    rangeLabel: rangeLabel(range),
    ...mailByKind(allSenders, Date.now(), decisions(allSenders)),
    kinds: period.kinds,
    total: period.total,
    suspicious: rankFlagged(securitySenders).high.length,
    waiting: inScreener(allSenders),
    neverOpened: {
      senders: unopened.length,
      emails: plan.neverReadMsgs,
    },
    pastDate: plan.expiryTotal,
    clearable: plan.total,
    limitsOn: ctx.settings.autoSort.timeLimitsEnabled
      ? Object.entries(ctx.settings.autoSort.inboxHoursByBucket).filter(
          ([b, h]) => h != null && !ctx.settings.autoSort.labelsOff.includes(b),
        ).length
      : 0,
    couldLeaveWeekly: [...weeklyByBucket(senders, Date.now()).values()].reduce((n, c) => n + c, 0),
    fakedBrands: fakedBrands(securitySenders),
    cleared30: clearedByDay(ctx.settings.actionLog, Date.now(), 30).reduce((a, b) => a + b, 0),
    cleared: {
      byDay: clearedByDay(ctx.settings.actionLog, Date.now()),
      total: ctx.settings.clearedTotal ?? 0,
    },
    reading: firstReadProgress(),
    people: ctx.settings.sentCorrespondents.addresses.length,
    inboxUnread,
    unreadByDay: unreadDays(ctx.settings.unreadSnapshots ?? {}, Date.now()),
    unreadWeekAgo: unreadWeekAgo(ctx.settings.unreadSnapshots ?? {}, Date.now()),
    heldThisWeek: heldByWeek(ctx.settings.scamHistory, 1)[0]?.held ?? 0,
    movedToday: movedTodayEntries().reduce((sum, e) => sum + (e.undo?.ids.length ?? 0), 0),
    stopLists: stopListKeys.length,
    filed: filedByDay(ctx.settings.actionLog, Date.now()),
    topSenders: topSendersByCompany(allSenders, range.start, rangeEndExcl),
    sweptAt: ctx.settings.autoSort.timeLimitsEnabled ? ctx.settings.autoSort.lastSweep.at || undefined : undefined,
    // Until reading is done the total covers only recent mail, so say how far back.
    since: [...indexRuns.values()].some((r) => r.progress?.phase === "reading")
      ? oldestRead(allSenders)
      : undefined,
  };
  lastFacts = facts;
  overviewContentEl.appendChild(
    renderHomeDashboard(
      facts,
      goAndAct,
      (kind) => details?.open({ kind, range: { start: range.start, end: rangeEndExcl, label: facts.rangeLabel! } }),
      (key) => details?.open({ view: "emails", senderKey: key, range: { start: range.start, end: rangeEndExcl, label: facts.rangeLabel! } }),
      () => details?.open({ view: "emails", week: WEEKS - 1 }),
    ),
  );
  paintScanCard();
  // The background run is late (Chrome just opened, or it stalled): run it
  // from here, once per page load, instead of only reporting it.
  if (facts.sweptAt && !staleSweepKicked && Date.now() - facts.sweptAt > STALE_SWEEP_MS) {
    staleSweepKicked = true;
    void runInboxTimeLimits().catch((err) => log.error("Overview: late inbox run failed", err));
  }
  lastOverview = [senders, securitySenders, allSenders];
  void refreshInboxUnread();
  if (lastScanCapHit) {
    const footNote = document.createElement("p");
    footNote.className = "text-meta";
    footNote.textContent = `Based on your latest ${ctx.settings.readCap.toLocaleString()} messages per account.`;
    overviewContentEl.appendChild(footNote);
  }
}

function showScanError(err: unknown) {
  log.error(err);
  // Settings-derived tabs don't need scan data — keep them populated even
  // when the scan itself failed.
  renderRulesTab();
  delete statusEl.dataset.loading;
  statusEl.hidden = false;
  statusEl.innerHTML = "";

  // Outlook's refresh token is dead — a plain Retry would just 401 again.
  // Offer an interactive reconnect instead.
  if (err instanceof OutlookReauthRequired) {
    const text = document.createElement("span");
    text.textContent = "Your Outlook sign-in expired. ";
    const reconnectBtn = document.createElement("button");
    reconnectBtn.textContent = "Reconnect Outlook";
    reconnectBtn.onclick = async () => {
      reconnectBtn.disabled = true;
      reconnectBtn.textContent = "Connecting…";
      try {
        await outlookProvider.getAuthToken(true);
        await scanAndRender();
      } catch (reconnectErr) {
        showScanError(reconnectErr);
      }
    };
    statusEl.append(text, reconnectBtn);
    return;
  }

  // A Gmail per-user quota hit (returned as 403) survived the retry layer —
  // the window is per-minute, so a plain "try again shortly" is the fix.
  if (
    err instanceof GmailApiError &&
    err.status === 403 &&
    /rateLimitExceeded|RATE_LIMIT_EXCEEDED/i.test(err.message)
  ) {
    const text = document.createElement("span");
    text.textContent = "Gmail is rate-limiting Cluster. Wait about a minute, then check again. ";
    const retryBtn = document.createElement("button");
    retryBtn.textContent = "Check again";
    retryBtn.onclick = () => scanAndRender();
    statusEl.append(text, retryBtn);
    return;
  }

  const message = err instanceof Error ? err.message : "unknown error";
  const text = document.createElement("span");
  text.textContent = `Couldn't load your mail (${message}). `;
  const retryBtn = document.createElement("button");
  retryBtn.textContent = "Retry";
  retryBtn.onclick = () => scanAndRender();
  statusEl.append(text, retryBtn);
}

// ── Sender table ─────────────────────────────────────────────────────────
/** Clean-up suggestions for these senders, from their profiles. */
function currentSuggestions(senders: SenderSummary[]): Suggestion[] {
  return buildSuggestions(
    senders,
    ctx.profiles,
    ctx.settings.senderEngagement,
    buildProtectionContext(ctx.settings, "you-confirm"),
    undefined,
    suggestionModel(),
  );
}

/** Clean up's cards. Home, the cards and the sidebar badge all show this
 * one total, so they never disagree. */
function clearOutPlan(senders: SenderSummary[]) {
  const protectionCtx = buildProtectionContext(ctx.settings, "you-confirm");
  const cards = buildCleanupCards(
    senders,
    ctx.profiles,
    unopenedSuggestions(currentSuggestions(senders)),
    buildExpiryBuckets(senders, protectionCtx),
    protectionCtx,
  );
  return {
    expiry: cards.old,
    neverRead: cards.never,
    lists: cards.lists,
    expiryTotal: cards.oldCount,
    neverReadMsgs: cards.neverCount,
    total: cards.total,
  };
}

function updateSenderState(senders: SenderSummary[]) {
  ctx.senders = senders;
  pruneSelection(
    selectedSenderKeys,
    senders.map((s) => s.key),
  );
}

// Clean up: a card per kind. Each card's button
// is the existing confirm (mute never-opened, trash past-date), moved in.
function renderDeleteScreen(senders: SenderSummary[]) {
  const plan = clearOutPlan(senders);
  const n = (v: number) => v.toLocaleString();
  document.getElementById("never-opened-fact")!.textContent = n(plan.neverReadMsgs);
  document.getElementById("past-date-fact")!.textContent = n(plan.expiryTotal);
  // Rule 2: every tile counts emails; the list count is the second line.
  const listEmails = plan.lists.reduce((t, s) => t + s.messages.length, 0);
  document.getElementById("lists-fact")!.textContent = n(listEmails);
  const listsNote = document.querySelector<HTMLElement>("#lists-card .cu-num");
  if (listsNote) listsNote.dataset.note = listsNote.textContent = `emails from ${n(plan.lists.length)} list${plan.lists.length === 1 ? "" : "s"}`;
  document.getElementById("cu-total-fact")!.textContent = n(plan.neverReadMsgs + plan.expiryTotal);
  lastPlan = plan;
  paintCleanupChart(cuKpi);
  const tableItems = [
    ...(cuKpi !== "old" ? pageItems("never").map((it) => ({ ...it, reason: whyNever(it.sender) })) : []),
    ...(cuKpi !== "never" ? pageItems("old").map((it) => ({ ...it, reason: "Past its date" })) : []),
  ];
  renderSenderTable(document.getElementById("cu-senders-table")!, {
    id: "senders",
    columns: ["note", "read", "emails", "size", "last"],
    tools: document.getElementById("cu-tools-senders"),
    items: tableItems,
    rowKeyOf: detailRowKey,
    openRow: (key) => details?.open({ view: "emails", senderKey: key }),
    act: (merged, picked, slot, reset) => trashFromPage("table", merged, picked, slot, reset),
    more: [{ verb: `Keep newest ${SAVED_KEEP}`, act: (_merged, picked, slot, reset) => keepNewestFromPage(picked, slot, reset) }],
    allVerb: "Trash all",
    scope: cuKpi
      ? { label: cuKpi === "never" ? "Unopened" : "Expired", clear: () => document.querySelector<HTMLElement>('.cu-card[data-page="all"]')?.click() }
      : undefined,
  });
  if (openPage) showCleanupPage(openPage);
}

/** Saved cleanups (plan 5.5): how many of a sender's newest emails a rule keeps. */
const SAVED_KEEP = 3;

/** Keeps each ticked sender's newest emails and archives the rest, now and as a
 * standing rule. Archive, never trash, so it's always safe to leave running. */
function keepNewestFromPage(picked: SenderSummary[], slot: HTMLElement, reset: () => void): void {
  const senders = picked.filter((s) => providerById.get(s.provider)?.archiveMessages);
  if (senders.length === 0) return;
  const rules = senders.map(
    (s): ClusterRule => ({
      id: crypto.randomUUID(),
      name: `Keep newest ${SAVED_KEEP}: ${s.address}`,
      enabled: true,
      conditions: { fromAddress: s.address, keepNewest: SAVED_KEEP },
      action: "archive",
    }),
  );
  const now = Date.now();
  const merged = new Map<ProviderId, string[]>();
  for (const r of rules) for (const [p, ids] of matchRule(r, senders, now, buildProtectionContext(ctx.settings, "you-confirm"))) merged.set(p, [...(merged.get(p) ?? []), ...ids]);
  const n = [...merged.values()].reduce((sum, ids) => sum + ids.length, 0);
  renderConfirmStep(
    slot,
    reset,
    `Keep the newest ${SAVED_KEEP} from ${senders.length === 1 ? "1 sender" : `${senders.length} senders`} and archive the rest, ${n.toLocaleString()} now and more as they arrive?`,
    false,
    async () => {
      let saved = ctx.settings.rules;
      for (const r of rules) saved = upsertRuleByName(saved, r);
      ctx.settings = await updateSettings({ rules: saved });
      return archiveAndLog(merged, (moved) => `Archived ${moved} older emails, keeping the newest ${SAVED_KEEP} from ${senders.length === 1 ? "1 sender" : `${senders.length} senders`}`);
    },
  );
}

/** The table's reason, short: what this sender's mail shows about you. */
function whyNever(sender: SenderSummary): string {
  const p = ctx.profiles.get(sender.key);
  if (!p) return "Never opened";
  if (!p.stillSending) return "Stopped sending";
  const opened = Math.round((p.openRate ?? 0) * p.judged);
  return opened === 0 ? "Never opened" : `Opened ${opened} of ${p.judged}`;
}

let lastPlan: ReturnType<typeof clearOutPlan> | null = null;
/** The Cleanup KPI picked (Plausible-style): it drives the chart and filters the table. */
let cuKpi: "never" | "old" | null = null;

function cleanupItems(kpi: "never" | "old" | "lists" | null): PageItem[] {
  if (kpi === "lists") return (lastPlan?.lists ?? []).map((sender) => ({ sender, ids: sender.messages.map((m) => m.id) }));
  return kpi ? pageItems(kpi) : [...pageItems("never"), ...pageItems("old")];
}

/** Days the Cleanup chart covers, picked in its header. */
let cuDays = 28;

function paintCleanupChart(kpi: "never" | "old" | "lists" | null) {
  const now = Date.now();
  for (const card of Array.from(document.querySelectorAll<HTMLElement>(".cu-card[data-page]"))) {
    const page = card.dataset.page as "never" | "old" | "lists" | "all";
    card.classList.toggle("selected", page === kpi || (page === "all" && kpi === null));
    if (page === "all") continue;
    // This 4 weeks against the 4 before, from the same mail the tile counts.
    const days = dailyCounts(cleanupItems(page), now, 56);
    const sum = (a: number[]) => a.reduce((n, v) => n + v, 0);
    const chip = changeChip(sum(days.slice(28)), sum(days.slice(0, 28)));
    const foot = card.querySelector<HTMLElement>(".cu-num")!;
    foot.replaceChildren(...(chip ? [chip, "from 4 weeks before"] : [foot.dataset.note ?? ""]));
  }
  const kinds = cleanupKinds();
  // The Dashboard's Received Mails card, stacked by kind: title and tools, numbers
  // left, chart right, the kinds as dots underneath.
  const pickDays = document.createElement("select");
  pickDays.className = "chart-tool";
  pickDays.setAttribute("aria-label", "Days shown");
  for (const d of [14, 28, 90]) pickDays.add(new Option(`${d} days`, String(d), false, d === cuDays));
  pickDays.onchange = () => {
    cuDays = Number(pickDays.value);
    paintCleanupChart(kpi);
  };
  const dl = document.getElementById("cu-dl-wrap") ?? cleanupDownload();
  const series = kinds.map((k) => ({ key: k.key, label: k.label, color: k.color, counts: dailyCounts(k.items, now, cuDays) }));
  const chart = dayChart(series, now, { active: kpi });
  const pick = (key: string) => document.querySelector<HTMLElement>(`.cu-card[data-page="${key}"]`)?.click();
  const totals = series.map((x) => x.counts.reduce((a, b) => a + b, 0));
  const total = totals.reduce((a, b) => a + b, 0);
  const most = series[totals.indexOf(Math.max(...totals))];
  const head = document.createElement("div");
  head.className = "mr-head";
  const title = document.createElement("h2");
  title.className = "mr-title";
  title.textContent = "Arrived";
  const tools = document.createElement("div");
  tools.className = "chart-tools";
  tools.append(pickDays, dl);
  head.append(title, tools);
  const body = document.createElement("div");
  body.className = "mr-body";
  body.append(
    chartStats([
      [`Last ${cuDays} days`, total.toLocaleString()],
      ["Per day", Math.round(total / cuDays).toLocaleString()],
      ...(total ? [["Most", most.label] as [string, string]] : []),
    ]),
    chart,
  );
  document.getElementById("cu-chart")?.replaceChildren(head, body, chartLegend(series, chart, { active: kpi, onPick: pick }));
}

/** Cleanup's Download: the page as a report, or every email it lists as a CSV. */
function cleanupDownload(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "dl-wrap";
  wrap.id = "cu-dl-wrap";
  wrap.innerHTML = `<button type="button" class="chart-tool" aria-haspopup="menu" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 10l5 5 5-5M5 21h14"></path></svg>Download</button>
    <div class="dl-menu" role="menu" hidden><button type="button" role="menuitem" data-dl="pdf">Report<span>PDF</span></button><button type="button" role="menuitem" data-dl="xlsx">Emails to clean up<span>Excel</span></button><button type="button" role="menuitem" data-dl="csv">Emails to clean up<span>CSV</span></button></div>`;
  const rows = () =>
    emailRows(
      cleanupKinds().flatMap((k) => k.items.map((it) => ({ sender: it.sender, ids: new Set(it.ids), reason: k.reason }))),
      0,
      Infinity,
      decisions(ctx.senders),
    );
  const name = `cluster-cleanup-${isoDay(Date.now())}`;
  wireDownloadMenu(wrap.querySelector("button")!, wrap.querySelector(".dl-menu")!, {
    pdf: () => printReport(reportHtml(cleanupReportSpec(), brandSvg())),
    xlsx: () => downloadBytes(`${name}.xlsx`, emailsXlsx(rows(), "Cleanup"), XLSX_TYPE),
    csv: () => downloadBytes(`${name}.csv`, emailsCsv(rows()), "text/csv;charset=utf-8"),
  });
  return wrap;
}

/** Cleanup's three kinds, each email once (in the first kind that holds it). */
function cleanupKinds() {
  const seen = new Set<string>();
  const only = (items: PageItem[]) => items.map((it) => ({ ...it, ids: it.ids.filter((id) => !seen.has(id) && seen.add(id)) })).filter((it) => it.ids.length);
  return [
    { key: "never", label: "Unopened", reason: "Unopened", color: "#e5452b", items: only(cleanupItems("never")) },
    { key: "old", label: "Expired", reason: "Expired", color: "#f2853a", items: only(cleanupItems("old")) },
    { key: "lists", label: "Mailing lists", reason: "Unused mailing list", color: "#f7c948", items: only(cleanupItems("lists")) },
  ];
}

function cleanupReportSpec(): ReportSpec {
  const now = Date.now();
  const kinds = cleanupKinds();
  const n = (v: number) => v.toLocaleString();
  const count = (items: PageItem[]) => items.reduce((t, it) => t + it.ids.length, 0);
  const days = 28;
  const first = new Date(now).setHours(0, 0, 0, 0) - (days - 1) * 86_400_000;
  const rows = kinds
    .filter((k) => k.key !== "lists")
    .flatMap((k) => k.items.map((it) => ({ name: senderName(it.sender), address: it.sender.address, reason: k.reason, count: it.ids.length })))
    .sort((a, b) => b.count - a.count);
  const lists = kinds[2].items.map((it) => ({ name: senderName(it.sender), address: it.sender.address, count: it.ids.length })).sort((a, b) => b.count - a.count);
  return {
    title: "Cleanup report",
    period: `As of ${new Date(now).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`,
    account: accountEmail,
    sections: [
      {
        kind: "kpis",
        items: [
          { label: "Ready to clean up", value: n((lastPlan?.neverReadMsgs ?? 0) + (lastPlan?.expiryTotal ?? 0)), note: "Unopened and expired emails" },
          { label: "Unopened", value: n(lastPlan?.neverReadMsgs ?? 0), note: "From senders you never open" },
          { label: "Expired", value: n(lastPlan?.expiryTotal ?? 0), note: "Old codes, deliveries and news" },
          { label: "Unused mailing lists", value: n(lastPlan?.lists.length ?? 0), note: `${n(count(kinds[2].items))} emails` },
        ],
      },
      {
        kind: "chart",
        title: `Arrivals each day, last ${days} days`,
        legend: kinds.map((k) => ({ label: k.label, color: k.color })),
        svg: barsSvg(kinds.map((k) => ({ color: k.color, counts: dailyCounts(k.items, now, days) })), first),
      },
      {
        kind: "table",
        title: "Senders to clean up",
        note: rows.length > 30 ? `The 30 largest of ${n(rows.length)}. The Excel download lists every email.` : undefined,
        columns: [{ label: "Sender" }, { label: "Address" }, { label: "Reason" }, { label: "Emails", num: true }],
        rows: rows.slice(0, 30).map((r) => [r.name, r.address, r.reason, n(r.count)]),
        empty: "Nothing to clean up.",
      },
      {
        kind: "table",
        title: "Unused mailing lists",
        columns: [{ label: "List" }, { label: "Address" }, { label: "Emails", num: true }],
        rows: lists.slice(0, 30).map((r) => [r.name, r.address, n(r.count)]),
        empty: "No unused lists.",
      },
    ],
    source: REPORT_SOURCE,
  };
}
let openPage: "never" | "old" | null = null;

/** The items a card's page lists: each sender with the ids that card holds. */
function pageItems(page: "never" | "old"): PageItem[] {
  if (!lastPlan) return [];
  if (page === "never") return lastPlan.neverRead.map((s) => ({ sender: s.sender, ids: s.safeMessageIds }));
  const wanted = new Set(lastPlan.expiry.flatMap((b) => [...b.messageIdsByProvider.values()].flat()));
  return ctx.senders
    .map((sender) => ({ sender, ids: sender.messages.map((m) => m.id).filter((id) => wanted.has(id)) }))
    .filter((item) => item.ids.length > 0);
}

function showCleanupPage(page: "never" | "old" | null) {
  openPage = page;
  const root = document.getElementById("cu-page")!;
  const screen = document.querySelector<HTMLElement>('section[data-screen="delete"]')!;
  root.hidden = page === null;
  screen.classList.toggle("cu-paged", page !== null);
  if (page === null) {
    root.replaceChildren();
    return;
  }
  renderCleanupPage(root, {
    title: page === "never" ? "You never open these" : "Old codes and news",
    items: pageItems(page),
    rowKeyOf: detailRowKey,
    openRow: (key) => details?.open({ view: "emails", senderKey: key }),
    trash: (merged, senders, slot, reset) => trashFromPage(page, merged, senders, slot, reset),
    back: () => showCleanupPage(null),
  });
}

/** A KPI picks what the chart and table show; Subscriptions opens its tab. */
function wireCleanupCards() {
  for (const card of Array.from(document.querySelectorAll<HTMLElement>(".cu-card[data-page]"))) {
    card.classList.add("row-link");
    card.addEventListener("click", () => {
      const page = card.dataset.page;
      // The tile counts unused lists, so it opens the tab filtered to them.
      if (page === "lists") {
        setTableFilter("lists", "Unused");
        renderSubscriptionsTab(ctx.senders);
        return void selectScreen("subscriptions");
      }
      cuKpi = page === "all" || cuKpi === page ? null : (page as "never" | "old");
      if (document.querySelector('section[data-screen="subscriptions"]:not([hidden])')) void selectScreen("delete");
      renderDeleteScreen(ctx.senders);
    });
  }
}

function trashFromPage(
  page: "never" | "old" | "table",
  merged: Map<ProviderId, string[]>,
  senders: SenderSummary[],
  slot: HTMLElement,
  reset: () => void,
) {
  const total = [...merged.values()].reduce((n, ids) => n + ids.length, 0);
  renderConfirmStep(slot, reset, `Move ${total.toLocaleString()} to Trash?`, true, async () => {
    const { message, undoableGmailIds } = await executeSmartDelete(merged);
    appendUndoButton(slot, undoableGmailIds);
    if (page !== "old") await saveEngagementFeedback(senders.map((s) => s.key), "accept");
    await logAction(
      "trash",
      `Moved ${total} to Trash from ${page === "never" ? "Unopened" : page === "old" ? "Expired" : "Cleanup"}`,
      undoableGmailIds.length > 0 ? { provider: "gmail", ids: undoableGmailIds, via: "untrash" } : undefined,
    );
    await scanAndRender();
    // The table redraws over the confirm slot, so the result and Undo live in the sidebar card too.
    const undo = async () => {
      jobCard({ title: "Restoring" });
      try {
        await gmailProvider.untrashMessages?.(await gmailProvider.getAuthToken(false), undoableGmailIds);
        await scanAndRender({ quiet: true, fresh: true });
        jobCard({ title: "Restored", finished: true });
      } catch (err) {
        log.error(err);
        jobCard({ title: "Undo failed", finished: true, action: { label: "Try again", run: () => void undo() } });
      }
    };
    jobCard({
      title: message.replace(" ✓", ""),
      finished: true,
      action: undoableGmailIds.length > 0 ? { label: "Undo", run: () => void undo() } : undefined,
    });
    return message;
  });
}

/** Archive from a table's selection bar: ask, move them out of the inbox, log with Undo. */
function archiveFromPage(merged: Map<ProviderId, string[]>, _senders: SenderSummary[], slot: HTMLElement, reset: () => void) {
  const total = [...merged.values()].reduce((n, ids) => n + ids.length, 0);
  renderConfirmStep(slot, reset, `Move ${total.toLocaleString()} out of the inbox?`, false, async () => {
    const message = await archiveAndLog(merged, (moved) => `Moved out ${moved} from a label`);
    await scanAndRender();
    return message;
  });
}

/** Mute one sender: the provider's filter, the settings record and the log. */
async function muteOneSender(sender: SenderSummary) {
  const provider = providerById.get(sender.provider);
  if (!provider?.muteSender) return false;
  const token = await provider.getAuthToken(false);
  await provider.muteSender(token, sender.address, idsSafeToMoveOut(sender));
  ctx.settings = await mutateSettings((current) => ({
    ...current,
    mutedSenders: [...new Set([...current.mutedSenders, sender.address])],
    senderEngagement: recordEngagementFeedback(current.senderEngagement, [sender.key], "accept"),
  }));
  void learnFromFeedback([sender.key], "accept");
  await logAction("mute", `Muted ${sender.address}`, {
    provider: sender.provider,
    ids: sender.messageIds,
    via: "unmute",
    fromAddress: sender.address,
    senderKeys: [sender.key],
  });
  return true;
}

// ── Details panel ─────────────────────────────────────────────────────────
// The panel filters and selects; acting goes through the same confirm, live
// protection re-check, Undo and activity log as Clear out.
let details: DetailsPanel | null = null;

/** One row per company in Details and Clean up, the same fold Senders uses. */
const detailRowKey = (s: SenderSummary) => groupKeyFor(ctx.profiles.get(s.key)) ?? s.key;

function wireDetails() {
  const root = document.getElementById("details");
  if (!root) return;
  details = initDetailsPanel(
    root,
    {
      trash(messages, slot, reset, settle) {
        const merged = idsByProvider(messages);
        const total = [...merged.values()].reduce((n, ids) => n + ids.length, 0);
        const skip = messages.length - total;
        const plural = (n: number) => `${n} email${n === 1 ? "" : "s"}`;
        const summaryText = `Move ${plural(total)} to Trash?${skip > 0 ? ` ${skip} protected stay.` : ""}`;
        renderConfirmStep(slot, reset, summaryText, true, async () => {
          const { message, undoableGmailIds } = await executeSmartDelete(merged);
          // Protected mail skipped by the live re-check simply reappears on the next scan.
          settle.gone([...merged.values()].flat());
          appendUndoButton(slot, undoableGmailIds);
          if (undoableGmailIds.length > 0)
            slot.lastElementChild?.addEventListener("click", () => settle.back(undoableGmailIds));
          await logAction(
            "trash",
            `Moved ${plural(total)} to Trash from Details`,
            undoableGmailIds.length > 0
              ? { provider: "gmail", ids: undoableGmailIds, via: "untrash" }
              : undefined,
          );
          void refreshView();
          return message;
        });
      },
      archive: [...providerById.values()].some((p) => p.archiveMessages)
        ? (messages, slot, reset, settle) => {
            const merged = idsByProvider(messages);
            runNow(slot, async () => {
              const archived = await archiveDurably(merged);
              let done = 0;
              for (const ids of archived.values()) {
                settle.gone(ids);
                done += ids.length;
              }
              const gmailIds = archived.get("gmail") ?? [];
              await logAction(
                "archive",
                `Archived ${done} from Details`,
                gmailIds.length > 0 ? { provider: "gmail", ids: gmailIds, via: "unarchive" } : undefined,
              );
              void refreshView();
              return `Archived ${done} ✓`;
            });
          }
        : undefined,
      labels: ctx.settings.autoSort.timeLimitsEnabled
        ? ALL_SORT_BUCKETS.filter((b) => !ctx.settings.autoSort.labelsOff.includes(b)).map((bucket) => ({
            bucket,
            name: showLabel(categoryLabelName(bucket, ctx.settings.labelChoices)),
          }))
        : undefined,
      why: (s, m, d) => {
        if (d?.place === "screener") {
          // A label too often wrong for you sends its mail here (unsureLabels).
          const guess = effectiveBucket(m.kind, domainOf(s.address), s.address, ctx.settings.sortOverrides, m.promotion, m);
          return guess && engineContext(ctx.settings).unsure?.has(guess) ? `Not sure. Looked like ${bucketLabelName(guess)}` : undefined;
        }
        return d?.place && d.place !== "spam"
          ? labelReason(d.place, m.kind, domainOf(s.address), s.address, ctx.settings.sortOverrides, m.promotion, m)
          : undefined;
      },
      label: (messages, bucket, always, slot) =>
        runNow(slot, async () => {
          const gmail = messages.filter((m) => m.provider === "gmail");
          const addresses = new Set(gmail.map((m) => m.address.toLowerCase()));
          const ids = new Set(gmail.map((m) => m.id));
          const senders = (lastOverview?.[2] ?? ctx.senders).filter((s) => s.provider === "gmail" && addresses.has(s.address.toLowerCase()));
          // One kind ticked (Amazon's receipts): the correction is for that
          // kind only, so the sender's ads keep their own label.
          const kindOf = new Map(senders.flatMap((s) => s.messages.map((m) => [m.id, m.kind] as const)));
          const scopeFor = (address: string) => {
            const kinds = new Set(gmail.filter((m) => m.address.toLowerCase() === address).map((m) => kindOf.get(m.id)));
            const [only] = kinds;
            return kinds.size === 1 && only && SCOPED_KINDS.includes(only) ? only : undefined;
          };
          // "Always" fixes the senders' older mail too, not just what's ticked.
          if (always) {
            for (const s of senders) {
              const scope = scopeFor(s.address.toLowerCase());
              for (const m of s.messages) if (!scope || m.kind === scope) ids.add(m.id);
            }
          }
          const token = await gmailProvider.getAuthToken(false);
          const name = categoryLabelName(bucket, ctx.settings.labelChoices);
          const others = new Set(ALL_SORT_BUCKETS.filter((b) => b !== bucket).map((b) => categoryLabelName(b, ctx.settings.labelChoices)));
          const remove = (await listLabels(token)).filter((l) => others.has(l.name)).map((l) => l.id);
          await batchModify(token, [...ids], [await getOrCreateLabel(token, name)], remove);
          if (always) {
            ctx.settings = await mutateSettings((cur) => ({
              ...cur,
              sortOverrides: {
                ...cur.sortOverrides,
                ...Object.fromEntries(
                  [...addresses].map((a) => {
                    const scope = scopeFor(a);
                    return [scope ? kindKey(correctionKey(a), scope) : correctionKey(a), bucket];
                  }),
                ),
              },
            }));
            // Rewrites the Gmail filters so new mail from them lands there too.
            void runInboxTimeLimits().catch((err) => log.error("Label as: filter update failed", err));
          }
          const short = showLabel(name);
          await logAction("sort", `Labelled ${ids.size} as ${short} from Details`);
          void refreshView();
          return `Labelled ${ids.size} as ${short} ✓`;
        }),
      pin: [...providerById.values()].some((p) => p.pinMessages)
        ? async (messages, slot) => {
            let done = 0;
            for (const [pid, ids] of idsByProvider(messages)) {
              const provider = providerById.get(pid);
              if (!provider?.pinMessages || ids.length === 0) continue;
              await provider.pinMessages(await provider.getAuthToken(false), ids);
              done += ids.length;
            }
            slot.replaceChildren(`Pinned ${done}. Rules leave them alone.`);
            await logAction("pin", `Pinned ${done} from Details`);
            void refreshView();
          }
        : undefined,
      mute: [...providerById.values()].some((p) => p.muteSender)
        ? (senders, slot, reset, settle) => {
            const can = senders.filter((s) => providerById.get(s.provider)?.muteSender);
            const n = can.length;
            renderConfirmStep(
              slot,
              reset,
              `Hide all mail from ${n} sender${n === 1 ? "" : "s"}, now and in future?`,
              false,
              async () => {
                let done = 0;
                for (const sender of can) {
                  if (!(await muteOneSender(sender))) continue;
                  done += 1;
                  settle.gone(idsSafeToMoveOut(sender));
                }
                void refreshView();
                return `Muted ${done} ✓`;
              },
            );
          }
        : undefined,
    },
    decisions,
    undefined,
    detailRowKey,
  );
  fitDetailsTo(ctx.settings.setupDone ? resolveScreen(ctx.settings.activeTab) : "setup");
  // Kai sits left of Details (CSS --details-w), open or minimized to its strip.
  const pane = document.getElementById("details");
  if (pane && typeof ResizeObserver !== "undefined")
    new ResizeObserver(([e]) => {
      const w = Math.round(e.borderBoxSize?.[0]?.inlineSize ?? 0);
      document.documentElement.style.setProperty("--details-w", `${w}px`);
      // Open Details leaves Kai no free corner, so Kai steps out until it closes.
      document.documentElement.classList.toggle("details-open", w > 80);
    }).observe(pane);
  for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-details]"))) {
    btn.onclick = () => (details!.isOpen() ? details!.close() : details!.open());
  }
}

async function saveEngagementFeedback(senderKeys: string[], feedback: EngagementFeedback) {
  if (senderKeys.length === 0) return;
  void learnFromFeedback(senderKeys, feedback);
  ctx.settings = await mutateSettings((current) => ({
    ...current,
    senderEngagement: recordEngagementFeedback(current.senderEngagement, senderKeys, feedback),
  }));
}

// ── Ready-to-clean-up (retention expiry) section ────────────────────────
function renderExpirySection(senders: SenderSummary[]) {
  // The card's own buckets: mail already counted under "never open" is left out.
  currentExpiryBuckets = lastPlan?.expiry ?? clearOutPlan(senders).expiry;
  const total = totalExpiryCount(currentExpiryBuckets);
  if (total === 0) return;
  resetExpiryCleanupSlot();
}

function resetExpiryCleanupSlot() {
  expiryCleanupSlot.innerHTML = "";
  expiryCleanupBtn.textContent = "Trash";
  expiryCleanupSlot.appendChild(expiryCleanupBtn);
}

function wireScanSettings() {
  // Settings' Rescan row runs the account menu's Rescan.
  applyScanSettingsBtn.onclick = async () => {
    const scanWindowDays = Math.min(
      ALL_MAIL_DAYS,
      Math.max(1, Number(scanWindowInput.value) || ctx.settings.scanWindowDays),
    );
    scanWindowInput.value = String(scanWindowDays);

    applyScanSettingsBtn.disabled = true;
    applyScanSettingsBtn.textContent = "Reading…";
    try {
      ctx.settings = await updateSettings({ scanWindowDays });
      // A new window re-lists the index; known mail isn't read again.
      await scanAndRender({ refresh: true });
    } finally {
      applyScanSettingsBtn.disabled = false;
      applyScanSettingsBtn.textContent = "Read again";
    }
  };
}

interface SmartDeleteResult {
  message: string;
  // Gmail ids that were moved to Trash (never permanently deleted) — the
  // only ones undo can act on.
  undoableGmailIds: string[];
}

function skippedNote(skipped: number): string {
  return skipped > 0 ? ` (skipped ${skipped} you starred since the scan)` : "";
}

// Always Trash: every bulk delete stays undoable (Gmail empties Trash after 30 days).
async function executeSmartDelete(merged: Map<ProviderId, string[]>): Promise<SmartDeleteResult> {
  const { skipped, trashed, failed } = await executeBulkDeleteDomains(merged, providerById);
  // Drop them from the index now, so every count shows the change at once instead of after Gmail's change feed.
  const store = await openMailIndex();
  for (const [provider, ids] of trashed) await store.remove(provider, ids);
  const moved = [...trashed.values()].reduce((n, ids) => n + ids.length, 0);
  return {
    message: `Moved ${moved} to Trash ✓${skippedNote(skipped)}${failed > 0 ? `, ${failed} couldn't be moved` : ""}`,
    undoableGmailIds: trashed.get("gmail") ?? [],
  };
}

// sortInbox.ts and the extracted tab modules trigger a rescan through this
// bridge; logAction lives in recentTab.ts (with the log view and undo).
setBridge({ rescan: scanAndRender, logAction });

// ── Local engagement suggestions (Clean up tab) ──────────────────────────
function resetNeverReadSlots() {
  neverReadTrashSlot.innerHTML = "";
  neverReadTrashSlot.appendChild(neverReadTrashBtn);
}

function renderNeverReadSection(senders: SenderSummary[]) {
  engagementSuggestions = lastPlan?.neverRead ?? unopenedSuggestions(currentSuggestions(senders));
  neverReadTrashSlot.hidden = engagementSuggestions.length === 0;
  if (engagementSuggestions.length === 0) return;

  resetNeverReadSlots();
  neverReadTrashBtn.disabled = !engagementSuggestions.some(
    ({ sender, safeMessageIds }) => sender.provider === "gmail" && safeMessageIds.length > 0,
  );
}

// ── Clean up: one-time action cards beside the time-limit presets ──────
// What the last one did, shown on its card after the rescan redraws it.
const presetNotes = new Map<string, string>();
const KEEP_IN_INBOX = 3;

function presetActionCard(
  id: string,
  name: string,
  fact: string,
  verb: string,
  run: () => Promise<string>,
): HTMLElement {
  const card = document.createElement("div");
  card.className = "rec-card";
  card.dataset.preset = id;
  const title = document.createElement("div");
  title.className = "rec-name";
  title.textContent = name;
  const note = document.createElement("div");
  note.className = "rec-fact";
  note.textContent = presetNotes.get(id) ?? fact;
  const slot = document.createElement("span");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-sm";
  btn.textContent = verb;
  const reset = () => slot.replaceChildren(btn);
  btn.onclick = () =>
    runNow(slot, async () => {
      const done = await run();
      presetNotes.set(id, done);
      return done;
    });
  reset();
  card.append(title, note, slot);
  return card;
}

/** Archives as a saved job per provider (plan 5.1): a closed tab is finished by
 * the background, which then writes the Undo. Returns what actually moved. */
async function archiveDurably(merged: Map<ProviderId, string[]>): Promise<Map<ProviderId, string[]>> {
  const out = new Map<ProviderId, string[]>();
  for (const [pid, ids] of merged) {
    if (!providerById.get(pid)?.archiveMessages || ids.length === 0) continue;
    const job = await createDurableJob({ provider: pid, operation: "archive", targetIds: ids });
    out.set(pid, (await runDurableJob(job.id, providerById)).succeededIds);
  }
  return out;
}

/** Archives each provider's ids, logs one undoable entry, rescans. */
async function archiveAndLog(merged: Map<ProviderId, string[]>, summary: (moved: number) => string): Promise<string> {
  const archived = await archiveDurably(merged);
  const moved = [...archived.values()].reduce((n, ids) => n + ids.length, 0);
  const gmailIds = archived.get("gmail") ?? [];
  await logAction("archive", summary(moved), gmailIds.length > 0 ? { provider: "gmail", ids: gmailIds, via: "unarchive" } : undefined);
  void scanAndRender();
  return `Moved ${moved.toLocaleString()} out. Undo from Activity.`;
}

/** Shipping updates for orders that say delivered (orderEvents.ts): archive. */
function deliveredOrdersCard(): HTMLElement | null {
  const merged = deliveredUpdates(ctx.senders, buildProtectionContext(ctx.settings, "you-confirm"));
  const total = [...merged.values()].reduce((n, ids) => n + ids.length, 0);
  if (total === 0 && !presetNotes.has("delivered")) return null;
  return presetActionCard(
    "delivered",
    "Delivered orders",
    `${total.toLocaleString()} shipping ${total === 1 ? "update" : "updates"} done`,
    "Move out",
    () => archiveAndLog(merged, (moved) => `Moved out ${moved} shipping updates for delivered orders`),
  );
}

/** Keep each sender's newest few in the inbox and move the rest out (archive,
 * never Trash). shortcut: runs once when pressed, not on every check; make it
 * a standing rule in the sweep if people want it kept up. */
function keepNewestInInboxCard(): HTMLElement | null {
  const merged = keepNewestExcess(ctx.senders, KEEP_IN_INBOX, buildProtectionContext(ctx.settings, "you-confirm"));
  const total = [...merged.values()].reduce((n, ids) => n + ids.length, 0);
  if (total === 0 && !presetNotes.has("keep-newest")) return null;
  return presetActionCard(
    "keep-newest",
    `Newest ${KEEP_IN_INBOX} per sender`,
    `${total.toLocaleString()} older ${total === 1 ? "email moves" : "emails move"} out`,
    "Move out",
    () => archiveAndLog(merged, (moved) => `Kept each sender's newest ${KEEP_IN_INBOX} in the inbox: moved out ${moved}`),
  );
}

/** Superhuman's "Get me to zero": read mail older than a month leaves the
 * inbox; unread and starred mail stays. shortcut: fixed at 30 days, add a
 * picker if people ask for another cutoff. */
const ZERO_DAYS = 30;
function getToZeroCard(): HTMLElement | null {
  const merged = olderReadExcess(ctx.senders, ZERO_DAYS, Date.now(), buildProtectionContext(ctx.settings, "you-confirm"));
  const total = [...merged.values()].reduce((n, ids) => n + ids.length, 0);
  if (total === 0 && !presetNotes.has("zero")) return null;
  return presetActionCard(
    "zero",
    "Get to zero",
    `${total.toLocaleString()} read ${total === 1 ? "email" : "emails"} older than a month`,
    "Move out",
    () => archiveAndLog(merged, (moved) => `Moved out ${moved} read emails older than a month`),
  );
}

/** Senders you never open: their mail, old and new, goes to Read later
 * instead of the inbox (Keep sorted, one Gmail filter each). Undo per sender
 * from Activity removes the filter and puts the mail back. */
function neverOpenedSkipsInboxCard(): HTMLElement | null {
  const label = clusterLabelName("readLater");
  const senders = unopenedSuggestions(currentSuggestions(ctx.senders))
    .map((s) => s.sender)
    .filter((s) => providerById.get(s.provider)?.keepSorted);
  if (senders.length === 0 && !presetNotes.has("never-opened")) return null;
  return presetActionCard(
    "never-opened",
    "Never opened",
    `Skip the inbox · ${senders.length} ${senders.length === 1 ? "sender" : "senders"}`,
    "Move out",
    async () => {
      let done = 0;
      for (const sender of senders) {
        const provider = providerById.get(sender.provider)!;
        const ids = idsSafeToMoveOut(sender);
        try {
          await provider.keepSorted!(await provider.getAuthToken(false), sender.address, label, ids);
          await logAction("keepSorted", `Sent ${sender.address} to "${label}"`, {
            provider: sender.provider,
            ids,
            via: "unsort",
            labelName: label,
            wasFiledOut: true,
            fromAddress: sender.address,
          });
          done += 1;
        } catch (err) {
          log.error("Could not keep sorted", sender.address, err);
        }
      }
      void scanAndRender();
      return `${done} of ${senders.length} now skip the inbox. Undo from Activity.`;
    },
  );
}

/** A standing switch: sent mail nobody answered comes back to the inbox. */
function replyReminderCard(): HTMLElement {
  const cfg = ctx.settings.replyReminders;
  const card = document.createElement("div");
  card.className = "rec-card";
  card.dataset.preset = "no-reply";
  const name = document.createElement("div");
  name.className = "rec-name";
  name.textContent = `No reply in ${cfg.days} days`;
  const fact = document.createElement("div");
  fact.className = "rec-fact";
  fact.textContent = presetNotes.get("no-reply") ?? (cfg.enabled ? "On" : "Bring it back to your inbox");
  const sw = presetSwitch(name.textContent, cfg.enabled, async () => {
    ctx.settings = await updateSettings({ replyReminders: { ...cfg, enabled: !cfg.enabled } });
    presetNotes.delete("no-reply");
    if (!cfg.enabled) {
      try {
        const n = await runReplyReminders(await gmailProvider.getAuthToken(false));
        presetNotes.set("no-reply", n > 0 ? `On. ${n} brought back now.` : "On. Nothing waiting now.");
        if (n > 0)
          await logAction("snooze", `Brought back ${n} sent ${n === 1 ? "email" : "emails"} with no reply`);
      } catch (err) {
        log.error("Reply reminders failed", err);
        presetNotes.set("no-reply", "On. Couldn't check Gmail just now.");
      }
    }
    renderPresets();
  });
  card.append(name, fact, sw);
  return card;
}

// ── Bulk action bars ─────────────────────────────────────────────────────
function wireBulkHandlers() {
  expiryCleanupBtn.onclick = () => {
    const merged = mergeExpiryBuckets(currentExpiryBuckets);
    const total = totalExpiryCount(currentExpiryBuckets);
    const summaryText = `Move ${total} to Trash?`;

    renderConfirmStep(expiryCleanupSlot, resetExpiryCleanupSlot, summaryText, true, async () => {
      const { message, undoableGmailIds } = await executeSmartDelete(merged);
      clearCountBadge().catch(() => {});
      appendUndoButton(expiryCleanupSlot, undoableGmailIds);
      await logAction(
        "trash",
        `Cleaned up ${total} expired message${total === 1 ? "" : "s"}`,
        undoableGmailIds.length > 0
          ? { provider: "gmail", ids: undoableGmailIds, via: "untrash" }
          : undefined,
      );
      return message;
    });
  };

  // ── Local engagement suggestions: trash all ──
  neverReadTrashBtn.onclick = () => {
    const targets = engagementSuggestions.filter(({ sender }) => sender.provider === "gmail");
    const ids = targets.flatMap(({ safeMessageIds }) => safeMessageIds);
    if (ids.length === 0) return;
    renderConfirmStep(
      neverReadTrashSlot,
      resetNeverReadSlots,
      `Move ${ids.length} safe message${ids.length === 1 ? "" : "s"} from ${targets.length} suggested sender${targets.length === 1 ? "" : "s"} to Trash? Starred and flagged mail is excluded.`,
      true,
      async () => {
        const { safe } = await filterOutProtected(new Map([["gmail", ids]]), providerById);
        const targetIds = safe.get("gmail") ?? [];
        if (targetIds.length === 0) return "Nothing to trash. They were all starred after the scan";
        const job = await createDurableJob({ provider: "gmail", operation: "trash", targetIds });
        const result = await runDurableJob(job.id, providerById);
        const succeededIds = new Set(result.succeededIds);
        const acceptedKeys = targets
          .filter(({ safeMessageIds }) => safeMessageIds.some((id) => succeededIds.has(id)))
          .map(({ sender }) => sender.key);
        await saveEngagementFeedback(acceptedKeys, "accept");
        await logAction(
          "trash",
          `Trashed ${result.succeededIds.length} message${result.succeededIds.length === 1 ? "" : "s"} from personalized suggestions`,
          result.succeededIds.length > 0
            ? { provider: "gmail", ids: result.succeededIds, via: "untrash", senderKeys: acceptedKeys }
            : undefined,
        );
        await scanAndRender();
        return result.failures.length > 0
          ? `Moved ${result.succeededIds.length}; failed ${result.failures.length}`
          : `Moved ${result.succeededIds.length} to Trash`;
      },
    );
  };

  // ── "Suggested spam": select-all + trash selected ──
}

main().catch((err) => {
  log.error(err);
  const message =
    err instanceof Error
      ? err.message
      : typeof (err as { message?: unknown })?.message === "string"
        ? (err as { message: string }).message
        : "unknown error";
  delete statusEl.dataset.loading;
  statusEl.hidden = false;
  statusEl.innerHTML = "";
  const text = document.createElement("span");
  text.textContent = `Something went wrong (${message}). `;
  const reloadBtn = document.createElement("button");
  reloadBtn.textContent = "Reload";
  reloadBtn.onclick = () => location.reload();
  statusEl.append(text, reloadBtn);
});
