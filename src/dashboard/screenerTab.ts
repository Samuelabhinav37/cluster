// Screener tab: hold mail from senders the user has never emailed, with a
// per-sender Allow / Block queue and a hand-managed allow-list. Provider-
// generic (Gmail + Outlook, gated per-sender by whether that provider
// implements screenSender). screenPending is the foreground mirror of
// background.ts's runScreener, run when the user first turns the Screener on.
import { idsSafeToMoveOut } from "../lib/protectionPolicy";
import { log } from "../lib/log";
import { updateSettings } from "../lib/settingsStore";
import type { ProviderId } from "../lib/providers/emailProvider";
import { knownSenderSet, pendingScreenerSenders, refreshSentCorrespondents } from "../lib/screener";
import type { SenderSummary } from "../lib/senderModel";
import { senderTile } from "./senderTile";
import { ctx, providerById, rescan } from "./state";
import { logAction } from "./recentTab";
import { renderScreenerBacklog } from "./screenerBacklog";
import { clusterLabelName } from "../lib/clusterLabels";

const DAY_MS = 24 * 60 * 60 * 1000;

function firstWrote(sender: SenderSummary): string {
  const earliest = sender.messages.reduce(
    (min, m) => (m.receivedAt < min ? m.receivedAt : min),
    Date.now(),
  );
  const days = Math.round((Date.now() - earliest) / DAY_MS);
  if (days <= 0) return "First wrote today";
  if (days === 1) return "First wrote yesterday";
  if (days < 7) return `First wrote ${days} days ago`;
  return `First wrote ${new Date(earliest).toLocaleDateString()}`;
}

const screenerToggle = document.getElementById("screener-toggle") as HTMLInputElement;
const screenerQueueEl = document.getElementById("screener-queue") as HTMLDivElement;
const screenerAllowlistEl = document.getElementById("screener-allowlist") as HTMLDivElement;
const screenerQueueCountEl = document.getElementById("screener-queue-count") as HTMLElement | null;

async function screenPending(senders: SenderSummary[]) {
  const sentCorrespondents = await refreshSentCorrespondents(ctx.settings, providerById);
  if (sentCorrespondents !== ctx.settings.sentCorrespondents) {
    ctx.settings = { ...ctx.settings, sentCorrespondents };
  }

  const known = knownSenderSet(ctx.settings);
  const excluded = new Set(
    [...ctx.settings.mutedSenders, ...ctx.settings.screenedSenders].map((a) => a.toLowerCase()),
  );
  const pending = pendingScreenerSenders(senders, known, excluded);
  const screened: string[] = [];
  for (const s of pending) {
    const provider = providerById.get(s.provider);
    if (!provider?.screenSender) continue;
    try {
      const token = await provider.getAuthToken(false);
      await provider.screenSender(token, s.address, idsSafeToMoveOut(s));
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

async function releaseHeldSender(address: string, ids: string[], provider: ProviderId, decision: "allow" | "block") {
  const emailProvider = providerById.get(provider);
  if (!emailProvider) return;
  const token = await emailProvider.getAuthToken(false);
  if (decision === "allow") {
    await emailProvider.allowSenderThrough!(token, address, ids);
    ctx.settings = await updateSettings({
      screenerAllowlist: [...new Set([...ctx.settings.screenerAllowlist, address])],
      screenedSenders: ctx.settings.screenedSenders.filter((a) => a !== address),
    });
    await logAction("screener", `Allowed ${address} through the Screener`);
  } else {
    await emailProvider.muteSender!(token, address, ids);
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
  renderScreenerBacklog().catch((err) => log.error("Screener backlog render failed", err));

  screenerQueueEl.innerHTML = "";
  if (screenerQueueCountEl) screenerQueueCountEl.textContent = "";
  if (!ctx.settings.screenerEnabled) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent =
      ctx.settings.screenedSenders.length > 0
        ? `Holding is off. Mail already held from ${ctx.settings.screenedSenders.length} sender${ctx.settings.screenedSenders.length === 1 ? "" : "s"} is still under the "${clusterLabelName("screener")}" label in Gmail.`
        : "Holding is off, so new senders go straight to your inbox.";
    screenerQueueEl.appendChild(p);
  } else {
    const known = knownSenderSet(ctx.settings);
    const muted = new Set(ctx.settings.mutedSenders.map((a) => a.toLowerCase()));
    const queue = pendingScreenerSenders(senders, known, muted);

    if (queue.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No one is waiting. Everyone who wrote recently is someone you've emailed or let in.";
      screenerQueueEl.appendChild(p);
    } else {
      if (screenerQueueCountEl) {
        screenerQueueCountEl.textContent = `${queue.length} sender${queue.length === 1 ? "" : "s"}`;
      }
      const rows = document.createElement("div");
      rows.className = "sender-rows";
      for (const s of queue) {
        rows.appendChild(buildScreenerRow(s));
      }
      screenerQueueEl.appendChild(rows);
    }
  }

  // Allow-list management
  screenerAllowlistEl.innerHTML = "";
  if (ctx.settings.screenerAllowlist.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = "No one yet. People you've emailed are let in without being listed here.";
    screenerAllowlistEl.appendChild(p);
  } else {
    const list = document.createElement("div");
    list.className = "grouped-list";
    ctx.settings.screenerAllowlist.forEach((address, i) => {
      if (i > 0) {
        const sep = document.createElement("div");
        sep.className = "row-sep";
        sep.style.marginLeft = "18px";
        list.appendChild(sep);
      }
      const row = document.createElement("div");
      row.className = "list-row";
      row.style.gridTemplateColumns = "minmax(0,1fr) max-content";
      const label = document.createElement("span");
      label.className = "row-title";
      label.style.fontWeight = "400";
      label.textContent = address;
      const remove = document.createElement("button");
      remove.className = "btn btn-sm";
      remove.textContent = "Remove";
      remove.onclick = async () => {
        ctx.settings = await updateSettings({
          screenerAllowlist: ctx.settings.screenerAllowlist.filter((a) => a !== address),
        });
        renderScreenerTab(ctx.senders);
      };
      row.append(label, remove);
      list.appendChild(row);
    });
    screenerAllowlistEl.appendChild(list);
  }
}

/** One waiting sender: who, their newest subject line, and Let in / Block.
 * Names, addresses and subjects come from the sender, so they go in as text. */
function buildScreenerRow(s: SenderSummary): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "sender-row";
  const text = document.createElement("div");
  text.className = "sr-text";
  const name = document.createElement("div");
  name.className = "sr-name";
  name.textContent = s.displayName || s.address;
  const sub = document.createElement("div");
  sub.className = "sr-sub";
  const newest = [...s.messages].sort((a, b) => b.receivedAt - a.receivedAt).find((m) => m.subject);
  const n = s.messages.length || s.messageIds.length;
  sub.textContent = [
    newest?.subject ? `"${newest.subject}"` : null,
    `${n} email${n === 1 ? "" : "s"}`,
    s.address,
    firstWrote(s),
  ]
    .filter(Boolean)
    .join(" · ");
  text.append(name, sub);

  const block = document.createElement("button");
  block.className = "btn btn-ghost";
  block.textContent = "Block";
  block.title = "Their mail goes to Muted from now on";
  block.onclick = async () => {
    block.disabled = true;
    try {
      await releaseHeldSender(s.address, idsSafeToMoveOut(s), s.provider, "block");
    } catch (err) {
      block.disabled = false;
      log.error(err);
    }
  };
  const allow = document.createElement("button");
  allow.className = "btn btn-accent";
  allow.textContent = "Let in";
  allow.onclick = async () => {
    allow.disabled = true;
    try {
      await releaseHeldSender(s.address, s.messageIds, s.provider, "allow");
    } catch (err) {
      allow.disabled = false;
      log.error(err);
    }
  };
  row.append(senderTile(s.address, s.displayName, "sz-30"), text, block, allow);
  return row;
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
