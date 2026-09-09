// Subscriptions tab: every sender in the scan with an unsubscribe option,
// ranked by outcome, plus per-row Unsubscribe / Unsubscribe+clean / Read
// later and the "unsubscribe all verified one-click" bulk action.
// recordUnsubscribeRequests is exported because the Clean-up tab's sender
// table also records a request when its inline Unsubscribe button fires.
import { mutateSettings } from "../lib/settingsStore";
import { recordEngagementFeedback } from "../lib/engagementModel";
import { ensureOriginsPermission, fireOneClickUnsubscribe } from "../lib/unsubscribe";
import { executeBulkUnsubscribe } from "../lib/bulkActions";
import {
  evaluateUnsubscribeOutcome,
  unsubscribeOutcomeRank,
  type UnsubscribeOutcomeState,
} from "../lib/unsubscribeOutcome";
import { buildSenderCleanupPlan } from "../lib/protectionPolicy";
import { createDurableJob, runDurableJob } from "../lib/durableJobs";
import type { SenderSummary } from "../lib/senderModel";
import {
  buildSubscriptionCandidates,
  SUBSCRIPTION_SIGNAL_LABELS,
} from "../lib/subscriptionSignals";
import { formatRelativeTime, headerRow, pruneSelection, renderConfirmStep } from "./ui";
import { ctx, providerById } from "./state";
import { logAction } from "./recentTab";

const selectedSubKeys = new Set<string>();

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
    empty.className = "hint";
    empty.textContent = "No paid subscriptions or trials detected in the current scan.";
    paidSubscriptionsListEl.appendChild(empty);
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.appendChild(headerRow(["Sender", "Signal", "Last seen"]));
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const { sender, signal, lastSeenAt } of candidates) {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.textContent = sender.displayName
      ? `${sender.displayName} <${sender.address}>`
      : sender.address;
    row.appendChild(nameCell);

    const signalCell = document.createElement("td");
    signalCell.textContent = SUBSCRIPTION_SIGNAL_LABELS[signal];
    row.appendChild(signalCell);

    const seenCell = document.createElement("td");
    seenCell.textContent = formatRelativeTime(lastSeenAt);
    row.appendChild(seenCell);

    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  paidSubscriptionsListEl.appendChild(table);
}

// Persisted so "already requested" survives a reload — senders can take up
// to 10 business days to stop, so re-requesting isn't blocked, just labeled.
export async function recordUnsubscribeRequests(senders: SenderSummary[]) {
  if (senders.length === 0) return;
  const now = Date.now();
  ctx.settings = await mutateSettings((current) => {
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
    const tracked = ctx.settings.unsubscribeRequests[sender.key];
    btn.textContent = tracked
      ? evaluateUnsubscribeOutcome(sender, tracked).state === "still-sending"
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
        renderSubscriptionsTab(ctx.senders);
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
        `Move ${readLaterPlan.safeNewsletterIds.length} newsletter message${readLaterPlan.safeNewsletterIds.length === 1 ? "" : "s"} from ${sender.address} to a "Read Later" label? ${kept} protected or ambiguous message${kept === 1 ? " stays" : "s stay"}.`,
        false,
        async () => {
          const job = await createDurableJob({
            provider: sender.provider,
            operation: "label",
            targetIds: readLaterPlan.safeNewsletterIds,
            labelName: "Read Later",
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
                labelName: "Read Later",
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

function selectedUnsubscribeOutcome(): "all" | UnsubscribeOutcomeState {
  const value = subsOutcomeFilter.value;
  return value === "pending" || value === "quiet" || value === "still-sending" || value === "untracked"
    ? value
    : "all";
}

function senderAddressFromKey(key: string): string {
  const separator = key.indexOf(":");
  return separator >= 0 ? key.slice(separator + 1) : key;
}

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
      outcome: evaluateUnsubscribeOutcome(sender, ctx.settings.unsubscribeRequests[sender.key]),
    }))
    .sort(
      (a, b) =>
        unsubscribeOutcomeRank(a.outcome.state) - unsubscribeOutcomeRank(b.outcome.state) ||
        b.sender.count - a.sender.count,
    );
  const availableKeys = new Set(available.map((sender) => sender.key));
  const trackedOnlyRows = Object.entries(ctx.settings.unsubscribeRequests)
    .filter(([key]) => !availableKeys.has(key))
    .map(([key, request]) => ({
      key,
      request,
      sender: senderByKey.get(key),
      outcome: evaluateUnsubscribeOutcome(senderByKey.get(key), request),
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
  const stillSendingCount = allOutcomes.filter(({ state }) => state === "still-sending").length;
  const trackedCount = Object.keys(ctx.settings.unsubscribeRequests).length;
  const oneClick = available.filter((sender) => sender.unsubscribe.postUrl);

  subscriptionsListEl.innerHTML = "";
  subsBulkBar.hidden = available.length === 0 && trackedCount === 0;
  subsCountEl.textContent = `${available.length} available · ${trackedCount} tracked${stillSendingCount > 0 ? ` · ${stillSendingCount} still sending` : ""}`;
  subsUnsubAllBtn.disabled = oneClick.length === 0;

  if (available.length === 0 && trackedCount === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No senders with an unsubscribe option or tracked request in the current scan.";
    subscriptionsListEl.appendChild(empty);
    return;
  }

  if (visibleCurrentRows.length > 0) {
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    thead.appendChild(
      headerRow([
        "",
        "Sender",
        `Count (${ctx.settings.scanWindowDays}d)`,
        "Mostly",
        "Method",
        "Outcome",
        "Action",
      ]),
    );
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const { sender, outcome } of visibleCurrentRows) {
      const row = document.createElement("tr");

      const cbCell = document.createElement("td");
      if (sender.unsubscribe.postUrl) {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = selectedSubKeys.has(sender.key);
        cb.onchange = () => {
          if (cb.checked) selectedSubKeys.add(sender.key);
          else selectedSubKeys.delete(sender.key);
        };
        cbCell.appendChild(cb);
      }
      row.appendChild(cbCell);

      const nameCell = document.createElement("td");
      nameCell.textContent = sender.displayName
        ? `${sender.displayName} <${sender.address}>`
        : sender.address;
      row.appendChild(nameCell);

      const countCell = document.createElement("td");
      countCell.textContent = String(sender.count);
      row.appendChild(countCell);

      const kindCell = document.createElement("td");
      kindCell.textContent = dominantKind(sender);
      row.appendChild(kindCell);

      const methodCell = document.createElement("td");
      methodCell.textContent = unsubMethodLabel(sender.unsubscribe);
      row.appendChild(methodCell);

      const statusCell = document.createElement("td");
      const outcomeLabel = document.createElement("div");
      outcomeLabel.textContent = outcome.requestAt
        ? `${outcome.label} · requested ${formatRelativeTime(outcome.requestAt)}`
        : outcome.label;
      const evidence = document.createElement("div");
      evidence.className = "hint";
      evidence.textContent = outcome.detail;
      statusCell.append(outcomeLabel, evidence);
      row.appendChild(statusCell);

      row.appendChild(subUnsubscribeCell(sender));
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    subscriptionsListEl.appendChild(table);
  }

  if (visibleTrackedOnlyRows.length > 0) {
    const heading = document.createElement("h3");
    heading.textContent = "Tracked requests without a current unsubscribe option";
    subscriptionsListEl.appendChild(heading);
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    thead.appendChild(headerRow(["Sender", "Provider", "Requested", "Outcome", "Evidence"]));
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
      row.append(addressCell, providerCell, requestedCell, outcomeCell, evidenceCell);
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    subscriptionsListEl.appendChild(table);
  }

  if (visibleCurrentRows.length === 0 && visibleTrackedOnlyRows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
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
        renderSubscriptionsTab(ctx.senders);
        return `Unsubscribed ${succeeded.length}, failed ${failed.length}`;
      },
    );
  };
}
