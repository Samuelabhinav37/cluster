// Screener tab: hold mail from senders the user has never emailed, with a
// per-sender Allow / Block queue and a hand-managed allow-list. Provider-
// generic (Gmail + Outlook, gated per-sender by whether that provider
// implements screenSender). screenPending is the foreground mirror of
// background.ts's runScreener, run when the user first turns the Screener on.
import { correctionKey } from "../lib/addressIdentity";
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
import { renderConfirmStep } from "./ui";
import { ensureOriginsPermission, fireOneClickUnsubscribe } from "../lib/unsubscribe";
import { recordUnsubscribeRequests } from "./unsubscribeRecord";
import { batchModify, findLabelIds, getOrCreateLabel } from "../lib/gmailApi";
import { categoryLabelName } from "../lib/categoryFilters";
import { ALL_SORT_BUCKETS, type SortBucket } from "../lib/sortTaxonomy";

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
  const date = new Date(earliest);
  const year = date.getFullYear() === new Date().getFullYear() ? undefined : "numeric";
  return `First wrote ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year })}`;
}

const screenerToggle = document.getElementById("screener-toggle") as HTMLInputElement;
const holdPeopleToggle = document.getElementById("screener-people") as HTMLInputElement | null;
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
  const pending = pendingScreenerSenders(senders, known, excluded, ctx.settings.screenerHoldPeople);
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

async function releaseHeldSender(
  address: string,
  ids: string[],
  provider: ProviderId,
  decision: "allow" | "block",
  rescanAfter = true,
) {
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
  if (rescanAfter) await rescan();
}

/** Safe to let in as a group: a list, or someone who has written for over two
 * weeks, and never anyone with a scam warning. Everyone else is decided alone. */
function isFamiliar(s: SenderSummary): boolean {
  if (s.threatSignals.length > 0) return false;
  const first = Math.min(...s.messages.map((m) => m.receivedAt));
  return s.messages.some((m) => m.looksAutomated) || Date.now() - first > 14 * DAY_MS;
}

/** One row for every familiar waiting sender, so they can be let in together. */
function buildFamiliarBatch(familiar: SenderSummary[]): HTMLTableRowElement {
  const row = document.createElement("tr");
  row.className = "scr-row batch-row";
  const name = document.createElement("td");
  name.colSpan = 4;
  name.className = "scr-name";
  name.textContent = `${familiar.length} mailing lists and older senders`;
  const slot = document.createElement("td");
  slot.className = "scr-c-act";
  const allow = document.createElement("button");
  allow.className = "btn btn-accent";
  allow.textContent = "Let in all";
  const reset = () => slot.replaceChildren(allow);
  allow.onclick = () =>
    renderConfirmStep(slot, reset, `Let in all ${familiar.length}?`, false, async () => {
      let done = 0;
      for (const s of familiar) {
        try {
          await releaseHeldSender(s.address, s.messageIds, s.provider, "allow", false);
          done += 1;
        } catch (err) {
          log.error("Screener: failed to let in", s.address, err);
        }
      }
      await rescan();
      return `Let in ${done} of ${familiar.length}.`;
    });
  reset();
  row.append(name, slot);
  return row;
}

export function renderScreenerTab(senders: SenderSummary[]) {
  // Two things hold mail: the old Screener and "Hold mail with no label" (Settings).
  const holding = ctx.settings.screenerEnabled || ctx.settings.autoSort.holdUnsorted;
  screenerToggle.checked = holding;
  if (holdPeopleToggle) {
    holdPeopleToggle.checked = ctx.settings.screenerHoldPeople;
    holdPeopleToggle.disabled = !holding;
  }
  renderScreenerBacklog().catch((err) => log.error("Screener backlog render failed", err));

  screenerQueueEl.innerHTML = "";
  if (screenerQueueCountEl) screenerQueueCountEl.textContent = "";
  const held = new Set(ctx.settings.screenedSenders.map((a) => a.toLowerCase()));
  // Without the old Screener, only mail that really was held is waiting.
  const showHeldOnly = !ctx.settings.screenerEnabled;
  if (!holding) {
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
    const queue = pendingScreenerSenders(senders, known, muted, ctx.settings.screenerHoldPeople).filter(
      (s) => !showHeldOnly || held.has(s.address.toLowerCase()),
    );

    if (queue.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No one is waiting.";
      screenerQueueEl.appendChild(p);
    } else {
      if (screenerQueueCountEl) {
        screenerQueueCountEl.textContent = `${queue.length} sender${queue.length === 1 ? "" : "s"}`;
      }
      const table = document.createElement("table");
      table.className = "ct-table scr-table";
      const head = table.createTHead().insertRow();
      for (const [text, cls] of [["Sender", ""], ["Emails", "num"], ["First email", ""], ["Label", ""], ["", "scr-c-act"]]) {
        const th = document.createElement("th");
        th.textContent = text;
        if (cls) th.className = cls;
        head.append(th);
      }
      const body = table.createTBody();
      const familiar = queue.filter(isFamiliar);
      if (familiar.length > 1) body.appendChild(buildFamiliarBatch(familiar));
      for (const s of queue) body.appendChild(buildScreenerRow(s));
      screenerQueueEl.appendChild(table);
    }
  }

  // Allow-list management
  screenerAllowlistEl.innerHTML = "";
  if (ctx.settings.screenerAllowlist.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = "No one yet, and people you've emailed skip this list.";
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

/** One waiting sender as a table row: who (name, address under it), how many
 * emails, when they first wrote, a label to file them under, Block and Let in.
 * Names and addresses come from the sender, so they go in as text. */
function buildScreenerRow(s: SenderSummary): HTMLTableRowElement {
  const row = document.createElement("tr");
  row.className = "scr-row";
  const cell = (cls: string, ...kids: Array<Node | string>) => {
    const td = document.createElement("td");
    if (cls) td.className = cls;
    td.append(...kids);
    row.append(td);
  };
  const who = document.createElement("span");
  who.className = "scr-who";
  const words = document.createElement("span");
  words.className = "scr-words";
  const name = document.createElement("b");
  name.className = "scr-name";
  name.textContent = s.displayName || s.address;
  const address = document.createElement("span");
  address.className = "scr-addr";
  address.textContent = s.address;
  words.append(name, ...(s.displayName ? [address] : []));
  who.append(senderTile(s.address, s.displayName, "sz-30"), words);
  const n = s.messages.length || s.messageIds.length;
  const first = firstWrote(s).replace(/^First wrote /, "");
  cell("", who);
  cell("num", n.toLocaleString());
  cell("ct-dim", first.charAt(0).toUpperCase() + first.slice(1));

  const block = document.createElement("button");
  block.className = "btn btn-danger";
  block.textContent = "Block";
  // Only a signed company gets an unsubscribe: to a spammer it just proves the address is read.
  const stopUrl = ctx.profiles.get(s.key)?.companyKey ? s.unsubscribe.postUrl : undefined;
  block.title = stopUrl
    ? "Their mail goes to Muted from now on, and they're asked to stop"
    : "Their mail goes to Muted from now on";
  block.onclick = async () => {
    block.disabled = true;
    try {
      await releaseHeldSender(s.address, idsSafeToMoveOut(s), s.provider, "block");
      if (stopUrl && (await ensureOriginsPermission([stopUrl])) && (await fireOneClickUnsubscribe(stopUrl)))
        await recordUnsubscribeRequests([s]);
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
  cell("", ...(s.provider === "gmail" ? [labelPicker(s)] : []));
  const acts = document.createElement("span");
  acts.className = "scr-acts";
  acts.append(block, allow);
  cell("scr-c-act", acts);
  return row;
}

/** "Label": file this sender's mail under a label, now and from now on. Their
 * mail leaves the Screener into that label (not the inbox: it's already been
 * waiting), and the choice is saved as a correction for the sender. */
function labelPicker(s: SenderSummary): HTMLSelectElement {
  const select = document.createElement("select");
  select.className = "kind-pick";
  select.setAttribute("aria-label", `Label for ${s.address}`);
  select.add(new Option("Label", ""));
  for (const b of ALL_SORT_BUCKETS) select.add(new Option(categoryLabelName(b, ctx.settings.labelChoices), b));
  select.onchange = async () => {
    const bucket = select.value as SortBucket;
    if (!bucket) return;
    select.disabled = true;
    try {
      const provider = providerById.get(s.provider)!;
      const token = await provider.getAuthToken(false);
      // Drops the per-sender hold filter if the Screener made one; moves nothing.
      await provider.allowSenderThrough!(token, s.address, []);
      const labelId = await getOrCreateLabel(token, categoryLabelName(bucket, ctx.settings.labelChoices));
      await batchModify(token, s.messageIds, [labelId], await findLabelIds(token, clusterLabelName("screener")));
      const address = s.address.toLowerCase();
      ctx.settings = await updateSettings({
        sortOverrides: { ...ctx.settings.sortOverrides, [correctionKey(address)]: bucket },
        screenedSenders: ctx.settings.screenedSenders.filter((a) => a.toLowerCase() !== address),
      });
      await logAction("screener", `Filed ${s.address} under ${categoryLabelName(bucket, ctx.settings.labelChoices)}`);
      await rescan();
    } catch (err) {
      select.disabled = false;
      select.value = "";
      log.error("Screener: failed to label", s.address, err);
    }
  };
  return select;
}

export function wireScreenerTab() {
  screenerToggle.onchange = async () => {
    const on = screenerToggle.checked;
    ctx.settings = await updateSettings({ screenerEnabled: on, autoSort: { ...ctx.settings.autoSort, holdUnsorted: on } });
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
  if (holdPeopleToggle)
    holdPeopleToggle.onchange = async () => {
      ctx.settings = await updateSettings({ screenerHoldPeople: holdPeopleToggle.checked });
      renderScreenerTab(ctx.senders);
    };
}
