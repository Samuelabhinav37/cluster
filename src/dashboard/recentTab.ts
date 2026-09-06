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

export function renderRecentTab() {
  recentListEl.innerHTML = "";

  if (ctx.settings.lastTriageSummary) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = `Last background sweep: ${ctx.settings.lastTriageSummary}`;
    recentListEl.appendChild(p);
  }

  const entries = [...ctx.settings.actionLog].reverse();
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
