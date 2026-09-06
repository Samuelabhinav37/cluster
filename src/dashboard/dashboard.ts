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
import { categorizeDomain, DOMAIN_CATEGORY_LABELS, type DomainCategory } from "../lib/domainCategories";
import { buildDomainGroups, domainOf, type DomainGroup } from "../lib/domainGrouping";
import {
  buildExpiryBuckets,
  mergeExpiryBuckets,
  totalExpiryCount,
  type ExpiryBucket,
} from "../lib/expiryTriage";
import { getElevatedAuthToken } from "../lib/gmailApi";
import type { NormalizedMessageMetadata, ProviderId } from "../lib/providers/emailProvider";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { outlookProvider } from "../lib/providers/outlookProvider";
import { OutlookReauthRequired } from "../lib/providers/msalAuth";
import { buildSenderSummaries, type SenderSummary } from "../lib/senderModel";
import { getSettings, mutateSettings, updateSettings } from "../lib/settingsStore";
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
import { buildInboxHealth } from "../lib/inboxHealth";
import { createDurableJob, runDurableJob } from "../lib/durableJobs";
import { evaluateUnsubscribeOutcome } from "../lib/unsubscribeOutcome";

const selectedSenderKeys = new Set<string>();
const selectedDomainKeys = new Set<string>();
let currentDomainGroups: DomainGroup[] = [];
let currentExpiryBuckets: ExpiryBucket[] = [];
let engagementSuggestions: EngagementSuggestion[] = [];
const SECURITY_SCAN_WINDOW_DAYS = 30;

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
const athenaSectionEl = document.getElementById("athena-section") as HTMLElement;
const athenaConnectBtn = document.getElementById("athena-connect-btn") as HTMLButtonElement;
const athenaStatusEl = document.getElementById("athena-status") as HTMLSpanElement;

const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("#tabs button[data-tab]"));
const tabPanels = Array.from(document.querySelectorAll<HTMLElement>("section.tab-panel[data-tab]"));



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


// ── Tabs ─────────────────────────────────────────────────────────────────
function showTab(name: string) {
  const target = tabButtons.some((b) => b.dataset.tab === name) ? name : "overview";
  for (const panel of tabPanels) panel.hidden = panel.dataset.tab !== target;
  for (const btn of tabButtons) btn.setAttribute("aria-selected", String(btn.dataset.tab === target));
}

function wireTabs() {
  showTab(ctx.settings.activeTab);
  for (const btn of tabButtons) {
    btn.onclick = async () => {
      const name = btn.dataset.tab!;
      showTab(name);
      ctx.settings = await updateSettings({ activeTab: name });
    };
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

async function main() {
  statusEl.textContent = "Connecting…";
  ctx.settings = await getSettings();
  wireTabs();
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

async function scanAndRender() {
  statusEl.hidden = false;
  senderGroupsEl.hidden = true;
  domainSectionEl.hidden = true;
  expirySectionEl.hidden = true;
  statusEl.textContent = "Scanning recent mail…";

  let senders: SenderSummary[];
  let securitySenders: SenderSummary[];
  // One cache spanning both scans below. The cleanup query
  // (category:promotions OR updates, 180d) and the security query
  // (in:inbox, 30d) overlap on recent promotional mail still in the inbox —
  // this fetches each such message's metadata once instead of twice.
  const scanCache = new Map<string, NormalizedMessageMetadata>();
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
      ctx.settings.maxMessagesPerProvider,
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

  renderOverview(senders, securitySenders);
  render(senders);
  renderRulesTab();
  renderDomainGroups(senders);
  renderExpirySection(senders);
  renderSecuritySection(securitySenders);
  renderSubscriptionsTab(senders);
  renderNeverReadSection(senders);
  renderSpamSection(senders);
  renderSortInbox(senders);
  renderSmartViews(senders);
  renderScreenerTab(senders);
  generateDigestBtn.disabled = false;
}

// Metric id → the section to scroll to after switching tabs. Missing entries
// just switch tab.
const OVERVIEW_SECTION_BY_METRIC: Record<string, string> = {
  "ready-to-clean-up": "expiry-section",
  "never-opened": "never-read-section",
  "suspected-spam": "spam-section",
  "old-and-large": "smart-views-bar",
  "flagged-senders": "security-section",
  "unsubscribe-capable": "subscriptions-list",
  "screener-queue": "screener-queue",
  "done-last-7-days": "recent-list",
};

function renderOverview(senders: SenderSummary[], securitySenders: SenderSummary[]) {
  const health = buildInboxHealth({ senders, securitySenders, settings: ctx.settings });
  overviewHeadlineEl.textContent = `Scanned ${health.scannedSenders} sender${
    health.scannedSenders === 1 ? "" : "s"
  } · ${health.scannedMessages} message${health.scannedMessages === 1 ? "" : "s"}`;

  overviewContentEl.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "overview-grid";
  for (const metric of health.metrics) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = metric.tone === "attention" ? "overview-tile attention" : "overview-tile";
    tile.onclick = () => {
      showTab(metric.tab);
      ctx.settings = { ...ctx.settings, activeTab: metric.tab };
      void updateSettings({ activeTab: metric.tab });
      const target = OVERVIEW_SECTION_BY_METRIC[metric.id];
      if (target) document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const value = document.createElement("span");
    value.className = "value";
    value.textContent = String(metric.value);

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = metric.label;

    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = metric.hint;

    tile.append(value, label, hint);
    grid.appendChild(tile);
  }
  overviewContentEl.appendChild(grid);
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
function render(senders: SenderSummary[]) {
  ctx.senders = senders;
  pruneSelection(
    selectedSenderKeys,
    senders.map((s) => s.key),
  );

  const groups = groupByCategory(
    senders,
    (s) => categorizeDomain(domainOf(s.address)),
    (s) => s.count,
  );
  renderCategoryGroups(
    senderGroupsEl,
    groups,
    [
      "",
      "Provider",
      "Sender",
      `Count (${ctx.settings.scanWindowDays}d)`,
      "Unsubscribe",
      "Keep sorted",
      "Mute",
      "Snooze",
    ],
    buildSenderRow,
    "senders",
    "collapsedSenderCategories",
  );

  updateSenderBulkBar();
}

function buildSenderRow(sender: SenderSummary): HTMLTableRowElement {
  const row = document.createElement("tr");

  const checkboxCell = document.createElement("td");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.senderKey = sender.key;
  checkbox.checked = selectedSenderKeys.has(sender.key);
  checkbox.onchange = () => {
    if (checkbox.checked) selectedSenderKeys.add(sender.key);
    else selectedSenderKeys.delete(sender.key);
    updateSenderBulkBar();
  };
  checkboxCell.appendChild(checkbox);
  row.appendChild(checkboxCell);

  const providerCell = document.createElement("td");
  providerCell.textContent = sender.provider;
  providerCell.className = "provider-badge";
  row.appendChild(providerCell);

  const nameCell = document.createElement("td");
  nameCell.textContent = sender.displayName ? `${sender.displayName} <${sender.address}>` : sender.address;
  if (sender.firstContact) {
    const badge = document.createElement("span");
    badge.className = "hint";
    badge.textContent = " · new since Cluster started tracking";
    nameCell.appendChild(badge);
  }
  row.appendChild(nameCell);

  const countCell = document.createElement("td");
  countCell.textContent = String(sender.count);
  row.appendChild(countCell);

  row.appendChild(buildUnsubscribeCell(sender));
  row.appendChild(buildKeepSortedCell(sender));
  row.appendChild(buildMuteCell(sender));
  row.appendChild(buildSnoozeCell(sender));

  return row;
}

// ── Mute (local BlackHole) ───────────────────────────────────────────────
// A standing from:<address> filter hiding all mail from this sender, now and
// future — independent of whether they honour unsubscribe. Gmail-only.
function buildMuteCell(sender: SenderSummary): HTMLTableCellElement {
  const cell = document.createElement("td");
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

async function saveEngagementFeedback(senderKeys: string[], feedback: EngagementFeedback) {
  if (senderKeys.length === 0) return;
  ctx.settings = await mutateSettings((current) => ({
    ...current,
    senderEngagement: recordEngagementFeedback(current.senderEngagement, senderKeys, feedback),
  }));
}

function buildUnsubscribeCell(sender: SenderSummary): HTMLTableCellElement {
  const cell = document.createElement("td");

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

function buildKeepSortedCell(sender: SenderSummary): HTMLTableCellElement {
  const cell = document.createElement("td");
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

function buildSnoozeCell(sender: SenderSummary): HTMLTableCellElement {
  const cell = document.createElement("td");

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
      await scanAndRender();
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
  smartViewResultSlot.className = "bulk-bar";

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
