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
import type { EmailProvider, ProviderId } from "../lib/providers/emailProvider";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { outlookProvider } from "../lib/providers/outlookProvider";
import { buildSenderSummaries, type SenderSummary } from "../lib/senderModel";
import { getSettings, mutateSettings, updateSettings, type ClusterSettings } from "../lib/settingsStore";
import { excludeSnoozedMessages } from "../lib/snoozeFilter";
import { resurfaceDueSnoozed } from "../lib/snoozeResurface";
import { ensureOriginsPermission, fireOneClickUnsubscribe } from "../lib/unsubscribe";
import { athenaOriginPatterns, getAthenaConfig, queueAthenaSecurityEvent } from "../lib/athenaIntegration";
import { findBlocklistedLinkTargets, findMismatchedLinks } from "../lib/linkMismatch";
import { isBlockedDomain } from "../lib/blocklist";
import { riskTier, senderRiskScore } from "../lib/threatSignals";
import {
  describeRule,
  findRuleConflicts,
  ruleHasConditions,
  type ClusterRule,
  type RuleAction,
  type RuleConditions,
} from "../lib/rules";
import { applyRules, previewRuleMatches } from "../lib/ruleRunner";
import {
  buildEngagementSuggestions,
  recordEngagementFeedback,
  updateEngagementObservations,
  type EngagementFeedback,
  type EngagementSuggestion,
} from "../lib/engagementModel";
import { markFirstContact } from "../lib/firstContact";
import { buildSortPlan, totalPlanCount, type SortPlanEntry } from "../lib/autoSort";
import { ALL_SORT_BUCKETS, SORT_BUCKET_LABELS, type SortBucket } from "../lib/sortTaxonomy";
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
import { knownSenderSet, pendingScreenerSenders, sentCorrespondentsStale } from "../lib/screener";
import {
  appendActionLog,
  makeLogId,
  type ActionLogEntry,
  type ActionLogKind,
  type ActionLogUndo,
} from "../lib/actionLog";
import type { MessageKind } from "../lib/messageKind";
import { buildSenderCleanupPlan } from "../lib/protectionPolicy";
import { createDurableJob, runDurableJob } from "../lib/durableJobs";
import { draftRuleFromNaturalLanguage } from "../lib/aiRuleDraft";

const providerById = new Map<ProviderId, EmailProvider>([
  [gmailProvider.id, gmailProvider],
  [outlookProvider.id, outlookProvider],
]);
const activeProviders: EmailProvider[] = [gmailProvider];

const selectedSenderKeys = new Set<string>();
const selectedDomainKeys = new Set<string>();
const selectedSubKeys = new Set<string>();
let currentSenders: SenderSummary[] = [];
let currentDomainGroups: DomainGroup[] = [];
let currentExpiryBuckets: ExpiryBucket[] = [];
let engagementSuggestions: EngagementSuggestion[] = [];
let cachedSettings: ClusterSettings;
const SECURITY_SCAN_WINDOW_DAYS = 30;

const statusEl = document.getElementById("status") as HTMLParagraphElement;
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
const securitySectionEl = document.getElementById("security-section") as HTMLElement;
const securitySenderListEl = document.getElementById("security-sender-list") as HTMLUListElement;
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
const securityEmptyEl = document.getElementById("security-empty") as HTMLParagraphElement;

const rulesListEl = document.getElementById("rules-list") as HTMLDivElement;
const ruleForm = document.getElementById("rule-form") as HTMLFormElement;
const ruleNameInput = document.getElementById("rule-name") as HTMLInputElement;
const ruleFromDomainInput = document.getElementById("rule-from-domain") as HTMLInputElement;
const ruleFromAddressInput = document.getElementById("rule-from-address") as HTMLInputElement;
const ruleExceptDomainInput = document.getElementById("rule-except-domain") as HTMLInputElement;
const ruleExceptAddressInput = document.getElementById("rule-except-address") as HTMLInputElement;
const ruleOlderDaysInput = document.getElementById("rule-older-days") as HTMLInputElement;
const ruleKindSel = document.getElementById("rule-kind") as HTMLSelectElement;
const ruleUnsubSel = document.getElementById("rule-unsub") as HTMLSelectElement;
const ruleUnreadSel = document.getElementById("rule-unread") as HTMLSelectElement;
const ruleActionSel = document.getElementById("rule-action") as HTMLSelectElement;
const ruleLabelInput = document.getElementById("rule-label") as HTMLInputElement;
const rulePriorityInput = document.getElementById("rule-priority") as HTMLInputElement;
const ruleStopProcessingInput = document.getElementById("rule-stop-processing") as HTMLInputElement;
const ruleFormError = document.getElementById("rule-form-error") as HTMLSpanElement;
const ruleApplySlot = document.getElementById("rule-apply-slot") as HTMLDivElement;
const ruleApplyBtn = document.getElementById("rule-apply-btn") as HTMLButtonElement;
const ruleNaturalLanguageInput = document.getElementById("rule-natural-language") as HTMLInputElement;
const ruleDraftBtn = document.getElementById("rule-draft-btn") as HTMLButtonElement;
const ruleSaveDraftBtn = document.getElementById("rule-save-draft-btn") as HTMLButtonElement;
const ruleDraftStatus = document.getElementById("rule-draft-status") as HTMLSpanElement;
let pendingRuleDraft: ClusterRule | undefined;

const recentListEl = document.getElementById("recent-list") as HTMLDivElement;

const subsBulkBar = document.getElementById("subscriptions-bulk-bar") as HTMLDivElement;
const subsCountEl = document.getElementById("subs-count") as HTMLSpanElement;
const subsUnsubAllSlot = document.getElementById("subs-unsub-all-slot") as HTMLSpanElement;
const subsUnsubAllBtn = document.getElementById("subs-unsub-all-btn") as HTMLButtonElement;
const subscriptionsListEl = document.getElementById("subscriptions-list") as HTMLDivElement;

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

const sortInboxBtn = document.getElementById("sort-inbox-btn") as HTMLButtonElement;
const sortInboxSlot = document.getElementById("sort-inbox-slot") as HTMLSpanElement;
const sortInboxCountEl = document.getElementById("sort-inbox-count") as HTMLSpanElement;
const sortInboxBucketsEl = document.getElementById("sort-inbox-buckets") as HTMLDivElement;
const sortKeepSortingEl = document.getElementById("sort-keep-sorting") as HTMLInputElement;
const sortExpireOtpEl = document.getElementById("sort-expire-otp") as HTMLInputElement;

const smartViewChipsEl = document.getElementById("smart-view-chips") as HTMLSpanElement;
const smartViewResultSlot = document.getElementById("smart-view-result-slot") as HTMLDivElement;
const keepNewestNInput = document.getElementById("keep-newest-n") as HTMLInputElement;
const keepNewestSlot = document.getElementById("keep-newest-slot") as HTMLSpanElement;
const keepNewestBtn = document.getElementById("keep-newest-btn") as HTMLButtonElement;

const screenerToggle = document.getElementById("screener-toggle") as HTMLInputElement;
const screenerQueueEl = document.getElementById("screener-queue") as HTMLDivElement;
const screenerAllowlistEl = document.getElementById("screener-allowlist") as HTMLDivElement;

// ── Tabs ─────────────────────────────────────────────────────────────────
function showTab(name: string) {
  const target = tabButtons.some((b) => b.dataset.tab === name) ? name : "cleanup";
  for (const panel of tabPanels) panel.hidden = panel.dataset.tab !== target;
  for (const btn of tabButtons) btn.setAttribute("aria-selected", String(btn.dataset.tab === target));
}

function wireTabs() {
  showTab(cachedSettings.activeTab);
  for (const btn of tabButtons) {
    btn.onclick = async () => {
      const name = btn.dataset.tab!;
      showTab(name);
      cachedSettings = await updateSettings({ activeTab: name });
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
  cachedSettings = await getSettings();
  wireTabs();
  fastDeleteToggle.checked = cachedSettings.fastPermanentDeleteEnabled;
  wireFastDeleteToggle();
  autoQuarantineToggle.checked = cachedSettings.autoQuarantineHighRisk;
  autoQuarantineToggle.onchange = async () => {
    cachedSettings = await updateSettings({ autoQuarantineHighRisk: autoQuarantineToggle.checked });
  };
  scanWindowInput.value = String(cachedSettings.scanWindowDays);
  maxMessagesInput.value = String(cachedSettings.maxMessagesPerProvider);
  wireScanSettings();
  await wireAthenaConnection();

  onboardingBanner.hidden = cachedSettings.onboardingDismissed;
  onboardingDismissBtn.onclick = async () => {
    onboardingBanner.hidden = true;
    cachedSettings = await updateSettings({ onboardingDismissed: true });
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
  wireKeepNewest();
  wireSortInbox();
  wireScreenerTab();
  wireOfflineHandling();
  wireRulesTab();
  renderRulesTab();
  renderRecentTab();
  await wireDigest();
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
  try {
    senders = await buildSenderSummaries(
      activeProviders,
      cachedSettings.maxMessagesPerProvider,
      cachedSettings.scanWindowDays,
      (done, total) => {
        statusEl.textContent =
          total > 0 ? `Scanning recent mail… ${done}/${total} messages` : "Scanning recent mail…";
      },
      "cleanup",
    );
    statusEl.textContent = "Scanning recent Inbox mail for security…";
    securitySenders = await buildSenderSummaries(
      activeProviders,
      cachedSettings.maxMessagesPerProvider,
      Math.min(cachedSettings.scanWindowDays, SECURITY_SCAN_WINDOW_DAYS),
      (done, total) => {
        statusEl.textContent =
          total > 0
            ? `Scanning recent Inbox mail for security… ${done}/${total} messages`
            : "Scanning recent Inbox mail for security…";
      },
      "security",
    );
  } catch (err) {
    showScanError(err);
    return;
  }

  const activeSnoozedIds = new Set(
    Object.entries(cachedSettings.snoozedMessages)
      .filter(([, v]) => v.resurfaceAt > Date.now())
      .map(([id]) => id),
  );
  senders = excludeSnoozedMessages(senders, activeSnoozedIds);

  cachedSettings = await mutateSettings((current) => ({
    ...current,
    senderEngagement: updateEngagementObservations(current.senderEngagement, senders),
  }));

  const firstContact = markFirstContact(
    securitySenders,
    cachedSettings.knownSenders,
    Date.now(),
    cachedSettings.knownSendersInitialized,
  );
  const newlySeenKeys = new Set(
    securitySenders.filter((sender) => sender.firstContact).map((sender) => sender.key),
  );
  for (const sender of senders) sender.firstContact = newlySeenKeys.has(sender.key);
  if (!cachedSettings.knownSendersInitialized || firstContact.firstContactCount > 0) {
    cachedSettings = await mutateSettings((current) => ({
      ...current,
      knownSenders: { ...current.knownSenders, ...firstContact.updatedKnownSenders },
      knownSendersInitialized: true,
    }));
  }

  statusEl.hidden = true;
  senderGroupsEl.hidden = false;
  domainSectionEl.hidden = false;

  render(senders);
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

function showScanError(err: unknown) {
  log.error(err);
  const message = err instanceof Error ? err.message : "unknown error";
  statusEl.hidden = false;
  statusEl.innerHTML = "";
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
  const current = new Set(cachedSettings[settingsKey]);
  if (collapsed) current.add(category);
  else current.delete(category);
  cachedSettings = await updateSettings({ [settingsKey]: [...current] });
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
    details.open = !cachedSettings[collapseSettingsKey].includes(group.category);

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
  currentSenders = senders;
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
      `Count (${cachedSettings.scanWindowDays}d)`,
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
  const isMuted = () => cachedSettings.mutedSenders.includes(sender.address);
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
        cachedSettings = await mutateSettings((current) => ({
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
  senderBulkBar.hidden = currentSenders.length === 0;
  senderSelectedCountEl.textContent = `${selectedSenderKeys.size} selected`;
  bulkUnsubscribeBtn.disabled = selectedSenderKeys.size === 0;
  bulkKeepSortedBtn.disabled = selectedSenderKeys.size === 0;
  bulkSnoozeBtn.disabled = selectedSenderKeys.size === 0;
}

// ── Confirmed-unsubscribe tracking ───────────────────────────────────────
// Persisted so "already requested" survives a reload — senders can take up
// to 10 business days to stop, so re-requesting isn't blocked, just labeled.
async function recordUnsubscribeRequests(senders: SenderSummary[]) {
  if (senders.length === 0) return;
  const now = Date.now();
  cachedSettings = await mutateSettings((current) => {
    const requests = { ...current.unsubscribeRequests };
    for (const sender of senders) requests[sender.key] = { requestedAt: now, provider: sender.provider };
    return {
      ...current,
      unsubscribeRequests: requests,
      senderEngagement: recordEngagementFeedback(
        current.senderEngagement,
        senders.map((sender) => sender.key),
        "accept",
        now,
      ),
    };
  });
}

async function saveEngagementFeedback(senderKeys: string[], feedback: EngagementFeedback) {
  if (senderKeys.length === 0) return;
  cachedSettings = await mutateSettings((current) => ({
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
      const tracked = cachedSettings.unsubscribeRequests[sender.key];
      if (tracked) {
        statusEl.textContent = `Requested ${formatRelativeTime(tracked.requestedAt)}`;
        btn.textContent = "Request again";
      } else {
        statusEl.textContent = "";
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
        btn.textContent = cachedSettings.unsubscribeRequests[sender.key]
          ? "Request again"
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
      const labelName = `Cluster/${sender.displayName || sender.address}`;
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
  const snoozedMessages = { ...cachedSettings.snoozedMessages };
  for (const id of ids) snoozedMessages[id] = { resurfaceAt, provider };
  cachedSettings = await updateSettings({ snoozedMessages });
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
    ["", "Domain", `Count (${cachedSettings.scanWindowDays}d)`, "Protected", "Action"],
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

// ── Possible-impersonation (threatSignals) section ──────────────────────
// Read-only detail plus one manual, per-sender action (labelSuspicious) --
// never automatic, never a standing filter. See threatSignals.ts and
// emailProvider.ts's labelSuspicious doc comment for the reasoning.
function describeSignal(s: SenderSummary["threatSignals"][number]): string {
  switch (s.kind) {
    case "freemail-brand-claim":
      return `claims to be ${s.brand}, sent from a free-mail address`;
    case "brand-impersonation":
      return `claims to be ${s.brand}, domain doesn't match`;
    case "lookalike-domain":
      return `domain closely resembles ${s.brand}'s real domain`;
    case "failed-authentication":
      return `failed DMARC authentication (claimed domain: ${s.brand})`;
    case "blocklisted-domain":
      return `sending domain (${s.brand}) is on a known-bad domain list`;
    case "reply-to-mismatch":
      return `replies would go to a personal address (${s.brand}), not the sender's domain`;
    case "punycode-domain":
      return `sender domain (${s.brand}) uses punycode — a common homograph trick`;
    case "lure-language":
      return `subject uses urgency / credential-request language`;
    case "link-mismatch":
      return `a link's visible text doesn't match where it actually goes`;
    default: {
      const unreachable: never = s.kind;
      return unreachable;
    }
  }
}

// "SPF ✓ · DKIM ✓ · DMARC —" — a plain-language read on what the mail
// provider's Authentication-Results header actually said about this sender.
function authChip(v: SenderSummary["authVerdicts"]): string {
  const mark = (verdict: string) => (verdict === "pass" ? "✓" : verdict === "fail" ? "✗" : "—");
  return `SPF ${mark(v.spf)} · DKIM ${mark(v.dkim)} · DMARC ${mark(v.dmarc)}`;
}

// messageIds is in fetch order, not date order -- pick the genuinely most
// recent message so "checks the most recent message" is true.
function newestMessageId(sender: SenderSummary): string | undefined {
  if (sender.messages.length === 0) return sender.messageIds[0];
  return [...sender.messages].sort((a, b) => b.receivedAt - a.receivedAt)[0].id;
}

// Deep scan is the one place this dashboard fetches a message body
// (format=full, via getMessageLinks) -- deliberately manual, one message
// at a time, never part of the automatic triage. See linkMismatch.ts.
async function runDeepScan(sender: SenderSummary, resultEl: HTMLElement): Promise<void> {
  const provider = providerById.get(sender.provider);
  const targetId = newestMessageId(sender);
  if (!provider?.getMessageLinks || !targetId) return;
  resultEl.textContent = "Scanning…";
  try {
    const token = await provider.getAuthToken(false);
    const links = await provider.getMessageLinks(token, targetId);
    const suspicious = findMismatchedLinks(links);
    const blocked = findBlocklistedLinkTargets(links, isBlockedDomain);

    const findings = [
      ...suspicious.map((link) => `"${link.displayedDomain}" actually points to ${link.actualDomain}`),
      ...blocked.map((host) => `links to ${host}, a known-bad domain`),
    ];
    if (findings.length === 0) {
      resultEl.textContent = "No mismatched or known-bad links found in the most recent message.";
      return;
    }
    resultEl.textContent = findings.join("; ");

    const domain = sender.address.slice(sender.address.lastIndexOf("@") + 1);
    const now = new Date().toISOString();
    if (suspicious.length > 0) {
      void queueAthenaSecurityEvent({
        sourceEventId: `${sender.key}:link-mismatch:${targetId}`,
        occurredAt: now,
        action: "warned",
        severity: "high",
        ruleId: "threat-signal:link-mismatch",
        targetIndicator: domain,
        evidence: { kind: "link-mismatch", count: suspicious.length },
      });
    }
    if (blocked.length > 0) {
      void queueAthenaSecurityEvent({
        sourceEventId: `${sender.key}:blocklisted-link:${targetId}`,
        occurredAt: now,
        action: "warned",
        severity: "high",
        ruleId: "threat-signal:blocklisted-link",
        targetIndicator: domain,
        evidence: { kind: "blocklisted-link", hosts: blocked },
      });
    }
  } catch (err) {
    resultEl.textContent = "Scan failed, try again.";
    log.error(err);
  }
}

function renderSecuritySection(senders: SenderSummary[]) {
  // Rank by combined risk so a sender tripping several signals (or a
  // freemail brand claim) sorts above one with a lone medium signal.
  const flagged = senders
    .filter((s) => s.threatSignals.length > 0)
    .map((sender) => ({ sender, score: senderRiskScore(sender.threatSignals) }))
    .sort((a, b) => b.score - a.score);
  securitySectionEl.hidden = flagged.length === 0;
  securityEmptyEl.hidden = flagged.length > 0;
  if (flagged.length === 0) return;

  securitySenderListEl.replaceChildren(
    ...flagged.map(({ sender, score }) => {
      const li = document.createElement("li");
      const label = sender.threatSignals.map(describeSignal).join("; ");
      const tierEl = document.createElement("strong");
      tierEl.textContent = `${riskTier(score).toUpperCase()} risk`;
      const text = document.createElement("span");
      const firstContact = sender.firstContact ? " · new since Cluster started tracking" : "";
      text.textContent = ` — ${sender.displayName || sender.address} <${sender.address}> — ${label} `;
      const meta = document.createElement("span");
      meta.className = "hint";
      meta.textContent = `[${authChip(sender.authVerdicts)}]${firstContact} `;
      li.append(tierEl, text, meta);

      const provider = providerById.get(sender.provider);
      if (provider?.labelSuspicious) {
        const slot = document.createElement("span");
        const btn = document.createElement("button");
        btn.textContent = "Label as suspicious";
        const reset = () => {
          slot.innerHTML = "";
          slot.appendChild(btn);
        };
        btn.onclick = () => {
          renderConfirmStep(
            slot,
            reset,
            `Move ${sender.messageIds.length} message${sender.messageIds.length === 1 ? "" : "s"} from ${sender.address} to a "Possible Phishing" label, out of the inbox?`,
            false,
            async () => {
              const token = await provider.getAuthToken(false);
              await provider.labelSuspicious!(token, sender.messageIds);
              await logAction(
                "labelSuspicious",
                `Labelled ${sender.messageIds.length} from ${sender.address} as suspicious`,
              );
              return "Labeled ✓";
            },
          );
        };
        slot.appendChild(btn);
        li.appendChild(slot);
      }

      if (provider?.getMessageLinks) {
        const scanResult = document.createElement("span");
        scanResult.className = "hint";
        const scanBtn = document.createElement("button");
        scanBtn.textContent = "Deep scan (checks links in the most recent message)";
        scanBtn.onclick = async () => {
          scanBtn.disabled = true;
          await runDeepScan(sender, scanResult);
          scanBtn.disabled = false;
        };
        li.append(scanBtn, scanResult);
      }
      return li;
    }),
  );
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
        cachedSettings = await updateSettings({ fastPermanentDeleteEnabled: true });
      } catch (err) {
        fastDeleteToggle.checked = false;
        log.error(err);
      } finally {
        fastDeleteToggle.disabled = false;
      }
    } else {
      cachedSettings = await updateSettings({ fastPermanentDeleteEnabled: false });
    }
  };
}

function wireScanSettings() {
  applyScanSettingsBtn.onclick = async () => {
    const scanWindowDays = Math.min(
      3650,
      Math.max(1, Number(scanWindowInput.value) || cachedSettings.scanWindowDays),
    );
    const maxMessagesPerProvider = Math.min(
      5000,
      Math.max(50, Number(maxMessagesInput.value) || cachedSettings.maxMessagesPerProvider),
    );
    scanWindowInput.value = String(scanWindowDays);
    maxMessagesInput.value = String(maxMessagesPerProvider);

    applyScanSettingsBtn.disabled = true;
    applyScanSettingsBtn.textContent = "Rescanning…";
    try {
      cachedSettings = await updateSettings({ scanWindowDays, maxMessagesPerProvider });
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
      const input = buildDigestInput(currentSenders, currentExpiryBuckets);
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
    cachedSettings.fastPermanentDeleteEnabled &&
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

// ── Undo (Gmail-first) ────────────────────────────────────────────────────
// Only ever offered for ids that were moved to Trash, never permanently
// deleted. Outlook's move-to-Deleted-Items has no undo wired up, so a
// mixed-provider delete only restores its Gmail portion.
function appendUndoButton(container: HTMLElement, gmailIds: string[]) {
  if (gmailIds.length === 0 || !gmailProvider.untrashMessages) return;
  const undoBtn = document.createElement("button");
  undoBtn.textContent = "Undo";
  undoBtn.onclick = async () => {
    undoBtn.disabled = true;
    undoBtn.textContent = "Undoing…";
    try {
      const token = await gmailProvider.getAuthToken(false);
      await gmailProvider.untrashMessages!(token, gmailIds);
      undoBtn.textContent = "Restored ✓";
      await scanAndRender();
    } catch (err) {
      undoBtn.disabled = false;
      undoBtn.textContent = "Undo failed, try again";
      log.error(err);
    }
  };
  container.appendChild(undoBtn);
}

// ── Rules tab (Auto Clean) ───────────────────────────────────────────────
function renderRulesTab() {
  rulesListEl.innerHTML = "";
  if (cachedSettings.rules.length === 0) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "No rules yet — add one below.";
    rulesListEl.appendChild(p);
    return;
  }
  for (const rule of cachedSettings.rules) {
    const row = document.createElement("div");
    row.className = "rule-row";

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = rule.enabled;
    toggle.onchange = async () => {
      cachedSettings = await updateSettings({
        rules: cachedSettings.rules.map((r) => (r.id === rule.id ? { ...r, enabled: toggle.checked } : r)),
      });
    };

    const label = document.createElement("label");
    label.append(toggle, document.createTextNode(` ${rule.name} `));

    const desc = document.createElement("span");
    desc.className = "hint";
    const policy = `${rule.priority ?? 0}${rule.stopProcessing ? ", stops later rules" : ""}`;
    desc.textContent = `[priority ${policy}] ${describeRule(rule)}`;

    const del = document.createElement("button");
    del.textContent = "Delete";
    del.onclick = async () => {
      cachedSettings = await updateSettings({
        rules: cachedSettings.rules.filter((r) => r.id !== rule.id),
      });
      renderRulesTab();
    };

    row.append(label, desc, del);
    rulesListEl.appendChild(row);
  }
}

function collectRuleConditions(): RuleConditions {
  const c: RuleConditions = {};
  if (ruleFromDomainInput.value.trim()) c.fromDomain = ruleFromDomainInput.value.trim().toLowerCase();
  if (ruleFromAddressInput.value.trim()) c.fromAddress = ruleFromAddressInput.value.trim().toLowerCase();
  if (ruleOlderDaysInput.value) c.olderThanDays = Math.max(1, Number(ruleOlderDaysInput.value));
  if (ruleKindSel.value) c.kind = ruleKindSel.value as MessageKind;
  if (ruleUnsubSel.value) c.hasUnsubscribe = ruleUnsubSel.value === "yes";
  if (ruleUnreadSel.value) c.unread = ruleUnreadSel.value === "yes";
  return c;
}

function collectRuleExceptions(): RuleConditions | undefined {
  const exceptions: RuleConditions = {};
  if (ruleExceptDomainInput.value.trim()) {
    exceptions.fromDomain = ruleExceptDomainInput.value.trim().toLowerCase();
  }
  if (ruleExceptAddressInput.value.trim()) {
    exceptions.fromAddress = ruleExceptAddressInput.value.trim().toLowerCase();
  }
  return ruleHasConditions(exceptions) ? exceptions : undefined;
}

function resetRuleApplySlot() {
  ruleApplySlot.innerHTML = "";
  ruleApplySlot.appendChild(ruleApplyBtn);
}

function wireRulesTab() {
  ruleActionSel.onchange = () => {
    ruleLabelInput.hidden = ruleActionSel.value !== "label";
  };

  ruleForm.onsubmit = async (e) => {
    e.preventDefault();
    ruleFormError.textContent = "";
    const conditions = collectRuleConditions();
    if (!ruleHasConditions(conditions)) {
      ruleFormError.textContent = "Add at least one condition.";
      return;
    }
    const action = ruleActionSel.value as RuleAction;
    const labelName = action === "label" ? ruleLabelInput.value.trim() : undefined;
    if (action === "label" && !labelName) {
      ruleFormError.textContent = "A label action needs a label name.";
      return;
    }
    const rule: ClusterRule = {
      id: crypto.randomUUID(),
      name: ruleNameInput.value.trim() || "Untitled rule",
      enabled: true,
      conditions,
      exceptions: collectRuleExceptions(),
      priority: Math.max(-100, Math.min(100, Number(rulePriorityInput.value) || 0)),
      stopProcessing: ruleStopProcessingInput.checked,
      action,
      labelName,
    };
    cachedSettings = await updateSettings({ rules: [...cachedSettings.rules, rule] });
    ruleForm.reset();
    rulePriorityInput.value = "0";
    ruleLabelInput.hidden = true;
    renderRulesTab();
  };

  ruleDraftBtn.onclick = async () => {
    ruleDraftBtn.disabled = true;
    ruleSaveDraftBtn.disabled = true;
    ruleDraftStatus.textContent = "Drafting locally…";
    pendingRuleDraft = undefined;
    try {
      const draft = await draftRuleFromNaturalLanguage(ruleNaturalLanguageInput.value);
      pendingRuleDraft = draft.rule;
      const reviewRule = { ...draft.rule, enabled: true };
      const matches = previewRuleMatches([reviewRule], currentSenders);
      const conflicts = findRuleConflicts([...cachedSettings.rules, reviewRule], currentSenders).filter(
        (conflict) => conflict.ruleIds.includes(reviewRule.id),
      ).length;
      ruleDraftStatus.textContent = `${draft.source === "on-device-ai" ? "On-device AI" : "Deterministic fallback"}: ${describeRule(reviewRule)}. Current preview: ${matches} match${matches === 1 ? "" : "es"}${conflicts > 0 ? `, ${conflicts} overlap${conflicts === 1 ? "" : "s"}` : ""}.`;
      ruleSaveDraftBtn.disabled = false;
    } catch (error) {
      ruleDraftStatus.textContent = error instanceof Error ? error.message : "Could not draft that rule";
    } finally {
      ruleDraftBtn.disabled = false;
    }
  };

  ruleSaveDraftBtn.onclick = async () => {
    if (!pendingRuleDraft) return;
    cachedSettings = await updateSettings({
      rules: [...cachedSettings.rules, { ...pendingRuleDraft, enabled: true }],
    });
    pendingRuleDraft = undefined;
    ruleSaveDraftBtn.disabled = true;
    ruleNaturalLanguageInput.value = "";
    ruleDraftStatus.textContent =
      "Reviewed draft saved and enabled. It can run when you apply rules or during the background sweep.";
    renderRulesTab();
  };

  ruleApplyBtn.onclick = () => {
    const enabled = cachedSettings.rules.filter((r) => r.enabled);
    if (enabled.length === 0) {
      ruleFormError.textContent = "No enabled rules to apply.";
      return;
    }
    const count = previewRuleMatches(cachedSettings.rules, currentSenders);
    const conflicts = findRuleConflicts(cachedSettings.rules, currentSenders).length;
    renderConfirmStep(
      ruleApplySlot,
      resetRuleApplySlot,
      `Apply ${enabled.length} rule${enabled.length === 1 ? "" : "s"} across ${count} matches?${conflicts > 0 ? ` ${conflicts} message${conflicts === 1 ? " matches" : "s match"} multiple rules; priority and stop-processing decide the order.` : ""}`,
      false,
      async () => {
        const results = await applyRules(cachedSettings.rules, currentSenders, providerById);
        cachedSettings = await getSettings();
        renderRecentTab();
        const moved = results.reduce(
          (sum, r) => sum + [...r.movedByProvider.values()].reduce((a, b) => a + b, 0),
          0,
        );
        await scanAndRender();
        return `Applied — ${moved} message${moved === 1 ? "" : "s"} actioned`;
      },
    );
  };
}

// ── Recently done (review loop) ──────────────────────────────────────────
// Every action path calls logAction; the tab shows them newest-first with an
// Undo where the provider exposes the matching reversal.
async function logAction(kind: ActionLogKind, summary: string, undo?: ActionLogUndo) {
  await appendActionLog([{ id: makeLogId(kind), at: Date.now(), kind, summary, undo }]);
  cachedSettings = await getSettings();
  renderRecentTab();
}

async function undoEntry(entry: ActionLogEntry) {
  if (!entry.undo) return;
  const provider = providerById.get(entry.undo.provider);
  if (!provider) throw new Error(`Provider ${entry.undo.provider} is unavailable`);
  const token = await provider.getAuthToken(false);
  if (entry.undo.via === "untrash") {
    if (!provider.untrashMessages) throw new Error("This provider cannot restore trashed messages");
    await provider.untrashMessages(token, entry.undo.ids);
  } else if (entry.undo.via === "unarchive") {
    if (!provider.unarchiveMessages) throw new Error("This provider cannot restore archived messages");
    await provider.unarchiveMessages(token, entry.undo.ids);
  } else if (entry.undo.via === "unmute" && entry.undo.fromAddress) {
    if (!provider.unmuteSender) throw new Error("This provider cannot unmute senders");
    await provider.unmuteSender(token, entry.undo.fromAddress, entry.undo.ids);
  } else if (entry.undo.via === "unlabel-suspicious") {
    if (!provider.unlabelSuspicious) throw new Error("This provider cannot remove security labels");
    await provider.unlabelSuspicious(token, entry.undo.ids);
  } else if (entry.undo.via === "unsort" && entry.undo.labelName) {
    if (!provider.unlabelMessages) throw new Error("This provider cannot remove labels");
    await provider.unlabelMessages(
      token,
      entry.undo.ids,
      entry.undo.labelName,
      entry.undo.wasFiledOut ?? false,
    );
  }
  cachedSettings = await mutateSettings((current) => ({
    ...current,
    mutedSenders:
      entry.undo?.via === "unmute" && entry.undo.fromAddress
        ? current.mutedSenders.filter((address) => address !== entry.undo!.fromAddress)
        : current.mutedSenders,
    actionLog: current.actionLog.map((item) => (item.id === entry.id ? { ...item, undone: true } : item)),
    senderEngagement: entry.undo?.senderKeys
      ? recordEngagementFeedback(current.senderEngagement, entry.undo.senderKeys, "undo")
      : current.senderEngagement,
  }));
  renderRecentTab();
  await scanAndRender();
}

function renderRecentTab() {
  recentListEl.innerHTML = "";

  if (cachedSettings.lastTriageSummary) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = `Last background sweep: ${cachedSettings.lastTriageSummary}`;
    recentListEl.appendChild(p);
  }

  const entries = [...cachedSettings.actionLog].reverse();
  if (entries.length === 0) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Nothing done yet.";
    recentListEl.appendChild(p);
    return;
  }

  let lastDay = "";
  for (const entry of entries) {
    const day = new Date(entry.at).toLocaleDateString();
    if (day !== lastDay) {
      const h = document.createElement("h3");
      h.textContent = day;
      recentListEl.appendChild(h);
      lastDay = day;
    }

    const row = document.createElement("div");
    row.className = "recent-row";

    const text = document.createElement("span");
    const time = new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    text.textContent = `${time} — ${entry.summary}`;
    row.appendChild(text);

    if (entry.undone) {
      const done = document.createElement("span");
      done.className = "hint";
      done.textContent = "undone";
      row.appendChild(done);
    } else if (entry.undo) {
      const undoBtn = document.createElement("button");
      undoBtn.textContent = "Undo";
      undoBtn.onclick = async () => {
        undoBtn.disabled = true;
        undoBtn.textContent = "Undoing…";
        try {
          await undoEntry(entry);
        } catch (err) {
          undoBtn.disabled = false;
          undoBtn.textContent = "Undo failed, try again";
          log.error(err);
        }
      };
      row.appendChild(undoBtn);
    }

    recentListEl.appendChild(row);
  }
}

// ── Subscriptions tab ────────────────────────────────────────────────────
function unsubMethodLabel(u: SenderSummary["unsubscribe"]): string {
  if (u.postUrl) return "one-click";
  if (u.httpUrl) return "page";
  return "email";
}

function dominantKind(s: SenderSummary): string {
  const counts = new Map<string, number>();
  for (const m of s.messages) counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
  let best = "other";
  let bestN = -1;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

function subUnsubscribeCell(sender: SenderSummary): HTMLTableCellElement {
  const cell = document.createElement("td");
  const u = sender.unsubscribe;
  if (u.postUrl) {
    const btn = document.createElement("button");
    btn.textContent = cachedSettings.unsubscribeRequests[sender.key] ? "Request again" : "Unsubscribe";
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = "Requesting…";
      const ok = await fireOneClickUnsubscribe(u.postUrl!);
      if (ok) {
        await recordUnsubscribeRequests([sender]);
        await logAction("unsubscribe", `Unsubscribed from ${sender.address}`);
        renderSubscriptionsTab(currentSenders);
      } else {
        btn.disabled = false;
        btn.textContent = "Failed, retry";
      }
    };
    cell.appendChild(btn);

    const cleanup = buildSenderCleanupPlan(sender);
    if (cleanup.safeNewsletterIds.length > 0) {
      const cleanSlot = document.createElement("span");
      const cleanBtn = document.createElement("button");
      cleanBtn.className = "danger";
      cleanBtn.textContent = "Unsubscribe + clean…";
      const reset = () => {
        cleanSlot.replaceChildren(cleanBtn);
      };
      cleanBtn.onclick = () => {
        const kept = cleanup.protectedIds.length + cleanup.retainedOtherIds.length;
        renderConfirmStep(
          cleanSlot,
          reset,
          `Unsubscribe from ${sender.address} and move ${cleanup.safeNewsletterIds.length} newsletter message${cleanup.safeNewsletterIds.length === 1 ? "" : "s"} to Trash? ${kept} transactional, sensitive, starred, or ambiguous message${kept === 1 ? " stays" : "s stay"}.`,
          true,
          async () => {
            const ok = await fireOneClickUnsubscribe(u.postUrl!);
            if (!ok) return "Unsubscribe failed — no mail was moved";
            const provider = providerById.get(sender.provider);
            if (!provider) return "Provider unavailable — no mail was moved";
            const job = await createDurableJob({
              provider: sender.provider,
              operation: "trash",
              targetIds: cleanup.safeNewsletterIds,
            });
            const result = await runDurableJob(job.id, providerById);
            await recordUnsubscribeRequests([sender]);
            if (result.succeededIds.length > 0) {
              await logAction(
                "trash",
                `Unsubscribed from ${sender.address} and moved ${result.succeededIds.length} newsletter message${result.succeededIds.length === 1 ? "" : "s"} to Trash`,
                provider.untrashMessages
                  ? { provider: sender.provider, ids: result.succeededIds, via: "untrash" }
                  : undefined,
              );
            }
            return result.failures.length > 0
              ? `Unsubscribed; moved ${result.succeededIds.length}, failed ${result.failures.length}, kept ${kept}`
              : `Unsubscribed and moved ${result.succeededIds.length} to Trash; kept ${kept}`;
          },
        );
      };
      reset();
      cell.append(" ", cleanSlot);
    }
  } else if (u.mailto) {
    const a = document.createElement("a");
    a.href = u.mailto;
    a.textContent = "Email";
    a.target = "_blank";
    cell.appendChild(a);
  } else if (u.httpUrl) {
    const a = document.createElement("a");
    a.href = u.httpUrl;
    a.textContent = "Open page";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    cell.appendChild(a);
  }

  const readLaterPlan = buildSenderCleanupPlan(sender);
  const provider = providerById.get(sender.provider);
  if (readLaterPlan.safeNewsletterIds.length > 0 && provider?.labelMessages && provider.unlabelMessages) {
    const slot = document.createElement("span");
    const button = document.createElement("button");
    button.textContent = "Read later…";
    const reset = () => slot.replaceChildren(button);
    button.onclick = () => {
      const kept = readLaterPlan.protectedIds.length + readLaterPlan.retainedOtherIds.length;
      renderConfirmStep(
        slot,
        reset,
        `Move ${readLaterPlan.safeNewsletterIds.length} newsletter message${readLaterPlan.safeNewsletterIds.length === 1 ? "" : "s"} from ${sender.address} to Cluster/Read Later? ${kept} protected or ambiguous message${kept === 1 ? " stays" : "s stay"}.`,
        false,
        async () => {
          const job = await createDurableJob({
            provider: sender.provider,
            operation: "label",
            targetIds: readLaterPlan.safeNewsletterIds,
            labelName: "Cluster/Read Later",
            keepInInbox: false,
          });
          const result = await runDurableJob(job.id, providerById);
          if (result.succeededIds.length > 0) {
            await logAction(
              "sort",
              `Moved ${result.succeededIds.length} newsletter message${result.succeededIds.length === 1 ? "" : "s"} from ${sender.address} to Read Later`,
              {
                provider: sender.provider,
                ids: result.succeededIds,
                via: "unsort",
                labelName: "Cluster/Read Later",
                wasFiledOut: true,
              },
            );
          }
          return result.failures.length > 0
            ? `Moved ${result.succeededIds.length}; failed ${result.failures.length}; kept ${kept}`
            : `Moved ${result.succeededIds.length} to Read Later; kept ${kept}`;
        },
      );
    };
    reset();
    cell.append(" ", slot);
  }
  return cell;
}

function renderSubscriptionsTab(senders: SenderSummary[]) {
  const subs = senders
    .filter((s) => s.unsubscribe.postUrl || s.unsubscribe.httpUrl || s.unsubscribe.mailto)
    .sort((a, b) => b.count - a.count);
  pruneSelection(
    selectedSubKeys,
    subs.map((s) => s.key),
  );

  subscriptionsListEl.innerHTML = "";
  if (subs.length === 0) {
    subsBulkBar.hidden = true;
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "No senders with an unsubscribe option in the current scan.";
    subscriptionsListEl.appendChild(p);
    return;
  }

  const oneClick = subs.filter((s) => s.unsubscribe.postUrl);
  subsBulkBar.hidden = false;
  subsCountEl.textContent = `${subs.length} sender${subs.length === 1 ? "" : "s"}, ${oneClick.length} verified one-click`;
  subsUnsubAllBtn.disabled = oneClick.length === 0;

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.appendChild(
    headerRow([
      "",
      "Sender",
      `Count (${cachedSettings.scanWindowDays}d)`,
      "Mostly",
      "Method",
      "Status",
      "Action",
    ]),
  );
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const s of subs) {
    const row = document.createElement("tr");

    const cbCell = document.createElement("td");
    if (s.unsubscribe.postUrl) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selectedSubKeys.has(s.key);
      cb.onchange = () => {
        if (cb.checked) selectedSubKeys.add(s.key);
        else selectedSubKeys.delete(s.key);
      };
      cbCell.appendChild(cb);
    }
    row.appendChild(cbCell);

    const nameCell = document.createElement("td");
    nameCell.textContent = s.displayName ? `${s.displayName} <${s.address}>` : s.address;
    row.appendChild(nameCell);

    const countCell = document.createElement("td");
    countCell.textContent = String(s.count);
    row.appendChild(countCell);

    const kindCell = document.createElement("td");
    kindCell.textContent = dominantKind(s);
    row.appendChild(kindCell);

    const methodCell = document.createElement("td");
    methodCell.textContent = unsubMethodLabel(s.unsubscribe);
    row.appendChild(methodCell);

    const statusCell = document.createElement("td");
    const tracked = cachedSettings.unsubscribeRequests[s.key];
    statusCell.textContent = tracked ? `Requested ${formatRelativeTime(tracked.requestedAt)}` : "—";
    statusCell.className = "hint";
    row.appendChild(statusCell);

    row.appendChild(subUnsubscribeCell(s));
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  subscriptionsListEl.appendChild(table);
}

// ── Local engagement suggestions (Clean up tab) ──────────────────────────
function resetNeverReadSlots() {
  neverReadMuteSlot.innerHTML = "";
  neverReadMuteSlot.appendChild(neverReadMuteBtn);
  neverReadTrashSlot.innerHTML = "";
  neverReadTrashSlot.appendChild(neverReadTrashBtn);
}

function renderNeverReadSection(senders: SenderSummary[]) {
  engagementSuggestions = buildEngagementSuggestions(senders, cachedSettings.senderEngagement);
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
      renderNeverReadSection(currentSenders);
    };
    feedbackCell.appendChild(dismissBtn);
    row.append(nameCell, fitCell, reasonCell, actionCell, feedbackCell);
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  neverReadListEl.appendChild(table);

  resetNeverReadSlots();
  neverReadMuteBtn.disabled = !engagementSuggestions.some(
    ({ sender }) => sender.provider === "gmail" && !cachedSettings.mutedSenders.includes(sender.address),
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

// ── "Sort my inbox" (Clean up tab) ──────────────────────────────────────
// Buckets that come from the message kind (subject) rather than the sender's
// domain category -- they need a `kind` rule condition, the rest need
// `fromDomainCategory`.
const KIND_SORT_BUCKETS = new Set<SortBucket>(["otp", "receipt", "shipping", "newsletter", "social"]);

let sortPlan: SortPlanEntry[] = [];

function resetSortInboxSlot() {
  sortInboxSlot.innerHTML = "";
  sortInboxSlot.appendChild(sortInboxBtn);
}

function sortBucketChoices(): { bucket: SortBucket; include: boolean; keepInInbox: boolean }[] {
  return ALL_SORT_BUCKETS.filter((b) => sortPlan.some((e) => e.bucket === b)).map((bucket) => {
    const include =
      (document.getElementById(`sort-inc-${bucket}`) as HTMLInputElement | null)?.checked ?? false;
    const keepInInbox =
      (document.getElementById(`sort-keep-${bucket}`) as HTMLInputElement | null)?.checked ?? false;
    return { bucket, include, keepInInbox };
  });
}

function updateSortInboxCount() {
  const chosen = new Set(
    sortBucketChoices()
      .filter((c) => c.include)
      .map((c) => c.bucket),
  );
  const entries = sortPlan.filter((e) => chosen.has(e.bucket));
  const msgs = totalPlanCount(entries);
  sortInboxCountEl.textContent = entries.length
    ? `${msgs} message${msgs === 1 ? "" : "s"} → ${entries.length} label${entries.length === 1 ? "" : "s"}`
    : "nothing to sort";
  sortInboxBtn.disabled = entries.length === 0;
}

function renderSortInbox(senders: SenderSummary[]) {
  const cfg = cachedSettings.autoSort;
  sortPlan = buildSortPlan(senders, cfg.fileOutByBucket);
  resetSortInboxSlot();
  sortKeepSortingEl.checked = cfg.keepSorting;
  sortExpireOtpEl.checked = cfg.expireOtp;

  sortInboxBucketsEl.innerHTML = "";
  const neverConfigured = cfg.enabledBuckets.length === 0;
  for (const entry of sortPlan) {
    const row = document.createElement("label");
    row.className = "setting-toggle";
    const inc = document.createElement("input");
    inc.type = "checkbox";
    inc.id = `sort-inc-${entry.bucket}`;
    inc.checked = neverConfigured || cfg.enabledBuckets.includes(entry.bucket);
    inc.onchange = updateSortInboxCount;

    const text = document.createElement("span");
    text.textContent = ` ${SORT_BUCKET_LABELS[entry.bucket]} — ${entry.count} `;

    const keep = document.createElement("label");
    keep.className = "hint";
    const keepBox = document.createElement("input");
    keepBox.type = "checkbox";
    keepBox.id = `sort-keep-${entry.bucket}`;
    keepBox.checked = !entry.fileOut;
    keep.append(keepBox, document.createTextNode(" keep in inbox"));

    row.append(inc, text, keep);
    sortInboxBucketsEl.appendChild(row);
  }
  updateSortInboxCount();
}

function upsertRule(rules: ClusterRule[], rule: ClusterRule): ClusterRule[] {
  const without = rules.filter((r) => r.name !== rule.name);
  return [...without, rule];
}

function wireSortInbox() {
  sortInboxBtn.onclick = () => {
    const choices = sortBucketChoices().filter((c) => c.include);
    const chosen = choices
      .map((c) => {
        const entry = sortPlan.find((e) => e.bucket === c.bucket)!;
        return { ...entry, fileOut: !c.keepInInbox };
      })
      .filter((e) => e.count > 0);
    if (chosen.length === 0) return;

    const total = totalPlanCount(chosen);
    renderConfirmStep(
      sortInboxSlot,
      resetSortInboxSlot,
      `Sort ${total} message${total === 1 ? "" : "s"} into ${chosen.length} label${chosen.length === 1 ? "" : "s"}?`,
      false,
      async () => {
        cachedSettings = await updateSettings({
          autoSort: {
            enabledBuckets: chosen.map((e) => e.bucket),
            fileOutByBucket: Object.fromEntries(chosen.map((e) => [e.bucket, e.fileOut])),
            keepSorting: sortKeepSortingEl.checked,
            expireOtp: sortExpireOtpEl.checked,
          },
        });

        for (const entry of chosen) {
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
        }

        if (sortKeepSortingEl.checked) {
          let rules = cachedSettings.rules;
          for (const entry of chosen) {
            rules = upsertRule(rules, {
              id: crypto.randomUUID(),
              name: `Auto-sort: ${SORT_BUCKET_LABELS[entry.bucket]}`,
              enabled: true,
              conditions: KIND_SORT_BUCKETS.has(entry.bucket)
                ? { kind: entry.bucket as MessageKind }
                : { fromDomainCategory: entry.bucket as DomainCategory },
              action: "label",
              labelName: entry.label,
              labelKeepInInbox: !entry.fileOut,
            });
          }
          if (sortExpireOtpEl.checked) {
            rules = upsertRule(rules, {
              id: crypto.randomUUID(),
              name: "Auto-sort: expire one-time codes",
              enabled: true,
              conditions: { kind: "otp", olderThanDays: 2 },
              action: "trash",
            });
          }
          cachedSettings = await updateSettings({ rules });
        }

        await scanAndRender();
        return `Sorted ${total} into ${chosen.length} label${chosen.length === 1 ? "" : "s"}`;
      },
    );
  };
}

// ── Smart Views + Keep-newest (Clean up tab) ─────────────────────────────
async function applySmartView(view: SmartView, action: "archive" | "trash"): Promise<string> {
  const merged = evaluateSmartView(view, currentSenders);
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
    const merged = keepNewestExcess(currentSenders, n);
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

// ── Screener tab ─────────────────────────────────────────────────────────
// Foreground mirror of background.ts's runScreener — used when the user turns
// the Screener on so held mail moves right away rather than at the next sweep.
async function screenPending(senders: SenderSummary[]) {
  if (!gmailProvider.screenSender) return;
  const token = await gmailProvider.getAuthToken(false);

  if (sentCorrespondentsStale(cachedSettings) && gmailProvider.listSentCorrespondents) {
    try {
      const addresses = await gmailProvider.listSentCorrespondents(token);
      cachedSettings = await updateSettings({ sentCorrespondents: { addresses, fetchedAt: Date.now() } });
    } catch (err) {
      log.error("Screener: sent-correspondent refresh failed", err);
    }
  }

  const known = knownSenderSet(cachedSettings);
  const excluded = new Set(
    [...cachedSettings.mutedSenders, ...cachedSettings.screenedSenders].map((a) => a.toLowerCase()),
  );
  const pending = pendingScreenerSenders(senders, known, excluded);
  const screened: string[] = [];
  for (const s of pending) {
    try {
      await gmailProvider.screenSender(token, s.address, s.messageIds);
      screened.push(s.address);
    } catch (err) {
      log.error("Screener: failed to hold", s.address, err);
    }
  }
  if (screened.length > 0) {
    cachedSettings = await updateSettings({
      screenedSenders: [...cachedSettings.screenedSenders, ...screened],
    });
    await logAction(
      "screener",
      `Screener held ${screened.length} unknown sender${screened.length === 1 ? "" : "s"}`,
    );
  }
}

async function releaseHeldSender(address: string, ids: string[], decision: "allow" | "block") {
  const token = await gmailProvider.getAuthToken(false);
  if (decision === "allow") {
    await gmailProvider.allowSenderThrough!(token, address, ids);
    cachedSettings = await updateSettings({
      screenerAllowlist: [...new Set([...cachedSettings.screenerAllowlist, address])],
      screenedSenders: cachedSettings.screenedSenders.filter((a) => a !== address),
    });
    await logAction("screener", `Allowed ${address} through the Screener`);
  } else {
    await gmailProvider.muteSender!(token, address, ids);
    cachedSettings = await updateSettings({
      mutedSenders: [...new Set([...cachedSettings.mutedSenders, address])],
      screenedSenders: cachedSettings.screenedSenders.filter((a) => a !== address),
    });
    await logAction("mute", `Blocked ${address} from the Screener`);
  }
  await scanAndRender();
}

function renderScreenerTab(senders: SenderSummary[]) {
  screenerToggle.checked = cachedSettings.screenerEnabled;

  screenerQueueEl.innerHTML = "";
  if (!cachedSettings.screenerEnabled) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent =
      cachedSettings.screenedSenders.length > 0
        ? `Screener is off. ${cachedSettings.screenedSenders.length} sender(s) are still held — turn it back on to review them, or find them under the Cluster/Screener label in Gmail.`
        : "Screener is off.";
    screenerQueueEl.appendChild(p);
  } else {
    const known = knownSenderSet(cachedSettings);
    const muted = new Set(cachedSettings.mutedSenders.map((a) => a.toLowerCase()));
    const queue = pendingScreenerSenders(senders, known, muted);

    if (queue.length === 0) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "Nothing waiting — every sender in this scan is someone you've emailed or allowed.";
      screenerQueueEl.appendChild(p);
    } else {
      const table = document.createElement("table");
      const tbody = document.createElement("tbody");
      for (const s of queue) {
        const row = document.createElement("tr");

        const nameCell = document.createElement("td");
        nameCell.textContent = s.displayName ? `${s.displayName} <${s.address}>` : s.address;
        const countCell = document.createElement("td");
        countCell.textContent = `${s.messageIds.length} message${s.messageIds.length === 1 ? "" : "s"}`;

        const actionCell = document.createElement("td");
        const allow = document.createElement("button");
        allow.textContent = "Allow";
        allow.onclick = async () => {
          allow.disabled = true;
          try {
            await releaseHeldSender(s.address, s.messageIds, "allow");
          } catch (err) {
            allow.disabled = false;
            log.error(err);
          }
        };
        const block = document.createElement("button");
        block.className = "danger";
        block.textContent = "Block";
        block.onclick = async () => {
          block.disabled = true;
          try {
            await releaseHeldSender(s.address, s.messageIds, "block");
          } catch (err) {
            block.disabled = false;
            log.error(err);
          }
        };
        actionCell.append(allow, block);

        row.append(nameCell, countCell, actionCell);
        tbody.appendChild(row);
      }
      table.appendChild(tbody);
      screenerQueueEl.appendChild(table);
    }
  }

  // Allow-list management
  screenerAllowlistEl.innerHTML = "";
  if (cachedSettings.screenerAllowlist.length === 0) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "No addresses added by hand yet (your sent mail already counts as allowed).";
    screenerAllowlistEl.appendChild(p);
  } else {
    for (const address of cachedSettings.screenerAllowlist) {
      const row = document.createElement("div");
      row.className = "recent-row";
      const label = document.createElement("span");
      label.textContent = address;
      const remove = document.createElement("button");
      remove.textContent = "Remove";
      remove.onclick = async () => {
        cachedSettings = await updateSettings({
          screenerAllowlist: cachedSettings.screenerAllowlist.filter((a) => a !== address),
        });
        renderScreenerTab(currentSenders);
      };
      row.append(label, remove);
      screenerAllowlistEl.appendChild(row);
    }
  }
}

function wireScreenerTab() {
  screenerToggle.onchange = async () => {
    cachedSettings = await updateSettings({ screenerEnabled: screenerToggle.checked });
    if (screenerToggle.checked) {
      screenerToggle.disabled = true;
      try {
        await screenPending(currentSenders);
        await scanAndRender();
      } catch (err) {
        log.error(err);
      } finally {
        screenerToggle.disabled = false;
      }
    } else {
      renderScreenerTab(currentSenders);
    }
  };
}

// ── Bulk action bars ─────────────────────────────────────────────────────
function wireBulkHandlers() {
  selectSafeSendersBtn.onclick = () => {
    const safe = safeSenderKeys(currentSenders);
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
    const selected = currentSenders.filter((s) => selectedSenderKeys.has(s.key));
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
      render(currentSenders);
      return `Unsubscribed ${succeeded.length}, failed ${failed.length}, skipped ${manual.length} (no verified link)`;
    });
  };

  const resetKeepSortedBulkSlot = () => {
    keepSortedBulkSlot.innerHTML = "";
    keepSortedBulkSlot.appendChild(bulkKeepSortedBtn);
  };

  bulkKeepSortedBtn.onclick = () => {
    const selected = currentSenders.filter((s) => selectedSenderKeys.has(s.key));
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
    const selected = currentSenders.filter((s) => selectedSenderKeys.has(s.key));
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

  // ── Subscriptions: unsubscribe all verified ──
  const resetSubsUnsubAllSlot = () => {
    subsUnsubAllSlot.innerHTML = "";
    subsUnsubAllSlot.appendChild(subsUnsubAllBtn);
  };

  subsUnsubAllBtn.onclick = () => {
    const oneClick = currentSenders.filter(
      (s) => s.unsubscribe.postUrl && (selectedSubKeys.size === 0 || selectedSubKeys.has(s.key)),
    );
    if (oneClick.length === 0) return;
    const scope = selectedSubKeys.size === 0 ? "all" : `${oneClick.length} selected`;
    renderConfirmStep(
      subsUnsubAllSlot,
      resetSubsUnsubAllSlot,
      `Send a verified one-click unsubscribe to ${scope} (${oneClick.length} sender${oneClick.length === 1 ? "" : "s"})?`,
      false,
      async (summary) => {
        summary.textContent = "Requesting permission…";
        const granted = await ensureOriginsPermission(oneClick.map((s) => s.unsubscribe.postUrl!));
        if (!granted) return "Permission denied — nothing sent";
        summary.textContent = "Unsubscribing…";
        const { succeeded, failed } = await executeBulkUnsubscribe(oneClick, fireOneClickUnsubscribe);
        await recordUnsubscribeRequests(succeeded);
        if (succeeded.length > 0) {
          await logAction("unsubscribe", `Bulk unsubscribed from ${succeeded.length} senders`);
        }
        renderSubscriptionsTab(currentSenders);
        return `Unsubscribed ${succeeded.length}, failed ${failed.length}`;
      },
    );
  };

  // ── Local engagement suggestions: mute all / trash all ──
  neverReadMuteBtn.onclick = () => {
    const targets = engagementSuggestions.filter(
      ({ sender }) => sender.provider === "gmail" && !cachedSettings.mutedSenders.includes(sender.address),
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
        cachedSettings = await mutateSettings((current) => ({
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
