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
import { buildExpiryBuckets, mergeExpiryBuckets, totalExpiryCount, type ExpiryBucket } from "../lib/expiryTriage";
import { getElevatedAuthToken } from "../lib/gmailApi";
import type { EmailProvider, ProviderId } from "../lib/providers/emailProvider";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { outlookProvider } from "../lib/providers/outlookProvider";
import { buildSenderSummaries, type SenderSummary } from "../lib/senderModel";
import { getSettings, updateSettings, type DeclutterSettings } from "../lib/settingsStore";
import { excludeSnoozedMessages } from "../lib/snoozeFilter";
import { resurfaceDueSnoozed } from "../lib/snoozeResurface";
import { ensureOriginsPermission, fireOneClickUnsubscribe } from "../lib/unsubscribe";

const providerById = new Map<ProviderId, EmailProvider>([
  [gmailProvider.id, gmailProvider],
  [outlookProvider.id, outlookProvider],
]);
const activeProviders: EmailProvider[] = [gmailProvider];

const selectedSenderKeys = new Set<string>();
const selectedDomainKeys = new Set<string>();
let currentSenders: SenderSummary[] = [];
let currentDomainGroups: DomainGroup[] = [];
let currentExpiryBuckets: ExpiryBucket[] = [];
let cachedSettings: DeclutterSettings;

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
const expiryBreakdownEl = document.getElementById("expiry-breakdown") as HTMLSpanElement;
const expiryCleanupSlot = document.getElementById("expiry-cleanup-slot") as HTMLSpanElement;
const expiryCleanupBtn = document.getElementById("expiry-cleanup-btn") as HTMLButtonElement;

const fastDeleteToggle = document.getElementById("fast-delete-toggle") as HTMLInputElement;

const scanWindowInput = document.getElementById("scan-window-input") as HTMLInputElement;
const maxMessagesInput = document.getElementById("max-messages-input") as HTMLInputElement;
const applyScanSettingsBtn = document.getElementById("apply-scan-settings-btn") as HTMLButtonElement;

const onboardingBanner = document.getElementById("onboarding-banner") as HTMLDivElement;
const onboardingDismissBtn = document.getElementById("onboarding-dismiss-btn") as HTMLButtonElement;

const digestSectionEl = document.getElementById("digest-section") as HTMLElement;
const generateDigestBtn = document.getElementById("generate-digest-btn") as HTMLButtonElement;
const digestStatusEl = document.getElementById("digest-status") as HTMLSpanElement;
const digestTextEl = document.getElementById("digest-text") as HTMLParagraphElement;

async function main() {
  statusEl.textContent = "Connecting…";
  cachedSettings = await getSettings();
  fastDeleteToggle.checked = cachedSettings.fastPermanentDeleteEnabled;
  wireFastDeleteToggle();
  scanWindowInput.value = String(cachedSettings.scanWindowDays);
  maxMessagesInput.value = String(cachedSettings.maxMessagesPerProvider);
  wireScanSettings();

  onboardingBanner.hidden = cachedSettings.onboardingDismissed;
  onboardingDismissBtn.onclick = async () => {
    onboardingBanner.hidden = true;
    cachedSettings = await updateSettings({ onboardingDismissed: true });
  };

  await gmailProvider.getAuthToken(true);
  resurfaceDueSnoozed(gmailProvider).catch((err) => console.error("Resurfacing snoozed mail failed", err));

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
      console.error(err);
    }
  };

  wireBulkHandlers();
  wireOfflineHandling();
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
  try {
    senders = await buildSenderSummaries(
      activeProviders,
      cachedSettings.maxMessagesPerProvider,
      cachedSettings.scanWindowDays,
      (done, total) => {
        statusEl.textContent = total > 0 ? `Scanning recent mail… ${done}/${total} messages` : "Scanning recent mail…";
      },
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

  statusEl.hidden = true;
  senderGroupsEl.hidden = false;
  domainSectionEl.hidden = false;

  render(senders);
  renderDomainGroups(senders);
  renderExpirySection(senders);
  generateDigestBtn.disabled = false;
}

function showScanError(err: unknown) {
  console.error(err);
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

function pruneSelection(selection: Set<string>, validKeys: string[]) {
  const valid = new Set(validKeys);
  for (const key of selection) {
    if (!valid.has(key)) selection.delete(key);
  }
}

// ── Shared two-step confirm UI (used by single-row and bulk actions alike) ──
function renderConfirmStep(
  container: HTMLElement,
  resetContent: () => void,
  summaryText: string,
  danger: boolean,
  onConfirm: (summary: HTMLElement) => Promise<string>,
) {
  container.innerHTML = "";

  const summary = document.createElement("span");
  summary.textContent = summaryText;
  container.appendChild(summary);

  const confirmBtn = document.createElement("button");
  if (danger) confirmBtn.className = "danger";
  confirmBtn.textContent = "Confirm";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.onclick = resetContent;

  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    try {
      summary.textContent = await onConfirm(summary);
    } catch (err) {
      summary.textContent = "Action failed, try again";
      console.error(err);
    }
  };

  container.append(confirmBtn, cancelBtn);
}

// ── Shared collapsible-by-category rendering (sender table + domain table) ──
interface CategoryGroup<T> {
  category: DomainCategory;
  items: T[];
  total: number;
}

function groupByCategory<T>(
  items: T[],
  categoryOf: (item: T) => DomainCategory,
  countOf: (item: T) => number,
): CategoryGroup<T>[] {
  const map = new Map<DomainCategory, CategoryGroup<T>>();
  for (const item of items) {
    const category = categoryOf(item);
    let group = map.get(category);
    if (!group) {
      group = { category, items: [], total: 0 };
      map.set(category, group);
    }
    group.items.push(item);
    group.total += countOf(item);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function headerRow(labels: string[]): HTMLTableRowElement {
  const row = document.createElement("tr");
  for (const label of labels) {
    const th = document.createElement("th");
    th.textContent = label;
    row.appendChild(th);
  }
  return row;
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
    details.addEventListener("toggle", () => {
      toggleCollapsedCategory(collapseSettingsKey, group.category, !details.open);
    });

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
    for (const item of group.items) tbody.appendChild(buildRow(item));
    table.appendChild(tbody);

    details.appendChild(table);
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
    ["", "Provider", "Sender", `Count (${cachedSettings.scanWindowDays}d)`, "Unsubscribe", "Keep sorted", "Snooze"],
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
  nameCell.textContent = sender.displayName
    ? `${sender.displayName} <${sender.address}>`
    : sender.address;
  row.appendChild(nameCell);

  const countCell = document.createElement("td");
  countCell.textContent = String(sender.count);
  row.appendChild(countCell);

  row.appendChild(buildUnsubscribeCell(sender));
  row.appendChild(buildKeepSortedCell(sender));
  row.appendChild(buildSnoozeCell(sender));

  return row;
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
function formatRelativeTime(epochMs: number): string {
  const minutes = Math.floor((Date.now() - epochMs) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function recordUnsubscribeRequests(senders: SenderSummary[]) {
  if (senders.length === 0) return;
  const requests = { ...cachedSettings.unsubscribeRequests };
  const now = Date.now();
  for (const s of senders) requests[s.key] = { requestedAt: now, provider: s.provider };
  cachedSettings = await updateSettings({ unsubscribeRequests: requests });
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
        applyState();
      } else {
        statusEl.textContent = "Request failed, try again";
        btn.textContent = cachedSettings.unsubscribeRequests[sender.key] ? "Request again" : "Unsubscribe (verified one-click)";
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
      const labelName = `Declutter/${sender.displayName || sender.address}`;
      await provider.keepSorted(token, sender.address, labelName, sender.messageIds);
      btn.textContent = "Sorted ✓";
    } catch (err) {
      btn.textContent = "Failed, try again";
      btn.disabled = false;
      console.error(err);
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
      btn.textContent = `Snoozed until ${new Date(resurfaceAt).toLocaleDateString()} ✓`;
    } catch (err) {
      btn.textContent = "Failed, try again";
      btn.disabled = false;
      select.disabled = false;
      console.error(err);
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
      appendUndoButton(cell, merged.get("gmail") ?? []);
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
        cachedSettings = await updateSettings({ fastPermanentDeleteEnabled: true });
      } catch (err) {
        fastDeleteToggle.checked = false;
        console.error(err);
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
    const scanWindowDays = Math.min(3650, Math.max(1, Number(scanWindowInput.value) || cachedSettings.scanWindowDays));
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
    digestStatusEl.textContent = availability === "available" ? "Generating…" : "Downloading on-device model…";
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
      console.error(err);
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
    cachedSettings.fastPermanentDeleteEnabled && gmailCount > 0 && Boolean(gmailProvider.permanentlyDeleteMessages);
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
    return { message: `Moved ${gmailCount + otherCount} to Trash ✓`, undoableGmailIds: merged.get("gmail") ?? [] };
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
    console.error("Elevated permanent-delete failed, falling back to Trash", err);
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
      console.error(err);
    }
  };
  container.appendChild(undoBtn);
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
      return message;
    });
  };
}

main().catch((err) => {
  console.error(err);
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
