// The "Recently done" tab and the action-log write/undo layer behind it.
// Every destructive path in the dashboard calls logAction(); this module owns
// the log, the per-entry Undo, and the small "Undo" button the Clean-up tab
// attaches after a bulk delete. Kept together because they're one unit: an
// entry is only useful if it can be undone and re-rendered.
import { log } from "../lib/log";
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
import { senderTile } from "./senderTile";
import { ctx, providerById, rescan } from "./state";

const recentListEl = document.getElementById("recent-list") as HTMLDivElement;

export async function logAction(kind: ActionLogKind, summary: string, undo?: ActionLogUndo) {
  await appendActionLog([{ id: makeLogId(kind), at: Date.now(), kind, summary, undo }]);
  ctx.settings = await getSettings();
  renderRecentTab();
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
      await rescan();
    } catch (err) {
      undoBtn.disabled = false;
      undoBtn.textContent = "Undo failed, try again";
      log.error(err);
    }
  };
  container.appendChild(undoBtn);
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

function makeTile(entry: ActionLogEntry): HTMLElement {
  if (entry.undo?.fromAddress) {
    return senderTile(entry.undo.fromAddress, undefined, "sz-30");
  }
  const tile = document.createElement("span");
  tile.className = "logo-tile sz-30";
  tile.setAttribute("aria-hidden", "true");
  tile.style.background = "var(--neutral-fill-hover)";
  tile.style.color = "var(--label-2)";
  tile.innerHTML =
    '<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="6.6"></circle><path d="M10 6.4V10l2.6 1.6"></path></svg>';
  return tile;
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
  let rowInGroup = 0;

  for (const entry of entries) {
    const label = dayLabel(entry.at);
    if (label !== currentLabel) {
      const wrap = document.createElement("div");
      wrap.className = "day-group";
      const h = document.createElement("div");
      h.className = "section-label";
      h.style.padding = "0 4px 10px";
      h.textContent = label;
      group = document.createElement("div");
      group.className = "grouped-list";
      wrap.append(h, group);
      stack.appendChild(wrap);
      currentLabel = label;
      rowInGroup = 0;
    }

    if (rowInGroup > 0) {
      const sep = document.createElement("div");
      sep.className = "row-sep";
      sep.style.marginLeft = "61px";
      group!.appendChild(sep);
    }
    rowInGroup += 1;

    const row = document.createElement("div");
    row.className = "list-row";
    row.style.gridTemplateColumns = "30px minmax(0,1fr) max-content";
    row.appendChild(makeTile(entry));

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
    detail.textContent = new Date(entry.at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    text.append(line, detail);
    row.appendChild(text);

    if (entry.undone) {
      const done = document.createElement("span");
      done.className = "recent-detail";
      done.textContent = "undone";
      row.appendChild(done);
    } else if (entry.undo) {
      const undoBtn = document.createElement("button");
      undoBtn.className = "btn btn-sm";
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
    } else {
      const spacer = document.createElement("span");
      row.appendChild(spacer);
    }

    group!.appendChild(row);
  }

  recentListEl.appendChild(stack);
}
