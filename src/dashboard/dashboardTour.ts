// The short tour after setup: Kai points at each part of the dashboard with
// one line, Next to go on, Skip any time. A spotlight (a hole in a dimmed
// page) shows where Kai means.
import "./kai/kaiLife.js";
import type { KaiInstance } from "./kai/kaiLife";
import { ctx } from "./state";
import { rememberKai, travel, TRAVEL_MS } from "./kaiTravel";
import { TYPE_MS } from "./kaiBubble";

export interface TourStop {
  selector: string;
  line: string;
}

export const TOUR: TourStop[] = [
  // Only while the first read runs: the tour starts at once, so Kai never goes quiet after setup.
  { selector: ".home-read", line: "I'm reading the rest of your mail. You can look around while I work." },
  { selector: "#sidebar", line: "Cleanup clears out old mail, Labels sorts new mail, and Security catches scams." },
  { selector: "#ask-kai-open", line: "Press / to find any email or sender, or to ask me for something." },
];

/** Kai's last line: what to do next, so it is clear the tour is over (Get started, startList.ts). */
export const TOUR_BYE = "Try the three Get started steps at the bottom of the sidebar.";

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
  // A small arrow on the card's edge, pointing at what Kai means.
  const arrow = el("span", "tour-arrow");
  arrow.setAttribute("aria-hidden", "true");
  card.append(arrow, kaiHost, words);
  layer.append(hole, card);
  document.body.append(layer);
  const kai: KaiInstance | null =
    ctx.settings.showKai && typeof window.Kai === "function"
      ? window.Kai(kaiHost, { src: "/characters/", imgWidth: 320 })
      : null;
  if (!kai) kaiHost.hidden = true;

  let at = 0;
  let typing = 0;
  const end = () => {
    clearInterval(typing);
    window.removeEventListener("resize", place);
    document.removeEventListener("keydown", onKey);
    if (kai) rememberKai(kaiHost);
    layer.remove();
    // Kai flies down to its corner, where it stays on the dashboard.
    const dock = document.querySelector<HTMLElement>(".kai-guide .kg-kai");
    if (dock) travel(dock, null);
  };
  /** Types the line with Kai's mouth following it. */
  const type = (text: string) => {
    clearInterval(typing);
    if (reduced || !kai) {
      line.textContent = text;
      return;
    }
    let n = 0;
    line.textContent = "";
    kai.talk(text.length * TYPE_MS + 200);
    typing = window.setInterval(() => {
      n += 1;
      line.textContent = text.slice(0, n);
      kai.voice(text[n - 1] ?? " ");
      if (n >= text.length) clearInterval(typing);
    }, TYPE_MS);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") end();
    else if (e.key === "ArrowRight") next.click();
    else if (e.key === "ArrowLeft" && at > 0 && !layer.classList.contains("is-end")) {
      at -= 1;
      show();
    }
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
    // The arrow on the card edge facing the target, lined up with its middle.
    const clamp = (v: number, max: number) => Math.max(22, Math.min(v, max - 22));
    arrow.className = `tour-arrow ${inSidebar ? "is-left" : "is-top"}`;
    arrow.style.left = inSidebar ? "" : `${clamp(r.left + r.width / 2 - x, w)}px`;
    arrow.style.top = inSidebar ? `${clamp(r.top + r.height / 2 - y, h)}px` : "";
  }

  function show() {
    const stop = shown[at];
    // Dots for the eye, "2 of 5" for screen readers.
    count.replaceChildren(
      ...shown.map((_, i) => el("i", i === at ? "is-on" : i < at ? "is-done" : "")),
      el("span", "sr-only", `${at + 1} of ${shown.length}`),
    );
    next.textContent = at === shown.length - 1 ? "Done" : "Next";
    type(stop.line);
    if (!reduced) {
      line.classList.remove("pop");
      void line.offsetWidth;
      line.classList.add("pop");
    }
    place();
    const target = document.querySelector(stop.selector);
    if (target && kai) {
      kai.pointAt(target);
      if (at > 0) kai.do("hop");
    }
    next.focus();
  }

  next.onclick = () => {
    if (layer.classList.contains("is-end")) return end();
    if (at === shown.length - 1) {
      // The ending, like a console's "Welcome to PlayStation 5": the card moves
      // to the middle, Kai welcomes you by name and says the tour is over.
      // Jump to the middle without sliding there, then fade in, so the card
      // and Kai don't swing across the page.
      card.style.transition = "none";
      layer.classList.add("is-end");
      if (!reduced && typeof card.animate === "function")
        card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
      // The page stays dimmed: the hole shrinks to nothing in the middle.
      Object.assign(hole.style, { left: "50%", top: "50%", width: "0px", height: "0px" });
      count.replaceChildren();
      skip.hidden = true;
      arrow.hidden = true;
      const name = ctx.settings.userName;
      words.prepend(el("h2", "tour-title", name ? `You're all set, ${name}.` : "You're all set."));
      next.textContent = "Let's go";
      type(TOUR_BYE);
      kai?.lookAt(null);
      kai?.setMood("proud", 2400);
      kai?.do("celebrate");
      next.focus();
      return;
    }
    at += 1;
    show();
  };
  skip.onclick = end;
  window.addEventListener("resize", place);
  document.addEventListener("keydown", onKey);
  kai?.do("wave");
  // First placement without the slide, so the card doesn't fly in from the corner.
  card.style.transition = "none";
  show();
  void card.offsetWidth;
  card.style.transition = "";
  // The same Kai as setup: it flies into the card from where it stood.
  travel(kaiHost, kai);
  window.setTimeout(() => kai?.lookAt(document.querySelector(shown[at].selector)), TRAVEL_MS);
}
