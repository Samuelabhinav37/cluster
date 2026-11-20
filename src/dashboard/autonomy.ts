// Research ideas 2 and 6. Settings: "What Cluster does on its own", one row per
// automatic action with its tier (Do it, Ask me, Off). Dashboard: "Waiting for
// you", the actions set to Ask me, each with Approve and Not now.
import { getSettings, updateSettings, type ClusterSettings } from "../lib/settingsStore";
import { muteNow } from "../lib/unsubscribedSweep";
import { log } from "../lib/log";
import { ctx } from "./state";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: { className?: string; textContent?: string; type?: string } = {}): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.textContent) node.textContent = props.textContent;
  if (props.type) node.setAttribute("type", props.type);
  return node;
}

function row(name: string, sub: string, trail: HTMLElement): HTMLElement {
  const r = el("div", { className: "set-row plain" });
  const words = el("span", { className: "grow", textContent: name });
  if (sub) words.append(el("span", { className: "sub", textContent: sub }));
  r.append(words, trail);
  return r;
}

const state = (on: boolean) => el("span", { className: "ios-value", textContent: on ? "Does it" : "Off" });

/** The Settings card. The first three follow their own switches further down. */
export function renderAutonomy(settings: ClusterSettings = ctx.settings): void {
  const host = document.getElementById("settings-autonomy");
  if (!host || !settings) return;
  const mute = el("select", { className: "kind-pick" });
  mute.setAttribute("aria-label", "Mute senders who keep sending");
  for (const [value, text] of [["do", "Do it"], ["ask", "Ask me"], ["off", "Off"]] as const) mute.add(new Option(text, value, false, settings.autoMute === value));
  mute.onchange = async () => {
    ctx.settings = await updateSettings({ autoMute: mute.value as ClusterSettings["autoMute"] });
  };
  host.replaceChildren(
    row("Label and move new mail", "", state(settings.autoSort.timeLimitsEnabled)),
    row("Hold unlabelled mail", "", state(settings.autoSort.holdUnsorted)),
    row("Hold scams", "", state(settings.autoQuarantineHighRisk)),
    row("Mute senders who ignore Unsubscribe", "", mute),
    row("Trash and unsubscribe", "", el("span", { className: "ios-value", textContent: "Always asks" })),
  );
}

/** The Dashboard card: nothing when the list is empty. */
export function renderWaiting(settings: ClusterSettings = ctx.settings): void {
  const host = document.getElementById("overview-waiting");
  if (!host || !settings) return;
  const items = settings.waiting ?? [];
  host.hidden = items.length === 0;
  if (items.length === 0) return host.replaceChildren();
  const list = el("div", { className: "set-rows" });
  for (const w of items) {
    const approve = el("button", { type: "button", className: "btn btn-accent", textContent: "Mute" });
    const no = el("button", { type: "button", className: "btn", textContent: "Not now" });
    const acts = el("span", { className: "row-actions" });
    acts.append(no, approve);
    approve.onclick = async () => {
      approve.disabled = no.disabled = true;
      try {
        await muteNow([{ key: w.key, address: w.address, inboxIds: w.ids }]);
      } catch (err) {
        log.error("Waiting: mute failed", err);
      }
      ctx.settings = await getSettings();
      renderWaiting();
    };
    no.onclick = async () => {
      const address = w.address.toLowerCase();
      ctx.settings = await updateSettings({
        waiting: ctx.settings.waiting.filter((x) => x.address.toLowerCase() !== address),
        waitingDeclined: [...new Set([...ctx.settings.waitingDeclined, address])],
      });
      renderWaiting();
    };
    list.append(row(w.address, "Still sending 14 days after you unsubscribed", acts));
  }
  host.replaceChildren(el("h2", { textContent: "Waiting for you" }), list);
}
