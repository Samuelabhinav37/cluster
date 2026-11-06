// The "Recently done" tab and the action-log write/undo layer behind it.
// Every destructive path in the dashboard calls logAction(); this module owns
// the log, the per-entry Undo, and the small "Undo" button the Clean-up tab
// attaches after a bulk delete. Kept together because they're one unit: an
// entry is only useful if it can be undone and re-rendered.
import { log } from "../lib/log";
import { learnFromFeedback } from "./suggestionLearning";
import {
  appendActionLog,
  makeLogId,
  type ActionLogEntry,
  type ActionLogKind,
  type ActionLogUndo,
} from "../lib/actionLog";
import { getSettings, mutateSettings } from "../lib/settingsStore";
import { recordEngagementFeedback } from "../lib/engagementModel";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { ctx, providerById, rescan } from "./state";
import { pinInInbox } from "../lib/inboxTimeLimits";

const recentListEl = document.getElementById("recent-list") as HTMLDivElement;

export async function logAction(kind: ActionLogKind, summary: string, undo?: ActionLogUndo) {
  await appendActionLog([{ id: makeLogId(kind), at: Date.now(), kind, summary, undo }]);
  ctx.settings = await getSettings();
  renderRecentTab();
  // Kai reacts to what Cluster just did (kaiGuide.ts listens)
  document.dispatchEvent(new CustomEvent("cluster:action", { detail: { kind } }));
}

// Undo (Gmail-first). Only ever offered for ids that were moved to Trash /
// archived / labelled — never permanently deleted. Outlook's move-to-Deleted-
// Items has no undo wired up, so a mixed-provider action only restores its
// Gmail portion.
export function appendUndoButton(container: HTMLElement, gmailIds: string[]) {
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
      document.dispatchEvent(new CustomEvent("cluster:undo"));
      await rescan();
    } catch (err) {
      undoBtn.disabled = false;
      undoBtn.textContent = "Undo failed, try again";
      log.error(err);
    }
  };
  container.appendChild(undoBtn);
}

export async function undoEntry(entry: ActionLogEntry) {
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
    // Mail put back in the inbox stays there: without this, the time-limit
    // sweep would see it still past its limit and move it out again.
    const restored = entry.undo.ids;
    ctx.settings = await mutateSettings((current) => ({
      ...current,
      autoSort: { ...current.autoSort, keptInInboxIds: pinInInbox(current.autoSort.keptInInboxIds, restored) },
    }));
  } else if (entry.undo.via === "unmute" && entry.undo.fromAddress) {
    if (!provider.unmuteSender) throw new Error("This provider cannot unmute senders");
    await provider.unmuteSender(token, entry.undo.fromAddress, entry.undo.ids);
  } else if (entry.undo.via === "unlabel-suspicious") {
    if (!provider.unlabelSuspicious) throw new Error("This provider cannot remove security labels");
    await provider.unlabelSuspicious(token, entry.undo.ids);
  } else if (entry.undo.via === "unsort" && entry.undo.labelName) {
    if (!provider.unlabelMessages) throw new Error("This provider cannot remove labels");
    if (entry.undo.fromAddress) await provider.unkeepSorted?.(token, entry.undo.fromAddress);
    await provider.unlabelMessages(
      token,
      entry.undo.ids,
      entry.undo.labelName,
      entry.undo.wasFiledOut ?? false,
    );
  }
  if (entry.undo?.senderKeys) void learnFromFeedback(entry.undo.senderKeys, "undo");
  ctx.settings = await mutateSettings((current) => ({
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
  await rescan();
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayLabel(at: number): string {
  const startOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((startOfDay(Date.now()) - startOfDay(at)) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  return new Date(at).toLocaleDateString();
}

// GitHub's pull-request list: a kind icon, the summary in bold, then a gray meta line.
const KIND_ICON: Record<ActionLogEntry["kind"], string> = {
  trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
  archive: "M3 4h18v4H3zM5 8v12h14V8M10 12h4",
  pin: "M12 17v5M9 3h6l-1 6 4 4H6l4-4z",
  markRead: "M20 6 9 17l-5-5",
  mute: "M6 8a6 6 0 0 1 9.3-5M18 8c0 7 3 9 3 9H9M3 3l18 18M10.3 21a1.9 1.9 0 0 0 3.4 0",
  unsubscribe: "M3 5h18v14H3zM3 7l9 6 9-6M15 15l4 4M19 15l-4 4",
  snooze: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  labelSuspicious: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM12 8v4M12 16h.01",
  keepSorted: "M3 6h18M7 12h10M10 18h4",
  sort: "M3 6h18M7 12h10M10 18h4",
  screener: "M3 12h5l2 3h4l2-3h5M5 5h14l2 7v7H3v-7z",
  rule: "M4 4h16l-6 8v6l-4 2v-8z",
  labels: "M3 12V4h8l10 10-8 8z M7.5 7.5h.01",
};

function kindIcon(entry: ActionLogEntry): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", `act-ic${entry.undone ? " undone" : ""}`);
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", KIND_ICON[entry.kind] ?? KIND_ICON.labels);
  svg.append(path);
  return svg;
}

export function renderRecentTab() {
  recentListEl.innerHTML = "";

  if (ctx.settings.lastTriageSummary) {
    const p = document.createElement("p");
    p.className = "caveat";
    p.textContent = `Last background sweep: ${ctx.settings.lastTriageSummary}`;
    recentListEl.appendChild(p);
  }

  const entries = [...ctx.settings.actionLog].reverse();
  if (entries.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = "Nothing done yet.";
    recentListEl.appendChild(p);
    return;
  }

  const stack = document.createElement("div");
  stack.className = "stack";
  let currentLabel = "";
  let group: HTMLDivElement | null = null;

  for (const entry of entries) {
    const label = dayLabel(entry.at);
    if (label !== currentLabel) {
      const h = document.createElement("h2");
      h.className = "act-day";
      h.textContent = label;
      group = document.createElement("div");
      group.className = "act-list";
      stack.append(h, group);
      currentLabel = label;
    }

    const row = document.createElement("div");
    row.className = "act-row";
    const text = document.createElement("div");
    text.className = "act-text";
    const title = document.createElement("b");
    title.textContent = entry.summary;
    const meta = document.createElement("span");
    const time = new Date(entry.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    meta.textContent = [entry.undo?.fromAddress, entry.undo ? `${entry.undo.ids.length.toLocaleString()} emails` : "", entry.undone ? "Undone" : "", time]
      .filter(Boolean)
      .join(" · ");
    text.append(title, meta);
    row.append(kindIcon(entry), text);

    if (entry.undo && !entry.undone) {
      const undoBtn = document.createElement("button");
      undoBtn.className = "act-undo";
      undoBtn.textContent = "Undo";
      undoBtn.onclick = async () => {
        undoBtn.disabled = true;
        undoBtn.textContent = "Undoing…";
        try {
          await undoEntry(entry);
          document.dispatchEvent(new CustomEvent("cluster:undo"));
        } catch (err) {
          undoBtn.disabled = false;
          undoBtn.textContent = "Undo failed, try again";
          log.error(err);
        }
      };
      row.appendChild(undoBtn);
    }
    group!.appendChild(row);
  }

  recentListEl.appendChild(stack);
}
