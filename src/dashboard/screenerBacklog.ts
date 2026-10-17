// The Screener's real backlog: how many messages sit under the Screener label
// (the queue below only shows senders from the latest scan), and a one-pass
// "sort the held mail" that files each into its category label, sends mail
// from people you know back to the inbox, and lifts the hold on those senders.
// Gmail only; the planning is in lib/screenerBacklog.ts.
import { clusterLabelName } from "../lib/clusterLabels";
import {
  batchModify,
  deleteFilter,
  findLabelIds,
  getLabel,
  getOrCreateLabel,
  listFilters,
  listMessageIdsInLabel,
} from "../lib/gmailApi";
import { log } from "../lib/log";
import { loadMetadataCache, saveMetadataCache } from "../lib/metadataCache";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { knownSenderSet } from "../lib/screener";
import {
  planScreenerRelease,
  runScreenerRelease,
  type ReleaseDestination,
  type ScreenerReleasePlan,
} from "../lib/screenerBacklog";
import { buildSenderSummariesFromStubs } from "../lib/senderModel";
import { updateSettings } from "../lib/settingsStore";
import { bucketLabelName } from "../lib/sortTaxonomy";
import { logAction } from "./recentTab";
import { ctx, rescan } from "./state";

const SCREENER_LABEL = clusterLabelName("screener");
const MAX_BACKLOG = 5000;
const backlogEl = document.getElementById("screener-backlog") as HTMLDivElement | null;
// A re-render of the Screener tab mid-run mustn't wipe the progress UI.
let busy = false;

function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

function destinationName(dest: ReleaseDestination): string {
  return dest === "inbox" ? "Back to your inbox" : bucketLabelName(dest);
}

function button(text: string, accent = false): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = accent ? "btn btn-accent" : "btn";
  b.textContent = text;
  return b;
}

export async function renderScreenerBacklog(): Promise<void> {
  if (!backlogEl || busy) return;
  let token: string;
  let labelIds: string[];
  let total = 0;
  try {
    token = await gmailProvider.getAuthToken(false);
    labelIds = await findLabelIds(token, SCREENER_LABEL);
    for (const id of labelIds) total += (await getLabel(token, id)).messagesTotal ?? 0;
  } catch (err) {
    log.error("Screener backlog: could not read the label", err);
    backlogEl.hidden = true;
    return;
  }
  if (total === 0) {
    backlogEl.hidden = true;
    return;
  }

  backlogEl.innerHTML = "";
  const intro = document.createElement("p");
  const headline = document.createElement("strong");
  headline.textContent = `${plural(total, "message")} ${total === 1 ? "is" : "are"} waiting in the Screener.`;
  intro.append(
    headline,
    " ",
    "They never reached your inbox. Cluster can file each one where it belongs.",
  );
  const start = button("Sort the held mail…", true);
  const status = document.createElement("span");
  status.className = "hint";
  status.setAttribute("role", "status");
  const actions = document.createElement("div");
  actions.className = "tidy-actions";
  actions.append(start, status);
  backlogEl.append(intro, actions);
  backlogEl.hidden = false;

  start.onclick = () => void readAndPreview(token, labelIds, total, start, status);
}

async function readAndPreview(
  token: string,
  labelIds: string[],
  total: number,
  start: HTMLButtonElement,
  status: HTMLElement,
) {
  busy = true;
  start.disabled = true;
  try {
    const ids = new Set<string>();
    for (const id of labelIds) {
      for (const m of await listMessageIdsInLabel(token, id, MAX_BACKLOG)) ids.add(m);
    }
    const stubs = [...ids].slice(0, MAX_BACKLOG).map((id) => ({ id, provider: "gmail" as const }));
    // Each message is one metadata read; Gmail's per-minute limit paces this.
    const minutes = Math.max(1, Math.ceil((stubs.length * 20) / 5500));
    status.textContent = `Reading ${plural(stubs.length, "held message")} (about ${plural(minutes, "minute")})…`;
    const cache = await loadMetadataCache();
    const senders = await buildSenderSummariesFromStubs(
      [{ provider: gmailProvider, token, stubs }],
      (done, all) => {
        status.textContent = `Reading held mail… ${done.toLocaleString()} of ${all.toLocaleString()}`;
      },
      cache,
    );
    void saveMetadataCache(cache);
    const plan = planScreenerRelease(senders, knownSenderSet(ctx.settings), ctx.settings.sortOverrides);
    renderPreview(token, labelIds, plan, total > MAX_BACKLOG);
  } catch (err) {
    log.error("Screener backlog: read failed", err);
    status.textContent = "Couldn't read the held mail. Try again in a minute.";
    start.disabled = false;
    busy = false;
  }
}

function renderPreview(token: string, labelIds: string[], plan: ScreenerReleasePlan, capped: boolean) {
  if (!backlogEl) return;
  backlogEl.innerHTML = "";
  const intro = document.createElement("p");
  intro.textContent = capped
    ? `Here's where the first ${MAX_BACKLOG.toLocaleString()} held messages would go. Untick anything you'd rather keep held.`
    : "Here's where the held mail would go. Untick anything you'd rather keep held.";
  backlogEl.appendChild(intro);

  const list = document.createElement("div");
  list.className = "tidy-list";
  const boxes = new Map<ReleaseDestination, HTMLInputElement>();
  for (const group of plan.groups) {
    const row = document.createElement("label");
    row.className = "tidy-row";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = true;
    boxes.set(group.destination, box);
    const text = document.createElement("span");
    text.textContent = `${destinationName(group.destination)} · ${plural(group.ids.length, "message")} from ${plural(group.senders.length, "sender")}`;
    row.append(box, text);
    list.appendChild(row);
  }
  backlogEl.appendChild(list);

  if (plan.keptHeld.length > 0) {
    const held = document.createElement("p");
    held.className = "hint";
    held.textContent = `Staying held because they look like phishing: ${plan.keptHeld
      .map((k) => k.address)
      .slice(0, 5)
      .join(", ")}${plan.keptHeld.length > 5 ? ` and ${plan.keptHeld.length - 5} more` : ""}.`;
    backlogEl.appendChild(held);
  }

  const apply = button("Sort them", true);
  const cancel = button("Cancel");
  const status = document.createElement("span");
  status.className = "hint";
  status.setAttribute("role", "status");
  const actions = document.createElement("div");
  actions.className = "tidy-actions";
  actions.append(apply, cancel, status);
  backlogEl.appendChild(actions);

  cancel.onclick = () => {
    busy = false;
    void renderScreenerBacklog();
  };

  apply.onclick = async () => {
    const selected = new Set([...boxes].filter(([, b]) => b.checked).map(([d]) => d));
    if (selected.size === 0) {
      status.textContent = "Nothing ticked.";
      return;
    }
    apply.disabled = true;
    cancel.disabled = true;
    status.textContent = "Sorting…";
    try {
      const result = await runScreenerRelease(plan, selected, labelIds, {
        labelIdFor: (bucket) => getOrCreateLabel(token, bucketLabelName(bucket)),
        batchModify: (ids, add, remove) => batchModify(token, ids, add, remove),
        listFilters: () => listFilters(token),
        deleteFilter: (id) => deleteFilter(token, id),
      });
      // Released senders stay let-through, the same as "Let through" on a card,
      // so the Screener doesn't hold them again on its next pass.
      const released = new Set(result.released);
      ctx.settings = await updateSettings({
        screenerAllowlist: [...new Set([...ctx.settings.screenerAllowlist, ...result.released])],
        screenedSenders: ctx.settings.screenedSenders.filter((a) => !released.has(a.toLowerCase())),
      });
      const summary = `Sorted ${plural(result.moved, "held message")} out of the Screener and let ${plural(result.released.length, "sender")} through`;
      await logAction("screener", summary);
      status.textContent = `${summary}.`;
      busy = false;
      await rescan();
    } catch (err) {
      log.error("Screener backlog: release failed", err);
      status.textContent = "Something went wrong part-way. Anything not yet moved is still held; try again.";
      busy = false;
      cancel.disabled = false;
      cancel.textContent = "Start over";
    }
  };
}
