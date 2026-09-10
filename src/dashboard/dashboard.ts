import {
  executeBulkDeleteDomains,
  executeBulkKeepSorted,
  executeBulkSnooze,
  executeBulkUnsubscribe,
  mergeDeletableIdsByProvider,
  partitionForKeepSorted,
  partitionForSnooze,
  partitionForUnsubscribe,
  safeDomainGroupKeys,
  safeSenderKeys,
  totalDeletableAcrossGroups,
} from "../lib/bulkActions";
import { buildDigestInput, checkDigestAvailability, generateDigest } from "../lib/aiDigest";
import { checkMessageKindAiAvailability, classifyOtherSubjects } from "../lib/aiMessageKind";
import { DOMAIN_CATEGORY_LABELS, type DomainCategory } from "../lib/domainCategories";
import { buildDomainGroups, type DomainGroup } from "../lib/domainGrouping";
import {
  buildExpiryBuckets,
  mergeExpiryBuckets,
  totalExpiryCount,
  type ExpiryBucket,
} from "../lib/expiryTriage";
import { getElevatedAuthToken, GmailApiError } from "../lib/gmailApi";
import { clearMetadataCache, loadMetadataCache, saveMetadataCache } from "../lib/metadataCache";
import type { ProviderId } from "../lib/providers/emailProvider";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { outlookProvider } from "../lib/providers/outlookProvider";
import { OutlookReauthRequired } from "../lib/providers/msalAuth";
import { buildSenderSummaries, type SenderSummary } from "../lib/senderModel";
import {
  getSettings,
  mutateSettings,
  updateSettings,
  type ClusterSettings,
} from "../lib/settingsStore";
import { activeProviders, ctx, providerById, setBridge } from "./state";
import { maybeShowSeedCard, renderSortInbox, wireSortInbox } from "./sortInbox";
import { excludeSnoozedMessages } from "../lib/snoozeFilter";
import { resurfaceDueSnoozed } from "../lib/snoozeResurface";
import { ensureOriginsPermission, fireOneClickUnsubscribe } from "../lib/unsubscribe";
import { athenaOriginPatterns, getAthenaConfig } from "../lib/athenaIntegration";
import {
  buildEngagementSuggestions,
  recordEngagementFeedback,
  updateEngagementObservations,
  type EngagementFeedback,
  type EngagementSuggestion,
} from "../lib/engagementModel";
import { markFirstContact } from "../lib/firstContact";
import { log } from "../lib/log";
import {
  formatRelativeTime,
  groupByCategory,
  headerRow,
  pruneSelection,
  renderConfirmStep,
  type CategoryGroup,
} from "./ui";
import { reasonLabel, suggestSpamSenders, type SpamSuggestion } from "../lib/spamSuggestions";
import { spamListSize } from "../lib/spamList";
import {
  SMART_VIEWS,
  evaluateSmartView,
  smartViewMessageCount,
  smartViewSenderCount,
  type SmartView,
} from "../lib/smartViews";
import { keepNewestExcess } from "../lib/keepNewest";
import { appendUndoButton, logAction, renderRecentTab } from "./recentTab";
import { renderRulesTab, wireRulesTab } from "./rulesTab";
import { renderSecuritySection } from "./securityTab";
import { renderScreenerTab, wireScreenerTab } from "./screenerTab";
import {
  recordUnsubscribeRequests,
  renderSubscriptionsTab,
  wireSubscriptionsTab,
} from "./subscriptionsTab";
import { buildInboxHealth, inboxHealthScore, recordHealthSnapshot } from "../lib/inboxHealth";
import { senderTile, type TileSize } from "./senderTile";
import { neverReadSenders } from "../lib/neverRead";
import { createDurableJob, runDurableJob } from "../lib/durableJobs";
import { evaluateUnsubscribeOutcome } from "../lib/unsubscribeOutcome";

const selectedSenderKeys = new Set<string>();
const selectedDomainKeys = new Set<string>();
const selectedPlanGroups = new Set<string>();
let currentDomainGroups: DomainGroup[] = [];
let currentExpiryBuckets: ExpiryBucket[] = [];
let currentSecuritySenders: SenderSummary[] = [];
let engagementSuggestions: EngagementSuggestion[] = [];
const SECURITY_SCAN_WINDOW_DAYS = 30;
const SECURITY_SCAN_MAX_MESSAGES = 100;

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
const maxMessagesInput = document.getElementById("max-messages-input") as HTMLInputElement;
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
  cleanup: "suggested",
  security: "impersonation",
};
function resolveScreen(name: string): string {
  const target = SCREEN_ALIASES[name] ?? name;
  return navButtons.some((b) => b.dataset.screen === target) ? target : "overview";
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

  list?.addEventListener("keydown", (event) => {
    const keyed = event as KeyboardEvent;
    const delta =
      keyed.key === "ArrowDown" || keyed.key === "ArrowRight"
        ? 1
        : keyed.key === "ArrowUp" || keyed.key === "ArrowLeft"
          ? -1
          : 0;
    let next: number | undefined;
    if (delta !== 0) {
      const current = navButtons.findIndex((b) => b.getAttribute("aria-selected") === "true");
      next = (current + delta + navButtons.length) % navButtons.length;
    } else if (keyed.key === "Home") {
      next = 0;
    } else if (keyed.key === "End") {
      next = navButtons.length - 1;
    }
    if (next === undefined) return;
    keyed.preventDefault();
    const btn = navButtons[next];
    btn.focus();
    void selectScreen(btn.dataset.screen!);
  });

  seeAllSendersLink?.addEventListener("click", (event) => {
    event.preventDefault();
    void selectScreen("senders");
  });

  showScreen(ctx.settings.activeTab);
}

function setNavCount(screen: string, value: number) {
  const el = document.getElementById(`nav-count-${screen}`);
  if (!el) return;
  el.textContent = value > 0 ? String(value) : "";
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
  statusEl.textContent = "Connecting…";
  ctx.settings = await getSettings();
  applyTheme(ctx.settings.theme);
  wireThemeSelect();
  wireNav();
  wireAllSendersControls();
  fastDeleteToggle.checked = ctx.settings.fastPermanentDeleteEnabled;
  wireFastDeleteToggle();
  autoQuarantineToggle.checked = ctx.settings.autoQuarantineHighRisk;
  autoQuarantineToggle.onchange = async () => {
    ctx.settings = await updateSettings({ autoQuarantineHighRisk: autoQuarantineToggle.checked });
  };
  scanWindowInput.value = String(ctx.settings.scanWindowDays);
  maxMessagesInput.value = String(ctx.settings.maxMessagesPerProvider);
  wireScanSettings();
  await wireAthenaConnection();

  onboardingBanner.hidden = ctx.settings.onboardingDismissed;
  onboardingDismissBtn.onclick = async () => {
    onboardingBanner.hidden = true;
    ctx.settings = await updateSettings({ onboardingDismissed: true });
  };

  await gmailProvider.getAuthToken(true);
  resurfaceDueSnoozed(gmailProvider).catch((err) => log.error("Resurfacing snoozed mail failed", err));

  if (await outlookProvider.isConnected()) {
    activeProviders.push(outlookProvider);
    connectOutlookBtn.hidden = true;
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
  wireScreenerTab();
  wireOfflineHandling();
  wireRulesTab();
  // Rules render from settings, but the dry-run inside needs a scan; let
  // scanAndRender() below do the render so it isn't done twice on load.
  renderRecentTab();
  await wireDigest();
  await wireAiMessageKind();
  maybeShowSeedCard().catch((err) => log.error("seed-from-existing card failed", err));
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
    statusEl.textContent = "You're offline — reconnect to continue";
    setActionsDisabled(true);
  });

  window.addEventListener("online", () => {
    statusEl.hidden = true;
    setActionsDisabled(false);
    updateSenderBulkBar();
    updateDomainBulkBar();
  });
}

async function scanAndRender({ refresh = false }: { refresh?: boolean } = {}) {
  statusEl.hidden = false;
  senderGroupsEl.hidden = true;
  domainSectionEl.hidden = true;
  expirySectionEl.hidden = true;
  statusEl.textContent = "Scanning recent mail… the first run can take a minute.";

  let senders: SenderSummary[];
  let securitySenders: SenderSummary[];
  // One cache spanning both scans below, seeded from the warm cache persisted
  // by the last scan. The cleanup query (category:promotions OR updates, 180d)
  // and the security query (in:inbox, 30d) overlap on recent promotional mail;
  // the warm cache additionally spares re-fetching (20 quota units each) every
  // message that hasn't changed since a previous session. An explicit "Rescan"
  // passes refresh:true to drop the warm cache first.
  if (refresh) await clearMetadataCache();
  const scanCache = await loadMetadataCache();
  try {
    senders = await buildSenderSummaries(
      activeProviders,
      ctx.settings.maxMessagesPerProvider,
      ctx.settings.scanWindowDays,
      (done, total) => {
        statusEl.textContent =
          total > 0 ? `Scanning recent mail… ${done}/${total} messages` : "Scanning recent mail…";
      },
      "cleanup",
      scanCache,
    );
    statusEl.textContent = "Scanning recent Inbox mail for security…";
    securitySenders = await buildSenderSummaries(
      activeProviders,
      // The security lane only needs recent Inbox mail for threat signals —
      // capping it well below the cleanup limit keeps the two scans together
      // under Gmail's per-minute quota (the cache already dedupes the overlap).
      Math.min(ctx.settings.maxMessagesPerProvider, SECURITY_SCAN_MAX_MESSAGES),
      Math.min(ctx.settings.scanWindowDays, SECURITY_SCAN_WINDOW_DAYS),
      (done, total) => {
        statusEl.textContent =
          total > 0
            ? `Scanning recent Inbox mail for security… ${done}/${total} messages`
            : "Scanning recent Inbox mail for security…";
      },
      "security",
      scanCache,
    );
  } catch (err) {
    showScanError(err);
    return;
  }

  // Persist what we fetched so the next open only pays for new mail.
  void saveMetadataCache(scanCache);

  const activeSnoozedIds = new Set(
    Object.entries(ctx.settings.snoozedMessages)
      .filter(([, v]) => v.resurfaceAt > Date.now())
      .map(([id]) => id),
  );
  senders = excludeSnoozedMessages(senders, activeSnoozedIds);

  ctx.settings = await mutateSettings((current) => ({
    ...current,
    senderEngagement: updateEngagementObservations(current.senderEngagement, senders),
  }));

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

  currentSecuritySenders = securitySenders;
  renderOverview(senders, securitySenders);
  render(senders);
  renderAllSenders(senders);
  renderRulesTab();
  renderDomainGroups(senders);
  renderExpirySection(senders);
  renderSecuritySection(securitySenders);
  renderSubscriptionsTab(senders);
  renderNeverReadSection(senders);
  renderSpamSection(senders);
  // The v3 "Your cleanup plan" list (renderCleanupPlan) is the primary
  // surface for these three; their detailed sections are collapsed by default
  // and only opened via a row's "Review" button (revealLegacySection).
  neverReadSectionEl.hidden = true;
  spamSectionEl.hidden = true;
  expirySectionEl.hidden = true;
  renderSortInbox(senders);
  renderSmartViews(senders);
  renderScreenerTab(senders);
  updateNavCounts(senders, securitySenders);
  generateDigestBtn.disabled = false;
}

function updateNavCounts(senders: SenderSummary[], securitySenders: SenderSummary[]) {
  const health = buildInboxHealth({ senders, securitySenders, settings: ctx.settings });
  const byId = new Map(health.metrics.map((m) => [m.id, m.value]));
  setNavCount(
    "suggested",
    (byId.get("ready-to-clean-up") ?? 0) +
      (byId.get("never-opened") ?? 0) +
      (byId.get("suspected-spam") ?? 0),
  );
  setNavCount("senders", senders.length);
  setNavCount("subscriptions", byId.get("unsubscribe-capable") ?? 0);
  setNavCount("impersonation", byId.get("flagged-senders") ?? 0);
  setNavCount("rules", ctx.settings.rules.length);
  setNavCount("screener", byId.get("screener-queue") ?? 0);
}

// ── Overview screen (v3) ────────────────────────────────────────────────
// A landing screen with two glass cards (what's waiting / inbox-health score +
// 12-week trend), a "needs a person" list of the things Cluster won't decide
// alone, a "working while you were away" summary, and a Recently-done preview.
// Every number is deterministic and already computed elsewhere.
const ICON_WARNING =
  '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M10 5.6v5M10 13.6h.01"></path><circle cx="10" cy="10" r="7"></circle></svg>';
const ICON_SEARCH =
  '<svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.4"></circle><path d="M13 13l4 4"></path></svg>';
const ICON_UP =
  '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9.5V2.5M3 5.5 6 2.5l3 3"></path></svg>';
const ICON_DOWN =
  '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2.5v7M3 6.5 6 9.5l3-3"></path></svg>';

function makeCard(sectionLabel: string): HTMLDivElement {
  const card = document.createElement("div");
  card.className = "glass-card";
  const label = document.createElement("div");
  label.className = "section-label";
  label.textContent = sectionLabel;
  card.appendChild(label);
  return card;
}

/** A "needs a person" style row: tile + title/sub + one action button. */
function makeNeedsRow(
  tile: HTMLElement,
  title: string,
  sub: string,
  actionLabel: string,
  actionClass: string,
  onAction: () => void,
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "list-row";
  row.style.gridTemplateColumns = "34px minmax(0,1fr) max-content";
  const text = document.createElement("div");
  text.className = "row-title-wrap";
  const t = document.createElement("div");
  t.className = "row-title";
  t.style.whiteSpace = "normal";
  t.textContent = title;
  const s = document.createElement("div");
  s.className = "row-sub wrap";
  s.textContent = sub;
  text.append(t, s);
  const btn = document.createElement("button");
  btn.className = actionClass;
  btn.textContent = actionLabel;
  btn.onclick = onAction;
  row.append(tile, text, btn);
  return row;
}

function renderOverview(senders: SenderSummary[], securitySenders: SenderSummary[]) {
  const health = buildInboxHealth({ senders, securitySenders, settings: ctx.settings });
  const byId = new Map(health.metrics.map((m) => [m.id, m.value]));
  overviewHeadlineEl.textContent = `Scanned ${health.scannedSenders} sender${
    health.scannedSenders === 1 ? "" : "s"
  } · ${health.scannedMessages} message${health.scannedMessages === 1 ? "" : "s"}`;

  const expiryTotal = totalExpiryCount(buildExpiryBuckets(senders));
  const spamMsgs = suggestSpamSenders(senders).reduce((n, s) => n + s.messageCount, 0);
  const neverReadMsgs = buildEngagementSuggestions(senders, ctx.settings.senderEngagement).reduce(
    (n, s) => n + s.safeMessageIds.length,
    0,
  );
  const planTotal = expiryTotal + spamMsgs + neverReadMsgs;
  const planGroups = [expiryTotal, spamMsgs, neverReadMsgs].filter((n) => n > 0).length;

  overviewContentEl.innerHTML = "";
  const stack = document.createElement("div");
  stack.className = "stack";

  // ── Two-up: "Ready when you are" + "Inbox health" ──
  const topGrid = document.createElement("div");
  topGrid.className = "two-up";

  const readyCard = makeCard("Ready when you are");
  const readyBody = document.createElement("div");
  const heroLine = document.createElement("div");
  heroLine.style.display = "flex";
  heroLine.style.alignItems = "baseline";
  heroLine.style.gap = "10px";
  heroLine.style.flexWrap = "wrap";
  const hero = document.createElement("span");
  hero.className = "metric-hero";
  hero.textContent = planTotal.toLocaleString();
  const heroCap = document.createElement("span");
  heroCap.className = "row-sub";
  heroCap.style.color = "var(--label-2)";
  heroCap.textContent = `messages across ${planGroups || 0} group${planGroups === 1 ? "" : "s"}`;
  heroLine.append(hero, heroCap);
  const explain = document.createElement("p");
  explain.className = "row-sub wrap";
  explain.style.margin = "12px 0 0";
  explain.style.maxWidth = "40ch";
  explain.textContent =
    "A few minutes of decisions. Everything stays reversible for 30 days.";
  readyBody.append(heroLine, explain);
  const readyActions = document.createElement("div");
  readyActions.style.display = "flex";
  readyActions.style.gap = "12px";
  readyActions.style.alignItems = "center";
  readyActions.style.flexWrap = "wrap";
  readyActions.style.marginTop = "auto";
  const startBtn = document.createElement("button");
  startBtn.className = "btn-accent-solid";
  startBtn.textContent = "Start cleanup";
  startBtn.onclick = () => void selectScreen("suggested");
  const reviewLink = document.createElement("a");
  reviewLink.href = "#";
  reviewLink.textContent = "Review suggestions";
  reviewLink.onclick = (e) => {
    e.preventDefault();
    void selectScreen("suggested");
  };
  readyActions.append(startBtn, reviewLink);
  readyCard.append(readyBody, readyActions);

  // ── Inbox health ──
  const score = inboxHealthScore(senders);
  const history = ctx.settings.healthHistory;
  const prev = history.length >= 2 ? history[history.length - 2].score : undefined;
  const delta = prev === undefined ? undefined : score - prev;

  const healthCard = makeCard("Inbox health");
  const healthHead = healthCard.firstElementChild as HTMLElement;
  healthHead.style.display = "flex";
  healthHead.style.alignItems = "center";
  healthHead.style.gap = "10px";
  if (delta !== undefined && delta !== 0) {
    const spacer = document.createElement("span");
    spacer.style.flex = "1";
    const deltaPill = document.createElement("span");
    deltaPill.className = `pill ${delta > 0 ? "success" : "danger"}`;
    deltaPill.innerHTML = `${delta > 0 ? ICON_UP : ICON_DOWN}${Math.abs(delta)}`;
    healthHead.append(spacer, deltaPill);
  }
  const scoreLine = document.createElement("div");
  scoreLine.style.display = "flex";
  scoreLine.style.alignItems = "baseline";
  scoreLine.style.gap = "8px";
  const scoreN = document.createElement("span");
  scoreN.className = "metric-hero";
  scoreN.textContent = String(score);
  const scoreCap = document.createElement("span");
  scoreCap.className = "row-sub";
  scoreCap.style.color = "var(--label-2)";
  scoreCap.textContent = "of 100";
  scoreLine.append(scoreN, scoreCap);
  healthCard.appendChild(scoreLine);

  const points = [...history.map((h) => h.score)];
  if (points.length >= 2) {
    const trendWrap = document.createElement("div");
    const trend = document.createElement("div");
    trend.className = "trend";
    trend.setAttribute("role", "img");
    const first = points[0];
    const last = points[points.length - 1];
    const dir = last > first ? "up" : last < first ? "down" : "flat";
    trend.setAttribute(
      "aria-label",
      `Inbox health over the last ${points.length} weeks: ${first} to ${last}, trending ${dir}.`,
    );
    points.forEach((p, i) => {
      const bar = document.createElement("span");
      bar.className = i === points.length - 1 ? "peak" : "on";
      bar.style.height = `${Math.max(8, Math.min(100, p))}%`;
      trend.appendChild(bar);
    });
    const axis = document.createElement("div");
    axis.className = "trend-axis";
    axis.innerHTML = `<span>${points.length} weeks ago</span><span>This week</span>`;
    trendWrap.append(trend, axis);
    healthCard.appendChild(trendWrap);
  } else {
    const soon = document.createElement("p");
    soon.className = "row-sub wrap";
    soon.style.margin = "0";
    soon.textContent = "The 12-week trend fills in as you keep using Cluster — check back next week.";
    healthCard.appendChild(soon);
  }
  const healthFoot = document.createElement("p");
  healthFoot.className = "recent-detail";
  healthFoot.style.margin = "auto 0 0";
  healthFoot.textContent = "Unread ratio, sender count and subscription load.";
  healthCard.appendChild(healthFoot);

  topGrid.append(readyCard, healthCard);
  stack.appendChild(topGrid);

  // ── Needs a person ──
  const flagged = byId.get("flagged-senders") ?? 0;
  const screenerQ = byId.get("screener-queue") ?? 0;
  if (flagged > 0 || screenerQ > 0) {
    const wrap = document.createElement("div");
    const head = document.createElement("div");
    head.className = "section-head";
    const h2 = document.createElement("h2");
    h2.className = "section-label";
    h2.textContent = "Needs a person";
    const cnt = document.createElement("span");
    cnt.className = "muted";
    const items = (flagged > 0 ? 1 : 0) + (screenerQ > 0 ? 1 : 0);
    cnt.textContent = `${items} item${items === 1 ? "" : "s"} Cluster won't decide for you`;
    head.append(h2, cnt);
    const list = document.createElement("div");
    list.className = "grouped-list";
    const rows: HTMLElement[] = [];
    if (flagged > 0) {
      const tile = document.createElement("span");
      tile.className = "tile-danger";
      tile.innerHTML = ICON_WARNING;
      rows.push(
        makeNeedsRow(
          tile,
          `${flagged} sender${flagged === 1 ? "" : "s"} may be impersonating people you know`,
          "Display name matches a known contact, the domain does not.",
          "Inspect",
          "btn btn-danger",
          () => void selectScreen("impersonation"),
        ),
      );
    }
    if (screenerQ > 0) {
      const tile = document.createElement("span");
      tile.className = "tile-neutral";
      tile.innerHTML = ICON_SEARCH;
      rows.push(
        makeNeedsRow(
          tile,
          `${screenerQ} first-time sender${screenerQ === 1 ? "" : "s"} waiting in the screener`,
          "Held out of the inbox until you decide — they are not told.",
          "Screen now",
          "btn btn-accent",
          () => void selectScreen("screener"),
        ),
      );
    }
    rows.forEach((row, i) => {
      if (i > 0) {
        const sep = document.createElement("div");
        sep.className = "row-sep";
        sep.style.marginLeft = "66px";
        list.appendChild(sep);
      }
      list.appendChild(row);
    });
    wrap.append(head, list);
    stack.appendChild(wrap);
  }

  // ── Bottom two-up: "Working while you were away" + "Recently done" ──
  const bottomGrid = document.createElement("div");
  bottomGrid.className = "two-up";

  const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
  const recentLog = ctx.settings.actionLog.filter((e) => !e.undone);
  const filedByRules = recentLog
    .filter((e) => Date.now() - e.at < MONTH_MS && ["rule", "sort", "keepSorted"].includes(e.kind))
    .reduce((n, e) => n + (e.undo?.ids.length ?? 0), 0);
  const mutedCount = ctx.settings.mutedSenders.length;
  const cleanupsDone = recentLog.filter(
    (e) => Date.now() - e.at < MONTH_MS && ["trash", "archive"].includes(e.kind),
  ).length;

  const awayEntries: Array<[string, string]> = [];
  if (filedByRules > 0)
    awayEntries.push([filedByRules.toLocaleString(), "messages filed by your rules this month"]);
  if (mutedCount > 0)
    awayEntries.push([String(mutedCount), `sender${mutedCount === 1 ? "" : "s"} muted and staying quiet`]);
  if (cleanupsDone > 0)
    awayEntries.push([String(cleanupsDone), `cleanup${cleanupsDone === 1 ? "" : "s"} done this month`]);

  if (awayEntries.length > 0) {
    const wrap = document.createElement("div");
    const head = document.createElement("div");
    head.className = "section-head";
    head.innerHTML = '<h2 class="section-label">Working while you were away</h2>';
    const list = document.createElement("div");
    list.className = "grouped-list";
    awayEntries.forEach(([n, t], i) => {
      if (i > 0) {
        const sep = document.createElement("div");
        sep.className = "row-sep";
        sep.style.marginLeft = "18px";
        list.appendChild(sep);
      }
      const line = document.createElement("div");
      line.className = "metric-line";
      const nEl = document.createElement("span");
      nEl.className = "n";
      nEl.textContent = n;
      const tEl = document.createElement("span");
      tEl.className = "t";
      tEl.textContent = t;
      line.append(nEl, tEl);
      list.appendChild(line);
    });
    wrap.append(head, list);
    bottomGrid.appendChild(wrap);
  }

  // Recently done preview
  const recentWrap = document.createElement("div");
  const recentHead = document.createElement("div");
  recentHead.className = "section-head";
  recentHead.innerHTML =
    '<h2 class="section-label">Recently done</h2><span class="spacer"></span>';
  const fullLink = document.createElement("a");
  fullLink.href = "#";
  fullLink.textContent = "Full history";
  fullLink.onclick = (e) => {
    e.preventDefault();
    void selectScreen("recent");
  };
  recentHead.appendChild(fullLink);
  const recentList = document.createElement("div");
  recentList.className = "grouped-list";
  const recentEntries = [...ctx.settings.actionLog].reverse().slice(0, 3);
  if (recentEntries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "list-row";
    empty.textContent = "Nothing done yet.";
    recentList.appendChild(empty);
  } else {
    recentEntries.forEach((entry, i) => {
      if (i > 0) {
        const sep = document.createElement("div");
        sep.className = "row-sep";
        sep.style.marginLeft = "18px";
        recentList.appendChild(sep);
      }
      const row = document.createElement("div");
      row.className = "list-row";
      row.style.gridTemplateColumns = "minmax(0,1fr) max-content";
      const text = document.createElement("div");
      text.className = "row-title-wrap";
      const line = document.createElement("div");
      line.className = "recent-line";
      const firstSpace = entry.summary.indexOf(" ");
      if (firstSpace > 0) {
        const verb = document.createElement("span");
        verb.className = "recent-verb";
        verb.textContent = entry.summary.slice(0, firstSpace);
        line.append(verb, document.createTextNode(entry.summary.slice(firstSpace)));
      } else {
        line.textContent = entry.summary;
      }
      const detail = document.createElement("div");
      detail.className = "recent-detail";
      detail.textContent =
        formatRelativeTime(entry.at) + (entry.undone ? " · undone" : "");
      text.append(line, detail);
      const btn = document.createElement("button");
      btn.className = "btn btn-sm";
      btn.textContent = entry.undo && !entry.undone ? "Undo" : "View";
      btn.onclick = () => void selectScreen("recent");
      row.append(text, btn);
      recentList.appendChild(row);
    });
  }
  recentWrap.append(recentHead, recentList);
  bottomGrid.appendChild(recentWrap);

  stack.appendChild(bottomGrid);
  overviewContentEl.appendChild(stack);
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

function renderCategoryGroups<T>(
  container: HTMLElement,
  groups: CategoryGroup<T>[],
  headers: string[],
  buildRow: (item: T) => HTMLTableRowElement,
  itemNoun: string,
  collapseSettingsKey: CollapseSettingsKey,
) {
  container.innerHTML = "";
  for (const group of groups) {
    const details = document.createElement("details");
    details.className = "category-group";
    details.open = !ctx.settings[collapseSettingsKey].includes(group.category);

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
    caption.textContent = `${DOMAIN_CATEGORY_LABELS[group.category]} — ${group.items.length} ${itemNoun}, ${group.total} messages`;
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
      for (const item of group.items) tbody.appendChild(buildRow(item));
      rowsBuilt = true;
    };
    if (details.open) buildRows();
    details.addEventListener("toggle", () => {
      toggleCollapsedCategory(collapseSettingsKey, group.category, !details.open);
      if (details.open) buildRows();
    });

    container.appendChild(details);
  }
}

// ── Sender table ─────────────────────────────────────────────────────────
// ── Suggested cleanup: metric band ─────────────────────────────────────
function renderSuggestedMetricBand(senders: SenderSummary[]) {
  const band = document.getElementById("suggested-metric-band");
  if (!band) return;
  const expiryTotal = totalExpiryCount(buildExpiryBuckets(senders));
  const spamMsgs = suggestSpamSenders(senders).reduce((n, s) => n + s.messageCount, 0);
  const neverReadMsgs = buildEngagementSuggestions(senders, ctx.settings.senderEngagement).reduce(
    (n, s) => n + s.safeMessageIds.length,
    0,
  );
  const planTotal = expiryTotal + spamMsgs + neverReadMsgs;
  const scanned = senders.reduce((n, s) => n + s.count, 0);
  const pct = scanned > 0 ? Math.round((planTotal / scanned) * 100) : 0;
  const unsub = senders.filter((s) => hasAnyUnsubscribe(s.unsubscribe)).length;
  const flagged = currentSecuritySenders.filter((s) => s.threatSignals.length > 0).length;

  band.className = "metric-band";
  band.innerHTML = "";
  const heroWrap = document.createElement("div");
  heroWrap.style.flex = "none";
  const heroLine = document.createElement("div");
  heroLine.style.display = "flex";
  heroLine.style.alignItems = "baseline";
  heroLine.style.gap = "10px";
  heroLine.style.flexWrap = "wrap";
  const hero = document.createElement("span");
  hero.className = "metric-hero";
  hero.textContent = planTotal.toLocaleString();
  const pctPill = document.createElement("span");
  pctPill.className = "pill accent";
  pctPill.textContent = `${pct}% of scan`;
  heroLine.append(hero, pctPill);
  const heroCap = document.createElement("div");
  heroCap.className = "row-sub";
  heroCap.style.color = "var(--label-2)";
  heroCap.style.marginTop = "8px";
  heroCap.textContent = "messages ready to clean up";
  heroWrap.append(heroLine, heroCap);
  band.appendChild(heroWrap);

  const divider = document.createElement("div");
  divider.className = "divider";
  band.appendChild(divider);

  const secondary: Array<[number, string, boolean]> = [
    [senders.length, "senders scanned", false],
    [unsub, "can unsubscribe", false],
    [flagged, "flagged senders", true],
  ];
  for (const [n, cap, danger] of secondary) {
    const cell = document.createElement("div");
    cell.className = danger ? "metric-secondary danger" : "metric-secondary";
    cell.style.flex = "none";
    const nEl = document.createElement("div");
    nEl.className = "n";
    nEl.textContent = String(n);
    const capEl = document.createElement("div");
    capEl.className = "cap";
    capEl.textContent = cap;
    cell.append(nEl, capEl);
    band.appendChild(cell);
  }
}

// ── Suggested cleanup: "Your cleanup plan" (3 grouped decisions) ────────
function renderCleanupPlan(senders: SenderSummary[]) {
  const list = document.getElementById("cleanup-plan-list");
  const countEl = document.getElementById("cleanup-plan-count");
  if (!list) return;

  const expiryBuckets = buildExpiryBuckets(senders);
  const expiryCount = totalExpiryCount(expiryBuckets);
  const engagement = buildEngagementSuggestions(senders, ctx.settings.senderEngagement);
  const neverMsgs = engagement.reduce((n, s) => n + s.safeMessageIds.length, 0);
  const spam = suggestSpamSenders(senders);
  const spamMsgs = spam.reduce((n, s) => n + s.messageCount, 0);

  type PlanRow = {
    id: string;
    checked: boolean;
    title: string;
    sub: string;
    badge?: string;
    primaryLabel: string;
    primaryClass: string;
    onPrimary: () => void;
    showReview: boolean;
    reviewTarget: string;
    stack?: SenderSummary[];
  };
  const rows: PlanRow[] = [];

  if (engagement.length > 0) {
    rows.push({
      id: "never-opened",
      checked: true,
      title: `${engagement.length} sender${engagement.length === 1 ? "" : "s"} you have never opened`,
      sub: `${neverMsgs} message${neverMsgs === 1 ? "" : "s"}, none opened recently · muting files them out without deleting`,
      primaryLabel: "Mute all",
      primaryClass: "btn btn-accent",
      onPrimary: () => neverReadMuteBtn.click(),
      showReview: true,
      reviewTarget: "never-read-section",
      stack: engagement.map((e) => e.sender),
    });
  }
  if (expiryCount > 0) {
    rows.push({
      id: "expired",
      checked: true,
      title: `${expiryCount} one-time code${expiryCount === 1 ? "" : "s"} and stale mail past their use`,
      sub: expiryBuckets.map((b) => `${b.count} ${b.label.toLowerCase()}`).join(", ") + " · judged by age alone",
      primaryLabel: "Trash",
      primaryClass: "btn btn-accent",
      onPrimary: () => expiryCleanupBtn.click(),
      showReview: true,
      reviewTarget: "expiry-section",
    });
  }
  if (spam.length > 0) {
    rows.push({
      id: "spam",
      checked: false,
      title: `${spam.length} sender${spam.length === 1 ? "" : "s"} on a spam or throwaway list`,
      sub: `${spamMsgs} message${spamMsgs === 1 ? "" : "s"} · off by default, because a public list is a signal, not proof`,
      badge: "Needs review",
      primaryLabel: `Review ${spam.length}`,
      primaryClass: "btn btn-danger",
      onPrimary: () => revealLegacySection("spam-section"),
      showReview: false,
      reviewTarget: "spam-section",
    });
  }

  list.innerHTML = "";
  if (countEl) countEl.textContent = `${rows.length} group${rows.length === 1 ? "" : "s"} · one action each`;
  const suggestedWrap = document.getElementById("suggested-actions-section") as HTMLElement;
  if (suggestedWrap) suggestedWrap.hidden = rows.length === 0;
  if (rows.length === 0) return;

  rows.forEach((r, i) => {
    if (i > 0) {
      const sep = document.createElement("div");
      sep.className = "row-sep";
      sep.style.marginLeft = "56px";
      list.appendChild(sep);
    }
    const row = document.createElement("div");
    row.className = "list-row";
    row.style.gridTemplateColumns = "22px minmax(0,1fr) max-content";

    const cbLabel = document.createElement("label");
    cbLabel.className = "check-label";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "check";
    cb.checked = r.checked;
    cb.dataset.planGroup = r.id;
    cb.setAttribute("aria-label", `Include ${r.title}`);
    cb.onchange = () => renderSuggestedFloatingBar();
    if (r.checked) selectedPlanGroups.add(r.id);
    cbLabel.appendChild(cb);

    const text = document.createElement("div");
    text.className = "row-title-wrap";
    const titleWrap = document.createElement("div");
    titleWrap.style.display = "flex";
    titleWrap.style.alignItems = "center";
    titleWrap.style.gap = "9px";
    titleWrap.style.flexWrap = "wrap";
    const title = document.createElement("span");
    title.className = "row-title";
    title.style.whiteSpace = "normal";
    title.textContent = r.title;
    titleWrap.appendChild(title);
    if (r.badge) {
      const badge = document.createElement("span");
      badge.className = "pill danger";
      badge.textContent = r.badge;
      titleWrap.appendChild(badge);
    }
    const sub = document.createElement("div");
    sub.className = "row-sub wrap";
    sub.textContent = r.sub;
    text.append(titleWrap, sub);
    if (r.stack && r.stack.length > 0) {
      const stackRow = document.createElement("div");
      stackRow.style.display = "flex";
      stackRow.style.alignItems = "center";
      stackRow.style.gap = "10px";
      stackRow.style.marginTop = "10px";
      const stack = document.createElement("span");
      stack.className = "favicon-stack";
      r.stack.slice(0, 4).forEach((s) => stack.appendChild(makeLogoTile(s, "sz-26")));
      stackRow.appendChild(stack);
      if (r.stack.length > 4) {
        const more = document.createElement("span");
        more.className = "row-sub";
        more.textContent = `+${r.stack.length - 4} more`;
        stackRow.appendChild(more);
      }
      text.appendChild(stackRow);
    }

    const actions = document.createElement("div");
    actions.className = "row-actions";
    const primary = document.createElement("button");
    primary.className = r.primaryClass;
    primary.textContent = r.primaryLabel;
    primary.onclick = r.onPrimary;
    actions.appendChild(primary);
    if (r.showReview) {
      const review = document.createElement("button");
      review.className = "btn";
      review.textContent = "Review";
      review.onclick = () => revealLegacySection(r.reviewTarget);
      actions.appendChild(review);
    }

    row.append(cbLabel, text, actions);
    list.appendChild(row);
  });
  renderSuggestedFloatingBar();
}

function revealLegacySection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.hidden = false;
  el.closest("details")?.setAttribute("open", "");
  const moreTools = document.getElementById("more-tools");
  if (moreTools && el.closest("#more-tools")) moreTools.setAttribute("open", "");
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Suggested cleanup: "Senders worth a decision" ──────────────────────
type PrimaryAct = "unsubscribe" | "mute" | "keepSorted";

function decisionReason(sender: SenderSummary): string {
  const unread = sender.messages.filter((m) => m.unread).length;
  const base =
    unread === sender.count
      ? `nothing opened of ${sender.count}`
      : `${unread} unread of ${sender.count}`;
  if (sender.unsubscribe.postUrl) return `${base} · verified one-click unsubscribe`;
  if (sender.firstContact) return `${base} · new since Cluster started tracking`;
  return base;
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

function pickDecisionSenders(senders: SenderSummary[]): { decide: SenderSummary[]; protectedOne?: SenderSummary } {
  const engagementKeys = new Set(
    buildEngagementSuggestions(senders, ctx.settings.senderEngagement).map((s) => s.sender.key),
  );
  const eligible = senders.filter((s) => s.protectedMessageIds.length === 0);
  const ranked = [...eligible].sort((a, b) => {
    const aEng = engagementKeys.has(a.key) ? 1 : 0;
    const bEng = engagementKeys.has(b.key) ? 1 : 0;
    if (aEng !== bEng) return bEng - aEng;
    const aScore = (a.messages.filter((m) => m.unread).length / Math.max(1, a.count)) * Math.log2(a.count + 1);
    const bScore = (b.messages.filter((m) => m.unread).length / Math.max(1, b.count)) * Math.log2(b.count + 1);
    return bScore - aScore;
  });
  const protectedOne = senders
    .filter((s) => s.protectedMessageIds.length > 0)
    .sort((a, b) => b.count - a.count)[0];
  return { decide: ranked.slice(0, 8), protectedOne };
}

function render(senders: SenderSummary[]) {
  ctx.senders = senders;
  pruneSelection(
    selectedSenderKeys,
    senders.map((s) => s.key),
  );
  renderSuggestedMetricBand(senders);
  renderCleanupPlan(senders);
  renderDecisionSenders(senders);
  updateSenderBulkBar();
  renderSuggestedFloatingBar();
}

function renderDecisionSenders(senders: SenderSummary[]) {
  const { decide, protectedOne } = pickDecisionSenders(senders);
  const countEl = document.getElementById("worth-decision-count");
  if (countEl) countEl.textContent = `${decide.length} of ${senders.length} · highest fit first`;

  senderGroupsEl.innerHTML = "";
  const list = document.createElement("div");
  list.className = "grouped-list";

  // Header row
  const hdr = document.createElement("div");
  hdr.className = "list-row";
  hdr.style.gridTemplateColumns = "22px minmax(0,1fr) max-content";
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
    renderSuggestedFloatingBar();
  };
  hdrLabel.appendChild(selectAll);
  const hdrCount = document.createElement("span");
  hdrCount.className = "row-sub";
  hdrCount.style.color = "var(--label-2)";
  const selCount = decide.filter((s) => selectedSenderKeys.has(s.key)).length;
  hdrCount.textContent = `${selCount} of ${decide.length} selected`;
  const hdrNote = document.createElement("span");
  hdrNote.className = "recent-detail";
  hdrNote.textContent = "Starred mail is always skipped";
  hdr.append(hdrLabel, hdrCount, hdrNote);
  list.appendChild(hdr);

  for (const sender of decide) {
    const sep = document.createElement("div");
    sep.className = "row-sep";
    sep.style.marginLeft = "56px";
    list.appendChild(sep);
    list.appendChild(buildDecisionRow(sender, senders));
  }

  if (protectedOne) {
    const sep = document.createElement("div");
    sep.className = "row-sep";
    sep.style.marginLeft = "56px";
    list.appendChild(sep);
    const row = document.createElement("div");
    row.className = "list-row protected-row";
    row.style.gridTemplateColumns = "22px minmax(0,1fr) max-content";
    const cbLabel = document.createElement("label");
    cbLabel.className = "check-label";
    cbLabel.style.cursor = "default";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "check";
    cb.disabled = true;
    cb.setAttribute("aria-label", `${protectedOne.displayName || protectedOne.address} is protected`);
    cbLabel.appendChild(cb);
    const media = document.createElement("div");
    media.className = "row-media";
    const tile = makeLogoTile(protectedOne, "sz-34");
    tile.classList.add("dim");
    media.appendChild(tile);
    const text = document.createElement("div");
    text.className = "row-title-wrap";
    const t = document.createElement("div");
    t.className = "row-title";
    t.textContent = protectedOne.displayName || protectedOne.address;
    const s = document.createElement("div");
    s.className = "row-sub";
    s.textContent = `${protectedOne.protectedMessageIds.length} starred of ${protectedOne.count} · excluded entirely`;
    text.append(t, s);
    media.appendChild(text);
    const chip = document.createElement("span");
    chip.className = "pill dashed";
    chip.textContent = "Protected";
    row.append(cbLabel, media, chip);
    list.appendChild(row);
  }

  senderGroupsEl.appendChild(list);
}

function buildDecisionRow(sender: SenderSummary, allSenders: SenderSummary[]): HTMLDivElement {
  const wrap = document.createElement("div");

  const row = document.createElement("div");
  row.className = "list-row";
  row.style.gridTemplateColumns = "22px minmax(0,1fr) max-content";

  const cbLabel = document.createElement("label");
  cbLabel.className = "check-label";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "check";
  cb.dataset.senderKey = sender.key;
  cb.checked = selectedSenderKeys.has(sender.key);
  cb.setAttribute("aria-label", `Select ${sender.displayName || sender.address}`);
  cb.onchange = () => {
    if (cb.checked) selectedSenderKeys.add(sender.key);
    else selectedSenderKeys.delete(sender.key);
    updateSenderBulkBar();
    renderSuggestedFloatingBar();
  };
  cbLabel.appendChild(cb);

  const media = document.createElement("div");
  media.className = "row-media";
  media.appendChild(makeLogoTile(sender, "sz-34"));
  const text = document.createElement("div");
  text.className = "row-title-wrap";
  const name = document.createElement("div");
  name.className = "row-title";
  name.textContent = sender.displayName || sender.address;
  const reason = document.createElement("div");
  reason.className = "row-sub";
  reason.textContent = decisionReason(sender);
  text.append(name, reason);
  media.appendChild(text);

  const actions = document.createElement("div");
  actions.className = "row-actions";
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

  actions.append(primary, ellipsis);
  row.append(cbLabel, media, actions);
  wrap.append(row, disclosure);
  return wrap;
}

// ── Mute (local BlackHole) ───────────────────────────────────────────────
// A standing from:<address> filter hiding all mail from this sender, now and
// future — independent of whether they honour unsubscribe. Gmail-only.
function buildMuteCell(sender: SenderSummary): HTMLDivElement {
  const cell = document.createElement("div");
  const provider = providerById.get(sender.provider);
  if (!provider?.muteSender) {
    cell.textContent = "—";
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
        const token = await provider.getAuthToken(false);
        await provider.muteSender!(token, sender.address, sender.messageIds);
        ctx.settings = await mutateSettings((current) => ({
          ...current,
          mutedSenders: [...new Set([...current.mutedSenders, sender.address])],
          senderEngagement: recordEngagementFeedback(current.senderEngagement, [sender.key], "accept"),
        }));
        await logAction("mute", `Muted ${sender.address}`, {
          provider: sender.provider,
          ids: sender.messageIds,
          via: "unmute",
          fromAddress: sender.address,
          senderKeys: [sender.key],
        });
        return "Muted ✓";
      },
    );
  };

  cell.appendChild(btn);
  return cell;
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

// ── Suggested cleanup: sticky floating action bar ──────────────────────
// Reflects the checked "cleanup plan" groups plus the count of senders ticked
// in "Senders worth a decision". "Apply plan" runs the checked plan groups
// (each delegates to its existing bulk-action confirm); per-sender actions
// stay on the row and in the All-senders bulk bar.
function renderSuggestedFloatingBar() {
  const host = document.getElementById("suggested-floating-bar");
  if (!host) return;
  const planBoxes = Array.from(
    document.querySelectorAll<HTMLInputElement>("#cleanup-plan-list input[data-plan-group]"),
  );
  const checkedGroups = planBoxes.filter((b) => b.checked);
  selectedPlanGroups.clear();
  for (const b of checkedGroups) selectedPlanGroups.add(b.dataset.planGroup!);
  const senderCount = selectedSenderKeys.size;

  if (checkedGroups.length === 0 && senderCount === 0) {
    host.className = "";
    host.innerHTML = "";
    return;
  }

  host.className = "floating-bar";
  host.innerHTML = "";
  const bar = document.createElement("div");

  const title = document.createElement("span");
  title.className = "fb-title";
  const parts: string[] = [];
  if (checkedGroups.length > 0)
    parts.push(`${checkedGroups.length} group${checkedGroups.length === 1 ? "" : "s"}`);
  if (senderCount > 0) parts.push(`${senderCount} sender${senderCount === 1 ? "" : "s"}`);
  title.textContent = parts.join(" · ");

  const sub = document.createElement("span");
  sub.className = "fb-sub";
  sub.textContent = "nothing permanent — everything here is reversible";

  const clear = document.createElement("button");
  clear.className = "btn btn-ghost";
  clear.textContent = "Clear";
  clear.onclick = () => {
    for (const b of planBoxes) b.checked = false;
    selectedSenderKeys.clear();
    render(ctx.senders);
  };

  const apply = document.createElement("button");
  apply.className = "btn-accent-solid";
  apply.textContent = "Apply plan";
  apply.disabled = checkedGroups.length === 0;
  apply.onclick = () => {
    const groups = new Set(selectedPlanGroups);
    if (groups.has("never-opened")) neverReadMuteBtn.click();
    if (groups.has("expired")) expiryCleanupBtn.click();
    if (groups.has("spam")) revealLegacySection("spam-section");
  };

  bar.append(title, sub, clear, apply);
  host.appendChild(bar);
}

// ── All senders screen ──────────────────────────────────────────────────
// A flat, searchable, filterable list of every scanned sender. The pixel
// exact "engagement bar + one action" row treatment lands in the All-senders
// screen commit; this keeps the screen populated and the controls live.
type SenderFilterId = "all" | "never" | "subs" | "muted";
let allSendersFilter: SenderFilterId = "all";
let allSendersQuery = "";
let allSendersLimit = 25;

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
  const neverKeys = new Set(neverReadSenders(senders).map((s) => s.key));
  return senders.filter((s) => {
    if (allSendersFilter === "never" && !neverKeys.has(s.key)) return false;
    if (allSendersFilter === "subs" && !hasAnyUnsubscribe(s.unsubscribe)) return false;
    if (allSendersFilter === "muted" && !ctx.settings.mutedSenders.includes(s.address)) return false;
    if (allSendersQuery) {
      const hay = `${s.displayName ?? ""} ${s.address}`.toLowerCase();
      if (!hay.includes(allSendersQuery)) return false;
    }
    return true;
  });
}

function renderAllSenders(senders: SenderSummary[]) {
  if (!allSendersListEl) return;
  const rows = filteredSenders(senders).sort((a, b) => b.count - a.count);
  const shown = rows.slice(0, allSendersLimit);

  allSendersListEl.innerHTML = "";
  const list = document.createElement("div");
  list.className = "grouped-list";

  shown.forEach((sender, i) => {
    if (i > 0) {
      const sep = document.createElement("div");
      sep.className = "row-sep inset";
      list.appendChild(sep);
    }
    const row = document.createElement("div");
    row.className = "list-row";
    row.style.gridTemplateColumns = "minmax(0,1fr) 92px max-content";

    const media = document.createElement("div");
    media.className = "row-media";
    media.appendChild(makeLogoTile(sender, "sz-34"));
    const text = document.createElement("div");
    text.className = "row-title-wrap";
    const title = document.createElement("div");
    title.className = "row-title";
    title.textContent = sender.displayName || sender.address;
    const sub = document.createElement("div");
    sub.className = "row-sub";
    const unread = sender.messages.filter((m) => m.unread).length;
    sub.textContent =
      unread === sender.count
        ? `nothing opened${sender.displayName ? ` · ${sender.address}` : ""}`
        : `${unread} of ${sender.count} unread${sender.displayName ? ` · ${sender.address}` : ""}`;
    text.append(title, sub);
    media.appendChild(text);

    // Count + engagement bar (unread ratio).
    const count = document.createElement("div");
    count.style.minWidth = "0";
    const n = document.createElement("div");
    n.className = "row-title";
    n.style.fontSize = "15px";
    n.textContent = `${sender.count} msg`;
    const ratio = sender.count > 0 ? unread / sender.count : 0;
    const bar = document.createElement("div");
    bar.className = "eng-bar";
    const fill = document.createElement("span");
    fill.style.width = `${Math.round(ratio * 100)}%`;
    if (ratio <= 0.6) fill.classList.add("low");
    bar.appendChild(fill);
    count.append(n, bar);

    const actions = document.createElement("div");
    actions.className = "row-actions";
    const isProtected = sender.protectedMessageIds.length > 0;
    const isMuted = ctx.settings.mutedSenders.includes(sender.address);
    if (isProtected) {
      const chip = document.createElement("span");
      chip.className = "pill dashed";
      chip.textContent = "Protected";
      actions.appendChild(chip);
    } else if (isMuted) {
      const chip = document.createElement("span");
      chip.className = "pill neutral";
      chip.textContent = "Muted";
      actions.appendChild(chip);
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
      actions.appendChild(primary);
    }

    row.append(media, count, actions);
    list.appendChild(row);
  });

  allSendersListEl.appendChild(list);

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

/** Sender tile: favicon over a coloured monogram fallback (see senderTile.ts). */
function makeLogoTile(
  sender: Pick<SenderSummary, "address" | "displayName">,
  sizeClass: TileSize,
): HTMLElement {
  return senderTile(sender.address, sender.displayName, sizeClass);
}

async function saveEngagementFeedback(senderKeys: string[], feedback: EngagementFeedback) {
  if (senderKeys.length === 0) return;
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
        const outcome = evaluateUnsubscribeOutcome(sender, tracked);
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
          ? evaluateUnsubscribeOutcome(sender, tracked).state === "still-sending"
            ? "Retry unsubscribe"
            : "Request again"
          : "Unsubscribe (verified one-click)";
      }
      btn.disabled = false;
    };

    applyState();
    cell.append(statusEl, btn);
  } else if (sender.unsubscribe.mailto) {
    const link = document.createElement("a");
    link.href = sender.unsubscribe.mailto;
    link.textContent = "Unsubscribe via email";
    link.target = "_blank";
    cell.appendChild(link);
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
      const labelName = sender.displayName || sender.address;
      await provider.keepSorted(token, sender.address, labelName, sender.messageIds);
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
  const groups = buildDomainGroups(senders).filter((g) => g.totalCount > 0);
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
  protectedCell.textContent = group.protectedCount > 0 ? `${group.protectedCount} starred` : "—";
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
        ? `Move ${deletable} to Trash, skip ${group.protectedCount} starred/flagged?`
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
  currentExpiryBuckets = buildExpiryBuckets(senders);
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
  expiryCleanupBtn.textContent = `Clean up ${totalExpiryCount(currentExpiryBuckets)} items…`;
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
    const maxMessagesPerProvider = Math.min(
      5000,
      Math.max(50, Number(maxMessagesInput.value) || ctx.settings.maxMessagesPerProvider),
    );
    scanWindowInput.value = String(scanWindowDays);
    maxMessagesInput.value = String(maxMessagesPerProvider);

    applyScanSettingsBtn.disabled = true;
    applyScanSettingsBtn.textContent = "Rescanning…";
    try {
      ctx.settings = await updateSettings({ scanWindowDays, maxMessagesPerProvider });
      // Explicit user "Rescan" — drop the warm metadata cache and re-fetch.
      await scanAndRender({ refresh: true });
    } finally {
      applyScanSettingsBtn.disabled = false;
      applyScanSettingsBtn.textContent = "Rescan";
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
        if (verdict && verdict !== "other") {
          message.kind = verdict;
          changed += 1;
        }
      }
      aiKindStatusEl.textContent =
        changed > 0
          ? `Reclassified ${changed} of ${otherMessages.length} "other" message${otherMessages.length === 1 ? "" : "s"}.`
          : "No confident reclassification found.";
      if (changed > 0) render(ctx.senders);
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

async function executeSmartDelete(merged: Map<ProviderId, string[]>): Promise<SmartDeleteResult> {
  const { gmailCount, otherCount, willUsePermanent } = planDelete(merged);
  if (!willUsePermanent) {
    await executeBulkDeleteDomains(merged, providerById);
    return {
      message: `Moved ${gmailCount + otherCount} to Trash ✓`,
      undoableGmailIds: merged.get("gmail") ?? [],
    };
  }

  try {
    const elevatedToken = await getElevatedAuthToken(false);
    await gmailProvider.permanentlyDeleteMessages!(elevatedToken, merged.get("gmail")!);
    const rest = new Map(merged);
    rest.delete("gmail");
    if (rest.size > 0) await executeBulkDeleteDomains(rest, providerById);
    const message =
      otherCount > 0
        ? `Permanently deleted ${gmailCount} from Gmail, moved ${otherCount} to Trash ✓`
        : `Permanently deleted ${gmailCount} from Gmail ✓`;
    return { message, undoableGmailIds: [] };
  } catch (err) {
    log.error("Elevated permanent-delete failed, falling back to Trash", err);
    await executeBulkDeleteDomains(merged, providerById);
    return {
      message: `Fast delete unavailable — moved ${gmailCount + otherCount} to Trash instead ✓`,
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
  engagementSuggestions = buildEngagementSuggestions(senders, ctx.settings.senderEngagement);
  neverReadSectionEl.hidden = engagementSuggestions.length === 0;
  if (engagementSuggestions.length === 0) return;

  const totalMsgs = engagementSuggestions.reduce((count, item) => count + item.safeMessageIds.length, 0);
  neverReadCountEl.textContent = `${engagementSuggestions.length} suggestion${engagementSuggestions.length === 1 ? "" : "s"}, ${totalMsgs} safe message${totalMsgs === 1 ? "" : "s"}`;

  neverReadListEl.innerHTML = "";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.appendChild(headerRow(["Sender", "Fit", "Why", "Suggested", "Feedback"]));
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const suggestion of engagementSuggestions) {
    const { sender } = suggestion;
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.textContent = sender.displayName ? `${sender.displayName} <${sender.address}>` : sender.address;
    const fitCell = document.createElement("td");
    fitCell.textContent = `${suggestion.score}/100 · ${suggestion.confidence}`;
    fitCell.title = "Deterministic fit score, not a probability";
    const reasonCell = document.createElement("td");
    reasonCell.textContent = suggestion.reasons.join("; ");
    const actionCell = document.createElement("td");
    actionCell.textContent = suggestion.suggestedAction;
    const feedbackCell = document.createElement("td");
    const dismissBtn = document.createElement("button");
    dismissBtn.textContent = "Not useful";
    dismissBtn.title = "Hide this suggestion for 30 days and use that correction in future scoring";
    dismissBtn.onclick = async () => {
      dismissBtn.disabled = true;
      await saveEngagementFeedback([sender.key], "dismiss");
      renderNeverReadSection(ctx.senders);
    };
    feedbackCell.appendChild(dismissBtn);
    row.append(nameCell, fitCell, reasonCell, actionCell, feedbackCell);
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
  spamSuggestions = suggestSpamSenders(senders);
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
    box.checked = true;
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
  const merged = evaluateSmartView(view, ctx.senders);
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
    `View "${view.label}": ${action} — ${total} message${total === 1 ? "" : "s"}`,
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
  trashBtn.onclick = () =>
    renderConfirmStep(smartViewResultSlot, clearSmartViewResult, `Move ${msgCount} to Trash?`, true, () =>
      applySmartView(view, "trash"),
    );

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
    const merged = keepNewestExcess(ctx.senders, n);
    const gmailIds = merged.get("gmail") ?? [];
    const total = [...merged.values()].reduce((a, b) => a + b.length, 0);
    if (total === 0) {
      renderConfirmStep(
        keepNewestSlot,
        resetKeepNewestSlot,
        `Nothing to trim — no sender has more than ${n}.`,
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
        for (const [pid, ids] of merged) {
          const provider = providerById.get(pid);
          if (!provider || ids.length === 0) continue;
          const token = await provider.getAuthToken(false);
          await provider.trashMessages(token, ids);
        }
        await logAction(
          "trash",
          `Trimmed to newest ${n} per sender — ${total} message${total === 1 ? "" : "s"}`,
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
    const summaryText = `${automatable.length} will be unsubscribed automatically, ${manual.length} need manual review — no verified link`;

    renderConfirmStep(unsubscribeBulkSlot, resetUnsubscribeBulkSlot, summaryText, false, async (summary) => {
      if (automatable.length === 0) return `Nothing to automate — ${manual.length} need manual review`;
      summary.textContent = "Requesting permission…";
      const granted = await ensureOriginsPermission(automatable.map((s) => s.unsubscribe.postUrl!));
      if (!granted) return "Permission denied — nothing was unsubscribed";
      summary.textContent = "Unsubscribing…";
      const { succeeded, failed } = await executeBulkUnsubscribe(automatable, fireOneClickUnsubscribe);
      await recordUnsubscribeRequests(succeeded);
      if (succeeded.length > 0)
        await logAction("unsubscribe", `Bulk unsubscribed from ${succeeded.length} senders`);
      render(ctx.senders);
      return `Unsubscribed ${succeeded.length}, failed ${failed.length}, skipped ${manual.length} (no verified link)`;
    });
  };

  const resetKeepSortedBulkSlot = () => {
    keepSortedBulkSlot.innerHTML = "";
    keepSortedBulkSlot.appendChild(bulkKeepSortedBtn);
  };

  bulkKeepSortedBtn.onclick = () => {
    const selected = ctx.senders.filter((s) => selectedSenderKeys.has(s.key));
    const { eligible, unsupported } = partitionForKeepSorted(selected, providerById);
    const summaryText = `${eligible.length} will be sorted, ${unsupported.length} skipped — not supported for this provider`;

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
    const summaryText = `${eligible.length} will be snoozed for ${snoozeDurationSelect.options[snoozeDurationSelect.selectedIndex].textContent}, ${unsupported.length} skipped — not supported for this provider`;

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
    const skipNote = protectedTotal > 0 ? ` (skips ${protectedTotal} starred/flagged)` : "";
    const summaryText = permanentSummary
      ? `${permanentSummary}${skipNote}`
      : protectedTotal > 0
        ? `Move ${deletable} to Trash across ${selected.length} domains, skip ${protectedTotal} starred/flagged?`
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
        const succeeded: EngagementSuggestion[] = [];
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
        const job = await createDurableJob({ provider: "gmail", operation: "trash", targetIds: ids });
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
  const message = err instanceof Error ? err.message : "unknown error";
  statusEl.hidden = false;
  statusEl.innerHTML = "";
  const text = document.createElement("span");
  text.textContent = `Something went wrong (${message}). `;
  const reloadBtn = document.createElement("button");
  reloadBtn.textContent = "Reload";
  reloadBtn.onclick = () => location.reload();
  statusEl.append(text, reloadBtn);
});
