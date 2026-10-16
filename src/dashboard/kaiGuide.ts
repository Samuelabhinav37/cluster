// Kai, the guide in the bottom-right corner of the dashboard, with "Ask
// Kai" in a small bubble above it (the same Kai as in Moat and on the
// website). Pressing Kai opens a chat of plain questions about Cluster;
// there is no text box, so every question has an answer. Kai answers in a
// sentence or two and offers "Show me": the right screen opens and, where
// there is one, the control is outlined for a moment.
//
// Kai is the live front-facing Kai (./kai/kaiLife.js) in calm mode: it
// blinks, glances, follows the pointer when it comes near and reacts while
// answering, but draws no frames while still. DOM calls only.
//
// The bubble above Kai floats on its own, pinned over Kai's right edge
// (dashboard.css), so longer text grows it up and to the left and Kai never
// moves. When it shows is kai/kaiWatch.js's call: "Ask Kai" once per visit,
// then it folds away and only comes back when you look stuck (rage or dead
// clicks, back and forth between screens, flipping a switch, hunting
// without clicking), or as "Need help?" when the pointer comes near Kai.
import "./kai/kaiLife.js";
import "./kai/kaiWatch.js";
import type { KaiInstance } from "./kai/kaiLife";
import type { KaiNudgeKind, KaiWatch } from "./kai/kaiWatch";

export interface KaiQuestion {
  id: string;
  ask: string;
  answer: string;
  /** The sidebar screen "Show me" opens (a data-screen value). */
  screen?: string;
  /** An element on that screen to outline. */
  target?: string;
  /** Question ids to offer next. */
  follow?: string[];
}

export interface KaiOptions {
  questions: KaiQuestion[];
  /** The screen on screen now (the active sidebar item's data-screen). */
  currentScreen: () => string;
  /** Question ids to list first on each screen. */
  firstOn: Record<string, string[]>;
  /** Folder holding Kai's images, with a trailing slash. */
  src?: string;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const STATUS = "Here to help with Cluster";

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function closeIcon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "aria-hidden": "true" })) svg.setAttribute(k, v);
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M5 5l10 10M15 5L5 15");
  svg.append(path);
  return svg;
}

/** A Kai that does nothing, where the engine can't run (tests without it). */
const STILL_KAI: Omit<KaiInstance, "root"> = {
  mood: "neutral", thinking: false,
  setMood() {}, do() {}, blink() {}, lookAt() {}, talk() {}, think() {}, lightAntenna() {}, react() {},
};

function makeKai(host: HTMLElement, src: string): KaiInstance {
  const factory = host.ownerDocument.defaultView?.Kai;
  return factory ? factory(host, { src, imgWidth: 320, calm: true }) : { ...STILL_KAI, root: host };
}

/** Scroll to `selector` and outline it briefly. */
export function pointAt(doc: Document, selector: string): boolean {
  const target = doc.querySelector<HTMLElement>(selector);
  if (!target) return false;
  const reduced = doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  target.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "center" });
  target.classList.remove("kai-here");
  void target.offsetWidth;
  target.classList.add("kai-here");
  doc.defaultView?.setTimeout(() => target.classList.remove("kai-here"), 2600);
  return true;
}

export function initKaiGuide(doc: Document, options: KaiOptions): { open: () => void; close: () => void; isOpen: () => boolean; watch: KaiWatch | undefined } {
  const win = doc.defaultView ?? window;
  const reduced = win.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const wait = (ms: number) => (reduced ? 0 : ms);
  const byId = new Map(options.questions.map((q) => [q.id, q]));

  const root = el(doc, "div", "kai-guide");
  const panel = el(doc, "section", "kg-panel");
  panel.id = "kai-chat";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Ask Kai");
  const head = el(doc, "header", "kg-head");
  const id = el(doc, "div", "kg-id");
  const status = el(doc, "div", "kg-status", STATUS);
  id.append(el(doc, "div", "kg-name", "Kai"), status);
  const close = el(doc, "button", "kg-close");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.append(closeIcon(doc));
  head.append(id, close);
  const body = el(doc, "div", "kg-body");
  const log = el(doc, "div", "kg-log");
  log.setAttribute("aria-live", "polite");
  body.append(log);
  panel.append(head, body);

  const launch = el(doc, "div", "kg-launch");
  const tag = el(doc, "button", "kg-tag");
  const tagText = el(doc, "span", "kg-tag-text", "Ask Kai");
  tag.append(tagText);
  tag.type = "button";
  tag.tabIndex = -1;
  tag.setAttribute("aria-hidden", "true");
  const button = el(doc, "button", "kai-button");
  button.type = "button";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "kai-chat");
  button.setAttribute("aria-label", "Ask Kai");
  const kaiHost = el(doc, "span", "kg-kai");
  button.append(kaiHost);
  launch.append(tag, button);
  root.append(panel, launch);
  doc.body.append(root);
  const kai = makeKai(kaiHost, options.src ?? "/characters/");

  const isOpen = () => !panel.hidden;
  const scrollDown = () => { body.scrollTop = body.scrollHeight; };
  let busy = false;
  const asked = new Set<string>();

  const bubble = (who: "me" | "kai", text = "") => {
    const m = el(doc, "div", `kg-msg kg-${who}`, text);
    log.append(m);
    scrollDown();
    return m;
  };
  const chip = (label: string, onClick: () => void, className = "kai-q") => {
    const b = el(doc, "button", className, label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  };
  const showMe = (q: KaiQuestion) => {
    const b = el(doc, "button", "kg-go", "Show me →");
    b.type = "button";
    b.addEventListener("click", () => {
      hide();
      doc.querySelector<HTMLButtonElement>(`.nav-item[data-screen="${q.screen}"]`)?.click();
      const target = q.target;
      if (target) win.setTimeout(() => pointAt(doc, target), 250);
    });
    return b;
  };

  /** Kai says `text` (typed out while its mouth moves), then `then()`. */
  const say = (text: string, extra: HTMLElement | null, then: () => void) => {
    kai.react("found", text.length);
    const m = bubble("kai");
    let i = 0;
    const step = () => {
      i = reduced ? text.length : Math.min(text.length, i + 2);
      m.textContent = text.slice(0, i);
      scrollDown();
      if (i < text.length) {
        win.setTimeout(step, 16);
        return;
      }
      if (extra) m.append(extra);
      scrollDown();
      then();
    };
    step();
  };

  const choices = (ids: string[], more: boolean) => {
    const wrap = el(doc, "div", "kai-list");
    for (const qid of ids) {
      const q = byId.get(qid);
      if (q) wrap.append(chip(q.ask, () => ask(q, wrap)));
    }
    if (more) {
      const rest = options.questions.map((q) => q.id).filter((qid) => !ids.includes(qid) && !asked.has(qid));
      if (rest.length) wrap.append(chip("Ask something else", () => {
        wrap.remove();
        choices(rest, false);
      }, "kai-q quiet"));
    }
    log.append(wrap);
    scrollDown();
  };

  const firstIds = () => {
    const first = options.firstOn[options.currentScreen()] ?? [];
    return [...options.questions].sort((a, b) => {
      const ia = first.indexOf(a.id), ib = first.indexOf(b.id);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    }).map((q) => q.id).slice(0, 4);
  };

  const ask = (q: KaiQuestion, wrap: HTMLElement) => {
    if (busy) return;
    busy = true;
    asked.add(q.id);
    wrap.remove();
    bubble("me", q.ask);
    const typing = el(doc, "div", "kg-msg kg-kai typing");
    typing.append(el(doc, "i"), el(doc, "i"), el(doc, "i"));
    log.append(typing);
    scrollDown();
    root.classList.add("thinking");
    status.textContent = "Thinking";
    kai.think(true);
    win.setTimeout(() => {
      typing.remove();
      root.classList.remove("thinking");
      status.textContent = STATUS;
      kai.think(false);
      say(q.answer, q.screen ? showMe(q) : null, () => {
        busy = false;
        const next = (q.follow ?? []).filter((qid) => !asked.has(qid));
        for (const o of options.questions) if (next.length < 3 && !asked.has(o.id) && !next.includes(o.id)) next.push(o.id);
        choices(next.slice(0, 3), true);
      });
    }, wait(560));
  };

  const show = () => {
    if (isOpen()) return;
    panel.hidden = false;
    root.classList.add("open");
    button.setAttribute("aria-expanded", "true");
    hint = false;
    watch?.opened();
    tagFold();
    kai.do("wave");
    // Each time it opens, Kai starts afresh with this screen's questions.
    log.replaceChildren();
    asked.clear();
    busy = true;
    say("Hi, I'm Kai. Ask me anything about Cluster.", null, () => {
      busy = false;
      choices(firstIds(), true);
    });
    win.setTimeout(() => panel.querySelector<HTMLButtonElement>(".kai-q")?.focus(), wait(400));
  };
  const hide = () => {
    if (panel.hidden) return;
    panel.hidden = true;
    root.classList.remove("open", "thinking");
    button.setAttribute("aria-expanded", "false");
    kai.think(false);
    status.textContent = STATUS;
  };

  // The bubble: new words fade in while the bubble eases to its new width.
  let swapTimer = 0;
  let sizeTimer = 0;
  let hint = false;
  const tagSay = (text: string) => {
    win.clearTimeout(swapTimer);
    win.clearTimeout(sizeTimer);
    if (!root.classList.contains("tag-on") || reduced) {
      tagText.textContent = text;
      tag.style.width = "";
      root.classList.add("tag-on");
      return;
    }
    if (tagText.textContent === text) return;
    tag.classList.add("swap");
    swapTimer = win.setTimeout(() => {
      const from = tag.offsetWidth;
      tag.style.width = "";
      tagText.textContent = text;
      const to = tag.offsetWidth;
      tag.style.width = `${from}px`;
      void tag.offsetWidth;
      tag.style.width = `${to}px`;
      tag.classList.remove("swap");
      sizeTimer = win.setTimeout(() => { tag.style.width = ""; }, 320);
    }, 130);
  };
  const tagFold = () => {
    win.clearTimeout(swapTimer);
    root.classList.remove("tag-on");
    tag.classList.remove("swap");
  };
  const react: Record<KaiNudgeKind, () => void> = {
    welcome: () => { kai.setMood("happy", 2200); kai.do("wave"); },
    stuck: () => { kai.setMood("curious", 2400); kai.do("tilt"); },
    looking: () => { kai.do("lookAround"); win.setTimeout(() => { kai.lookAt(null); kai.setMood("happy", 1600); }, 900); },
    unsure: () => { kai.setMood("curious", 2400); kai.do("tilt"); },
  };
  const watch = win.KaiWatch?.({
    win,
    kaiEl: root,
    isOpen: () => isOpen() || win.getComputedStyle(root).display === "none",
    show: (kind, text) => { hint = false; tagSay(text); react[kind](); },
    hide: () => { if (!hint) tagFold(); },
    sectionName: (id) => (id === "overview" ? "" : doc.querySelector(`#sidebar .nav-item[data-screen="${CSS.escape(id)}"]`)?.textContent?.trim() ?? ""),
    storageKey: "cluster-kai-watch",
  });
  const onScreen = () => watch?.section(options.currentScreen());
  onScreen();
  // screens change from the sidebar; read the new one once it has switched
  doc.addEventListener("click", (event) => {
    if ((event.target as Element | null)?.closest?.("#sidebar .nav-item")) win.setTimeout(onScreen, 50);
  });
  tag.addEventListener("click", show);
  // "Ask Kai" once per visit, with a wave, then the bubble folds away.
  win.setTimeout(() => {
    if (!watch) tagSay("Ask Kai");
    else watch.welcome();
  }, 700);
  // Kai looks at the pointer when it comes near and offers help (not
  // counted as a nudge). Checked once a frame.
  let near = false;
  let pending = false;
  let px = 0;
  let py = 0;
  doc.addEventListener("pointermove", (event) => {
    px = event.clientX;
    py = event.clientY;
    if (pending) return;
    pending = true;
    win.requestAnimationFrame(() => {
      pending = false;
      const box = button.getBoundingClientRect();
      const d = Math.hypot(px - (box.left + box.width / 2), py - (box.top + box.height / 2));
      kai.lookAt(d < 420 ? { x: px, y: py } : null);
      if (isOpen()) return;
      if (!near && d < 170) {
        near = true;
        if (!watch?.isShowing()) {
          hint = true;
          kai.setMood("happy", 1500);
          tagSay("Need help?");
        }
      } else if (near && d > 260) {
        near = false;
        if (hint) { hint = false; tagFold(); }
      }
    });
  }, { passive: true });
  button.addEventListener("pointerenter", () => {
    if (isOpen()) return;
    kai.setMood("happy", 1200);
    kai.do("hop");
  });
  button.addEventListener("click", () => {
    if (isOpen()) hide();
    else show();
  });
  close.addEventListener("click", () => {
    hide();
    button.focus();
  });
  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) {
      hide();
      button.focus();
    }
  });
  // composedPath, not contains: a question's button is removed by the
  // answer before the click reaches the document.
  doc.addEventListener("click", (event) => {
    if (isOpen() && !event.composedPath().includes(root)) hide();
  });

  return { open: show, close: hide, isOpen, watch };
}

/** Cluster's questions. Short, plain answers; each names the screen it opens. */
export const CLUSTER_QUESTIONS: KaiQuestion[] = [
  { id: "read", ask: "Does Cluster read my emails?", answer: "No. It reads senders, subjects, dates, labels and a few sender-check headers, never the message itself. Everything runs in your browser.", follow: ["starred", "undo"] },
  { id: "sort", ask: "How do I sort my inbox?", answer: "Open Sorting and press Sort my inbox. You see every group first and tick what to file. Nothing moves until you confirm.", screen: "organize", target: "#sort-inbox-section", follow: ["keep", "undo"] },
  { id: "flagged", ask: "Why was this sender flagged?", answer: "It looked like someone else: a lookalike domain, a failed sender check, or a reply address that goes somewhere different. Each flag lists its reasons.", screen: "impersonation", follow: ["read"] },
  { id: "undo", ask: "How do I undo something?", answer: "Activity lists everything Cluster did, newest first, with Undo wherever your mail provider allows it.", screen: "recent", follow: ["starred"] },
  { id: "unsub", ask: "How do I unsubscribe from lots at once?", answer: "Subscriptions lists every sender you can leave. Pick the ones you want, or unsubscribe from every verified one-click sender together.", screen: "subscriptions", follow: ["undo"] },
  { id: "keep", ask: "Can Cluster keep new mail sorted?", answer: "Yes. When you sort your inbox, tick Keep doing this for new mail. Sender-based labels use Gmail filters, so they work with Chrome closed.", screen: "organize", target: "#sort-inbox-section", follow: ["undo"] },
  { id: "screener", ask: "What is New senders?", answer: "Turn on Hold mail from new senders, and mail from people you've never emailed waits there, out of your inbox, until you let them in.", screen: "screener", target: "#screener-toggle-row", follow: ["read"] },
  { id: "starred", ask: "Will it touch my starred mail?", answer: "Never. Starred mail is always skipped, and nothing is moved or deleted before you confirm.", follow: ["undo"] },
];

/** Which questions come first on each screen. */
export const CLUSTER_FIRST_ON: Record<string, string[]> = {
  overview: ["read", "sort"],
  delete: ["undo", "starred"],
  senders: ["unsub", "flagged"],
  subscriptions: ["unsub", "undo"],
  organize: ["sort", "keep"],
  rules: ["keep", "undo"],
  impersonation: ["flagged", "read"],
  screener: ["screener", "read"],
  recent: ["undo"],
};
