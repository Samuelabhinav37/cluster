// Screener tab: hold mail from senders the user has never emailed, with a
// per-sender Allow / Block queue and a hand-managed allow-list. Provider-
// generic (Gmail + Outlook, gated per-sender by whether that provider
// implements screenSender). screenPending is the foreground mirror of
// background.ts's runScreener, run when the user first turns the Screener on.
import { log } from "../lib/log";
import { updateSettings } from "../lib/settingsStore";
import type { ProviderId } from "../lib/providers/emailProvider";
import { knownSenderSet, pendingScreenerSenders, sentCorrespondentsStale } from "../lib/screener";
import type { SenderSummary } from "../lib/senderModel";
import { senderTile } from "./senderTile";
import { ctx, providerById, rescan } from "./state";
import { logAction } from "./recentTab";

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

async function screenPending(senders: SenderSummary[]) {
  if (sentCorrespondentsStale(ctx.settings)) {
    const addresses = new Set(ctx.settings.sentCorrespondents.addresses);
    let anySucceeded = false;
    for (const provider of providerById.values()) {
      if (!provider.listSentCorrespondents) continue;
      try {
        const token = await provider.getAuthToken(false);
        for (const addr of await provider.listSentCorrespondents(token)) addresses.add(addr);
        anySucceeded = true;
      } catch (err) {
        log.error("Screener: sent-correspondent refresh failed", provider.id, err);
      }
    }
    if (anySucceeded) {
      ctx.settings = await updateSettings({
        sentCorrespondents: { addresses: [...addresses], fetchedAt: Date.now() },
      });
    }
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
      await provider.screenSender(token, s.address, s.messageIds);
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
      const stack = document.createElement("div");
      stack.className = "stack";
      for (const s of queue) {
        stack.appendChild(buildScreenerCard(s));
      }
      screenerQueueEl.appendChild(stack);
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

const ENVELOPE_SVG =
  '<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="14" height="10" rx="2"></rect><path d="M3.6 5.6 10 10.6l6.4-5"></path></svg>';

function buildScreenerCard(s: SenderSummary): HTMLDivElement {
  const card = document.createElement("div");
  card.className = "glass-card";

  const head = document.createElement("div");
  head.style.display = "flex";
  head.style.alignItems = "center";
  head.style.gap = "14px";
  head.style.flexWrap = "wrap";
  const tile = senderTile(s.address, s.displayName, "sz-44");
  const idWrap = document.createElement("span");
  idWrap.style.flex = "1";
  idWrap.style.minWidth = "0";
  const name = document.createElement("span");
  name.style.display = "block";
  name.style.font = "600 22px/1.2 var(--font-display)";
  name.style.letterSpacing = "-.021em";
  name.textContent = s.displayName || "Unknown sender";
  const addr = document.createElement("span");
  addr.className = "row-sub";
  addr.style.display = "block";
  addr.style.overflowWrap = "anywhere";
  addr.textContent = s.address;
  idWrap.append(name, addr);
  const since = document.createElement("span");
  since.className = "recent-detail";
  since.style.whiteSpace = "nowrap";
  since.textContent = firstWrote(s);
  head.append(tile, idWrap, since);
  card.appendChild(head);

  const subjects = s.messages.map((m) => m.subject).filter((x): x is string => Boolean(x));
  if (subjects.length > 0) {
    const panel = document.createElement("div");
    panel.className = "inner-panel subject-list";
    panel.style.padding = "0";
    const hdr = document.createElement("div");
    hdr.className = "hdr";
    hdr.textContent = "Waiting";
    panel.appendChild(hdr);
    for (const subject of subjects.slice(0, 4)) {
      const line = document.createElement("div");
      line.className = "subj";
      const icon = document.createElement("span");
      icon.innerHTML = ENVELOPE_SVG;
      icon.style.display = "inline-flex";
      const text = document.createElement("span");
      text.textContent = subject;
      line.append(icon, text);
      panel.appendChild(line);
    }
    card.appendChild(panel);
  }

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "10px";
  actions.style.alignItems = "center";
  actions.style.flexWrap = "wrap";
  const allow = document.createElement("button");
  allow.className = "btn btn-accent";
  allow.textContent = "Let through";
  allow.onclick = async () => {
    allow.disabled = true;
    try {
      await releaseHeldSender(s.address, s.messageIds, s.provider, "allow");
    } catch (err) {
      allow.disabled = false;
      log.error(err);
    }
  };
  const keep = document.createElement("button");
  keep.className = "btn";
  keep.textContent = "Keep screening";
  keep.disabled = true;
  keep.title = "Already held — no action needed";
  const spacer = document.createElement("span");
  spacer.style.flex = "1";
  const block = document.createElement("button");
  block.className = "btn btn-danger";
  block.textContent = "Block";
  block.onclick = async () => {
    block.disabled = true;
    try {
      await releaseHeldSender(s.address, s.messageIds, s.provider, "block");
    } catch (err) {
      block.disabled = false;
      log.error(err);
    }
  };
  actions.append(allow, keep, spacer, block);
  card.appendChild(actions);

  return card;
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
