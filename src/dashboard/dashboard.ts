import {
  executeBulkDeleteDomains,
  executeBulkKeepSorted,
  executeBulkSnooze,
  executeBulkUnsubscribe,
  filterOutProtected,
  mergeDeletableIdsByProvider,
  partitionForKeepSorted,
  partitionForSnooze,
  partitionForUnsubscribe,
  safeDomainGroupKeys,
  safeSenderKeys,
  totalDeletableAcrossGroups,
} from "../lib/bulkActions";
import { buildDigestInput, checkDigestAvailability, generateDigest } from "../lib/aiDigest";
import { aiVerdictAllowed, checkMessageKindAiAvailability, classifyOtherSubjects } from "../lib/aiMessageKind";
import { DOMAIN_CATEGORY_LABELS, type DomainCategory } from "../lib/domainCategories";
import { loadPublicSuffixList } from "../lib/publicSuffix";
import { applySenderLedger } from "../lib/senderLedgerStore";
import { buildDomainGroups, type DomainGroup } from "../lib/domainGrouping";
import {
  buildExpiryBuckets,
  mergeExpiryBuckets,
  totalExpiryCount,
  type ExpiryBucket,
} from "../lib/expiryTriage";
import { buildProtectionContext, idsSafeToMoveOut } from "../lib/protectionPolicy";
import { markRepliesToYou } from "../lib/correspondents";
import { getElevatedAuthToken, getProfileEmail, GmailApiError } from "../lib/gmailApi";
import { clearMetadataCache } from "../lib/metadataCache";
import { MAIL_INDEX_CAP, openMailIndex } from "../lib/mailIndex";
import {
  catchUpIndex,
  DEFAULT_QUICK_COUNT,
  readMailIndex,
  syncChangedIndex,
  syncMailIndex,
  type SyncProgress,
  type SyncResult,
} from "../lib/mailSync";
import { GMAIL_QUOTA_BUDGET, gmailBuildPaceDelay } from "../lib/gmailQuotaLedger";
import { applyIndexedCorrespondents, mailIndexLockKey } from "../lib/indexTriage";
import { withStorageLock } from "../lib/storageLock";
import type { EmailProvider, ProviderId } from "../lib/providers/emailProvider";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { outlookProvider } from "../lib/providers/outlookProvider";
import { OutlookReauthRequired } from "../lib/providers/msalAuth";
import { summarizeCombined, type SenderSummary } from "../lib/senderModel";
import { applyCensus, senderUnread, senderVolume } from "../lib/census";
import { buildSenderProfiles } from "../lib/senderProfile";
import {
  companyName,
  foldByCompany,
  type CompanyGroup,
  groupByCompany,
  isPerson,
  profileLine,
  sortSenders,
  type SenderSortId,
} from "../lib/senderListView";
import {
  getSettings,
  mutateSettings,
  updateSettings,
  type ClusterSettings,
} from "../lib/settingsStore";
import { activeProviders, ctx, providerById, setBridge } from "./state";
import { maybeShowSeedCard, renderSortInbox, wireSortInbox } from "./sortInbox";
import { maybeShowLabelTidyCard } from "./labelTidy";
import { renderTimeLimits, wireTimeLimits } from "./timeLimitsTab";
import { excludeSnoozedMessages } from "../lib/snoozeFilter";
import { resurfaceDueSnoozed } from "../lib/snoozeResurface";
import { ensureOriginsPermission, fireOneClickUnsubscribe } from "../lib/unsubscribe";
import { athenaOriginPatterns, getAthenaConfig } from "../lib/athenaIntegration";
import { recordEngagementFeedback, type EngagementFeedback } from "../lib/engagementModel";
import { openUnsubscribeSheet } from "./unsubscribeSheet";
import { readUnsubscribeReplies, unsubscribeOutcomeFor } from "./unsubscribeRecord";
import { buildSuggestions, SUGGESTION_ACTION_LABELS, unopenedSuggestions, type Suggestion } from "../lib/suggestions";
import { markFirstContact } from "../lib/firstContact";
import { log } from "../lib/log";
import { initSuggestionModel, learnFromFeedback, suggestionModel } from "./suggestionLearning";
import { answerKind, initKindModel, kindModel } from "./kindLearning";
import { markLearnedTransactional, sendersToAsk } from "../lib/kindModel";
import { isAuthCancelled } from "../lib/chromeError";
import {
  formatRelativeTime,
  groupByCategory,
  headerRow,
  pruneSelection,
  renderConfirmStep,
  type CategoryGroup,
} from "./ui";
import { reasonLabel, suggestSpamSenders, type SpamSuggestion } from "../lib/spamSuggestions";
import { riskTier, senderRiskScore } from "../lib/threatSignals";
import { spamListSize } from "../lib/spamList";
import {
  SMART_VIEWS,
  evaluateSmartView,
  evaluateSmartViewForTrash,
  smartViewMessageCount,
  smartViewSenderCount,
  type SmartView,
} from "../lib/smartViews";
import { keepNewestExcess } from "../lib/keepNewest";
import { appendUndoButton, logAction, renderRecentTab } from "./recentTab";
import { renderRulesTab, wireRulesTab } from "./rulesTab";
import { initBodyChecks, renderSecuritySection } from "./securityTab";
import { renderScamReport } from "./reportTab";
import { applySimpleMode, renderSettingsSetup, renderSimpleHome, screenForMode, wireSetup } from "./setupTab";
import { renderScreenerTab, wireScreenerTab } from "./screenerTab";
import {
  recordUnsubscribeRequests,
  renderSubscriptionsTab,
  wireSubscriptionsTab,
} from "./subscriptionsTab";
import { buildInboxHealth, inboxHealthScore, recordHealthSnapshot } from "../lib/inboxHealth";
import { senderTile, type TileSize } from "./senderTile";
import { wireAccountMenu, wireHeaderSearch } from "./accountMenu";
import { mailByKind, renderHomeDashboard, type HomeFacts } from "./homeDashboard";
import { idsByProvider, initDetailsPanel, type DetailsPanel } from "./detailsPanel";
import { listGroup, listRow } from "./listRow";
import { neverReadSenders } from "../lib/neverRead";
import { createDurableJob, runDurableJob } from "../lib/durableJobs";
import { CLUSTER_FIRST_ON, CLUSTER_QUESTIONS, initKaiGuide } from "./kaiGuide";

const selectedSenderKeys = new Set<string>();
const selectedDomainKeys = new Set<string>();
let currentDomainGroups: DomainGroup[] = [];
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
const senderGroupsEl = document.getElementById("sender-groups") as HTMLDivElement;
const domainSectionEl = document.getElementById("domain-groups") as HTMLElement;
const domainGroupListEl = document.getElementById("domain-group-list") as HTMLDivElement;
const connectOutlookBtn = document.getElementById("connect-outlook") as HTMLButtonElement;

const senderBulkBar = document.getElementById("sender-bulk-bar") as HTMLDivElement;
const senderSelectedCountEl = document.getElementById("sender-selected-count") as HTMLSpanElement;
const selectSafeSendersBtn = document.getElementById("select-safe-senders") as HTMLButtonElement;
const unsubscribeBulkSlot = document.getElementById("unsubscribe-bulk-slot") as HTMLSpanElement;
const bulkUnsubscribeBtn = document.getElementById("bulk-unsubscribe-btn") as HTMLButtonElement;
const keepSortedBulkSlot = document.getElementById("keep-sorted-bulk-slot") as HTMLSpanElement;
const bulkKeepSortedBtn = document.getElementById("bulk-keep-sorted-btn") as HTMLButtonElement;
const snoozeDurationSelect = document.getElementById("snooze-duration-select") as HTMLSelectElement;
const snoozeBulkSlot = document.getElementById("snooze-bulk-slot") as HTMLSpanElement;
const bulkSnoozeBtn = document.getElementById("bulk-snooze-btn") as HTMLButtonElement;

const domainBulkBar = document.getElementById("domain-bulk-bar") as HTMLDivElement;
const domainSelectedCountEl = document.getElementById("domain-selected-count") as HTMLSpanElement;
const selectSafeDomainsBtn = document.getElementById("select-safe-domains") as HTMLButtonElement;
const deleteDomainsBulkSlot = document.getElementById("delete-domains-bulk-slot") as HTMLSpanElement;
const bulkDeleteDomainsBtn = document.getElementById("bulk-delete-domains-btn") as HTMLButtonElement;


const expirySectionEl = document.getElementById("expiry-section") as HTMLElement;
const expiryBreakdownEl = document.getElementById("expiry-breakdown") as HTMLSpanElement;
const expiryCleanupSlot = document.getElementById("expiry-cleanup-slot") as HTMLSpanElement;
const expiryCleanupBtn = document.getElementById("expiry-cleanup-btn") as HTMLButtonElement;

const fastDeleteToggle = document.getElementById("fast-delete-toggle") as HTMLInputElement;
const themeSelect = document.getElementById("theme-select") as HTMLSelectElement;
const autoQuarantineToggle = document.getElementById("auto-quarantine-toggle") as HTMLInputElement;

const scanWindowInput = document.getElementById("scan-window-input") as HTMLInputElement;
const applyScanSettingsBtn = document.getElementById("apply-scan-settings-btn") as HTMLButtonElement;

const onboardingBanner = document.getElementById("onboarding-banner") as HTMLDivElement;
const onboardingDismissBtn = document.getElementById("onboarding-dismiss-btn") as HTMLButtonElement;

const digestSectionEl = document.getElementById("digest-section") as HTMLElement;
const generateDigestBtn = document.getElementById("generate-digest-btn") as HTMLButtonElement;
const digestStatusEl = document.getElementById("digest-status") as HTMLSpanElement;
const digestTextEl = document.getElementById("digest-text") as HTMLParagraphElement;
const aiKindSectionEl = document.getElementById("ai-kind-section") as HTMLElement;
const classifyOtherBtn = document.getElementById("classify-other-btn") as HTMLButtonElement;
const aiKindStatusEl = document.getElementById("ai-kind-status") as HTMLSpanElement;
const athenaSectionEl = document.getElementById("athena-section") as HTMLElement;
const athenaConnectBtn = document.getElementById("athena-connect-btn") as HTMLButtonElement;
const athenaStatusEl = document.getElementById("athena-status") as HTMLSpanElement;

const navButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("#sidebar button[data-screen]"),
);
const screenPanels = Array.from(document.querySelectorAll<HTMLElement>("section.screen[data-screen]"));
const seeAllSendersLink = document.getElementById("see-all-senders-link") as HTMLAnchorElement | null;
const allSendersListEl = document.getElementById("all-senders-list") as HTMLDivElement | null;

// Old stored activeTab values → the new screen ids they map to.
const SCREEN_ALIASES: Record<string, string> = {
  cleanup: "delete",
  suggested: "delete",
  security: "impersonation",
};
function resolveScreen(name: string): string {
  const target = screenForMode(SCREEN_ALIASES[name] ?? name);
  // Setup, Activity and Settings have no sidebar item; any screen with a panel is fine.
  return screenPanels.some((p) => p.dataset.screen === target) ? target : screenForMode("overview");
}



const neverReadSectionEl = document.getElementById("never-read-section") as HTMLElement;
const neverReadCountEl = document.getElementById("never-read-count") as HTMLSpanElement;
const neverReadMuteSlot = document.getElementById("never-read-mute-slot") as HTMLSpanElement;
const neverReadMuteBtn = document.getElementById("never-read-mute-btn") as HTMLButtonElement;
const neverReadTrashSlot = document.getElementById("never-read-trash-slot") as HTMLSpanElement;
const neverReadTrashBtn = document.getElementById("never-read-trash-btn") as HTMLButtonElement;
const neverReadListEl = document.getElementById("never-read-list") as HTMLDivElement;

const spamSectionEl = document.getElementById("spam-section") as HTMLElement;
const spamCountEl = document.getElementById("spam-count") as HTMLSpanElement;
const spamSelectAllEl = document.getElementById("spam-select-all") as HTMLInputElement;
const spamTrashSlot = document.getElementById("spam-trash-slot") as HTMLSpanElement;
const spamTrashBtn = document.getElementById("spam-trash-btn") as HTMLButtonElement;
const spamListEl = document.getElementById("spam-list") as HTMLDivElement;


const smartViewChipsEl = document.getElementById("smart-view-chips") as HTMLSpanElement;
const smartViewResultSlot = document.getElementById("smart-view-result-slot") as HTMLDivElement;
const keepNewestNInput = document.getElementById("keep-newest-n") as HTMLInputElement;
const keepNewestSlot = document.getElementById("keep-newest-slot") as HTMLSpanElement;
const keepNewestBtn = document.getElementById("keep-newest-btn") as HTMLButtonElement;


// ── Sidebar navigation (WAI-ARIA tabs pattern, vertical) ────────────────
function showScreen(name: string) {
  const target = resolveScreen(name);
  for (const panel of screenPanels) {
    const active = panel.dataset.screen === target;
    panel.hidden = !active;
    panel.tabIndex = active ? 0 : -1;
  }
  for (const btn of navButtons) {
    const active = btn.dataset.screen === target;
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
}

/** "Clean up › Stop mail" above a sub-page: its place, then its own name. */
function renderCrumbs(btn: HTMLButtonElement | undefined) {
  const crumbs = document.getElementById("crumbs");
  if (!crumbs) return;
  // The item's own text nodes only, so a count badge is left out.
  const label = (b: HTMLButtonElement | null | undefined) =>
    b ? Array.from(b.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join("").trim() : "";
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

async function selectScreen(name: string) {
  const target = resolveScreen(name);
  showScreen(target);
  ctx.settings = await updateSettings({ activeTab: target });
}

function wireNav() {
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
    // Simple mode hides most items; arrow keys skip what isn't shown.
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

  seeAllSendersLink?.addEventListener("click", (event) => {
    event.preventDefault();
    details?.open({ view: "senders" });
  });

  showScreen(ctx.settings.activeTab);
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

function showConnectGate(): Promise<string> {
  const gate = document.getElementById("connect-gate") as HTMLElement;
  const btn = document.getElementById("connect-gmail-btn") as HTMLButtonElement;
  const errorEl = document.getElementById("connect-error") as HTMLElement;
  const titleEl = document.getElementById("connect-title") as HTMLElement;

  // Anyone with a recorded health score has completed a scan before, so a
  // missing token means the sign-in expired rather than a first run.
  if (ctx.settings.healthHistory.length > 0) {
    titleEl.textContent = "Reconnect Gmail";
    const lead = document.getElementById("connect-lead") as HTMLElement;
    lead.textContent =
      "Your Google sign-in expired. Reconnect to continue. Your settings are kept.";
  }
  void showPinTip();

  document.body.dataset.state = "connect";
  gate.hidden = false;
  btn.focus();

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
        btn.textContent = "Connect Gmail";
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

async function showAccountPill(token: string) {
  try {
    const email = await getProfileEmail(token);
    if (!email) return;
    const pill = document.getElementById("account-pill");
    const emailEl = document.getElementById("account-email");
    const avatarEl = document.getElementById("account-avatar");
    if (!pill || !emailEl || !avatarEl) return;
    emailEl.textContent = email;
    avatarEl.textContent = email.slice(0, 2).toUpperCase();
    pill.hidden = false;
  } catch (err) {
    log.error("Could not load the account email", err);
  }
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

async function main() {
  // Kai in the corner, from the first screen (even before Gmail is connected).
  initKaiGuide(document, {
    questions: CLUSTER_QUESTIONS,
    firstOn: CLUSTER_FIRST_ON,
    currentScreen: () => document.querySelector<HTMLElement>("#sidebar .nav-item.active")?.dataset.screen ?? "overview",
  });
  statusEl.textContent = "Connecting…";
  // Domain matching needs the Public Suffix List (a local file, quick to load).
  const [settings] = await Promise.all([
    getSettings(),
    loadPublicSuffixList(),
    initSuggestionModel(),
    initKindModel(),
    initBodyChecks(),
  ]);
  ctx.settings = settings;
  applyTheme(ctx.settings.theme);
  applySimpleMode(ctx.settings.simpleMode);
  wireSetup(selectScreen);
  renderSettingsSetup();
  wireThemeSelect();
  wireNav();
  wireDetails();
  wireAccountMenu();
  wireHeaderSearch(() => void selectScreen("senders"));
  wireAllSendersControls();
  fastDeleteToggle.checked = ctx.settings.fastPermanentDeleteEnabled;
  wireFastDeleteToggle();
  autoQuarantineToggle.checked = ctx.settings.autoQuarantineHighRisk;
  autoQuarantineToggle.onchange = async () => {
    ctx.settings = await updateSettings({ autoQuarantineHighRisk: autoQuarantineToggle.checked });
  };
  scanWindowInput.value = String(ctx.settings.scanWindowDays);
  wireScanSettings();
  await wireAthenaConnection();

  onboardingBanner.hidden = ctx.settings.onboardingDismissed;
  onboardingDismissBtn.onclick = async () => {
    onboardingBanner.hidden = true;
    ctx.settings = await updateSettings({ onboardingDismissed: true });
  };

  const gmailToken = await connectGmail();
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
      connectOutlookBtn.textContent = "Connect Outlook";
      log.error(err);
    }
  };

  wireBulkHandlers();
  wireSubscriptionsTab();
  wireKeepNewest();
  wireSortInbox();
  wireTimeLimits();
  wireScreenerTab();
  wireOfflineHandling();
  wireRulesTab();
  // Rules render from settings, but the dry-run inside needs a scan; let
  // scanAndRender() below do the render so it isn't done twice on load.
  renderRecentTab();
  await wireDigest();
  await wireAiMessageKind();
  maybeShowSeedCard().catch((err) => log.error("seed-from-existing card failed", err));
  maybeShowLabelTidyCard().catch((err) => log.error("label tidy-up card failed", err));
  await scanAndRender();
}

// ── Offline handling ─────────────────────────────────────────────────────
// This tool only ever shows live mail metadata — there's no offline-first
// cache to fall back to, so the only real requirement is not leaving the
// user staring at confusing failed-fetch errors while disconnected.
function wireOfflineHandling() {
  const setActionsDisabled = (disabled: boolean) => {
    connectOutlookBtn.disabled = disabled;
    selectSafeSendersBtn.disabled = disabled;
    selectSafeDomainsBtn.disabled = disabled;
    bulkUnsubscribeBtn.disabled = disabled;
    bulkKeepSortedBtn.disabled = disabled;
    bulkSnoozeBtn.disabled = disabled;
    bulkDeleteDomainsBtn.disabled = disabled;
    expiryCleanupBtn.disabled = disabled;
    fastDeleteToggle.disabled = disabled;
    applyScanSettingsBtn.disabled = disabled;
  };

  window.addEventListener("offline", () => {
    statusEl.hidden = false;
    statusEl.textContent = "You're offline. Reconnect to continue.";
    setActionsDisabled(true);
  });

  window.addEventListener("online", () => {
    statusEl.hidden = true;
    setActionsDisabled(false);
    updateSenderBulkBar();
    updateDomainBulkBar();
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
}
const indexRuns = new Map<ProviderId, IndexRun>();
const indexStatusEl = document.getElementById("index-status") as HTMLParagraphElement;
const QUICK_READY_COUNT = DEFAULT_QUICK_COUNT;
// No progress for this long while reading means Gmail's rate limit is pacing us.
const QUOTA_PAUSE_MS = 4000;
const CHANGES_WAIT_MS = 4000;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Leave room in Gmail's per-minute quota for the person's own clicks.
const BUILD_HEADROOM_UNITS = 1500;

// Spend the build's share evenly: one batch (25 reads at 20 units) at least
// every 7.5 s, slower after a burst, so progress keeps ticking instead of
// bursting and then stalling each minute.
const BUILD_PACE = {
  share: GMAIL_QUOTA_BUDGET - BUILD_HEADROOM_UNITS,
  batchUnits: 25 * 20,
  minGapMs: 7_500,
};
/** When the paced build's next batch is due, for the status line. */
let buildResumesAt = 0;

async function waitForGmailHeadroom() {
  for (;;) {
    const wait = await gmailBuildPaceDelay(BUILD_PACE);
    if (wait <= 0) break;
    buildResumesAt = Date.now() + wait;
    updateIndexStatus();
    await delay(Math.min(wait, 1000));
  }
  buildResumesAt = 0;
}

function startIndexSync(provider: EmailProvider, token?: string): IndexRun {
  const existing = indexRuns.get(provider.id);
  if (existing) return existing;
  let resolveQuick: () => void = () => {};
  const run: IndexRun = {
    quick: new Promise<void>((resolve) => (resolveQuick = resolve)),
    done: Promise.resolve(null),
  };
  run.done = (async () => {
    try {
      const store = await openMailIndex();
      const authToken = token ?? (await provider.getAuthToken(false));
      const result = await withStorageLock(mailIndexLockKey(provider), () =>
        syncMailIndex(provider, authToken, store, {
          windowDays: ctx.settings.scanWindowDays,
          cap: MAIL_INDEX_CAP,
          quickCount: QUICK_READY_COUNT,
          onQuickReady: resolveQuick,
          onProgress: (progress) => {
            run.progress = progress;
            run.progressAt = Date.now();
            updateIndexStatus();
          },
          waitForHeadroom: provider.id === "gmail" ? waitForGmailHeadroom : undefined,
          onSentReady: () => updateCorrespondentsFromIndex(provider).catch((err) =>
            log.error("Could not update people you write to", err),
          ),
        }),
      );
      await updateCorrespondentsFromIndex(provider).catch((err) =>
        log.error("Could not update people you write to", err),
      );
      return result;
    } catch (err) {
      run.error = err;
      log.error(`Mail index sync failed for ${provider.id}`, err);
      return null;
    } finally {
      run.settled = true;
      resolveQuick();
      indexRuns.delete(provider.id);
      updateIndexStatus();
    }
  })();
  indexRuns.set(provider.id, run);
  updateIndexStatus();
  return run;
}

// Rate sample for the time estimate, reset when the phase changes.
let paceSample: { phase: string; at: number; done: number } | undefined;
// Messages read when the screens were last redrawn from the index.
let viewDone = 0;
const VIEW_REFRESH_EVERY = 500;

/** Bar pinned to the bottom while mail is still being read. */
function updateIndexStatus() {
  const active = [...indexRuns.values()]
    .map((run) => run.progress)
    .filter(
      (p): p is SyncProgress => p?.phase === "reading" || p?.phase === "sent" || p?.phase === "detail",
    );
  if (active.length === 0 || !statusEl.hidden) {
    indexStatusEl.hidden = true;
    return;
  }
  const done = active.reduce((sum, p) => sum + p.done, 0);
  const total = Math.max(done, active.reduce((sum, p) => sum + p.total, 0));
  const phase = active.some((p) => p.phase === "sent") ? "sent" : "mail";
  if (paceSample?.phase !== phase || done < paceSample.done) paceSample = { phase, at: Date.now(), done };
  const elapsed = Date.now() - paceSample.at;
  const rate = (done - paceSample.done) / elapsed;
  const minutes = rate > 0 && elapsed > 20_000 ? Math.ceil((total - done) / rate / 60_000) : 0;
  // Waits past the usual gap are Gmail's per-minute limit; say when reading resumes.
  const resumeIn = Math.ceil((buildResumesAt - Date.now()) / 1000);
  const parts = [
    phase === "sent" ? "Reading your sent mail" : "Reading your mail",
    // Between phases the last one reads "150 of 150", which looks finished.
    done < total ? `${done.toLocaleString()} of ${total.toLocaleString()}` : "",
    resumeIn * 1000 > BUILD_PACE.minGapMs + 2_000
      ? `paused for Gmail's speed limit, back in ${resumeIn} s`
      : minutes > 0
        ? `about ${minutes} min left`
        : "",
  ].filter(Boolean);
  const fill = document.createElement("div");
  fill.style.width = `${total > 0 ? Math.round((done / total) * 100) : 0}%`;
  const track = document.createElement("div");
  track.className = "scan-track";
  track.appendChild(fill);
  indexStatusEl.replaceChildren(parts.join(" · "), ...(done < total ? [track] : []));
  indexStatusEl.hidden = false;
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
  const reviews = [neverReadSectionEl, spamSectionEl, expirySectionEl].map((el) => el.hidden);
  const scroll = window.scrollY;
  try {
    viewDone = [...indexRuns.values()].reduce((sum, run) => sum + (run.progress?.done ?? 0), 0);
    await scanAndRender({ quiet: true });
    [neverReadSectionEl, spamSectionEl, expirySectionEl].forEach((el, i) => (el.hidden = reviews[i]));
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

async function scanAndRender({ refresh = false, quiet = false }: { refresh?: boolean; quiet?: boolean } = {}) {
  if (!quiet) {
    statusEl.hidden = false;
    indexStatusEl.hidden = true;
    senderGroupsEl.hidden = true;
    domainSectionEl.hidden = true;
    expirySectionEl.hidden = true;
    statusEl.textContent = "Getting your mailbox ready…";
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
      statusEl.textContent =
        "Gmail limits how fast apps can read mail. Cluster will continue in a moment…";
      return;
    }
    const reading = runs.map(({ run }) => run.progress).filter((p) => p?.phase === "reading");
    if (reading.length === 0) return;
    const done = reading.reduce((sum, p) => sum + Math.min(p!.done, QUICK_READY_COUNT), 0);
    const total = reading.reduce((sum, p) => sum + Math.min(p!.total, QUICK_READY_COUNT), 0);
    statusEl.textContent = `Reading your mail… ${done}/${total} messages`;
  };
  const progressTimer = setInterval(showProgress, 250);
  try {
    await Promise.all(
      runs.map(({ run, wasRunning, builtBefore: built }) =>
        // A built index only needs the changes since last time, which is
        // usually a moment. Wait briefly for them so an action's result shows.
        built && !wasRunning ? Promise.race([run.done, delay(CHANGES_WAIT_MS)]) : run.quick,
      ),
    );
  } finally {
    clearInterval(progressTimer);
  }

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
    metas.length >= MAIL_INDEX_CAP * providers.length,
  );
  // Real per-sender totals, counted by search, for senders not fully read yet.
  const censusRows = (await Promise.all(providers.map((p) => store.allCensus(p.id)))).flat();
  applyCensus(combined.cleanup, censusRows);
  applyCensus(combined.security, censusRows);
  const sent = (await Promise.all(providers.map((p) => store.allSent(p.id)))).flat();
  markRepliesToYou([...combined.cleanup, ...combined.security], metas, sent);
  markLearnedTransactional([...combined.cleanup, ...combined.security], kindModel());
  ctx.profiles = buildSenderProfiles({
    rows: metas,
    sent,
    census: censusRows,
    ownAddresses: (await Promise.all(providers.map((p) => store.getState(p.id))))
      .map((state) => state?.accountId ?? "")
      .filter(Boolean),
    knownSenders: buildProtectionContext(ctx.settings).knownSenders,
  });
  readUnsubscribeReplies(metas);
  for (const { run } of runs) refreshWhenDone(run);
  let senders = combined.cleanup;
  const securitySenders = combined.security;

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
  await applySenderLedger(securitySenders);
  if (!ctx.settings.knownSendersInitialized || firstContact.firstContactCount > 0) {
    ctx.settings = await mutateSettings((current) => ({
      ...current,
      knownSenders: { ...current.knownSenders, ...firstContact.updatedKnownSenders },
      knownSendersInitialized: true,
    }));
  }

  statusEl.hidden = true;
  senderGroupsEl.hidden = false;
  domainSectionEl.hidden = false;

  // Record this week's inbox-health score for the Overview trend chart (once
  // per ISO week; a same-week rescan overwrites it).
  const weeklyScore = inboxHealthScore(senders);
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
  safeRender("overview", () => renderOverview(senders, securitySenders));
  safeRender("details", () => details?.update(securitySenders));
  safeRender("delete", () => renderDeleteScreen(senders));
  safeRender("subscriptions", () => renderOrganizeScreen(senders));
  safeRender("senders", () => renderAllSenders(senders));
  safeRender("rules", () => renderRulesTab());
  safeRender("delete", () => renderDomainGroups(senders));
  safeRender("delete", () => renderExpirySection(senders));
  safeRender("impersonation", () => renderSecuritySection(securitySenders));
  safeRender("simple", () => renderSimpleHome(securitySenders));
  safeRender("report", () => renderScamReport(securitySenders));
  safeRender("subscriptions", () => renderSubscriptionsTab(senders));
  safeRender("delete", () => renderNeverReadSection(senders));
  safeRender("delete", () => renderSpamSection(senders));
  // Clean up's cards are the primary surface for these three; their detailed
  // sections stay collapsed in "More ways to clean up".
  neverReadSectionEl.hidden = true;
  spamSectionEl.hidden = true;
  expirySectionEl.hidden = true;
  safeRender("organize", () => renderSortInbox(senders));
  safeRender("organize", () => renderTimeLimits());
  safeRender("organize", () => renderSmartViews(senders));
  safeRender("screener", () => renderScreenerTab(senders));
  safeRender("overview", () => updateNavCounts(senders, securitySenders));
  generateDigestBtn.disabled = false;
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
      note.textContent = "Part of this screen didn't load. Try Rescan, or reload the page.";
      el.appendChild(note);
    }
  }
}

function updateNavCounts(senders: SenderSummary[], securitySenders: SenderSummary[]) {
  const health = buildInboxHealth({ senders, securitySenders, settings: ctx.settings });
  const byId = new Map(health.metrics.map((m) => [m.id, m.value]));
  setNavCount("delete", clearOutPlan(senders).total, true, "emails to clear out");
  setNavCount("senders", senders.length);
  setNavCount("subscriptions", byId.get("unsubscribe-capable") ?? 0, true);
  setNavCount("impersonation", byId.get("flagged-senders") ?? 0);
  setPhishingNavSeverity(securitySenders);
  setNavCount("rules", ctx.settings.rules.length);
  setNavCount("screener", byId.get("screener-queue") ?? 0);
}

// Quiet by default (no badge at zero, per the phishing-UX research this
// screen followed — see research/2026-09-18-phishing-security-ux-separation.md):
// strong "alert" red only when a HIGH-tier finding exists, a milder "accent"
// treatment for ELEVATED/LOW-only findings, so the sidebar doesn't cry wolf.
function setPhishingNavSeverity(securitySenders: SenderSummary[]) {
  const el = document.getElementById("nav-count-impersonation");
  if (!el) return;
  const tiers = securitySenders
    .filter((s) => s.threatSignals.length > 0)
    .map((s) => riskTier(senderRiskScore(s.threatSignals)));
  el.classList.remove("alert", "accent");
  if (tiers.includes("high")) {
    el.classList.add("alert");
    el.setAttribute("aria-label", `${el.textContent}, high severity`);
  } else if (tiers.length > 0) {
    el.classList.add("accent");
    el.setAttribute("aria-label", `${el.textContent}, needs review`);
  } else {
    el.removeAttribute("aria-label");
  }
}

// ── Overview screen (v3) ────────────────────────────────────────────────
// Home: the total, the kind bar and up to three next steps (homeDashboard.ts).
function renderOverview(senders: SenderSummary[], securitySenders: SenderSummary[]) {
  const health = buildInboxHealth({ senders, securitySenders, settings: ctx.settings });
  const byId = new Map(health.metrics.map((m) => [m.id, m.value]));
  overviewHeadlineEl.textContent = `Scanned ${health.scannedSenders} sender${
    health.scannedSenders === 1 ? "" : "s"
  } · ${health.scannedMessages} message${health.scannedMessages === 1 ? "" : "s"}`;

  const plan = clearOutPlan(senders);

  overviewContentEl.innerHTML = "";
  const facts: HomeFacts = {
    // The security lane is the whole inbox; `senders` is only the cleanup tabs.
    ...mailByKind(securitySenders, Date.now()),
    suspicious: byId.get("flagged-senders") ?? 0,
    waiting: byId.get("screener-queue") ?? 0,
    neverOpened: {
      senders: unopenedSuggestions(currentSuggestions(senders)).length,
      emails: plan.neverReadMsgs,
    },
    pastDate: plan.expiryTotal,
  };
  overviewContentEl.appendChild(
    renderHomeDashboard(
      facts,
      (screen, act) => {
        void selectScreen(screen).then(() => {
          if (act === "mute-never-opened") neverReadMuteBtn.click();
          if (act === "trash-past-date") expiryCleanupBtn.click();
        });
      },
      (kind) => details?.open({ kind }),
    ),
  );
  if (lastScanCapHit) {
    const footNote = document.createElement("p");
    footNote.className = "text-meta";
    footNote.textContent = `Based on your latest ${MAIL_INDEX_CAP.toLocaleString()} messages per account.`;
    overviewContentEl.appendChild(footNote);
  }
}

function showScanError(err: unknown) {
  log.error(err);
  // Settings-derived tabs don't need scan data — keep them populated even
  // when the scan itself failed.
  renderRulesTab();
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
    text.textContent = "Gmail is rate-limiting the scan. Wait about a minute, then rescan. ";
    const retryBtn = document.createElement("button");
    retryBtn.textContent = "Rescan";
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

type CollapseSettingsKey = "collapsedSenderCategories" | "collapsedDomainCategories";

async function toggleCollapsedCategory(
  settingsKey: CollapseSettingsKey,
  category: DomainCategory,
  collapsed: boolean,
) {
  const current = new Set(ctx.settings[settingsKey]);
  if (collapsed) current.add(category);
  else current.delete(category);
  ctx.settings = await updateSettings({ [settingsKey]: [...current] });
}

/** Rows a long list shows before "Show all". */
const LIST_PREVIEW = 10;
/** Groups after the first start closed; these are the ones opened this session. */
const openedGroups = new Set<string>();

function renderCategoryGroups<T>(
  container: HTMLElement,
  groups: CategoryGroup<T>[],
  headers: string[],
  buildRow: (item: T) => HTMLTableRowElement,
  itemNoun: string,
  collapseSettingsKey: CollapseSettingsKey,
) {
  container.innerHTML = "";
  groups.forEach((group, index) => {
    const details = document.createElement("details");
    details.className = "category-group";
    const openKey = `${collapseSettingsKey}:${group.category}`;
    details.open =
      index === 0 ? !ctx.settings[collapseSettingsKey].includes(group.category) : openedGroups.has(openKey);

    const summary = document.createElement("summary");
    summary.textContent = `${DOMAIN_CATEGORY_LABELS[group.category]} `;
    const countSpan = document.createElement("span");
    countSpan.className = "category-count";
    countSpan.textContent = `${group.items.length} ${itemNoun}, ${group.total} messages`;
    summary.appendChild(countSpan);
    details.appendChild(summary);

    const table = document.createElement("table");
    const caption = document.createElement("caption");
    caption.className = "sr-only";
    caption.textContent = `${DOMAIN_CATEGORY_LABELS[group.category]}: ${group.items.length} ${itemNoun}, ${group.total} messages`;
    table.appendChild(caption);
    const thead = document.createElement("thead");
    thead.appendChild(headerRow(headers));
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    table.appendChild(tbody);
    details.appendChild(table);

    // Build the rows only when the group is actually open — a collapsed
    // category costs nothing until the user expands it.
    let rowsBuilt = false;
    const buildRows = () => {
      if (rowsBuilt) return;
      for (const item of group.items.slice(0, LIST_PREVIEW)) tbody.appendChild(buildRow(item));
      if (group.items.length > LIST_PREVIEW) {
        const moreRow = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = headers.length;
        const more = document.createElement("button");
        more.className = "btn-link";
        more.textContent = `Show all ${group.items.length}`;
        more.onclick = () => {
          moreRow.remove();
          for (const item of group.items.slice(LIST_PREVIEW)) tbody.appendChild(buildRow(item));
        };
        cell.appendChild(more);
        moreRow.appendChild(cell);
        tbody.appendChild(moreRow);
      }
      rowsBuilt = true;
    };
    if (details.open) buildRows();
    details.addEventListener("toggle", () => {
      toggleCollapsedCategory(collapseSettingsKey, group.category, !details.open);
      if (details.open) openedGroups.add(openKey);
      else openedGroups.delete(openKey);
      if (details.open) buildRows();
    });

    container.appendChild(details);
  });
}

// ── Sender table ─────────────────────────────────────────────────────────
/** Clean-up suggestions for these senders, from their profiles. */
function currentSuggestions(senders: SenderSummary[]): Suggestion[] {
  return buildSuggestions(
    senders,
    ctx.profiles,
    ctx.settings.senderEngagement,
    buildProtectionContext(ctx.settings),
    undefined,
    suggestionModel(),
  );
}

/** Messages in the Clear out plan. Home, the metric band and the sidebar
 * badge all show this one total, so they never disagree. */
function clearOutPlan(senders: SenderSummary[]) {
  const protectionCtx = buildProtectionContext(ctx.settings);
  const expiryTotal = totalExpiryCount(buildExpiryBuckets(senders, protectionCtx));
  const spamMsgs = suggestSpamSenders(senders, undefined, protectionCtx).reduce(
    (n, s) => n + s.messageCount,
    0,
  );
  const neverReadMsgs = unopenedSuggestions(currentSuggestions(senders)).reduce(
    (n, s) => n + s.safeMessageIds.length,
    0,
  );
  return { expiryTotal, spamMsgs, neverReadMsgs, total: expiryTotal + spamMsgs + neverReadMsgs };
}

// ── Suggested cleanup: "Senders worth a decision" ──────────────────────
type PrimaryAct = "unsubscribe" | "mute" | "keepSorted";

function decisionReason(sender: SenderSummary): string {
  const total = senderVolume(sender);
  const opened = total - senderUnread(sender);
  return `${total.toLocaleString()} ${total === 1 ? "email" : "emails"}, ${opened === 0 ? "none" : opened.toLocaleString()} opened`;
}

function primaryActionFor(sender: SenderSummary): { act: PrimaryAct; label: string } {
  if (sender.unsubscribe.postUrl) return { act: "unsubscribe", label: "Unsubscribe" };
  const provider = providerById.get(sender.provider);
  if (provider?.muteSender && !ctx.settings.mutedSenders.includes(sender.address)) {
    return { act: "mute", label: "Mute" };
  }
  if (provider?.keepSorted) return { act: "keepSorted", label: "Keep sorted" };
  return { act: "mute", label: "Mute" };
}

/** The four working per-sender action groups, each a live element whose inner
 * button opens its own confirm (reused from the pre-redesign row). */
function buildActionGroups(sender: SenderSummary): Array<{ act: string; label: string; el: HTMLDivElement }> {
  return [
    { act: "unsubscribe", label: "Unsubscribe", el: buildUnsubscribeCell(sender) },
    { act: "keepSorted", label: "Keep sorted", el: buildKeepSortedCell(sender) },
    { act: "mute", label: "Mute", el: buildMuteCell(sender) },
    { act: "snooze", label: "Snooze", el: buildSnoozeCell(sender) },
  ];
}

/** Clean up's list: the ten unprotected senders with the most mail, plus the
 * biggest protected one shown dimmed. */
function pickDecisionSenders(senders: SenderSummary[]): { decide: SenderSummary[]; protectedOne?: SenderSummary } {
  const decide = senders
    .filter((s) => s.protectedMessageIds.length === 0)
    .sort((a, b) => senderVolume(b) - senderVolume(a))
    .slice(0, 10);
  const protectedOne = senders
    .filter((s) => s.protectedMessageIds.length > 0)
    .sort((a, b) => b.count - a.count)[0];
  return { decide, protectedOne };
}

function updateSenderState(senders: SenderSummary[]) {
  ctx.senders = senders;
  pruneSelection(
    selectedSenderKeys,
    senders.map((s) => s.key),
  );
}

// Clean up's head and its two bulk cards. Each card's button is the existing
// confirm (mute never-opened, trash past-date), moved into the card.
function renderDeleteScreen(senders: SenderSummary[]) {
  const plan = clearOutPlan(senders);
  const unopened = unopenedSuggestions(currentSuggestions(senders)).length;
  const emails = (n: number) => `${n.toLocaleString()} ${n === 1 ? "email" : "emails"}`;
  document.getElementById("cleanup-lead")!.textContent = `${emails(plan.total)} you can clear.`;
  document.getElementById("never-opened-card")!.hidden = unopened === 0;
  document.getElementById("never-opened-name")!.textContent =
    `${unopened} ${unopened === 1 ? "sender" : "senders"} you never open`;
  document.getElementById("never-opened-fact")!.textContent = emails(plan.neverReadMsgs);
  document.getElementById("past-date-card")!.hidden = plan.expiryTotal === 0;
  document.getElementById("past-date-fact")!.textContent = emails(plan.expiryTotal);
}

function renderOrganizeScreen(senders: SenderSummary[]) {
  renderDecisionSenders(senders);
  updateSenderBulkBar();
}

function renderDecisionSenders(senders: SenderSummary[]) {
  const { decide, protectedOne } = pickDecisionSenders(senders);
  const countEl = document.getElementById("worth-decision-count");
  if (countEl) countEl.textContent = `${decide.length} of ${senders.length}`;

  senderGroupsEl.innerHTML = "";
  const list = document.createElement("div");
  list.className = "grouped-list";

  // Header row
  const hdr = document.createElement("div");
  hdr.className = "list-row list-row--check-media-actions";
  hdr.style.background = "var(--row-hover)";
  const hdrLabel = document.createElement("label");
  hdrLabel.className = "check-label";
  const selectAll = document.createElement("input");
  selectAll.type = "checkbox";
  selectAll.className = "check";
  selectAll.checked = decide.length > 0 && decide.every((s) => selectedSenderKeys.has(s.key));
  selectAll.setAttribute("aria-label", "Select all senders");
  selectAll.onchange = () => {
    for (const s of decide) {
      if (selectAll.checked) selectedSenderKeys.add(s.key);
      else selectedSenderKeys.delete(s.key);
    }
    renderDecisionSenders(senders);
    updateSenderBulkBar();
  };
  hdrLabel.appendChild(selectAll);
  const hdrCount = document.createElement("span");
  hdrCount.className = "row-sub";
  hdrCount.style.color = "var(--label-2)";
  const selCount = decide.filter((s) => selectedSenderKeys.has(s.key)).length;
  hdrCount.textContent = `${selCount} of ${decide.length} selected`;
  hdr.append(hdrLabel, hdrCount);
  list.appendChild(hdr);

  const most = Math.max(1, ...decide.map(senderVolume));
  for (const sender of decide) {
    const sep = document.createElement("div");
    sep.className = "row-sep";
    sep.style.marginLeft = "56px";
    list.appendChild(sep);
    list.appendChild(buildDecisionRow(sender, senders, most));
  }

  if (protectedOne) {
    const sep = document.createElement("div");
    sep.className = "row-sep";
    sep.style.marginLeft = "56px";
    list.appendChild(sep);
    const tile = makeLogoTile(protectedOne, "sz-34");
    tile.classList.add("dim");
    const chip = document.createElement("span");
    chip.className = "pill dashed";
    chip.textContent = "Protected";
    const row = listRow({
      selectable: {
        checked: true,
        disabled: true,
        label: `${protectedOne.displayName || protectedOne.address} is protected`,
        onChange: () => {},
      },
      lead: tile,
      title: protectedOne.displayName || protectedOne.address,
      sub: `${protectedOne.protectedMessageIds.length} starred of ${protectedOne.count} · excluded entirely`,
      actions: [chip],
    });
    row.classList.add("protected-row");
    (row.querySelector(".check-label") as HTMLLabelElement).style.cursor = "default";
    list.appendChild(row);
  }

  senderGroupsEl.appendChild(list);
}

function buildDecisionRow(sender: SenderSummary, allSenders: SenderSummary[], most: number): HTMLElement {
  const { act, label } = primaryActionFor(sender);
  const primary = document.createElement("button");
  primary.className = "btn btn-accent";
  primary.textContent = label;

  // Full-width options strip below the row — every action group lives here so
  // its two-step confirm has room to render (rendering it inside the narrow
  // max-content action column crushed the text).
  const disclosure = document.createElement("div");
  disclosure.className = "instead-strip";
  disclosure.hidden = true;
  const insteadLabel = document.createElement("span");
  insteadLabel.className = "lbl";
  insteadLabel.textContent = "Options";
  disclosure.appendChild(insteadLabel);
  const groups = buildActionGroups(sender);
  for (const g of groups) {
    g.el.dataset.act = g.act;
    disclosure.appendChild(g.el);
  }
  const notUseful = document.createElement("button");
  notUseful.className = "link-btn";
  notUseful.textContent = "Not useful";
  notUseful.onclick = async () => {
    notUseful.disabled = true;
    await saveEngagementFeedback([sender.key], "dismiss");
    renderDecisionSenders(allSenders);
  };
  const spacer = document.createElement("span");
  spacer.className = "spacer";
  disclosure.append(spacer, notUseful);

  // The primary button is a shortcut: open the options strip and fire the
  // recommended action's confirm there (full-width), leaving both controls
  // in place.
  primary.onclick = () => {
    disclosure.hidden = false;
    ellipsis.setAttribute("aria-expanded", "true");
    const target = groups.find((g) => g.act === act);
    target?.el.querySelector("button")?.click();
    target?.el.scrollIntoView?.({ block: "nearest" });
  };

  disclosure.id = `opts-${sender.key.replace(/[^a-z0-9]+/gi, "-")}`;
  const ellipsis = document.createElement("button");
  ellipsis.className = "btn btn-icon";
  ellipsis.setAttribute("aria-label", "More actions");
  ellipsis.setAttribute("aria-expanded", "false");
  ellipsis.setAttribute("aria-controls", disclosure.id);
  ellipsis.innerHTML =
    '<svg viewBox="0 0 20 20" width="17" height="17" fill="currentColor" aria-hidden="true"><circle cx="5" cy="10" r="1.5"></circle><circle cx="10" cy="10" r="1.5"></circle><circle cx="15" cy="10" r="1.5"></circle></svg>';
  ellipsis.onclick = () => {
    disclosure.hidden = !disclosure.hidden;
    ellipsis.setAttribute("aria-expanded", String(!disclosure.hidden));
  };

  return listRow({
    selectable: {
      checked: selectedSenderKeys.has(sender.key),
      label: `Select ${sender.displayName || sender.address}`,
      data: { senderKey: sender.key },
      onChange: (checked) => {
        if (checked) selectedSenderKeys.add(sender.key);
        else selectedSenderKeys.delete(sender.key);
        updateSenderBulkBar();
      },
    },
    lead: makeLogoTile(sender, "sz-34"),
    title: sender.displayName || sender.address,
    sub: decisionReason(sender),
    meta: volumeBar(senderVolume(sender) / most),
    actions: [primary, ellipsis],
    disclosure,
    href: () => details?.open({ senderKey: sender.key }),
  });
}

function volumeBar(share: number): HTMLElement {
  const bar = document.createElement("span");
  bar.className = "cellbar";
  bar.setAttribute("aria-hidden", "true");
  const fill = document.createElement("i");
  fill.style.width = `${Math.round(share * 100)}%`;
  bar.append(fill);
  return bar;
}

// ── Mute (local BlackHole) ───────────────────────────────────────────────
// A standing from:<address> filter hiding all mail from this sender, now and
// future — independent of whether they honour unsubscribe. Gmail-only.
function buildMuteCell(sender: SenderSummary): HTMLDivElement {
  const cell = document.createElement("div");
  const provider = providerById.get(sender.provider);
  if (!provider?.muteSender) {
    cell.textContent = "";
    return cell;
  }

  const btn = document.createElement("button");
  const isMuted = () => ctx.settings.mutedSenders.includes(sender.address);
  btn.textContent = isMuted() ? "Muted ✓" : "Mute";
  btn.disabled = isMuted();

  const reset = () => {
    cell.innerHTML = "";
    cell.appendChild(btn);
  };

  btn.onclick = () => {
    renderConfirmStep(
      cell,
      reset,
      `Hide all mail from ${sender.address}, now and in future?`,
      false,
      async () => {
        await muteOneSender(sender);
        return "Muted ✓";
      },
    );
  };

  cell.appendChild(btn);
  return cell;
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

function wireDetails() {
  const root = document.getElementById("details");
  if (!root) return;
  details = initDetailsPanel(root, {
    trash(messages, slot, reset, settle) {
      const merged = idsByProvider(messages);
      const total = [...merged.values()].reduce((n, ids) => n + ids.length, 0);
      const skip = messages.length - total;
      const plural = (n: number) => `${n} email${n === 1 ? "" : "s"}`;
      const summaryText =
        describePermanentDelete(merged) ||
        `Move ${plural(total)} to Trash?${skip > 0 ? ` ${skip} protected stay.` : ""}`;
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
          undoableGmailIds.length > 0 ? { provider: "gmail", ids: undoableGmailIds, via: "untrash" } : undefined,
        );
        void refreshView();
        return message;
      });
    },
    mute: [...providerById.values()].some((p) => p.muteSender)
      ? (senders, slot, reset, settle) => {
          const can = senders.filter((s) => providerById.get(s.provider)?.muteSender);
          const n = can.length;
          renderConfirmStep(slot, reset, `Hide all mail from ${n} sender${n === 1 ? "" : "s"}, now and in future?`, false, async () => {
            let done = 0;
            for (const sender of can) {
              if (!(await muteOneSender(sender))) continue;
              done += 1;
              settle.gone(idsSafeToMoveOut(sender));
            }
            void refreshView();
            return `Muted ${done} ✓`;
          });
        }
      : undefined,
  });
  for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-details]"))) {
    btn.onclick = () => (details!.isOpen() ? details!.close() : details!.open());
  }
}

function refreshSenderCheckboxes() {
  senderGroupsEl.querySelectorAll<HTMLInputElement>("input[data-sender-key]").forEach((cb) => {
    cb.checked = selectedSenderKeys.has(cb.dataset.senderKey!);
  });
}

function updateSenderBulkBar() {
  senderBulkBar.hidden = ctx.senders.length === 0;
  senderSelectedCountEl.textContent = `${selectedSenderKeys.size} selected`;
  bulkUnsubscribeBtn.disabled = selectedSenderKeys.size === 0;
  bulkKeepSortedBtn.disabled = selectedSenderKeys.size === 0;
  bulkSnoozeBtn.disabled = selectedSenderKeys.size === 0;
}

// ── All senders screen ──────────────────────────────────────────────────
// A flat, searchable, filterable list of every scanned sender. The pixel
// exact "engagement bar + one action" row treatment lands in the All-senders
// screen commit; this keeps the screen populated and the controls live.
type SenderFilterId = "all" | "people" | "companies" | "subs" | "never" | "quiet" | "muted";
let allSendersFilter: SenderFilterId = "all";
let allSendersSort: SenderSortId = "volume";
let allSendersQuery = "";
let allSendersLimit = 25;
/** Companies opened to show their addresses on the Senders screen. */
const openCompanies = new Set<string>();

/** One row for a company, followed by its addresses when opened. */
function buildCompanyEntry(group: CompanyGroup, all: SenderSummary[]): HTMLElement[] {
  const open = openCompanies.has(group.key);
  const toggle = document.createElement("button");
  toggle.className = "btn btn-sm";
  toggle.textContent = open ? "Hide addresses" : "Show addresses";
  toggle.setAttribute("aria-expanded", String(open));
  toggle.onclick = () => {
    if (open) openCompanies.delete(group.key);
    else openCompanies.add(group.key);
    renderAllSenders(all);
  };
  const opens = group.openRate === null ? "" : ` · opens ${Math.round(group.openRate * 100)}%`;
  const row = listRow({
    lead: makeLogoTile(group.senders[0], "sz-34"),
    title: companyName(group),
    sub: `${group.senders.length} addresses · ${group.total.toLocaleString()} messages${opens}`,
    actions: [toggle],
  });
  if (!open) return [row];
  const children = group.senders.map((sender) => {
    const child = buildAllSendersRow(sender);
    child.classList.add("list-row--child");
    return child;
  });
  return [row, ...children];
}

function hasAnyUnsubscribe(u: SenderSummary["unsubscribe"]): boolean {
  return Boolean(u.postUrl || u.httpUrl || u.mailto);
}

function wireAllSendersControls() {
  const search = document.getElementById("sender-search") as HTMLInputElement | null;
  search?.addEventListener("input", () => {
    allSendersQuery = search.value.trim().toLowerCase();
    allSendersLimit = 25;
    renderAllSenders(ctx.senders);
  });
  const sort = document.getElementById("sender-sort") as HTMLSelectElement | null;
  sort?.addEventListener("change", () => {
    allSendersSort = sort.value as SenderSortId;
    allSendersLimit = 25;
    renderAllSenders(ctx.senders);
  });
  const seg = document.getElementById("sender-filter");
  seg?.querySelectorAll<HTMLButtonElement>("button[data-filter]").forEach((btn) => {
    btn.onclick = () => {
      allSendersFilter = btn.dataset.filter as SenderFilterId;
      allSendersLimit = 25;
      seg
        .querySelectorAll<HTMLButtonElement>("button[data-filter]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      renderAllSenders(ctx.senders);
    };
  });
}

function filteredSenders(senders: SenderSummary[]): SenderSummary[] {
  const neverKeys = new Set(neverReadSenders(senders, buildProtectionContext(ctx.settings)).map((s) => s.key));
  return senders.filter((s) => {
    const profile = ctx.profiles.get(s.key);
    if (allSendersFilter === "never" && !neverKeys.has(s.key)) return false;
    if (allSendersFilter === "people" && !isPerson(profile)) return false;
    if (allSendersFilter === "quiet" && (!profile || profile.stillSending)) return false;
    if (allSendersFilter === "subs" && !hasAnyUnsubscribe(s.unsubscribe)) return false;
    if (allSendersFilter === "muted" && !ctx.settings.mutedSenders.includes(s.address)) return false;
    if (allSendersQuery) {
      const hay = `${s.displayName ?? ""} ${s.address}`.toLowerCase();
      if (!hay.includes(allSendersQuery)) return false;
    }
    return true;
  });
}

/** The company view: one row per authenticated company, opt in through the
 * Companies filter. "Show senders" narrows the list to that company. */
function renderCompanyRows(senders: SenderSummary[]) {
  if (!allSendersListEl) return;
  const groups = groupByCompany(senders, ctx.profiles);
  allSendersListEl.innerHTML = "";
  if (groups.length === 0) {
    allSendersListEl.appendChild(Object.assign(document.createElement("p"), {
      className: "empty-state",
      textContent: "No company senders match this filter.",
    }));
    return;
  }
  const rows = groups.slice(0, allSendersLimit).map((group) => {
    const show = document.createElement("button");
    show.className = "btn btn-sm";
    show.textContent = "Show senders";
    show.onclick = () => {
      const search = document.getElementById("sender-search") as HTMLInputElement | null;
      if (search) search.value = group.key;
      allSendersQuery = group.key;
      document.querySelector<HTMLButtonElement>('#sender-filter button[data-filter="all"]')?.click();
    };
    const opens = group.openRate === null ? "" : ` · opens ${Math.round(group.openRate * 100)}%`;
    return listRow({
      lead: makeLogoTile(group.senders[0], "sz-34"),
      title: group.key,
      sub: `${group.senders.length} address${group.senders.length === 1 ? "" : "es"} · ${group.total.toLocaleString()} messages${opens}`,
      actions: [show],
    });
  });
  allSendersListEl.appendChild(listGroup(rows));
}

function renderAllSenders(senders: SenderSummary[]) {
  if (!allSendersListEl) return;
  const lead = document.getElementById("senders-lead");
  if (lead) {
    lead.textContent = lastScanCapHit
      ? `Who emailed you, from your latest ${MAIL_INDEX_CAP.toLocaleString()} messages.`
      : `Who emailed you in the last ${ctx.settings.scanWindowDays} days.`;
  }
  if (allSendersFilter === "companies") {
    renderCompanyRows(filteredSenders(senders));
    return;
  }
  // A company's addresses fold into one row (LinkedIn, not five LinkedIns).
  const rows = foldByCompany(sortSenders(filteredSenders(senders), ctx.profiles, allSendersSort), ctx.profiles);
  const shown = rows.slice(0, allSendersLimit);

  allSendersListEl.innerHTML = "";
  allSendersListEl.appendChild(
    listGroup(
      shown.flatMap((entry) =>
        entry.kind === "sender" ? [buildAllSendersRow(entry.sender)] : buildCompanyEntry(entry.group, senders),
      ),
    ),
  );

  if (rows.length > shown.length) {
    const more = document.createElement("div");
    more.className = "confirm-slot";
    more.style.padding = "14px 18px";
    const info = document.createElement("span");
    info.className = "hint";
    info.textContent = `Showing ${shown.length} of ${rows.length}`;
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Load 25 more";
    btn.onclick = () => {
      allSendersLimit += 25;
      renderAllSenders(senders);
    };
    more.append(info, btn);
    allSendersListEl.appendChild(more);
  } else if (rows.length > 0) {
    const info = document.createElement("div");
    info.className = "hint";
    info.style.padding = "14px 18px 0";
    info.textContent = `Showing all ${rows.length}`;
    allSendersListEl.appendChild(info);
  } else {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No senders match this filter.";
    allSendersListEl.appendChild(empty);
  }
}

function buildAllSendersRow(sender: SenderSummary): HTMLElement {
  const unread = senderUnread(sender);
  const total = senderVolume(sender);
  const profile = ctx.profiles.get(sender.key);
  const sub = [profileLine(profile), sender.displayName ? sender.address : ""].filter(Boolean).join(" · ");

  // Count + engagement bar (unread ratio).
  const count = document.createElement("div");
  count.style.minWidth = "0";
  const n = document.createElement("div");
  n.className = "row-title";
  n.style.fontSize = "15px";
  n.textContent = `${total} msg`;
  const ratio = total > 0 ? unread / total : 0;
  const bar = document.createElement("div");
  bar.className = "eng-bar";
  const fill = document.createElement("span");
  fill.style.width = `${Math.round(ratio * 100)}%`;
  if (ratio <= 0.6) fill.classList.add("low");
  bar.appendChild(fill);
  count.append(n, bar);

  const actions: HTMLElement[] = [];
  const isProtected = sender.protectedMessageIds.length > 0;
  const isMuted = ctx.settings.mutedSenders.includes(sender.address);
  if (isProtected) {
    const chip = document.createElement("span");
    chip.className = "pill dashed";
    chip.textContent = "Protected";
    actions.push(chip);
  } else if (isMuted) {
    const chip = document.createElement("span");
    chip.className = "pill neutral";
    chip.textContent = "Muted";
    actions.push(chip);
  } else {
    const { act, label } = primaryActionFor(sender);
    const primary = document.createElement("button");
    primary.className = "btn btn-accent btn-sm";
    primary.textContent = label;
    primary.onclick = () => {
      const group = buildActionGroups(sender).find((g) => g.act === act);
      if (!group) return;
      primary.replaceWith(group.el);
      group.el.querySelector("button")?.click();
    };
    actions.push(primary);
  }

  return listRow({
    lead: makeLogoTile(sender, "sz-34"),
    title: sender.displayName || sender.address,
    sub,
    meta: count,
    actions,
  });
}

/** Sender tile: favicon over a coloured monogram fallback (see senderTile.ts). */
function makeLogoTile(
  sender: Pick<SenderSummary, "address" | "displayName">,
  sizeClass: TileSize,
): HTMLElement {
  return senderTile(sender.address, sender.displayName, sizeClass);
}

async function saveEngagementFeedback(senderKeys: string[], feedback: EngagementFeedback) {
  if (senderKeys.length === 0) return;
  void learnFromFeedback(senderKeys, feedback);
  ctx.settings = await mutateSettings((current) => ({
    ...current,
    senderEngagement: recordEngagementFeedback(current.senderEngagement, senderKeys, feedback),
  }));
}

function buildUnsubscribeCell(sender: SenderSummary): HTMLDivElement {
  const cell = document.createElement("div");

  if (sender.unsubscribe.postUrl) {
    const statusEl = document.createElement("div");
    statusEl.className = "unsubscribe-status";

    const btn = document.createElement("button");
    const applyState = () => {
      const tracked = ctx.settings.unsubscribeRequests[sender.key];
      if (tracked) {
        const outcome = unsubscribeOutcomeFor(sender.key, sender);
        statusEl.textContent = `${outcome.label} · requested ${formatRelativeTime(tracked.requestedAt)}`;
        statusEl.title = outcome.detail;
        btn.textContent = outcome.state === "still-sending" ? "Retry unsubscribe" : "Request again";
      } else {
        statusEl.textContent = "";
        statusEl.title = "";
        btn.textContent = "Unsubscribe (verified one-click)";
      }
    };

    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = "Requesting…";
      const ok = await fireOneClickUnsubscribe(sender.unsubscribe.postUrl!);
      if (ok) {
        await recordUnsubscribeRequests([sender]);
        await logAction("unsubscribe", `Unsubscribed from ${sender.address}`);
        applyState();
      } else {
        statusEl.textContent = "Request failed, try again";
        const tracked = ctx.settings.unsubscribeRequests[sender.key];
        btn.textContent = tracked
          ? unsubscribeOutcomeFor(sender.key, sender).state === "still-sending"
            ? "Retry unsubscribe"
            : "Request again"
          : "Unsubscribe (verified one-click)";
      }
      btn.disabled = false;
    };

    applyState();
    cell.append(statusEl, btn);
  } else if (sender.unsubscribe.mailto) {
    const button = document.createElement("button");
    button.textContent = "Unsubscribe by email";
    button.onclick = () => void openUnsubscribeSheet([sender], () => renderDeleteScreen(ctx.senders));
    cell.appendChild(button);
  } else if (sender.unsubscribe.httpUrl) {
    const link = document.createElement("a");
    link.href = sender.unsubscribe.httpUrl;
    link.textContent = "Open unsubscribe page";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    cell.appendChild(link);
  } else {
    cell.textContent = "No unsubscribe link found";
  }

  return cell;
}

function buildKeepSortedCell(sender: SenderSummary): HTMLDivElement {
  const cell = document.createElement("div");
  const btn = document.createElement("button");
  btn.textContent = "Keep sorted";
  const labelName = sender.displayName || sender.address;
  btn.title = `New mail from ${sender.address} skips your inbox and goes to "${labelName}".`;
  btn.onclick = async () => {
    const provider = providerById.get(sender.provider);
    if (!provider?.keepSorted) {
      btn.textContent = "Not supported for this provider";
      return;
    }
    btn.disabled = true;
    btn.textContent = "Setting up…";
    try {
      const token = await provider.getAuthToken(false);
      await provider.keepSorted(token, sender.address, labelName, idsSafeToMoveOut(sender));
      await logAction("keepSorted", `Kept ${sender.address} sorted into "${labelName}"`);
      btn.textContent = "Sorted ✓";
    } catch (err) {
      btn.textContent = "Failed, try again";
      btn.disabled = false;
      log.error(err);
    }
  };
  cell.appendChild(btn);
  return cell;
}

// ── Snooze (Gmail-only) ──────────────────────────────────────────────────
// Moves mail out of the inbox under a dedicated label and remembers when to
// bring it back (settingsStore.snoozedMessages, checked by the background
// alarm and on dashboard load — see snoozeResurface.ts). Never offered for
// Outlook: Graph has no snooze primitive, and a folder-move approximation
// would silently go stale if the user reorganizes mail elsewhere.
async function recordSnoozedMessages(ids: string[], provider: ProviderId, resurfaceAt: number) {
  if (ids.length === 0) return;
  const snoozedMessages = { ...ctx.settings.snoozedMessages };
  for (const id of ids) snoozedMessages[id] = { resurfaceAt, provider };
  ctx.settings = await updateSettings({ snoozedMessages });
}

function buildSnoozeCell(sender: SenderSummary): HTMLDivElement {
  const cell = document.createElement("div");

  if (!providerById.get(sender.provider)?.snoozeMessages) {
    cell.textContent = "Not supported for this provider";
    return cell;
  }

  const select = document.createElement("select");
  for (const [days, label] of [
    [1, "1 day"],
    [7, "1 week"],
    [30, "1 month"],
  ] as const) {
    const option = document.createElement("option");
    option.value = String(days);
    option.textContent = label;
    if (days === 7) option.selected = true;
    select.appendChild(option);
  }

  const btn = document.createElement("button");
  btn.textContent = "Snooze";
  btn.onclick = async () => {
    const provider = providerById.get(sender.provider);
    if (!provider?.snoozeMessages) return;
    btn.disabled = true;
    select.disabled = true;
    btn.textContent = "Snoozing…";
    try {
      const token = await provider.getAuthToken(false);
      await provider.snoozeMessages(token, sender.messageIds);
      const resurfaceAt = Date.now() + Number(select.value) * 24 * 60 * 60 * 1000;
      await recordSnoozedMessages(sender.messageIds, sender.provider, resurfaceAt);
      await logAction(
        "snooze",
        `Snoozed ${sender.messageIds.length} from ${sender.address} until ${new Date(resurfaceAt).toLocaleDateString()}`,
      );
      btn.textContent = `Snoozed until ${new Date(resurfaceAt).toLocaleDateString()} ✓`;
    } catch (err) {
      btn.textContent = "Failed, try again";
      btn.disabled = false;
      select.disabled = false;
      log.error(err);
    }
  };

  cell.append(select, btn);
  return cell;
}

// ── Domain-group table ───────────────────────────────────────────────────
function renderDomainGroups(senders: SenderSummary[]) {
  const groups = buildDomainGroups(senders, buildProtectionContext(ctx.settings)).filter(
    (g) => g.totalCount > 0,
  );
  currentDomainGroups = groups;
  pruneSelection(
    selectedDomainKeys,
    groups.map((g) => g.key),
  );

  const categoryGroups = groupByCategory(
    groups,
    (g) => g.category,
    (g) => g.totalCount,
  );
  renderCategoryGroups(
    domainGroupListEl,
    categoryGroups,
    ["", "Domain", `Count (${ctx.settings.scanWindowDays}d)`, "Protected", "Action"],
    buildDomainRow,
    "domains",
    "collapsedDomainCategories",
  );

  updateDomainBulkBar();
}

function buildDomainRow(group: DomainGroup): HTMLTableRowElement {
  const row = document.createElement("tr");

  const checkboxCell = document.createElement("td");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.domainKey = group.key;
  checkbox.checked = selectedDomainKeys.has(group.key);
  checkbox.onchange = () => {
    if (checkbox.checked) selectedDomainKeys.add(group.key);
    else selectedDomainKeys.delete(group.key);
    updateDomainBulkBar();
  };
  checkboxCell.appendChild(checkbox);
  row.appendChild(checkboxCell);

  const domainCell = document.createElement("td");
  domainCell.textContent = group.isFreeMailException
    ? `${group.senders[0]?.address ?? group.domain} (individual sender)`
    : group.domain;
  row.appendChild(domainCell);

  const countCell = document.createElement("td");
  countCell.textContent = String(group.totalCount);
  row.appendChild(countCell);

  const protectedCell = document.createElement("td");
  protectedCell.textContent = group.protectedCount > 0 ? `${group.protectedCount} protected` : "None";
  row.appendChild(protectedCell);

  row.appendChild(buildDeleteDomainCell(group));

  return row;
}

function refreshDomainCheckboxes() {
  domainGroupListEl.querySelectorAll<HTMLInputElement>("input[data-domain-key]").forEach((cb) => {
    cb.checked = selectedDomainKeys.has(cb.dataset.domainKey!);
  });
}

function updateDomainBulkBar() {
  domainBulkBar.hidden = currentDomainGroups.length === 0;
  domainSelectedCountEl.textContent = `${selectedDomainKeys.size} selected`;
  bulkDeleteDomainsBtn.disabled = selectedDomainKeys.size === 0;
}

// Always trash-only, even when fast permanent delete is on — see the note
// above executeSmartDelete for why that's scoped to the bulk flows only.
function buildDeleteDomainCell(group: DomainGroup): HTMLTableCellElement {
  const cell = document.createElement("td");
  const deletable = totalDeletableAcrossGroups([group]);

  const btn = document.createElement("button");
  btn.className = "danger";
  btn.textContent = "Delete domain…";
  btn.disabled = deletable === 0;

  const resetCell = () => {
    cell.innerHTML = "";
    cell.appendChild(btn);
  };

  btn.onclick = () => {
    const summaryText =
      group.protectedCount > 0
        ? `Move ${deletable} to Trash, skip ${group.protectedCount} protected?`
        : `Move ${deletable} to Trash?`;

    renderConfirmStep(cell, resetCell, summaryText, true, async () => {
      const merged = mergeDeletableIdsByProvider([group]);
      await executeBulkDeleteDomains(merged, providerById);
      const gmailIds = merged.get("gmail") ?? [];
      appendUndoButton(cell, gmailIds);
      await logAction(
        "trash",
        `Moved ${deletable} from ${group.domain} to Trash`,
        gmailIds.length > 0 ? { provider: "gmail", ids: gmailIds, via: "untrash" } : undefined,
      );
      return `Moved ${deletable} to Trash ✓`;
    });
  };

  cell.appendChild(btn);
  return cell;
}

// ── Ready-to-clean-up (retention expiry) section ────────────────────────
function renderExpirySection(senders: SenderSummary[]) {
  currentExpiryBuckets = buildExpiryBuckets(senders, buildProtectionContext(ctx.settings));
  const total = totalExpiryCount(currentExpiryBuckets);
  expirySectionEl.hidden = total === 0;
  if (total === 0) return;

  expiryBreakdownEl.textContent = currentExpiryBuckets
    .map((b) => `${b.count} ${b.label.toLowerCase()} (${b.retentionDays}+ days old)`)
    .join(", ");

  resetExpiryCleanupSlot();
}

function resetExpiryCleanupSlot() {
  expiryCleanupSlot.innerHTML = "";
  expiryCleanupBtn.textContent = "Trash…";
  expiryCleanupSlot.appendChild(expiryCleanupBtn);
}

// ── Opt-in fast permanent delete (Gmail only) ────────────────────────────
// Applies only to the two bulk multi-item flows below (bulk domain delete,
// expiry cleanup) — the quota-efficiency argument for batchDelete is about
// large batches; the single per-row domain delete stays trash-only, where
// reversibility matters more than the negligible quota difference.
function wireFastDeleteToggle() {
  fastDeleteToggle.onchange = async () => {
    if (fastDeleteToggle.checked) {
      fastDeleteToggle.disabled = true;
      try {
        await getElevatedAuthToken(true);
        ctx.settings = await updateSettings({ fastPermanentDeleteEnabled: true });
      } catch (err) {
        fastDeleteToggle.checked = false;
        log.error(err);
      } finally {
        fastDeleteToggle.disabled = false;
      }
    } else {
      ctx.settings = await updateSettings({ fastPermanentDeleteEnabled: false });
    }
  };
}

function wireScanSettings() {
  applyScanSettingsBtn.onclick = async () => {
    const scanWindowDays = Math.min(
      3650,
      Math.max(1, Number(scanWindowInput.value) || ctx.settings.scanWindowDays),
    );
    scanWindowInput.value = String(scanWindowDays);

    applyScanSettingsBtn.disabled = true;
    applyScanSettingsBtn.textContent = "Rescanning…";
    try {
      ctx.settings = await updateSettings({ scanWindowDays });
      // A new window re-lists the index; known mail isn't read again.
      await scanAndRender({ refresh: true });
    } finally {
      applyScanSettingsBtn.disabled = false;
      applyScanSettingsBtn.textContent = "Rescan mail";
    }
  };
}

// ── AI-powered smart digest (Chrome's on-device Summarizer) ─────────────
// Narrates only already-computed aggregate counts (category/sender/expiry
// totals, same data already shown in the tables) — never subjects or
// bodies. The whole section stays hidden when the on-device model isn't
// available in this browser/hardware.
async function wireDigest() {
  const availability = await checkDigestAvailability();
  if (availability === "unavailable") return;
  digestSectionEl.hidden = false;

  generateDigestBtn.onclick = async () => {
    generateDigestBtn.disabled = true;
    digestTextEl.hidden = true;
    digestStatusEl.textContent =
      availability === "available" ? "Generating…" : "Downloading on-device model…";
    try {
      const input = buildDigestInput(ctx.senders, currentExpiryBuckets);
      const summary = await generateDigest(input, (fraction) => {
        digestStatusEl.textContent = `Downloading on-device model… ${Math.round(fraction * 100)}%`;
      });
      digestStatusEl.textContent = "";
      digestTextEl.textContent = summary;
      digestTextEl.hidden = false;
    } catch (err) {
      digestStatusEl.textContent = "Couldn't generate a digest right now.";
      log.error(err);
    } finally {
      generateDigestBtn.disabled = false;
    }
  };
}

// ── On-device second opinion for "other"-kind mail (Chrome's Prompt API) ──
// messageKind.ts's regex classifier is English-only; this asks the on-device
// model to classify only the subjects the regex already gave up on, in this
// browser session, and never overrides a classification the regex made. The
// section stays hidden when the model isn't available in this browser/
// hardware, same convention as the digest section above.
async function wireAiMessageKind() {
  const availability = await checkMessageKindAiAvailability();
  if (availability === "unavailable") return;
  aiKindSectionEl.hidden = false;
  classifyOtherBtn.disabled = false;

  classifyOtherBtn.onclick = async () => {
    classifyOtherBtn.disabled = true;
    aiKindStatusEl.textContent = "Classifying…";
    try {
      const otherMessages = ctx.senders.flatMap((sender) =>
        sender.messages.filter((message) => message.kind === "other" && message.subject),
      );
      if (otherMessages.length === 0) {
        aiKindStatusEl.textContent = "Nothing classified as \"other\" in the current scan.";
        return;
      }
      const verdicts = await classifyOtherSubjects(otherMessages.map((message) => message.subject ?? ""));
      let changed = 0;
      for (const message of otherMessages) {
        const verdict = message.subject ? verdicts.get(message.subject) : undefined;
        if (aiVerdictAllowed(message, verdict)) {
          message.kind = verdict;
          changed += 1;
        }
      }
      aiKindStatusEl.textContent =
        changed > 0
          ? `Reclassified ${changed} of ${otherMessages.length} "other" message${otherMessages.length === 1 ? "" : "s"}.`
          : "No confident reclassification found.";
      if (changed > 0) {
        renderDeleteScreen(ctx.senders);
        renderOrganizeScreen(ctx.senders);
      }
    } catch (err) {
      aiKindStatusEl.textContent = "Couldn't classify right now.";
      log.error(err);
    } finally {
      classifyOtherBtn.disabled = false;
    }
  };
}

function planDelete(merged: Map<ProviderId, string[]>) {
  const gmailCount = merged.get("gmail")?.length ?? 0;
  const otherCount = [...merged.entries()]
    .filter(([provider]) => provider !== "gmail")
    .reduce((sum, [, ids]) => sum + ids.length, 0);
  const willUsePermanent =
    ctx.settings.fastPermanentDeleteEnabled &&
    gmailCount > 0 &&
    Boolean(gmailProvider.permanentlyDeleteMessages);
  return { gmailCount, otherCount, willUsePermanent };
}

// Returns "" when the normal trash-only wording should be used instead.
function describePermanentDelete(merged: Map<ProviderId, string[]>): string {
  const { gmailCount, otherCount, willUsePermanent } = planDelete(merged);
  if (!willUsePermanent) return "";
  return otherCount > 0
    ? `Permanently delete ${gmailCount} from Gmail (cannot be undone) and move ${otherCount} to Trash?`
    : `Permanently delete ${gmailCount} from Gmail? This cannot be undone.`;
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

async function executeSmartDelete(merged: Map<ProviderId, string[]>): Promise<SmartDeleteResult> {
  const { gmailCount, otherCount, willUsePermanent } = planDelete(merged);
  if (!willUsePermanent) {
    const { skipped } = await executeBulkDeleteDomains(merged, providerById);
    return {
      message: `Moved ${gmailCount + otherCount - skipped} to Trash ✓${skippedNote(skipped)}`,
      undoableGmailIds: (merged.get("gmail") ?? []).filter(Boolean),
    };
  }

  try {
    const elevatedToken = await getElevatedAuthToken(false);
    // Permanent delete has no undo — re-check protection before it, not just
    // before the Trash paths.
    const { safe, skipped } = await filterOutProtected(
      new Map([["gmail", merged.get("gmail") ?? []]]),
      providerById,
    );
    const gmailSafe = safe.get("gmail") ?? [];
    if (gmailSafe.length > 0) {
      await gmailProvider.permanentlyDeleteMessages!(elevatedToken, gmailSafe);
    }
    const rest = new Map(merged);
    rest.delete("gmail");
    let otherSkipped = 0;
    if (rest.size > 0) ({ skipped: otherSkipped } = await executeBulkDeleteDomains(rest, providerById));
    const totalSkipped = skipped + otherSkipped;
    const message =
      (otherCount > 0
        ? `Permanently deleted ${gmailSafe.length} from Gmail, moved ${otherCount - otherSkipped} to Trash ✓`
        : `Permanently deleted ${gmailSafe.length} from Gmail ✓`) + skippedNote(totalSkipped);
    return { message, undoableGmailIds: [] };
  } catch (err) {
    log.error("Elevated permanent-delete failed, falling back to Trash", err);
    await executeBulkDeleteDomains(merged, providerById);
    return {
      message: `Fast delete wasn't available, so ${gmailCount + otherCount} moved to Trash instead ✓`,
      undoableGmailIds: merged.get("gmail") ?? [],
    };
  }
}

// sortInbox.ts and the extracted tab modules trigger a rescan through this
// bridge; logAction lives in recentTab.ts (with the log view and undo).
setBridge({ rescan: scanAndRender, logAction });

// ── Local engagement suggestions (Clean up tab) ──────────────────────────
function resetNeverReadSlots() {
  neverReadMuteSlot.innerHTML = "";
  neverReadMuteSlot.appendChild(neverReadMuteBtn);
  neverReadTrashSlot.innerHTML = "";
  neverReadTrashSlot.appendChild(neverReadTrashBtn);
}

function renderNeverReadSection(senders: SenderSummary[]) {
  engagementSuggestions = unopenedSuggestions(currentSuggestions(senders));
  neverReadSectionEl.hidden = engagementSuggestions.length === 0;
  neverReadMuteSlot.hidden = engagementSuggestions.length === 0;
  if (engagementSuggestions.length === 0) return;

  const totalMsgs = engagementSuggestions.reduce((count, item) => count + item.safeMessageIds.length, 0);
  neverReadCountEl.textContent = `${engagementSuggestions.length} suggestion${engagementSuggestions.length === 1 ? "" : "s"}, ${totalMsgs} message${totalMsgs === 1 ? "" : "s"}`;

  neverReadListEl.innerHTML = "";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.appendChild(headerRow(["Sender", "Why", "Suggested", "Feedback"]));
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  // Ask about at most three rows, the ones the kind model is least sure of.
  // Mailing lists are never receipts, so they're never asked about.
  const ask = new Set(
    sendersToAsk(
      kindModel(),
      engagementSuggestions.filter((s) => !s.profile.listId).map((s) => s.sender),
    ).map((s) => s.key),
  );
  for (const suggestion of engagementSuggestions) {
    const { sender } = suggestion;
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.textContent = sender.displayName ? `${sender.displayName} <${sender.address}>` : sender.address;
    const reasonCell = document.createElement("td");
    reasonCell.textContent = suggestion.reasons.join(" ");
    const actionCell = document.createElement("td");
    actionCell.textContent = SUGGESTION_ACTION_LABELS[suggestion.action];
    const feedbackCell = document.createElement("td");
    const dismissBtn = document.createElement("button");
    dismissBtn.textContent = "Not useful";
    dismissBtn.title = "Hide this suggestion for 30 days";
    dismissBtn.onclick = async () => {
      dismissBtn.disabled = true;
      await saveEngagementFeedback([sender.key], "dismiss");
      renderNeverReadSection(ctx.senders);
    };
    if (ask.has(sender.key)) {
      const keepBtn = document.createElement("button");
      keepBtn.textContent = "Receipts? Keep them";
      keepBtn.title = "Keep this sender's mail and learn what your receipts look like";
      const noBtn = document.createElement("button");
      noBtn.textContent = "No";
      noBtn.title = "Not receipts";
      const reply = (value: "yes" | "no") => async () => {
        keepBtn.disabled = noBtn.disabled = true;
        await answerKind(sender, value).catch((err) => log.error("Could not save your answer", err));
        renderDeleteScreen(ctx.senders);
        renderNeverReadSection(ctx.senders);
      };
      keepBtn.onclick = reply("yes");
      noBtn.onclick = reply("no");
      feedbackCell.append(keepBtn, noBtn);
    }
    feedbackCell.appendChild(dismissBtn);
    row.append(nameCell, reasonCell, actionCell, feedbackCell);
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  neverReadListEl.appendChild(table);

  resetNeverReadSlots();
  neverReadMuteBtn.disabled = !engagementSuggestions.some(
    ({ sender }) => sender.provider === "gmail" && !ctx.settings.mutedSenders.includes(sender.address),
  );
  neverReadTrashBtn.disabled = !engagementSuggestions.some(
    ({ sender, safeMessageIds }) => sender.provider === "gmail" && safeMessageIds.length > 0,
  );
}

// ── "Suggested spam" (Clean up tab) ─────────────────────────────────────
let spamSuggestions: SpamSuggestion[] = [];

function resetSpamSlot() {
  spamTrashSlot.innerHTML = "";
  spamTrashSlot.appendChild(spamTrashBtn);
}

function spamCheckboxes(): HTMLInputElement[] {
  return Array.from(spamListEl.querySelectorAll<HTMLInputElement>("input[type=checkbox][data-key]"));
}

function updateSpamCount() {
  const selectedKeys = new Set(
    spamCheckboxes()
      .filter((c) => c.checked)
      .map((c) => c.dataset.key),
  );
  const chosen = spamSuggestions.filter((s) => selectedKeys.has(s.sender.key));
  const msgs = chosen.reduce((n, s) => n + s.messageCount, 0);
  spamCountEl.textContent = `${chosen.length} of ${spamSuggestions.length} sender${
    spamSuggestions.length === 1 ? "" : "s"
  } selected · ${msgs} message${msgs === 1 ? "" : "s"}`;
  spamTrashBtn.disabled = chosen.length === 0;
  const boxes = spamCheckboxes();
  spamSelectAllEl.checked = boxes.length > 0 && boxes.every((b) => b.checked);
}

function renderSpamSection(senders: SenderSummary[]) {
  const sizeEl = document.getElementById("spam-list-size");
  if (sizeEl) sizeEl.textContent = `Matched against ${spamListSize().toLocaleString()} known domains.`;
  spamSuggestions = suggestSpamSenders(senders, undefined, buildProtectionContext(ctx.settings));
  spamSectionEl.hidden = spamSuggestions.length === 0;
  resetSpamSlot();
  if (spamSuggestions.length === 0) return;

  spamListEl.innerHTML = "";
  const table = document.createElement("table");
  const tbody = document.createElement("tbody");
  for (const sug of spamSuggestions) {
    const row = document.createElement("tr");

    const pickCell = document.createElement("td");
    const box = document.createElement("input");
    box.type = "checkbox";
    // Delete-adjacent -- requires an explicit look before it's trashed,
    // rather than everything pre-selected for a one-click confirm.
    box.checked = false;
    box.dataset.key = sug.sender.key;
    box.onchange = updateSpamCount;
    pickCell.appendChild(box);

    const nameCell = document.createElement("td");
    nameCell.textContent = sug.sender.displayName
      ? `${sug.sender.displayName} <${sug.sender.address}>`
      : sug.sender.address;

    const countCell = document.createElement("td");
    countCell.textContent = `${sug.messageCount} message${sug.messageCount === 1 ? "" : "s"}`;

    const reasonCell = document.createElement("td");
    reasonCell.className = "hint";
    reasonCell.textContent = `${reasonLabel(sug.reason)} · ${sug.sender.provider}`;

    row.append(pickCell, nameCell, countCell, reasonCell);
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  spamListEl.appendChild(table);
  updateSpamCount();
}


// ── Smart Views + Keep-newest (Clean up tab) ─────────────────────────────
async function applySmartView(view: SmartView, action: "archive" | "trash"): Promise<string> {
  let merged =
    action === "trash"
      ? evaluateSmartViewForTrash(view, ctx.senders, buildProtectionContext(ctx.settings))
      : evaluateSmartView(view, ctx.senders);
  if (action === "trash") ({ safe: merged } = await filterOutProtected(merged, providerById));
  const gmailIds = merged.get("gmail") ?? [];
  let total = 0;
  for (const [pid, ids] of merged) {
    const provider = providerById.get(pid);
    if (!provider || ids.length === 0) continue;
    const token = await provider.getAuthToken(false);
    if (action === "trash") {
      await provider.trashMessages(token, ids);
      total += ids.length;
    } else if (provider.archiveMessages) {
      await provider.archiveMessages(token, ids);
      total += ids.length;
    }
  }
  const via = action === "trash" ? "untrash" : "unarchive";
  await logAction(
    action === "trash" ? "trash" : "archive",
    `View "${view.label}": ${action}, ${total} message${total === 1 ? "" : "s"}`,
    gmailIds.length > 0 ? { provider: "gmail", ids: gmailIds, via } : undefined,
  );
  await scanAndRender();
  return `${action === "trash" ? "Trashed" : "Archived"} ${total}`;
}

function clearSmartViewResult() {
  smartViewResultSlot.innerHTML = "";
}

function openSmartView(view: SmartView, msgCount: number, senderCount: number) {
  smartViewResultSlot.innerHTML = "";
  smartViewResultSlot.className = "confirm-slot";

  const info = document.createElement("span");
  info.textContent = `${view.label}: ${msgCount} message${msgCount === 1 ? "" : "s"} across ${senderCount} sender${senderCount === 1 ? "" : "s"}`;

  const archiveBtn = document.createElement("button");
  archiveBtn.textContent = "Archive";
  archiveBtn.onclick = () =>
    renderConfirmStep(smartViewResultSlot, clearSmartViewResult, `Archive ${msgCount}?`, false, () =>
      applySmartView(view, "archive"),
    );

  const trashBtn = document.createElement("button");
  trashBtn.className = "danger";
  trashBtn.textContent = "Trash";
  // Order confirmations are never auto-trashed (see protectionPolicy.ts) --
  // a return window can easily outlast any fixed age cutoff. Archive still
  // works; Trash is disabled and explained rather than silently doing
  // nothing or quietly excluding every message.
  if (view.id === "shipping") {
    trashBtn.disabled = true;
    trashBtn.title = "Order confirmations aren't trashed automatically. Archive them instead.";
  } else {
    trashBtn.onclick = () =>
      renderConfirmStep(smartViewResultSlot, clearSmartViewResult, `Move ${msgCount} to Trash?`, true, () =>
        applySmartView(view, "trash"),
      );
  }

  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.onclick = clearSmartViewResult;

  smartViewResultSlot.append(info, archiveBtn, trashBtn, cancel);
}

function renderSmartViews(senders: SenderSummary[]) {
  smartViewChipsEl.innerHTML = "";
  clearSmartViewResult();
  for (const view of SMART_VIEWS) {
    const msgCount = smartViewMessageCount(view, senders);
    const chip = document.createElement("button");
    chip.className = "smart-view-chip";
    chip.textContent = `${view.label} (${msgCount})`;
    chip.title = view.hint;
    chip.disabled = msgCount === 0;
    chip.onclick = () => openSmartView(view, msgCount, smartViewSenderCount(view, senders));
    smartViewChipsEl.appendChild(chip);
  }
}

function resetKeepNewestSlot() {
  keepNewestSlot.innerHTML = "";
  keepNewestSlot.appendChild(keepNewestBtn);
}

function wireKeepNewest() {
  keepNewestBtn.onclick = () => {
    const n = Math.max(1, Number(keepNewestNInput.value) || 3);
    const merged = keepNewestExcess(ctx.senders, n, buildProtectionContext(ctx.settings));
    const gmailIds = merged.get("gmail") ?? [];
    const total = [...merged.values()].reduce((a, b) => a + b.length, 0);
    if (total === 0) {
      renderConfirmStep(
        keepNewestSlot,
        resetKeepNewestSlot,
        `Nothing to trim. No sender has more than ${n}.`,
        false,
        async () => "",
      );
      return;
    }
    renderConfirmStep(
      keepNewestSlot,
      resetKeepNewestSlot,
      `Move ${total} older message${total === 1 ? "" : "s"} to Trash, keeping the newest ${n} per sender?`,
      true,
      async () => {
        const { safe } = await filterOutProtected(merged, providerById);
        for (const [pid, ids] of safe) {
          const provider = providerById.get(pid);
          if (!provider || ids.length === 0) continue;
          const token = await provider.getAuthToken(false);
          await provider.trashMessages(token, ids);
        }
        await logAction(
          "trash",
          `Trimmed to the newest ${n} per sender: ${total} message${total === 1 ? "" : "s"}`,
          gmailIds.length > 0 ? { provider: "gmail", ids: gmailIds, via: "untrash" } : undefined,
        );
        await scanAndRender();
        return `Trimmed ${total}`;
      },
    );
  };
}

// ── Bulk action bars ─────────────────────────────────────────────────────
function wireBulkHandlers() {
  selectSafeSendersBtn.onclick = () => {
    const safe = safeSenderKeys(ctx.senders);
    selectedSenderKeys.clear();
    for (const key of safe) selectedSenderKeys.add(key);
    refreshSenderCheckboxes();
    updateSenderBulkBar();
  };

  selectSafeDomainsBtn.onclick = () => {
    const safe = safeDomainGroupKeys(currentDomainGroups);
    selectedDomainKeys.clear();
    for (const key of safe) selectedDomainKeys.add(key);
    refreshDomainCheckboxes();
    updateDomainBulkBar();
  };

  const resetUnsubscribeBulkSlot = () => {
    unsubscribeBulkSlot.innerHTML = "";
    unsubscribeBulkSlot.appendChild(bulkUnsubscribeBtn);
  };

  bulkUnsubscribeBtn.onclick = () => {
    const selected = ctx.senders.filter((s) => selectedSenderKeys.has(s.key));
    const { automatable, manual } = partitionForUnsubscribe(selected);
    const byEmail = manual.filter((s) => s.unsubscribe.mailto);
    const summaryText = `${automatable.length} will be unsubscribed with one click. ${byEmail.length} need an email you check first. ${manual.length - byEmail.length} need a manual look.`;

    renderConfirmStep(unsubscribeBulkSlot, resetUnsubscribeBulkSlot, summaryText, false, async (summary) => {
      if (byEmail.length > 0) void openUnsubscribeSheet(byEmail, () => renderDeleteScreen(ctx.senders));
      if (automatable.length === 0) return `Nothing to send with one click. ${manual.length - byEmail.length} need a manual look`;
      summary.textContent = "Requesting permission…";
      const granted = await ensureOriginsPermission(automatable.map((s) => s.unsubscribe.postUrl!));
      if (!granted) return "Permission denied, so nothing was unsubscribed";
      summary.textContent = "Unsubscribing…";
      const { succeeded, failed } = await executeBulkUnsubscribe(automatable, fireOneClickUnsubscribe);
      await recordUnsubscribeRequests(succeeded);
      if (succeeded.length > 0)
        await logAction("unsubscribe", `Bulk unsubscribed from ${succeeded.length} senders`);
      renderDeleteScreen(ctx.senders);
      renderOrganizeScreen(ctx.senders);
      return `Unsubscribed ${succeeded.length}, failed ${failed.length}, skipped ${manual.length - byEmail.length} (no verified link)`;
    });
  };

  const resetKeepSortedBulkSlot = () => {
    keepSortedBulkSlot.innerHTML = "";
    keepSortedBulkSlot.appendChild(bulkKeepSortedBtn);
  };

  bulkKeepSortedBtn.onclick = () => {
    const selected = ctx.senders.filter((s) => selectedSenderKeys.has(s.key));
    const { eligible, unsupported } = partitionForKeepSorted(selected, providerById);
    const skipped = unsupported.length > 0 ? ` (${unsupported.length} skipped: not supported for this provider)` : "";
    const summaryText = `From now on, new mail from ${eligible.length} sender${eligible.length === 1 ? "" : "s"} will skip your inbox and go to a label named after each sender${skipped}.`;

    renderConfirmStep(keepSortedBulkSlot, resetKeepSortedBulkSlot, summaryText, false, async () => {
      const { succeeded, failed } = await executeBulkKeepSorted(eligible, providerById);
      if (succeeded > 0)
        await logAction("keepSorted", `Kept ${succeeded} sender${succeeded === 1 ? "" : "s"} sorted`);
      return `Sorted ${succeeded}, failed ${failed}, skipped ${unsupported.length}`;
    });
  };

  const resetSnoozeBulkSlot = () => {
    snoozeBulkSlot.innerHTML = "";
    snoozeBulkSlot.appendChild(bulkSnoozeBtn);
  };

  bulkSnoozeBtn.onclick = () => {
    const selected = ctx.senders.filter((s) => selectedSenderKeys.has(s.key));
    const { eligible, unsupported } = partitionForSnooze(selected, providerById);
    const days = Number(snoozeDurationSelect.value);
    const resurfaceAt = Date.now() + days * 24 * 60 * 60 * 1000;
    const summaryText = `${eligible.length} will be snoozed for ${snoozeDurationSelect.options[snoozeDurationSelect.selectedIndex].textContent}, ${unsupported.length} skipped because they're not supported for this provider`;

    renderConfirmStep(snoozeBulkSlot, resetSnoozeBulkSlot, summaryText, false, async () => {
      const { succeeded, failed } = await executeBulkSnooze(eligible, providerById);
      for (const s of succeeded) await recordSnoozedMessages(s.messageIds, s.provider, resurfaceAt);
      if (succeeded.length > 0) {
        await logAction(
          "snooze",
          `Snoozed ${succeeded.length} sender${succeeded.length === 1 ? "" : "s"} until ${new Date(resurfaceAt).toLocaleDateString()}`,
        );
      }
      const message = `Snoozed ${succeeded.length}, failed ${failed.length}, skipped ${unsupported.length}`;
      await scanAndRender();
      return message;
    });
  };

  const resetDeleteDomainsBulkSlot = () => {
    deleteDomainsBulkSlot.innerHTML = "";
    deleteDomainsBulkSlot.appendChild(bulkDeleteDomainsBtn);
  };

  bulkDeleteDomainsBtn.onclick = () => {
    const selected = currentDomainGroups.filter((g) => selectedDomainKeys.has(g.key));
    const merged = mergeDeletableIdsByProvider(selected);
    const deletable = totalDeletableAcrossGroups(selected);
    const protectedTotal = selected.reduce((sum, g) => sum + g.protectedCount, 0);
    const permanentSummary = describePermanentDelete(merged);
    const skipNote = protectedTotal > 0 ? ` (skips ${protectedTotal} protected)` : "";
    const summaryText = permanentSummary
      ? `${permanentSummary}${skipNote}`
      : protectedTotal > 0
        ? `Move ${deletable} to Trash across ${selected.length} domains, skip ${protectedTotal} protected?`
        : `Move ${deletable} to Trash across ${selected.length} domains?`;

    renderConfirmStep(deleteDomainsBulkSlot, resetDeleteDomainsBulkSlot, summaryText, true, async () => {
      const { message, undoableGmailIds } = await executeSmartDelete(merged);
      appendUndoButton(deleteDomainsBulkSlot, undoableGmailIds);
      await logAction(
        "trash",
        `Cleared ${deletable} across ${selected.length} domain${selected.length === 1 ? "" : "s"}`,
        undoableGmailIds.length > 0
          ? { provider: "gmail", ids: undoableGmailIds, via: "untrash" }
          : undefined,
      );
      return message;
    });
  };

  expiryCleanupBtn.onclick = () => {
    const merged = mergeExpiryBuckets(currentExpiryBuckets);
    const total = totalExpiryCount(currentExpiryBuckets);
    const summaryText = describePermanentDelete(merged) || `Move ${total} to Trash?`;

    renderConfirmStep(expiryCleanupSlot, resetExpiryCleanupSlot, summaryText, true, async () => {
      const { message, undoableGmailIds } = await executeSmartDelete(merged);
      chrome.action.setBadgeText({ text: "" }).catch(() => {});
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


  // ── Local engagement suggestions: mute all / trash all ──
  neverReadMuteBtn.onclick = () => {
    const targets = engagementSuggestions.filter(
      ({ sender }) => sender.provider === "gmail" && !ctx.settings.mutedSenders.includes(sender.address),
    );
    if (targets.length === 0) return;
    renderConfirmStep(
      neverReadMuteSlot,
      resetNeverReadSlots,
      `Mute ${targets.length} locally suggested sender${targets.length === 1 ? "" : "s"}, now and in future?`,
      false,
      async () => {
        const token = await gmailProvider.getAuthToken(false);
        const succeeded: Suggestion[] = [];
        for (const target of targets) {
          try {
            await gmailProvider.muteSender!(token, target.sender.address, target.safeMessageIds);
            succeeded.push(target);
          } catch (err) {
            log.error(err);
          }
        }
        ctx.settings = await mutateSettings((current) => ({
          ...current,
          mutedSenders: [
            ...new Set([...current.mutedSenders, ...succeeded.map(({ sender }) => sender.address)]),
          ],
          senderEngagement: recordEngagementFeedback(
            current.senderEngagement,
            succeeded.map(({ sender }) => sender.key),
            "accept",
          ),
        }));
        void learnFromFeedback(
          succeeded.map(({ sender }) => sender.key),
          "accept",
        );
        await logAction(
          "mute",
          `Muted ${succeeded.length} personalized suggestion${succeeded.length === 1 ? "" : "s"}`,
        );
        await scanAndRender();
        return `Muted ${succeeded.length}`;
      },
    );
  };

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
  spamSelectAllEl.onchange = () => {
    for (const box of spamCheckboxes()) box.checked = spamSelectAllEl.checked;
    updateSpamCount();
  };

  spamTrashBtn.onclick = () => {
    const selectedKeys = new Set(
      spamCheckboxes()
        .filter((c) => c.checked)
        .map((c) => c.dataset.key),
    );
    const chosen = spamSuggestions.filter((s) => selectedKeys.has(s.sender.key));
    if (chosen.length === 0) return;

    const idsByProvider = new Map<ProviderId, string[]>();
    for (const { sender } of chosen) {
      const list = idsByProvider.get(sender.provider) ?? [];
      list.push(...sender.messageIds);
      idsByProvider.set(sender.provider, list);
    }
    const total = [...idsByProvider.values()].reduce((n, ids) => n + ids.length, 0);
    const gmailIds = idsByProvider.get("gmail") ?? [];

    renderConfirmStep(
      spamTrashSlot,
      resetSpamSlot,
      `Move ${total} message${total === 1 ? "" : "s"} from ${chosen.length} suggested-spam sender${
        chosen.length === 1 ? "" : "s"
      } to Trash?`,
      true,
      async () => {
        await executeBulkDeleteDomains(idsByProvider, providerById);
        await logAction(
          "trash",
          `Trashed ${total} from ${chosen.length} suggested-spam sender${chosen.length === 1 ? "" : "s"}`,
          gmailIds.length > 0 ? { provider: "gmail", ids: gmailIds, via: "untrash" } : undefined,
        );
        await scanAndRender();
        return `Moved ${total} to Trash`;
      },
    );
  };
}

main().catch((err) => {
  log.error(err);
  const message =
    err instanceof Error
      ? err.message
      : typeof (err as { message?: unknown })?.message === "string"
        ? (err as { message: string }).message
        : "unknown error";
  statusEl.hidden = false;
  statusEl.innerHTML = "";
  const text = document.createElement("span");
  text.textContent = `Something went wrong (${message}). `;
  const reloadBtn = document.createElement("button");
  reloadBtn.textContent = "Reload";
  reloadBtn.onclick = () => location.reload();
  statusEl.append(text, reloadBtn);
});
