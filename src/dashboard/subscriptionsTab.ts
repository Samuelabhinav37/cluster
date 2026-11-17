// Cleanup's Mailing lists tab: every list in the scan in the Senders table's
// design (one row per domain, a Status column), Unsubscribe in the selection
// bar, and each list's other actions in its ⋯ menu.
// recordUnsubscribeRequests is exported because the Clean-up tab's sender
// table also records a request when its inline Unsubscribe button fires.
import { ensureOriginsPermission, fireOneClickUnsubscribe } from "../lib/unsubscribe";
import { executeBulkUnsubscribe, filterOutProtected } from "../lib/bulkActions";
import { unsubscribeOutcomeRank } from "../lib/unsubscribeOutcome";
import { buildProtectionContext, buildSenderCleanupPlan } from "../lib/protectionPolicy";
import { createDurableJob, runDurableJob } from "../lib/durableJobs";
import type { SenderSummary } from "../lib/senderModel";
import { domainOf } from "../lib/domainGrouping";
import { registrableDomain } from "../lib/registrableDomain";
import { formatRelativeTime, headerRow, renderConfirmStep, runNow } from "./ui";
import { renderSenderTable } from "./cleanupPage";
import { leavableList } from "../lib/cleanupCards";
import { ctx, providerById } from "./state";
import { logAction } from "./recentTab";
import { clusterLabelName } from "../lib/clusterLabels";
import {
  recordUnsubscribeRequests,
  trashStillSending,
  undoUnsubscribe,
  UNDO_UNSUBSCRIBE_COPY,
  unsubscribeButtonText,
  unsubscribeOutcomeFor,
} from "./unsubscribeRecord";
import { openUnsubscribeSheet } from "./unsubscribeSheet";

const READ_LATER_LABEL = clusterLabelName("readLater");

/** Ticked rows (registrable domains), kept across re-renders. */
const selectedListKeys = new Set<string>();

const subscriptionsListEl = document.getElementById("subscriptions-list") as HTMLDivElement;

export { recordUnsubscribeRequests };

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
    if (succeeded.length > 0)
      await logAction("unsubscribe", `Unsubscribed from ${succeeded.length} more ${name} addresses`);
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

/** Moves a sender's old list mail to Trash (or archives it), re-checking protection live. */
async function trashOldMail(
  sender: SenderSummary,
  ids: string[],
  kept: number,
  op: "trash" | "archive" = "trash",
): Promise<string> {
  const provider = providerById.get(sender.provider);
  if (!provider) return "Couldn't reach your mail, so nothing was moved";
  const { safe, skipped } = await filterOutProtected(new Map([[sender.provider, ids]]), providerById);
  const targetIds = safe.get(sender.provider) ?? [];
  if (targetIds.length === 0)
    return skipped > 0 ? `Skipped ${skipped} you starred since the scan` : "Nothing left to move";
  const job = await createDurableJob({ provider: sender.provider, operation: op, targetIds });
  const result = await runDurableJob(job.id, providerById);
  const where = op === "trash" ? "to Trash" : "to the archive";
  if (result.succeededIds.length > 0) {
    const undo = op === "trash" ? provider.untrashMessages : provider.unarchiveMessages;
    await logAction(
      op,
      `Moved ${result.succeededIds.length} old message${result.succeededIds.length === 1 ? "" : "s"} from ${sender.address} ${where}`,
      undo
        ? {
            provider: sender.provider,
            ids: result.succeededIds,
            via: op === "trash" ? "untrash" : "unarchive",
          }
        : undefined,
    );
  }
  const skippedNote = skipped > 0 ? `, skipped ${skipped} you starred since the scan` : "";
  return result.failures.length > 0
    ? `Moved ${result.succeededIds.length}, failed ${result.failures.length}, kept ${kept}${skippedNote}`
    : `Moved ${result.succeededIds.length} ${where}, kept ${kept}${skippedNote}`;
}

const UNSUBSCRIBE_GRACE_MS = 3000;

/** "Unsubscribing… Undo" for a moment before the request goes out. True when it should go. */
function graceWithUndo(cell: HTMLElement): Promise<boolean> {
  const before = Array.from(cell.childNodes);
  return new Promise((resolve) => {
    const undo = Object.assign(document.createElement("button"), {
      type: "button",
      className: "btn",
      textContent: "Undo",
    });
    const timer = setTimeout(() => {
      cell.replaceChildren(...before);
      resolve(true);
    }, UNSUBSCRIBE_GRACE_MS);
    undo.onclick = () => {
      clearTimeout(timer);
      cell.replaceChildren(...before);
      resolve(false);
    };
    cell.replaceChildren("Unsubscribing… ", undo);
  });
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
    renderConfirmStep(
      slot,
      reset,
      `Move ${n} old message${n === 1 ? "" : "s"} to Trash? ${kept} stay.`,
      true,
      () => trashOldMail(sender, cleanup.safeNewsletterIds, kept),
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
    btn.textContent = unsubscribeButtonText(sender);
    btn.onclick = async () => {
      const host = btn.parentElement;
      if (host && !(await graceWithUndo(host))) return;
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
    const n = cleanup.safeNewsletterIds.length;
    const kept = cleanup.protectedIds.length + cleanup.retainedOtherIds.length;
    const stopAnd = (label: string, op: "trash" | "archive") => {
      const slot = document.createElement("span");
      const button = Object.assign(document.createElement("button"), {
        textContent: label,
        className: op === "trash" ? "danger" : "",
      });
      const reset = () => slot.replaceChildren(button);
      button.onclick = () =>
        renderConfirmStep(
          slot,
          reset,
          `Unsubscribe from ${sender.address} and move ${n} old message${n === 1 ? "" : "s"} ${op === "trash" ? "to Trash" : "out of your inbox"}? ${kept} stay.`,
          op === "trash",
          async () => {
            const ok = await fireOneClickUnsubscribe(u.postUrl!);
            if (!ok) return "Unsubscribe failed, so no mail was moved";
            await recordUnsubscribeRequests([sender]);
            return `Unsubscribed. ${await trashOldMail(sender, cleanup.safeNewsletterIds, kept, op)}`;
          },
        );
      reset();
      cell.append(" ", slot);
    };
    if (n > 0) {
      stopAnd("Stop and trash old", "trash");
      if (providerById.get(sender.provider)?.archiveMessages) stopAnd("Stop and archive old", "archive");
    }
  } else if (u.mailto) {
    const button = document.createElement("button");
    button.textContent = "Unsubscribe by email";
    button.onclick = () => void openUnsubscribeSheet([sender], () => renderSubscriptionsTab(ctx.senders));
    cell.appendChild(button);
  } else if (u.httpUrl) {
    const page = document.createElement("button");
    page.textContent = "Open unsubscribe page";
    const url = u.httpUrl;
    page.onclick = () => window.open(url, "_blank", "noopener,noreferrer");
    cell.appendChild(page);
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
      runNow(slot, async () => {
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

function senderAddressFromKey(key: string): string {
  const separator = key.indexOf(":");
  return separator >= 0 ? key.slice(separator + 1) : key;
}

/** One row per domain: "Suhas via LinkedIn" and LinkedIn's own lists are one LinkedIn row. */
const listRowKey = (s: SenderSummary) => registrableDomain(domainOf(s.address));

/** Where a list stands, for the Status column. Blank when there's nothing to say. */
function listStatus(group: SenderSummary[]): string {
  const asked = group.map((s) => unsubscribeOutcomeFor(s.key, s)).find((o) => o.requestAt);
  if (asked) return asked.label;
  if (group.every((s) => ctx.profiles.get(s.key)?.stillSending === false)) return "Stopped sending";
  const protection = buildProtectionContext(ctx.settings);
  if (group.some((s) => leavableList(s, ctx.profiles.get(s.key), protection))) return "Unused";
  if (!group.some((s) => s.unsubscribe.postUrl) && group.some((s) => s.unsubscribe.mailto)) return "By email";
  return "";
}

/** The bar's Unsubscribe can send these: not yet asked, with a one-click or email way out. */
const canUnsubscribe = (s: SenderSummary) =>
  !ctx.settings.unsubscribeRequests[s.key] && Boolean(s.unsubscribe.postUrl || s.unsubscribe.mailto);

/** A single list's ⋯ menu: its way out, the old-mail actions, and Undo once asked. */
function listControls(group: SenderSummary[]): HTMLElement[] {
  if (group.length !== 1) return [];
  const [sender] = group;
  const outcome = unsubscribeOutcomeFor(sender.key, sender);
  const quiet = !outcome.requestAt && ctx.profiles.get(sender.key)?.stillSending === false;
  const clear = quiet ? clearOldMailButton(sender) : null;
  const controls = Array.from(subUnsubscribeCell(sender).children) as HTMLElement[];
  if (clear) controls.unshift(clear);
  if (outcome.requestAt) controls.push(...requestActions(sender.key, sender.provider, outcome.state));
  return controls;
}

/** Asks once, then sends the one-click requests; lists that only take email open the email sheet. */
function unsubscribeMany(picked: SenderSummary[], slot: HTMLElement, reset: () => void) {
  const targets = picked.filter(canUnsubscribe);
  const oneClick = targets.filter((s) => s.unsubscribe.postUrl);
  const byEmail = targets.filter((s) => !s.unsubscribe.postUrl);
  const rerender = () => renderSubscriptionsTab(ctx.senders);
  if (oneClick.length === 0) {
    if (byEmail.length > 0) void openUnsubscribeSheet(byEmail, rerender);
    return;
  }
  const names = oneClick.map((s) => s.displayName || s.address).join(", ");
  renderConfirmStep(
    slot,
    reset,
    `Unsubscribe from ${oneClick.length} sender${oneClick.length === 1 ? "" : "s"}? ${names}. Only future mail stops. Anyone still sending in 14 days gets muted.`,
    false,
    async (summary) => {
      summary.textContent = "Requesting permission…";
      const granted = await ensureOriginsPermission(oneClick.map((s) => s.unsubscribe.postUrl!));
      if (!granted) return "Permission denied, so nothing was sent";
      summary.textContent = "Unsubscribing…";
      const { succeeded, failed } = await executeBulkUnsubscribe(oneClick, fireOneClickUnsubscribe);
      await recordUnsubscribeRequests(succeeded);
      if (succeeded.length > 0) await logAction("unsubscribe", `Bulk unsubscribed from ${succeeded.length} senders`);
      selectedListKeys.clear();
      rerender();
      if (byEmail.length > 0) void openUnsubscribeSheet(byEmail, rerender);
      return `Unsubscribed ${succeeded.length}, failed ${failed.length}`;
    },
  );
}

const tabCount = document.getElementById("tab-count-subs");
let openSender: (key: string) => void = () => {};

export function renderSubscriptionsTab(senders: SenderSummary[]) {
  const senderByKey = new Map(senders.map((sender) => [sender.key, sender]));
  const available = senders.filter(
    (sender) => sender.unsubscribe.postUrl || sender.unsubscribe.httpUrl || sender.unsubscribe.mailto,
  );
  const availableKeys = new Set(available.map((sender) => sender.key));
  const trackedOnlyRows = Object.entries(ctx.settings.unsubscribeRequests)
    .filter(([key]) => !availableKeys.has(key))
    .map(([key, request]) => ({ key, request, outcome: unsubscribeOutcomeFor(key, senderByKey.get(key)) }))
    .sort(
      (a, b) =>
        unsubscribeOutcomeRank(a.outcome.state) - unsubscribeOutcomeRank(b.outcome.state) ||
        b.request.requestedAt - a.request.requestedAt,
    );

  const statusByRow = new Map<string, string>();
  const groups = new Map<string, SenderSummary[]>();
  for (const s of available) groups.set(listRowKey(s), [...(groups.get(listRowKey(s)) ?? []), s]);
  for (const [k, g] of groups) statusByRow.set(k, listStatus(g));

  const table = document.createElement("div");
  const rowCount = renderSenderTable(table, {
    items: available.map((sender) => ({
      sender,
      ids: sender.messages.map((m) => m.id),
      reason: statusByRow.get(listRowKey(sender)) ?? "",
    })),
    rowKeyOf: listRowKey,
    openRow: (_key, lead) => openSender(lead.key),
    act: (_ids, picked, slot, reset) => unsubscribeMany(picked, slot, reset),
    noteHead: "Status",
    verb: "Unsubscribe",
    canTick: (group) => group.some(canUnsubscribe),
    controls: listControls,
    badge: (group) => (group.length > 1 ? `${group.length} lists` : ""),
    selected: selectedListKeys,
    barIds: { slot: "subs-unsub-all-slot", button: "subs-unsub-all-btn" },
  });
  if (tabCount) tabCount.textContent = rowCount ? rowCount.toLocaleString() : "";

  const parts: HTMLElement[] = [];
  const offer = siblingOffer(available);
  if (offer) parts.push(offer);
  if (rowCount > 0) parts.push(table);
  else if (trackedOnlyRows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No mailing lists in your mail.";
    parts.push(empty);
  }

  if (trackedOnlyRows.length > 0) {
    const heading = document.createElement("h3");
    heading.className = "section-label";
    heading.style.margin = "24px 0 10px";
    heading.textContent = "Unsubscribed, no mail left";
    const old = document.createElement("table");
    const thead = document.createElement("thead");
    thead.appendChild(headerRow(["Sender", "Requested", "Status", ""]));
    const tbody = document.createElement("tbody");
    for (const { key, request, outcome } of trackedOnlyRows) {
      const row = document.createElement("tr");
      const cells = [senderAddressFromKey(key), formatRelativeTime(request.requestedAt), outcome.label].map((t) =>
        Object.assign(document.createElement("td"), { textContent: t }),
      );
      const actionCell = document.createElement("td");
      actionCell.append(...requestActions(key, request.provider, outcome.state));
      row.append(...cells, actionCell);
      tbody.appendChild(row);
    }
    old.append(thead, tbody);
    parts.push(heading, old);
  }
  subscriptionsListEl.replaceChildren(...parts);
}

export function wireSubscriptionsTab(open: (senderKey: string) => void) {
  openSender = open;
}

/** Ticks these lists and opens the Unsubscribe confirm, for Home's "Stop mail you never open". */
export function preselectLists(keys: string[]) {
  const byKey = new Map(ctx.senders.map((s) => [s.key, s]));
  selectedListKeys.clear();
  for (const k of keys) {
    const s = byKey.get(k);
    if (s && canUnsubscribe(s)) selectedListKeys.add(listRowKey(s));
  }
  renderSubscriptionsTab(ctx.senders);
  if (selectedListKeys.size > 0) document.getElementById("subs-unsub-all-btn")?.click();
}
