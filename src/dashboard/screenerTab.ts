// Screener tab: hold mail from senders the user has never emailed, with a
// per-sender Allow / Block queue and a hand-managed allow-list. Gmail-only.
// screenPending is the foreground mirror of background.ts's runScreener,
// run when the user first turns the Screener on.
import { log } from "../lib/log";
import { updateSettings } from "../lib/settingsStore";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { knownSenderSet, pendingScreenerSenders, sentCorrespondentsStale } from "../lib/screener";
import type { SenderSummary } from "../lib/senderModel";
import { ctx, rescan } from "./state";
import { logAction } from "./recentTab";

const screenerToggle = document.getElementById("screener-toggle") as HTMLInputElement;
const screenerQueueEl = document.getElementById("screener-queue") as HTMLDivElement;
const screenerAllowlistEl = document.getElementById("screener-allowlist") as HTMLDivElement;

async function screenPending(senders: SenderSummary[]) {
  if (!gmailProvider.screenSender) return;
  const token = await gmailProvider.getAuthToken(false);

  if (sentCorrespondentsStale(ctx.settings) && gmailProvider.listSentCorrespondents) {
    try {
      const addresses = await gmailProvider.listSentCorrespondents(token);
      ctx.settings = await updateSettings({ sentCorrespondents: { addresses, fetchedAt: Date.now() } });
    } catch (err) {
      log.error("Screener: sent-correspondent refresh failed", err);
    }
  }

  const known = knownSenderSet(ctx.settings);
  const excluded = new Set(
    [...ctx.settings.mutedSenders, ...ctx.settings.screenedSenders].map((a) => a.toLowerCase()),
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
    ctx.settings = await updateSettings({
      screenedSenders: [...ctx.settings.screenedSenders, ...screened],
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
    ctx.settings = await updateSettings({
      screenerAllowlist: [...new Set([...ctx.settings.screenerAllowlist, address])],
      screenedSenders: ctx.settings.screenedSenders.filter((a) => a !== address),
    });
    await logAction("screener", `Allowed ${address} through the Screener`);
  } else {
    await gmailProvider.muteSender!(token, address, ids);
    ctx.settings = await updateSettings({
      mutedSenders: [...new Set([...ctx.settings.mutedSenders, address])],
      screenedSenders: ctx.settings.screenedSenders.filter((a) => a !== address),
    });
    await logAction("mute", `Blocked ${address} from the Screener`);
  }
  await rescan();
}

export function renderScreenerTab(senders: SenderSummary[]) {
  screenerToggle.checked = ctx.settings.screenerEnabled;

  screenerQueueEl.innerHTML = "";
  if (!ctx.settings.screenerEnabled) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent =
      ctx.settings.screenedSenders.length > 0
        ? `Screener is off. ${ctx.settings.screenedSenders.length} sender(s) are still held — turn it back on to review them, or find them under the Screener label in Gmail.`
        : "Screener is off.";
    screenerQueueEl.appendChild(p);
  } else {
    const known = knownSenderSet(ctx.settings);
    const muted = new Set(ctx.settings.mutedSenders.map((a) => a.toLowerCase()));
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
  if (ctx.settings.screenerAllowlist.length === 0) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "No addresses added by hand yet (your sent mail already counts as allowed).";
    screenerAllowlistEl.appendChild(p);
  } else {
    for (const address of ctx.settings.screenerAllowlist) {
      const row = document.createElement("div");
      row.className = "recent-row";
      const label = document.createElement("span");
      label.textContent = address;
      const remove = document.createElement("button");
      remove.textContent = "Remove";
      remove.onclick = async () => {
        ctx.settings = await updateSettings({
          screenerAllowlist: ctx.settings.screenerAllowlist.filter((a) => a !== address),
        });
        renderScreenerTab(ctx.senders);
      };
      row.append(label, remove);
      screenerAllowlistEl.appendChild(row);
    }
  }
}

export function wireScreenerTab() {
  screenerToggle.onchange = async () => {
    ctx.settings = await updateSettings({ screenerEnabled: screenerToggle.checked });
    if (screenerToggle.checked) {
      screenerToggle.disabled = true;
      try {
        await screenPending(ctx.senders);
        await rescan();
      } catch (err) {
        log.error(err);
      } finally {
        screenerToggle.disabled = false;
      }
    } else {
      renderScreenerTab(ctx.senders);
    }
  };
}
