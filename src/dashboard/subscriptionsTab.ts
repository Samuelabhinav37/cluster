// Cleanup's Mailing lists tab: every list in the scan in the Senders table's
// design (one row per domain), with Unsubscribe in the selection bar. Each
// list's status feeds the Filter menu.
// recordUnsubscribeRequests is exported because the Clean-up tab's sender
// table also records a request when its inline Unsubscribe button fires.
import { ensureOriginsPermission, fireOneClickUnsubscribe } from "../lib/unsubscribe";
import { executeBulkUnsubscribe } from "../lib/bulkActions";
import { unsubscribeOutcomeRank } from "../lib/unsubscribeOutcome";
import { buildProtectionContext } from "../lib/protectionPolicy";
import type { SenderSummary } from "../lib/senderModel";
import { domainOf } from "../lib/domainGrouping";
import { registrableDomain } from "../lib/registrableDomain";
import { formatRelativeTime, headerRow, renderConfirmStep } from "./ui";
import { renderSenderTable } from "./cleanupPage";
import { leavableList } from "../lib/cleanupCards";
import { ctx } from "./state";
import { logAction } from "./recentTab";
import {
  recordUnsubscribeRequests,
  trashStillSending,
  undoUnsubscribe,
  UNDO_UNSUBSCRIBE_COPY,
  unsubscribeOutcomeFor,
} from "./unsubscribeRecord";
import { openUnsubscribeSheet } from "./unsubscribeSheet";


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
    id: "lists",
    columns: ["read", "emails", "perMonth", "last"],
    tools: document.getElementById("cu-tools-lists"),
    nameHead: "Mailing list",
    perMonth: (group) => group.reduce((n, s) => n + (ctx.profiles.get(s.key)?.perMonth ?? 0), 0),
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
    badge: (group) => (group.length > 1 ? `${group.length} lists` : ""),
    selected: selectedListKeys,
    barIds: { slot: "subs-unsub-all-slot", button: "subs-unsub-all-btn" },
  });
  if (tabCount) tabCount.textContent = rowCount ? rowCount.toLocaleString() : "";

  const parts: HTMLElement[] = [];
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
