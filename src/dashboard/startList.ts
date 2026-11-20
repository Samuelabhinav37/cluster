// "Get started" at the foot of the sidebar (research/2026-11-20-mobbin-onboarding-audit.md #11,
// after Stripe's setup guide and Langdock's sidebar card): three first things to try after
// setup, each ticked when you actually do it, until all three are done or you hide the card.
import { ctx } from "./state";
import { updateSettings, type StartItem } from "../lib/settingsStore";

const ITEMS: { id: StartItem; label: string }[] = [
  { id: "screener", label: "Check your new senders" },
  { id: "cleanup", label: "Clean up one sender" },
  { id: "search", label: "Search for an email" },
];
/** Cleanup actions that count; background sorting logs other kinds. */
const CLEANUP_KINDS = new Set(["trash", "archive", "mute", "unsubscribe"]);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface StartList {
  /** Ticks an item (no-op once ticked) and redraws. */
  mark(id: StartItem): void;
  /** Redraws from ctx.settings: hidden before setup is done, once hidden, or once all are done. */
  paint(): void;
}

/** `open` takes you to where each item is done. */
export function wireStartList(root: HTMLElement, open: Record<StartItem, () => void>): StartList {
  const done = () => new Set(ctx.settings.startList?.done ?? []);

  function paint() {
    const ticked = done();
    const left = ITEMS.filter((i) => !ticked.has(i.id)).length;
    root.hidden = !ctx.settings.setupDone || !!ctx.settings.startList?.hidden || left === 0;
    if (root.hidden) return root.replaceChildren();
    const head = el("div", "sl-head");
    const hide = el("button", "sl-hide", "Hide");
    hide.type = "button";
    hide.onclick = () => save({ done: [...done()], hidden: true });
    head.append(el("b", "", "Get started"), hide);
    const bar = el("div", "sl-bar");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", "Get started");
    bar.setAttribute("aria-valuemax", String(ITEMS.length));
    bar.setAttribute("aria-valuenow", String(ticked.size));
    const fill = el("i");
    fill.style.width = `${(ticked.size / ITEMS.length) * 100}%`;
    bar.append(fill);
    const list = el("ul", "sl-list");
    for (const item of ITEMS) {
      const row = el("li", ticked.has(item.id) ? "is-done" : "");
      const btn = el("button", "sl-item");
      btn.type = "button";
      btn.append(el("span", "sl-mark"), el("span", "", item.label));
      btn.disabled = ticked.has(item.id);
      btn.onclick = () => open[item.id]();
      row.append(btn);
      list.append(row);
    }
    root.replaceChildren(head, el("p", "sl-count", `${ticked.size} of ${ITEMS.length} done`), bar, list);
  }

  /** In memory first, then stored: two ticks close together must not overwrite each other. */
  function save(startList: NonNullable<typeof ctx.settings.startList>) {
    ctx.settings = { ...ctx.settings, startList };
    paint();
    // A failed save only loses a tick, which comes back the next time it is done.
    void updateSettings({ startList }).catch(() => {});
  }

  function mark(id: StartItem) {
    const ticked = done();
    if (ticked.has(id) || !ctx.settings.setupDone) return;
    ticked.add(id);
    save({ ...ctx.settings.startList, done: [...ticked] });
  }

  document.addEventListener("cluster:action", (e) => {
    if (CLEANUP_KINDS.has((e as CustomEvent<{ kind: string }>).detail?.kind)) mark("cleanup");
  });
  document.addEventListener("cluster:search", () => mark("search"));
  paint();
  return { mark, paint };
}
