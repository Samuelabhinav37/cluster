// The short tour after setup: Kai points at each part of the dashboard with
// one line, Next to go on, Skip any time. A spotlight (a hole in a dimmed
// page) shows where Kai means.
import "./kai/kaiLife.js";
import type { KaiInstance } from "./kai/kaiLife";
import { ctx } from "./state";

export interface TourStop {
  selector: string;
  line: string;
}

export const TOUR: TourStop[] = [
  { selector: '.nav-item[data-screen="overview"]', line: "Home shows what's new in your inbox." },
  { selector: '.nav-item[data-screen="delete"]', line: "Cleanup finds old mail you can clear in one go." },
  { selector: '.nav-item[data-screen="organize"]', line: "Labels is where your labels live. Change them any time." },
  { selector: '.nav-item[data-screen="impersonation"]', line: "Security keeps scams and fake senders away from you." },
  { selector: "#top-settings", line: "Settings is here if you change your mind." },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Starts the tour over the dashboard. Stops stay only if their element is on the page. */
export function startDashboardTour(stops: TourStop[] = TOUR): void {
  const shown = stops.filter((s) => {
    const t = document.querySelector<HTMLElement>(s.selector);
    return t && t.getClientRects().length > 0;
  });
  if (shown.length === 0 || document.querySelector(".tour")) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const layer = el("div", "tour");
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-label", "Dashboard tour");
  const hole = el("div", "tour-hole");
  const card = el("div", "tour-card");
  const kaiHost = el("div", "onb-kai tour-kai");
  const line = el("p", "tour-line");
  line.id = "tour-line";
  line.setAttribute("aria-live", "polite");
  const count = el("span", "tour-count");
  const skip = el("button", "onb-link", "Skip tour");
  skip.type = "button";
  skip.id = "tour-skip";
  const next = el("button", "connect-btn tour-next", "Next");
  next.type = "button";
  next.id = "tour-next";
  const foot = el("div", "tour-foot");
  foot.append(count, el("span", "grow"), skip, next);
  const words = el("div", "tour-words");
  words.append(line, foot);
  card.append(kaiHost, words);
  layer.append(hole, card);
  document.body.append(layer);
  const kai: KaiInstance | null =
    ctx.settings.showKai && typeof window.Kai === "function"
      ? window.Kai(kaiHost, { src: "/characters/", imgWidth: 320, calm: true })
      : null;
  if (!kai) kaiHost.hidden = true;

  let at = 0;
  const end = () => {
    window.removeEventListener("resize", place);
    document.removeEventListener("keydown", onKey);
    layer.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") end();
  };

  /** The hole over the target; the card beside it (right of the sidebar, under the top bar). */
  function place() {
    const target = document.querySelector<HTMLElement>(shown[at].selector);
    if (!target) return;
    const r = target.getBoundingClientRect();
    const pad = 6;
    Object.assign(hole.style, {
      left: `${r.left - pad}px`,
      top: `${r.top - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    });
    const w = card.offsetWidth || 380;
    const h = card.offsetHeight || 140;
    const inSidebar = r.right < window.innerWidth / 3;
    let x = inSidebar ? r.right + 20 : r.right - w;
    let y = inSidebar ? r.top + r.height / 2 - h / 2 : r.bottom + 16;
    x = Math.max(16, Math.min(x, window.innerWidth - w - 16));
    y = Math.max(16, Math.min(y, window.innerHeight - h - 16));
    card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  function show() {
    const stop = shown[at];
    count.textContent = `${at + 1} of ${shown.length}`;
    next.textContent = at === shown.length - 1 ? "Done" : "Next";
    line.textContent = stop.line;
    if (!reduced) {
      line.classList.remove("pop");
      void line.offsetWidth;
      line.classList.add("pop");
    }
    place();
    const target = document.querySelector(stop.selector);
    if (target && kai) {
      kai.lookAt(target);
      kai.talk(Math.min(2400, stop.line.length * 45));
      if (at > 0) kai.do("hop");
    }
    next.focus();
  }

  next.onclick = () => {
    if (at === shown.length - 1) {
      kai?.do("celebrate");
      window.setTimeout(end, reduced ? 0 : 500);
      return;
    }
    at += 1;
    show();
  };
  skip.onclick = end;
  window.addEventListener("resize", place);
  document.addEventListener("keydown", onKey);
  kai?.do("wave");
  show();
}
