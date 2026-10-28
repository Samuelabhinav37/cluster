// Subscriptions tab: every sender in the scan with an unsubscribe option,
// ranked by outcome, plus per-row Unsubscribe / Unsubscribe+clean / Read
// later and the one-click "Unsubscribe all" bulk action.
// recordUnsubscribeRequests is exported because the Clean-up tab's sender
// table also records a request when its inline Unsubscribe button fires.
import { cadenceLabel, senderVolume } from "../lib/census";
import { ensureOriginsPermission, fireOneClickUnsubscribe } from "../lib/unsubscribe";
import { executeBulkUnsubscribe, filterOutProtected } from "../lib/bulkActions";
import {
  unsubscribeOutcomeRank,
  unsubscribeTally,
  type UnsubscribeOutcomeState,
} from "../lib/unsubscribeOutcome";
import { buildProtectionContext, buildSenderCleanupPlan } from "../lib/protectionPolicy";
import { createDurableJob, runDurableJob } from "../lib/durableJobs";
import type { SenderSummary } from "../lib/senderModel";
import { buildSubscriptionCandidates, SUBSCRIPTION_SIGNAL_LABELS } from "../lib/subscriptionSignals";
import { formatRelativeTime, headerRow, pruneSelection, renderConfirmStep } from "./ui";
import { listGroup, listRow } from "./listRow";
import { menuForControls } from "./rowMenu";
import { senderTile } from "./senderTile";
import { ctx, providerById } from "./state";
import { logAction } from "./recentTab";
import { clusterLabelName } from "../lib/clusterLabels";
import {
  recordUnsubscribeRequests,
  trashStillSending,
  undoUnsubscribe,
  UNDO_UNSUBSCRIBE_COPY,
  unsubscribeOutcomeFor,
} from "./unsubscribeRecord";
import { openUnsubscribeSheet } from "./unsubscribeSheet";

const READ_LATER_LABEL = clusterLabelName("readLater");

const selectedSubKeys = new Set<string>();

function subTile(sender: SenderSummary, size: "sz-30" | "sz-34" = "sz-34"): HTMLElement {
  return senderTile(sender.address, sender.displayName, size);
}

const subsBulkBar = document.getElementById("subscriptions-bulk-bar") as HTMLDivElement;
const subsCountEl = document.getElementById("subs-count") as HTMLSpanElement;
const subsUnsubAllSlot = document.getElementById("subs-unsub-all-slot") as HTMLSpanElement;
const subsUnsubAllBtn = document.getElementById("subs-unsub-all-btn") as HTMLButtonElement;
const subsOutcomeFilter = document.getElementById("subs-outcome-filter") as HTMLSelectElement;
const subscriptionsListEl = document.getElementById("subscriptions-list") as HTMLDivElement;
const paidSubscriptionsListEl = document.getElementById("paid-subscriptions-list") as HTMLDivElement;

function renderPaidSubscriptions(senders: SenderSummary[]) {
  const candidates = buildSubscriptionCandidates(senders);
  paidSubscriptionsListEl.innerHTML = "";

  if (candidates.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No paid subscriptions or trials detected in the current scan.";
    paidSubscriptionsListEl.appendChild(empty);
    return;
  }

  const rows = candidates.map(({ sender, signal, lastSeenAt }) => {
    const seen = document.createElement("span");
    seen.className = "recent-detail";
    seen.textContent = formatRelativeTime(lastSeenAt);
    return listRow({
      lead: subTile(sender),
      title: sender.displayName || sender.address,
      sub: SUBSCRIPTION_SIGNAL_LABELS[signal],
      meta: seen,
    });
  });
  paidSubscriptionsListEl.appendChild(listGroup(rows));
}

export { recordUnsubscribeRequests };

function unsubMethodLabel(u: SenderSummary["unsubscribe"]): string {
  if (u.postUrl) return "Stops in one click";
  if (u.httpUrl) return "Finish on their site";
  return "Stops by email";
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

/** Undo, and for a sender still mailing on Gmail, a way to send what keeps
 * coming to Trash. Both act on Cluster's own filters only. */
function requestActions(key: string, provider: string, state: string): HTMLElement[] {
  const out: HTMLElement[] = [];
  const request = ctx.settings.unsubscribeRequests[key];
  if (state === "still-sending" && provider === "gmail" && !request?.trashFilterId) {
    const slot = document.createElement("span");
    const trash = document.createElement("button");
    trash.className = "btn btn-sm";
    trash.textContent = "Send their mail to Trash";
    const reset = () => slot.replaceChildren(trash);
    trash.onclick = () =>
      renderConfirmStep(
        slot,
        reset,
        `From now on, all mail from ${senderAddressFromKey(key)} goes to Trash. You can undo this.`,
        true,
        async () => {
          await trashStillSending(key);
          await logAction("unsubscribe", `Sending mail from ${senderAddressFromKey(key)} to Trash`);
          renderSubscriptionsTab(ctx.senders);
          return "Done";
        },
      );
    reset();
    out.push(slot);
  }
  const undo = document.createElement("button");
  undo.className = "btn btn-sm";
  undo.textContent = "Undo";
  undo.title = UNDO_UNSUBSCRIBE_COPY;
  undo.onclick = async () => {
    undo.disabled = true;
    await undoUnsubscribe(key);
    await logAction("unsubscribe", UNDO_UNSUBSCRIBE_COPY);
    renderSubscriptionsTab(ctx.senders);
  };
  out.push(undo);
  return out;
}

/** The sender just unsubscribed from, so the screen can offer the same
 * company's other list addresses. */
let justStopped: SenderSummary | null = null;

/** "Shop also mails you from 2 other addresses. Stop those too?" */
function siblingOffer(available: SenderSummary[]): HTMLElement | null {
  const company = justStopped && ctx.profiles.get(justStopped.key)?.companyKey;
  if (!justStopped || !company) return null;
  const others = available.filter(
    (s) =>
      s.key !== justStopped!.key &&
      s.unsubscribe.postUrl &&
      !ctx.settings.unsubscribeRequests[s.key] &&
      ctx.profiles.get(s.key)?.companyKey === company,
  );
  if (others.length === 0) return null;
  const name = justStopped.displayName || company;
  const banner = document.createElement("div");
  banner.className = "banner";
  const text = document.createElement("span");
  text.textContent = `${name} also mails you from ${others.length} other address${others.length === 1 ? "" : "es"}.`;
  const stop = document.createElement("button");
  stop.className = "btn btn-accent-solid btn-sm";
  stop.textContent = "Stop those too";
  stop.onclick = async () => {
    stop.disabled = true;
    const granted = await ensureOriginsPermission(others.map((s) => s.unsubscribe.postUrl!));
    if (!granted) {
      text.textContent = "Permission denied, so nothing was sent.";
      stop.disabled = false;
      return;
    }
    const { succeeded } = await executeBulkUnsubscribe(others, fireOneClickUnsubscribe);
    await recordUnsubscribeRequests(succeeded);
    if (succeeded.length > 0) await logAction("unsubscribe", `Unsubscribed from ${succeeded.length} more ${name} addresses`);
    justStopped = null;
    renderSubscriptionsTab(ctx.senders);
  };
  const later = document.createElement("button");
  later.className = "btn btn-sm";
  later.textContent = "Not now";
  later.onclick = () => {
    justStopped = null;
    banner.remove();
  };
  banner.append(text, stop, later);
  return banner;
}

/** Moves a sender's old list mail to Trash, re-checking protection live. */
async function trashOldMail(sender: SenderSummary, ids: string[], kept: number): Promise<string> {
  const provider = providerById.get(sender.provider);
  if (!provider) return "Couldn't reach your mail, so nothing was moved";
  const { safe, skipped } = await filterOutProtected(new Map([[sender.provider, ids]]), providerById);
  const targetIds = safe.get(sender.provider) ?? [];
  if (targetIds.length === 0)
    return skipped > 0 ? `Skipped ${skipped} you starred since the scan` : "Nothing left to move";
  const job = await createDurableJob({ provider: sender.provider, operation: "trash", targetIds });
  const result = await runDurableJob(job.id, providerById);
  if (result.succeededIds.length > 0) {
    await logAction(
      "trash",
      `Moved ${result.succeededIds.length} old message${result.succeededIds.length === 1 ? "" : "s"} from ${sender.address} to Trash`,
      provider.untrashMessages
        ? { provider: sender.provider, ids: result.succeededIds, via: "untrash" }
        : undefined,
    );
  }
  const skippedNote = skipped > 0 ? `, skipped ${skipped} you starred since the scan` : "";
  return result.failures.length > 0
    ? `Moved ${result.succeededIds.length}, failed ${result.failures.length}, kept ${kept}${skippedNote}`
    : `Moved ${result.succeededIds.length} to Trash, kept ${kept}${skippedNote}`;
}

/** They stopped on their own: nothing to unsubscribe from, only old mail to clear. */
function clearOldMailButton(sender: SenderSummary): HTMLElement | null {
  const cleanup = buildSenderCleanupPlan(sender, buildProtectionContext(ctx.settings));
  const n = cleanup.safeNewsletterIds.length;
  if (n === 0) return null;
  const slot = document.createElement("span");
  const btn = document.createElement("button");
  btn.textContent = "Clear out old mail";
  const reset = () => slot.replaceChildren(btn);
  btn.onclick = () => {
    const kept = cleanup.protectedIds.length + cleanup.retainedOtherIds.length;
    renderConfirmStep(slot, reset, `Move ${n} old message${n === 1 ? "" : "s"} to Trash? ${kept} stay.`, true, () =>
      trashOldMail(sender, cleanup.safeNewsletterIds, kept),
    );
  };
  reset();
  return slot;
}

function subUnsubscribeCell(sender: SenderSummary): HTMLTableCellElement {
  const cell = document.createElement("td");
  const u = sender.unsubscribe;
  if (u.postUrl) {
    const btn = document.createElement("button");
    const tracked = ctx.settings.unsubscribeRequests[sender.key];
    btn.textContent = tracked
      ? unsubscribeOutcomeFor(sender.key, sender).state === "still-sending"
        ? "Retry unsubscribe"
        : "Request again"
      : "Unsubscribe";
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = "Requesting…";
      const ok = await fireOneClickUnsubscribe(u.postUrl!);
      if (ok) {
        await recordUnsubscribeRequests([sender]);
        await logAction("unsubscribe", `Unsubscribed from ${sender.address}`);
        justStopped = sender;
        renderSubscriptionsTab(ctx.senders);
      } else {
        btn.disabled = false;
        btn.textContent = "Failed, retry";
      }
    };
    cell.appendChild(btn);

    const cleanup = buildSenderCleanupPlan(sender, buildProtectionContext(ctx.settings));
    if (cleanup.safeNewsletterIds.length > 0) {
      const cleanSlot = document.createElement("span");
      const cleanBtn = document.createElement("button");
      cleanBtn.className = "danger";
      cleanBtn.textContent = "Unsubscribe and clear old mail";
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
            if (!ok) return "Unsubscribe failed, so no mail was moved";
            await recordUnsubscribeRequests([sender]);
            return `Unsubscribed. ${await trashOldMail(sender, cleanup.safeNewsletterIds, kept)}`;
          },
        );
      };
      reset();
      cell.append(" ", cleanSlot);
    }
  } else if (u.mailto) {
    const button = document.createElement("button");
    button.textContent = "Unsubscribe by email";
    button.onclick = () => void openUnsubscribeSheet([sender], () => renderSubscriptionsTab(ctx.senders));
    cell.appendChild(button);
  } else if (u.httpUrl) {
    const a = document.createElement("a");
    a.href = u.httpUrl;
    a.textContent = "Open page";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    cell.appendChild(a);
  }

  const readLaterPlan = buildSenderCleanupPlan(sender, buildProtectionContext(ctx.settings));
  const provider = providerById.get(sender.provider);
  if (readLaterPlan.safeNewsletterIds.length > 0 && provider?.labelMessages && provider.unlabelMessages) {
    const slot = document.createElement("span");
    const button = document.createElement("button");
    button.textContent = "Read later";
    const reset = () => slot.replaceChildren(button);
    button.onclick = () => {
      const kept = readLaterPlan.protectedIds.length + readLaterPlan.retainedOtherIds.length;
      renderConfirmStep(
        slot,
        reset,
        `Move ${readLaterPlan.safeNewsletterIds.length} newsletter message${readLaterPlan.safeNewsletterIds.length === 1 ? "" : "s"} from ${sender.address} to the "${READ_LATER_LABEL}" label? ${kept} protected or ambiguous message${kept === 1 ? " stays" : "s stay"}.`,
        false,
        async () => {
          const { safe, skipped } = await filterOutProtected(
            new Map([[sender.provider, readLaterPlan.safeNewsletterIds]]),
            providerById,
          );
          const targetIds = safe.get(sender.provider) ?? [];
          if (targetIds.length === 0) {
            return skipped > 0 ? `Skipped ${skipped} you starred since the scan` : "Nothing to move";
          }
          const job = await createDurableJob({
            provider: sender.provider,
            operation: "label",
            targetIds,
            labelName: READ_LATER_LABEL,
            keepInInbox: false,
          });
          const result = await runDurableJob(job.id, providerById);
          if (result.succeededIds.length > 0) {
            await logAction(
              "sort",
              `Moved ${result.succeededIds.length} newsletter message${result.succeededIds.length === 1 ? "" : "s"} from ${sender.address} to "${READ_LATER_LABEL}"${skipped > 0 ? `, skipped ${skipped} you starred since the scan` : ""}`,
              {
                provider: sender.provider,
                ids: result.succeededIds,
                via: "unsort",
                labelName: READ_LATER_LABEL,
                wasFiledOut: true,
              },
            );
          }
          return result.failures.length > 0
            ? `Moved ${result.succeededIds.length}; failed ${result.failures.length}; kept ${kept}`
            : `Moved ${result.succeededIds.length} to "${READ_LATER_LABEL}"; kept ${kept}`;
        },
      );
    };
    reset();
    cell.append(" ", slot);
  }
  return cell;
}

function renderSubsFloatingBar(oneClickCount: number) {
  const host = document.getElementById("subs-floating-bar");
  if (!host) return;
  const selected = selectedSubKeys.size;
  if (oneClickCount === 0) {
    host.className = "";
    host.innerHTML = "";
    return;
  }
  host.className = "floating-bar";
  host.innerHTML = "";
  const bar = document.createElement("div");
  const title = document.createElement("span");
  title.className = "fb-title";
  title.textContent = selected > 0 ? `${selected} selected` : `${oneClickCount} stop in one click`;
  const sub = document.createElement("span");
  sub.className = "fb-sub";
  sub.textContent = "Only future mail stops.";
  const allBtn = document.createElement("button");
  allBtn.className = "btn-accent-solid";
  allBtn.textContent = selected > 0 ? "Unsubscribe selected" : "Unsubscribe all";
  allBtn.onclick = () => (document.getElementById("subs-unsub-all-btn") as HTMLButtonElement | null)?.click();
  bar.append(title, sub, allBtn);
  host.appendChild(bar);
}

function selectedUnsubscribeOutcome(): "all" | UnsubscribeOutcomeState {
  const value = subsOutcomeFilter.value;
  return value === "pending" ||
    value === "quiet" ||
    value === "still-sending" ||
    value === "untracked" ||
    value === "failed" ||
    value === "needs-you"
    ? value
    : "all";
}

function senderAddressFromKey(key: string): string {
  const separator = key.indexOf(":");
  return separator >= 0 ? key.slice(separator + 1) : key;
}

const LIST_PREVIEW = 10;
// Stays open for the session once you ask for the whole list.
let showAllSubscriptions = false;

export function renderSubscriptionsTab(senders: SenderSummary[]) {
  renderPaidSubscriptions(senders);

  const senderByKey = new Map(senders.map((sender) => [sender.key, sender]));
  const available = senders.filter(
    (sender) => sender.unsubscribe.postUrl || sender.unsubscribe.httpUrl || sender.unsubscribe.mailto,
  );
  pruneSelection(
    selectedSubKeys,
    available.map((sender) => sender.key),
  );

  const currentRows = available
    .map((sender) => ({
      sender,
      outcome: unsubscribeOutcomeFor(sender.key, sender),
    }))
    .sort(
      (a, b) =>
        unsubscribeOutcomeRank(a.outcome.state) - unsubscribeOutcomeRank(b.outcome.state) ||
        senderVolume(b.sender) - senderVolume(a.sender),
    );
  const availableKeys = new Set(available.map((sender) => sender.key));
  const trackedOnlyRows = Object.entries(ctx.settings.unsubscribeRequests)
    .filter(([key]) => !availableKeys.has(key))
    .map(([key, request]) => ({
      key,
      request,
      sender: senderByKey.get(key),
      outcome: unsubscribeOutcomeFor(key, senderByKey.get(key)),
    }))
    .sort(
      (a, b) =>
        unsubscribeOutcomeRank(a.outcome.state) - unsubscribeOutcomeRank(b.outcome.state) ||
        b.request.requestedAt - a.request.requestedAt,
    );
  const selectedOutcome = selectedUnsubscribeOutcome();
  const matchesFilter = (state: UnsubscribeOutcomeState) =>
    selectedOutcome === "all" || state === selectedOutcome;
  const visibleCurrentRows = currentRows.filter(({ outcome }) => matchesFilter(outcome.state));
  const visibleTrackedOnlyRows = trackedOnlyRows.filter(({ outcome }) => matchesFilter(outcome.state));
  const allOutcomes = [...currentRows, ...trackedOnlyRows].map(({ outcome }) => outcome);
  const trackedCount = Object.keys(ctx.settings.unsubscribeRequests).length;
  const oneClick = available.filter((sender) => sender.unsubscribe.postUrl);

  subscriptionsListEl.innerHTML = "";
  subsBulkBar.hidden = available.length === 0 && trackedCount === 0;
  const tally = unsubscribeTally(allOutcomes);
  subsCountEl.textContent = tally ? `${available.length} lists · ${tally}` : `${available.length} lists`;
  subsUnsubAllBtn.disabled = oneClick.length === 0;
  renderSubsFloatingBar(oneClick.length);

  if (available.length === 0 && trackedCount === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No senders with an unsubscribe option or tracked request in the current scan.";
    subscriptionsListEl.appendChild(empty);
    return;
  }

  const offer = siblingOffer(available);
  if (offer) subscriptionsListEl.appendChild(offer);

  if (visibleCurrentRows.length > 0) {
    // Select-all header — not itself a list item (no title/media), so it
    // reuses the check-media-actions grid class directly rather than going
    // through listRow(), whose spec always expects a title.
    const hdr = document.createElement("div");
    hdr.className = "list-row list-row--check-media-actions";
    hdr.style.background = "var(--row-hover)";
    const selAllLabel = document.createElement("label");
    selAllLabel.className = "check-label";
    const selAll = document.createElement("input");
    selAll.type = "checkbox";
    selAll.className = "check";
    selAll.setAttribute("aria-label", "Select all subscriptions");
    const oneClickKeys = visibleCurrentRows
      .filter(({ sender }) => sender.unsubscribe.postUrl)
      .map(({ sender }) => sender.key);
    selAll.checked = oneClickKeys.length > 0 && oneClickKeys.every((k) => selectedSubKeys.has(k));
    selAll.onchange = () => {
      for (const k of oneClickKeys) {
        if (selAll.checked) selectedSubKeys.add(k);
        else selectedSubKeys.delete(k);
      }
      renderSubscriptionsTab(ctx.senders);
    };
    selAllLabel.appendChild(selAll);
    const selCount = document.createElement("span");
    selCount.className = "row-sub";
    selCount.style.color = "var(--label-2)";
    selCount.textContent = `${oneClickKeys.filter((k) => selectedSubKeys.has(k)).length} of ${oneClickKeys.length} selected`;
    const sortedNote = document.createElement("span");
    sortedNote.className = "recent-detail";
    sortedNote.textContent = "Problems first, then by volume";
    hdr.append(selAllLabel, selCount, sortedNote);

    const rows = visibleCurrentRows.map(({ sender, outcome }) => {
      const outcomeText = outcome.requestAt
        ? `${outcome.label} · requested ${formatRelativeTime(outcome.requestAt)}`
        : `${unsubMethodLabel(sender.unsubscribe)} · mostly ${dominantKind(sender)}`;
      const subLine = [cadenceLabel(senderVolume(sender), ctx.settings.scanWindowDays), outcomeText, sender.displayName ? sender.address : ""]
        .filter(Boolean)
        .join(" · ");

      // One visible button (the way to stop the mail); the rest sit in ⋯.
      // A sender that already stopped gets "Clear out old mail" first.
      const cell = subUnsubscribeCell(sender);
      const controls = Array.from(cell.children) as HTMLElement[];
      const quiet = !outcome.requestAt && ctx.profiles.get(sender.key)?.stillSending === false;
      const clear = quiet ? clearOldMailButton(sender) : null;
      if (clear) controls.unshift(clear);
      const primary = controls.shift();
      const primaryBtn = primary?.matches("button") ? primary : primary?.querySelector("button");
      if (primaryBtn) primaryBtn.className = "btn";
      if (outcome.requestAt) controls.push(...requestActions(sender.key, sender.provider, outcome.state));
      const keep = document.createElement("button");
      keep.className = "btn";
      keep.textContent = "Keep";
      controls.push(keep);
      const strip = document.createElement("div");
      strip.className = "instead-strip";
      const menu = menuForControls(controls, strip);

      const row = listRow({
        // Every row keeps the checkbox column even without a one-click
        // unsubscribe (disabled instead of omitted) so titles stay aligned
        // under the select-all header's checkbox column.
        selectable: sender.unsubscribe.postUrl
          ? {
              checked: selectedSubKeys.has(sender.key),
              label: `Select ${sender.displayName || sender.address}`,
              onChange: (checked) => {
                if (checked) selectedSubKeys.add(sender.key);
                else selectedSubKeys.delete(sender.key);
                renderSubscriptionsTab(ctx.senders);
              },
            }
          : {
              checked: false,
              disabled: true,
              label: "No one-click unsubscribe to select",
              onChange: () => {},
            },
        lead: subTile(sender),
        title: sender.displayName || sender.address,
        sub: subLine,
        actions: primary ? [primary, menu] : [menu],
        disclosure: strip,
      });
      keep.onclick = () => {
        row.hidden = true;
        strip.hidden = true;
        // listGroup() puts an anonymous row-sep before every row but the
        // first; hide it too so a dismissed row doesn't leave a stray line.
        const sep = row.previousElementSibling;
        if (sep instanceof HTMLElement && sep.classList.contains("row-sep")) sep.hidden = true;
      };
      return row;
    });

    subscriptionsListEl.appendChild(hdr);
    const shown = showAllSubscriptions ? rows : rows.slice(0, LIST_PREVIEW);
    subscriptionsListEl.appendChild(listGroup(shown, { inset: true }));
    if (shown.length < rows.length) {
      const more = document.createElement("button");
      more.className = "btn-link";
      more.textContent = `Show all ${rows.length}`;
      more.onclick = () => {
        showAllSubscriptions = true;
        renderSubscriptionsTab(ctx.senders);
      };
      subscriptionsListEl.appendChild(more);
    }
  }

  if (visibleTrackedOnlyRows.length > 0) {
    const heading = document.createElement("h3");
    heading.className = "section-label";
    heading.style.margin = "24px 0 10px";
    heading.textContent = "Tracked requests without a current unsubscribe option";
    subscriptionsListEl.appendChild(heading);
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    thead.appendChild(headerRow(["Sender", "Provider", "Requested", "Outcome", "Evidence", ""]));
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (const { key, request, outcome } of visibleTrackedOnlyRows) {
      const row = document.createElement("tr");
      const addressCell = document.createElement("td");
      addressCell.textContent = senderAddressFromKey(key);
      const providerCell = document.createElement("td");
      providerCell.textContent = request.provider;
      const requestedCell = document.createElement("td");
      requestedCell.textContent = formatRelativeTime(request.requestedAt);
      const outcomeCell = document.createElement("td");
      outcomeCell.textContent = outcome.label;
      const evidenceCell = document.createElement("td");
      evidenceCell.className = "hint";
      evidenceCell.textContent = outcome.detail;
      const actionCell = document.createElement("td");
      actionCell.append(...requestActions(key, request.provider, outcome.state));
      row.append(addressCell, providerCell, requestedCell, outcomeCell, evidenceCell, actionCell);
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    subscriptionsListEl.appendChild(table);
  }

  if (visibleCurrentRows.length === 0 && visibleTrackedOnlyRows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No subscriptions match this outcome filter.";
    subscriptionsListEl.appendChild(empty);
  }
}

export function wireSubscriptionsTab() {
  subsOutcomeFilter.onchange = () => renderSubscriptionsTab(ctx.senders);

  const resetSubsUnsubAllSlot = () => {
    subsUnsubAllSlot.innerHTML = "";
    subsUnsubAllSlot.appendChild(subsUnsubAllBtn);
  };

  subsUnsubAllBtn.onclick = () => {
    const oneClick = ctx.senders.filter(
      (s) => s.unsubscribe.postUrl && (selectedSubKeys.size === 0 || selectedSubKeys.has(s.key)),
    );
    if (oneClick.length === 0) return;
    const scope = selectedSubKeys.size === 0 ? "all" : `${oneClick.length} selected`;
    renderConfirmStep(
      subsUnsubAllSlot,
      resetSubsUnsubAllSlot,
      `Unsubscribe from ${scope} (${oneClick.length} sender${oneClick.length === 1 ? "" : "s"})? Only future mail stops.`,
      false,
      async (summary) => {
        summary.textContent = "Requesting permission…";
        const granted = await ensureOriginsPermission(oneClick.map((s) => s.unsubscribe.postUrl!));
        if (!granted) return "Permission denied, so nothing was sent";
        summary.textContent = "Unsubscribing…";
        const { succeeded, failed } = await executeBulkUnsubscribe(oneClick, fireOneClickUnsubscribe);
        await recordUnsubscribeRequests(succeeded);
        if (succeeded.length > 0) {
          await logAction("unsubscribe", `Bulk unsubscribed from ${succeeded.length} senders`);
        }
        renderSubscriptionsTab(ctx.senders);
        return `Unsubscribed ${succeeded.length}, failed ${failed.length}`;
      },
    );
  };
}
