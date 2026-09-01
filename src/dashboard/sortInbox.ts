// "Sort my inbox" — extracted from dashboard.ts (the first slice of the split).
// Owns its own DOM refs and module state; reads the shared scan/settings via
// `ctx` and triggers a rescan / writes the action log via the state bridge.
import { log } from "../lib/log";
import {
  buildSortPlan,
  resolvePlanLabels,
  totalPlanCount,
  type PlanLabelConflict,
  type SortPlanEntry,
  type SortPlanMessage,
} from "../lib/autoSort";
import {
  ALL_SORT_BUCKETS,
  SORT_BUCKET_LABELS,
  type SortBucket,
  type SortOverride,
} from "../lib/sortTaxonomy";
import {
  buildBucketFilter,
  buildBucketRule,
  bucketMatchTerms,
  isServerSortBucket,
} from "../lib/serverSort";
import {
  filteredFromTargets,
  findLabelReuseCandidates,
  skipOverridesFor,
} from "../lib/seedFromExisting";
import {
  createFilter,
  deleteFilter,
  getOrCreateLabel,
  listFilters,
  listLabelNames,
} from "../lib/gmailApi";
import {
  createInboxRule,
  deleteInboxRule,
  getArchiveFolderId,
  outlookProvider,
} from "../lib/providers/outlookProvider";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { recordRuleCompletions } from "../lib/ruleCompletionLedger";
import { applyLabelChoice, type LabelChoice } from "../lib/labelResolver";
import { upsertRuleByName, type ClusterRule } from "../lib/rules";
import type { MessageKind } from "../lib/messageKind";
import type { DomainCategory } from "../lib/domainCategories";
import type { ProviderId } from "../lib/providers/emailProvider";
import type { SenderSummary } from "../lib/senderModel";
import { updateSettings } from "../lib/settingsStore";
import { activeProviders, ctx, logAction, providerById, rescan } from "./state";
import { formatRelativeTime, pruneSelection } from "./ui";

const sortInboxBtn = document.getElementById("sort-inbox-btn") as HTMLButtonElement;
const sortInboxSlot = document.getElementById("sort-inbox-slot") as HTMLSpanElement;
const sortInboxCountEl = document.getElementById("sort-inbox-count") as HTMLSpanElement;
const sortInboxBucketsEl = document.getElementById("sort-inbox-buckets") as HTMLDivElement;
const sortKeepSortingEl = document.getElementById("sort-keep-sorting") as HTMLInputElement;
const sortExpireOtpEl = document.getElementById("sort-expire-otp") as HTMLInputElement;
const sortInboxPreviewEl = document.getElementById("sort-inbox-preview") as HTMLDivElement;
const sortSeedCardEl = document.getElementById("sort-seed-card") as HTMLElement;

// ── "Sort my inbox" (Clean up tab) ──────────────────────────────────────
// Buckets that come from the message kind (subject) rather than the sender's
// domain category -- they need a `kind` rule condition, the rest need
// `fromDomainCategory`.
const KIND_SORT_BUCKETS = new Set<SortBucket>(["otp", "receipt", "shipping", "newsletter", "social"]);

let sortPlan: SortPlanEntry[] = [];
// Message ids the user unticked in the preview — skipped when Apply runs.
// Cleared on every rescan and after a successful sort.
const excludedSortIds = new Set<string>();

function resetSortInboxSlot() {
  sortInboxSlot.innerHTML = "";
  sortInboxSlot.appendChild(sortInboxBtn);
}

function clearSortPreview() {
  sortInboxPreviewEl.innerHTML = "";
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

// The config <details> checkbox rows — one per bucket in the current plan.
// Rebuilt whenever the plan changes (a fresh scan, or a "wrong bucket?"
// override that adds/removes a bucket).
function renderSortBucketToggles() {
  const cfg = ctx.settings.autoSort;
  const neverConfigured = cfg.enabledBuckets.length === 0;
  sortInboxBucketsEl.innerHTML = "";
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

  const filterCount = Object.values(cfg.filterIdsByBucket).reduce((n, ids) => n + ids.length, 0);
  const ruleCount = Object.values(cfg.ruleIdsByBucket).reduce((n, ids) => n + ids.length, 0);
  if (filterCount + ruleCount > 0) {
    const parts: string[] = [];
    if (filterCount > 0) parts.push(`${filterCount} Gmail filter${filterCount === 1 ? "" : "s"}`);
    if (ruleCount > 0) parts.push(`${ruleCount} Outlook rule${ruleCount === 1 ? "" : "s"}`);
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = `${parts.join(" + ")} keep these buckets sorted at delivery — manage them in your provider's settings.`;
    sortInboxBucketsEl.appendChild(note);
  }

  updateSortInboxCount();
}

function renderSortInbox(senders: SenderSummary[]) {
  const cfg = ctx.settings.autoSort;
  sortPlan = buildSortPlan(senders, cfg.fileOutByBucket, ctx.settings.sortOverrides);
  resetSortInboxSlot();
  clearSortPreview();
  pruneSelection(
    excludedSortIds,
    sortPlan.flatMap((e) => e.messages.map((m) => m.id)),
  );
  sortKeepSortingEl.checked = cfg.keepSorting;
  sortExpireOtpEl.checked = cfg.expireOtp;
  renderSortBucketToggles();
}

// Cluster's sort-bucket labels are flat ("Shopping", …). Before applying, we
// check them against the mailbox's existing labels: a clash with a label the
// user made themselves is surfaced here so they can choose to reuse it or keep
// Cluster's separate as "<name> (Cluster)". The choice persists
// (settings.labelChoices) so this only asks once.
function renderSortLabelConflicts(conflicts: PlanLabelConflict[], retry: () => void) {
  sortInboxSlot.innerHTML = "";

  const intro = document.createElement("span");
  intro.textContent =
    conflicts.length === 1
      ? "You already have a label with this name — reuse it, or keep Cluster's separate? "
      : "You already have labels with these names — reuse them, or keep Cluster's separate? ";
  sortInboxSlot.appendChild(intro);

  for (const c of conflicts) {
    const reuseBtn = document.createElement("button");
    reuseBtn.textContent = `Use my "${c.existingUserLabel}"`;
    reuseBtn.onclick = () => resolveSortLabelConflict(c.desired, "reuse", retry);

    const suffixBtn = document.createElement("button");
    suffixBtn.textContent = `Keep separate: "${c.desired} (Cluster)"`;
    suffixBtn.onclick = () => resolveSortLabelConflict(c.desired, "suffix", retry);

    sortInboxSlot.append(reuseBtn, suffixBtn);
  }

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.onclick = resetSortInboxSlot;
  sortInboxSlot.appendChild(cancelBtn);
}

async function resolveSortLabelConflict(desired: string, choice: LabelChoice, retry: () => void) {
  ctx.settings = await updateSettings({
    labelChoices: { ...ctx.settings.labelChoices, [desired]: applyLabelChoice(desired, choice) },
  });
  retry();
}

// Labels the mailbox already has, captured on the "Sort my inbox…" click so a
// "wrong bucket?" correction can re-resolve names without another fetch.
let lastKnownLabelNames: string[] = [];

// Re-derive the plan with the current per-sender overrides, refresh the config
// toggles, resolve label names, and show either the collision prompt or the
// preview. Called by the button and after every override change.
function rebuildSortPreview() {
  sortPlan = buildSortPlan(
    ctx.senders,
    ctx.settings.autoSort.fileOutByBucket,
    ctx.settings.sortOverrides,
  );
  renderSortBucketToggles();
  pruneSelection(
    excludedSortIds,
    sortPlan.flatMap((e) => e.messages.map((m) => m.id)),
  );

  const rawChosen = sortBucketChoices()
    .filter((c) => c.include)
    .map((c) => {
      const entry = sortPlan.find((e) => e.bucket === c.bucket)!;
      return { ...entry, fileOut: !c.keepInInbox };
    })
    .filter((e) => e.count > 0);
  if (rawChosen.length === 0) {
    clearSortPreview();
    return;
  }

  const { plan: chosen, conflicts } = resolvePlanLabels(
    rawChosen,
    lastKnownLabelNames,
    ctx.settings.clusterOwnedLabels,
    ctx.settings.labelChoices,
  );
  if (conflicts.length > 0) {
    clearSortPreview();
    renderSortLabelConflicts(conflicts, rebuildSortPreview);
    return;
  }

  renderSortPreview(chosen, new Set(lastKnownLabelNames.map((n) => n.toLowerCase())));
}

async function startSortFlow() {
  try {
    const token = await gmailProvider.getAuthToken(false);
    lastKnownLabelNames = await listLabelNames(token);
  } catch (err) {
    log.error("Couldn't list Gmail labels for the collision check", err);
    lastKnownLabelNames = [];
  }
  rebuildSortPreview();
}

async function changeSortOverride(address: string, value: "" | SortOverride) {
  const key = address.toLowerCase();
  const next = { ...ctx.settings.sortOverrides };
  if (value === "") delete next[key];
  else next[key] = value;
  ctx.settings = await updateSettings({ sortOverrides: next });
  rebuildSortPreview();
}

// The dry-run: bucket → sender → message. Each message ticks to include, each
// sender carries a "wrong bucket?" menu. Nothing is touched until Apply.
function renderSortPreview(chosen: SortPlanEntry[], knownLower: Set<string>) {
  clearSortPreview();
  resetSortInboxSlot();

  const applyBtn = document.createElement("button");
  const cancelBtn = document.createElement("button");
  const status = document.createElement("span");
  status.className = "hint";

  const includedCount = () =>
    chosen.flatMap((e) => e.messages).filter((m) => !excludedSortIds.has(m.id)).length;
  const refreshApplyLabel = () => {
    const n = includedCount();
    applyBtn.textContent = `Apply — ${n} message${n === 1 ? "" : "s"}`;
    applyBtn.disabled = n === 0;
  };

  for (const entry of chosen) {
    const bucketEl = document.createElement("details");
    bucketEl.className = "sort-preview-bucket";
    bucketEl.open = true;
    const summary = document.createElement("summary");
    summary.textContent = `${entry.label} — ${entry.count} · ${
      entry.fileOut ? "filed out of the inbox" : "labelled in place"
    }`;
    bucketEl.appendChild(summary);

    const bySender = new Map<string, SortPlanMessage[]>();
    for (const m of entry.messages) {
      const list = bySender.get(m.address) ?? [];
      list.push(m);
      bySender.set(m.address, list);
    }

    for (const [address, msgs] of bySender) {
      const senderEl = document.createElement("details");
      senderEl.className = "sort-preview-sender";
      const sSummary = document.createElement("summary");
      sSummary.append(document.createTextNode(`${msgs[0].displayName || address} — ${msgs.length} `));

      const select = document.createElement("select");
      select.title = "Sort this sender differently";
      select.add(new Option(`keep as ${SORT_BUCKET_LABELS[entry.bucket]}`, ""));
      for (const b of ALL_SORT_BUCKETS) {
        if (b !== entry.bucket) select.add(new Option(`move to ${SORT_BUCKET_LABELS[b]}`, b));
      }
      select.add(new Option("never sort this sender", "never"));
      select.value = ctx.settings.sortOverrides[address.toLowerCase()] ?? "";
      select.onchange = () => void changeSortOverride(address, select.value as "" | SortOverride);
      // A <select> inside a <summary> would also toggle the <details>; don't.
      select.onclick = (e) => e.stopPropagation();
      sSummary.appendChild(select);
      senderEl.appendChild(sSummary);

      for (const m of msgs) {
        const row = document.createElement("label");
        row.className = "sort-preview-row";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !excludedSortIds.has(m.id);
        cb.onchange = () => {
          if (cb.checked) excludedSortIds.delete(m.id);
          else excludedSortIds.add(m.id);
          refreshApplyLabel();
        };
        const text = document.createElement("span");
        const sensitive = entry.fileOut && m.sensitiveWhenFiled ? " · sensitive?" : "";
        text.textContent = ` ${m.subject || "(no subject)"} · ${formatRelativeTime(m.receivedAt)}${sensitive}`;
        row.append(cb, text);
        senderEl.appendChild(row);
      }
      bucketEl.appendChild(senderEl);
    }
    sortInboxPreviewEl.appendChild(bucketEl);
  }

  cancelBtn.textContent = "Cancel";
  cancelBtn.onclick = clearSortPreview;
  applyBtn.onclick = async () => {
    applyBtn.disabled = true;
    cancelBtn.disabled = true;
    status.textContent = "Sorting…";
    try {
      status.textContent = await applySortPlan(chosen, knownLower);
    } catch (err) {
      log.error(err);
      status.textContent = "Sort failed, try again";
      applyBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  };

  const bar = document.createElement("div");
  bar.className = "bulk-bar";
  bar.append(applyBtn, cancelBtn, status);
  sortInboxPreviewEl.appendChild(bar);
  refreshApplyLabel();
}

async function applySortPlan(chosen: SortPlanEntry[], knownLower: Set<string>): Promise<string> {
  // Drop unticked messages, then any bucket that's now empty.
  const effective = chosen
    .map((entry) => {
      const messages = entry.messages.filter((m) => !excludedSortIds.has(m.id));
      const idsByProvider = new Map<ProviderId, string[]>();
      for (const m of messages) {
        const list = idsByProvider.get(m.provider) ?? [];
        list.push(m.id);
        idsByProvider.set(m.provider, list);
      }
      return { ...entry, messages, idsByProvider, count: messages.length };
    })
    .filter((e) => e.count > 0);
  if (effective.length === 0) return "Nothing selected";

  const total = effective.reduce((sum, e) => sum + e.count, 0);
  const keepOn = sortKeepSortingEl.checked;

  // Apply the one-time backlog.
  for (const entry of effective) {
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

  // Record any label we just created so a later run reuses it without asking.
  const created = [
    ...new Set(
      effective
        .map((e) => e.label)
        .filter(
          (name) =>
            !knownLower.has(name.toLowerCase()) &&
            !ctx.settings.clusterOwnedLabels.some((o) => o.toLowerCase() === name.toLowerCase()),
        ),
    ),
  ];
  if (created.length > 0) {
    ctx.settings = await updateSettings({
      clusterOwnedLabels: [...ctx.settings.clusterOwnedLabels, ...created],
    });
  }

  // ── Keep sorting ───────────────────────────────────────────────────────
  // Domain-category buckets → a real Gmail filter + (if Outlook is connected)
  // an Outlook inbox rule, so new mail is filed at delivery with the browser
  // shut. Subject-kind buckets → a client rule for the 6-hourly sweep. Server
  // buckets also keep a client rule as a fallback (the Graph rule path is not
  // yet battle-tested; on Gmail it's a near-noop via the completion ledger).
  const gmailToken = await gmailProvider.getAuthToken(false).catch((err) => {
    log.error("keep-sorting: no Gmail token", err);
    return null;
  });
  const outlookOn = activeProviders.some((p) => p.id === "outlook");
  const outlookToken = outlookOn
    ? await outlookProvider.getAuthToken(false).catch((err: unknown) => {
        log.error("keep-sorting: no Outlook token", err);
        return null;
      })
    : null;
  const archiveFolderId = outlookToken ? await getArchiveFolderId(outlookToken).catch(() => null) : null;

  const filterIds: Record<string, string[]> = { ...ctx.settings.autoSort.filterIdsByBucket };
  const ruleIds: Record<string, string[]> = { ...ctx.settings.autoSort.ruleIdsByBucket };
  const keptServerBuckets = new Set(
    keepOn ? effective.filter((e) => isServerSortBucket(e.bucket)).map((e) => e.bucket) : [],
  );

  // Tear down server-side filters/rules for buckets that are no longer kept.
  for (const bucket of new Set([...Object.keys(filterIds), ...Object.keys(ruleIds)])) {
    if (keptServerBuckets.has(bucket as SortBucket)) continue;
    if (gmailToken) {
      for (const id of filterIds[bucket] ?? []) {
        await deleteFilter(gmailToken, id).catch((err) => log.error("keep-sorting: delete filter", err));
      }
    }
    if (outlookToken) {
      for (const id of ruleIds[bucket] ?? []) {
        await deleteInboxRule(outlookToken, id).catch((err) => log.error("keep-sorting: delete rule", err));
      }
    }
    delete filterIds[bucket];
    delete ruleIds[bucket];
  }

  if (keepOn) {
    let rules = ctx.settings.rules;
    const sortCompletions: Array<{ rule: ClusterRule; idsByProvider: Map<ProviderId, string[]> }> = [];

    for (const entry of effective) {
      const server = isServerSortBucket(entry.bucket);
      const hasOutlook = (entry.idsByProvider.get("outlook") ?? []).length > 0;
      const terms = server ? bucketMatchTerms(entry.bucket, ctx.settings.sortOverrides) : null;

      if (server && terms && gmailToken) {
        const labelId = await getOrCreateLabel(gmailToken, entry.label);
        for (const id of filterIds[entry.bucket] ?? []) {
          await deleteFilter(gmailToken, id).catch((err) => log.error("keep-sorting: replace filter", err));
        }
        const spec = buildBucketFilter(labelId, entry.fileOut, terms);
        filterIds[entry.bucket] = spec
          ? [await createFilter(gmailToken, spec.criteria, spec.action)]
          : [];
      }

      if (server && terms && outlookToken) {
        for (const id of ruleIds[entry.bucket] ?? []) {
          await deleteInboxRule(outlookToken, id).catch((err) => log.error("keep-sorting: replace rule", err));
        }
        const ruleBody = buildBucketRule(
          `Cluster: ${SORT_BUCKET_LABELS[entry.bucket]}`,
          entry.label,
          entry.fileOut,
          archiveFolderId,
          terms,
          20,
        );
        try {
          ruleIds[entry.bucket] = ruleBody ? [await createInboxRule(outlookToken, ruleBody)] : [];
        } catch (err) {
          log.error("keep-sorting: create Outlook rule", err);
          ruleIds[entry.bucket] = [];
        }
      }

      // Client rule: always for kind buckets; for server buckets only when
      // there's Outlook mail to cover (fallback for the Graph rule path).
      if (!server || hasOutlook) {
        const nextRule: ClusterRule = {
          id: crypto.randomUUID(),
          name: `Auto-sort: ${SORT_BUCKET_LABELS[entry.bucket]}`,
          enabled: true,
          conditions: KIND_SORT_BUCKETS.has(entry.bucket)
            ? { kind: entry.bucket as MessageKind }
            : { fromDomainCategory: entry.bucket as DomainCategory },
          action: "label",
          labelName: entry.label,
          labelKeepInInbox: !entry.fileOut,
        };
        rules = upsertRuleByName(rules, nextRule);
        sortCompletions.push({
          rule: rules.find((rule) => rule.name === nextRule.name)!,
          idsByProvider: new Map(
            [...entry.idsByProvider].filter(
              ([providerId, ids]) => ids.length > 0 && providerById.get(providerId)?.labelMessages,
            ),
          ),
        });
      }
    }
    if (sortExpireOtpEl.checked) {
      rules = upsertRuleByName(rules, {
        id: crypto.randomUUID(),
        name: "Auto-sort: expire one-time codes",
        enabled: true,
        conditions: { kind: "otp", olderThanDays: 2 },
        action: "trash",
      });
    }
    ctx.settings = await updateSettings({ rules });
    await recordRuleCompletions(sortCompletions).catch((error) =>
      log.error("Could not seed auto-sort completion receipts", error),
    );
  }

  ctx.settings = await updateSettings({
    autoSort: {
      enabledBuckets: effective.map((e) => e.bucket),
      fileOutByBucket: Object.fromEntries(effective.map((e) => [e.bucket, e.fileOut])),
      keepSorting: keepOn,
      expireOtp: sortExpireOtpEl.checked,
      filterIdsByBucket: filterIds,
      ruleIdsByBucket: ruleIds,
    },
  });

  excludedSortIds.clear();
  await rescan();
  const serverCount =
    Object.values(filterIds).reduce((n, ids) => n + ids.length, 0) +
    Object.values(ruleIds).reduce((n, ids) => n + ids.length, 0);
  const suffix = serverCount > 0 ? ` · ${serverCount} standing filter${serverCount === 1 ? "" : "s"}` : "";
  return `Sorted ${total} into ${effective.length} label${effective.length === 1 ? "" : "s"}${suffix}`;
}

// First run only: offer to reuse a label the user already made that matches a
// bucket name, and to leave alone senders they already filter themselves.
async function maybeShowSeedCard() {
  if (ctx.settings.seededFromExisting) return;

  let labelNames: string[];
  let filterTargets: string[];
  try {
    const token = await gmailProvider.getAuthToken(false);
    const [names, filters] = await Promise.all([listLabelNames(token), listFilters(token)]);
    labelNames = names;
    filterTargets = filteredFromTargets(filters);
  } catch (err) {
    log.error("seed-from-existing: Gmail read failed", err);
    return;
  }

  const bucketLabels = ALL_SORT_BUCKETS.map((b) => SORT_BUCKET_LABELS[b]);
  const labelCandidates = findLabelReuseCandidates(
    bucketLabels,
    labelNames,
    ctx.settings.clusterOwnedLabels,
  );
  // Don't badger the user if there's nothing useful to offer.
  if (labelCandidates.length === 0 && filterTargets.length === 0) {
    ctx.settings = await updateSettings({ seededFromExisting: true });
    return;
  }

  const dismiss = async () => {
    sortSeedCardEl.hidden = true;
    ctx.settings = await updateSettings({ seededFromExisting: true });
  };

  sortSeedCardEl.innerHTML = "";
  const intro = document.createElement("p");
  intro.textContent =
    "Cluster noticed some of your existing Gmail setup. Reuse it so “Sort my inbox” works with your organisation, not against it:";
  sortSeedCardEl.appendChild(intro);

  if (labelCandidates.length > 0) {
    const row = document.createElement("p");
    row.textContent = `Reuse your own label${labelCandidates.length === 1 ? "" : "s"} ${labelCandidates
      .map((c) => `“${c.existing}”`)
      .join(", ")} for the matching bucket${labelCandidates.length === 1 ? "" : "s"}? `;
    const yes = document.createElement("button");
    yes.textContent = "Reuse";
    yes.onclick = async () => {
      const labelChoices = { ...ctx.settings.labelChoices };
      for (const c of labelCandidates) labelChoices[c.bucketLabel] = c.existing;
      ctx.settings = await updateSettings({ labelChoices });
      yes.textContent = "Reusing ✓";
      yes.disabled = true;
    };
    row.appendChild(yes);
    sortSeedCardEl.appendChild(row);
  }

  if (filterTargets.length > 0) {
    const row = document.createElement("p");
    row.textContent = `Leave the ${filterTargets.length} sender${
      filterTargets.length === 1 ? "" : "s"
    } you already filter yourself out of sorting? `;
    const yes = document.createElement("button");
    yes.textContent = "Skip them";
    yes.onclick = async () => {
      ctx.settings = await updateSettings({
        sortOverrides: { ...ctx.settings.sortOverrides, ...skipOverridesFor(filterTargets) },
      });
      yes.textContent = "Skipping ✓";
      yes.disabled = true;
    };
    row.appendChild(yes);
    sortSeedCardEl.appendChild(row);
  }

  const dismissBtn = document.createElement("button");
  dismissBtn.textContent = "Done";
  dismissBtn.onclick = dismiss;
  sortSeedCardEl.appendChild(dismissBtn);
  sortSeedCardEl.hidden = false;
}

function wireSortInbox() {
  sortInboxBtn.onclick = () => void startSortFlow();
}

export { maybeShowSeedCard, renderSortInbox, wireSortInbox };
