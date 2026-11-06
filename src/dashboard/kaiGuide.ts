// Kai, the guide in the bottom-right corner of the dashboard, with "Ask
// Kai" in a small bubble above it (the same Kai as in Moat and on the
// website). Pressing Kai opens a chat of plain questions about Cluster, and
// a box to type your own (matched on this computer, kaiMatch.ts). Kai answers
// in a sentence or two and offers "Take me there": the right screen opens
// and, where there is one, the control is outlined for a moment.
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
  /** Other ways people ask, for typed questions. */
  phrases?: string[];
}

export interface KaiOptions {
  questions: KaiQuestion[];
  /** The screen on screen now (the active sidebar item's data-screen). */
  currentScreen: () => string;
  /** Question ids to list first on each screen. */
  firstOn: Record<string, string[]>;
  /** Folder holding Kai's images, with a trailing slash. */
  src?: string;
  /** Round 2: no Kai in the corner. Kai sits in the chat's header, the chat
   * opens beside the sidebar, and nudges show on this element (Ask Kai). */
  dock?: HTMLElement;
  /** Answers for a typed question, best first; empty when Kai doesn't know. */
  match?: (text: string) => KaiQuestion[];
  /** The person took this answer for what they typed. */
  picked?: (text: string, id: string) => void;
  /** Kai had no answer for this. */
  missed?: (text: string) => void;
  /** Opens a screen, including ones with no sidebar item (Settings, Activity). */
  go?: (screen: string) => void;
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
  setMood() {}, do() {}, blink() {}, lookAt() {}, pointAt() {}, talk() {}, think() {}, lightAntenna() {}, react() {},
};

function makeKai(host: HTMLElement, src: string): KaiInstance {
  const factory = host.ownerDocument.defaultView?.Kai;
  return factory ? factory(host, { src, imgWidth: 320, calm: true }) : { ...STILL_KAI, root: host };
}

/** Scroll to `selector` and outline it briefly. With `kai`, Kai first
 * looks at the spot and leans its antenna toward it, then the ring follows
 * (anticipation, then the action). */
export function pointAt(doc: Document, selector: string, kai?: KaiInstance): boolean {
  const target = doc.querySelector<HTMLElement>(selector);
  if (!target) return false;
  const win = doc.defaultView;
  const reduced = win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  target.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "center" });
  const ring = () => {
    target.classList.remove("kai-here");
    void target.offsetWidth;
    target.classList.add("kai-here");
    win?.setTimeout(() => target.classList.remove("kai-here"), 2600);
  };
  if (!kai || reduced || !win) { ring(); return true; }
  win.setTimeout(() => kai.pointAt(target), 380);
  win.setTimeout(ring, 680);
  return true;
}

export interface KaiGuide {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  watch: KaiWatch | undefined;
  /** A one-line tip in the bubble, folded away after a few seconds. */
  tip: (text: string) => void;
  /** Kai's element, so a page can seat him in its header. */
  root: HTMLElement;
  /** Opens the chat and asks one of the questions straight away. */
  ask: (id: string) => void;
}

export function initKaiGuide(doc: Document, options: KaiOptions): KaiGuide {
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
  // One box to type a question; the set questions stay as chips above it.
  const form = el(doc, "form", "kg-form");
  const input = el(doc, "input", "kg-input");
  input.type = "text";
  input.placeholder = "Ask Kai";
  input.autocomplete = "off";
  input.setAttribute("aria-label", "Ask Kai");
  form.append(input);
  if (options.match) panel.append(head, body, form);
  else panel.append(head, body);

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
  const dock = options.dock;
  if (dock) {
    root.classList.add("docked");
    head.prepend(kaiHost);
  }
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
  const showMe = (q: KaiQuestion, label = "Show me →", onGo?: () => void) => {
    const b = el(doc, "button", "kg-go", label);
    b.type = "button";
    b.addEventListener("click", () => {
      onGo?.();
      hide();
      if (q.screen) {
        if (options.go) options.go(q.screen);
        else doc.querySelector<HTMLButtonElement>(`.nav-item[data-screen="${q.screen}"]`)?.click();
      }
      const target = q.target;
      if (target) win.setTimeout(() => pointAt(doc, target, kai), 250);
    });
    return b;
  };

  /** A typed question: the best answer with Take me there, and up to two others. */
  const askTyped = (text: string) => {
    if (busy || !options.match) return;
    const found = options.match(text);
    log.querySelector(".kai-list")?.remove();
    bubble("me", text);
    const best = found[0];
    if (!best) {
      options.missed?.(text);
      busy = true;
      say("I don't know that one yet. I kept it so it can be added.", null, () => {
        busy = false;
        choices(firstIds(), false);
      });
      return;
    }
    busy = true;
    asked.add(best.id);
    const go = best.screen || best.target ? showMe(best, "Take me there ↵", () => options.picked?.(text, best.id)) : null;
    say(best.answer, go, () => {
      busy = false;
      go?.focus();
      const others = found.slice(1, 3);
      if (others.length === 0) return;
      const wrap = el(doc, "div", "kai-list");
      for (const o of others)
        wrap.append(
          chip(o.ask, () => {
            options.picked?.(text, o.id);
            ask(o, wrap);
          }),
        );
      log.append(wrap);
      scrollDown();
    });
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    askTyped(text);
  });

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
    // Back within 10 minutes: the conversation is still there. Otherwise
    // Kai starts afresh with this screen's questions.
    if (log.childElementCount && Date.now() - closedAt < 10 * 60000) {
      win.setTimeout(() => panel.querySelector<HTMLButtonElement>(".kai-q")?.focus(), wait(400));
      return;
    }
    log.replaceChildren();
    asked.clear();
    const first = pendingAsk ? byId.get(pendingAsk) : undefined;
    pendingAsk = "";
    if (first) {
      ask(first, el(doc, "div"));
      return;
    }
    busy = true;
    say("Hi, I'm Kai. I'm small, but I know Cluster inside out. What can I help with?", null, () => {
      busy = false;
      choices(firstIds(), true);
    });
    win.setTimeout(() => panel.querySelector<HTMLButtonElement>(".kai-q")?.focus(), wait(400));
  };
  let pendingAsk = "";
  let closedAt = 0;
  const hide = () => {
    if (panel.hidden) return;
    closedAt = Date.now();
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
    if (dock) dock.dataset.nudge = text;
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
    if (dock) delete dock.dataset.nudge;
    win.clearTimeout(swapTimer);
    root.classList.remove("tag-on");
    tag.classList.remove("swap");
  };
  const react: Record<KaiNudgeKind, () => void> = {
    welcome: () => { kai.setMood("happy", 2200); kai.do("wave"); },
    back: () => { kai.do("peek"); },
    say: () => {},
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
  // "Ask Kai" at most once a day, with a wave, then the bubble folds away.
  // A later day gets "Welcome back." with a peek, the same day nothing.
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
  if (!dock) doc.addEventListener("pointermove", (event) => {
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
          tagSay("Need a hand?");
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
    const path = event.composedPath();
    if (isOpen() && !path.includes(root) && !(dock && path.includes(dock))) hide();
  });

  // "Got it": a small nod when a setting changes, once per control per visit.
  const nodded = new Set<string>();
  const gotIt = (control: Element | null) => {
    if (!control || root.contains(control) || isOpen()) return;
    const id = control.id || control.getAttribute("name") || control.getAttribute("aria-label") || "";
    if (!id || nodded.has(id)) return;
    nodded.add(id);
    kai.do("nodSmall");
  };
  doc.addEventListener("change", (event) => {
    if (event.isTrusted) gotIt(event.target as Element | null);
  });

  // Moments (kai-character.md): Kai reacts to what Cluster just did. The
  // action log announces each action (recentTab.ts). Unsubscribes come one
  // per sender, so they are counted and answered once they stop.
  const line = (text: string) => { hint = false; watch?.say(text); };
  let unsubs = 0;
  let unsubTimer = 0;
  doc.addEventListener("cluster:action", (event) => {
    const kind = (event as CustomEvent<{ kind: string }>).detail?.kind;
    if (kind === "sort") { kai.do("celebrate"); line("All sorted."); }
    else if (kind === "unsubscribe") {
      unsubs++;
      win.clearTimeout(unsubTimer);
      unsubTimer = win.setTimeout(() => {
        kai.do("bye");
        line(unsubs === 1 ? "Unsubscribed. One less sender." : `Bye to ${unsubs} senders.`);
        unsubs = 0;
      }, 1500);
    } else kai.do("nodSmall");
  });
  doc.addEventListener("cluster:undo", () => { kai.do("nodSmall"); line("Undone."); });
  // Opening the screen of senders that look like someone else: a squint,
  // once per visit.
  let squinted = false;
  doc.addEventListener("click", (event) => {
    if (squinted || !(event.target as Element | null)?.closest?.('#sidebar .nav-item[data-screen="impersonation"]')) return;
    squinted = true;
    win.setTimeout(() => kai.do("squint"), 300);
  });

  const tip = (text: string) => {
    if (isOpen() || watch?.isShowing()) return;
    hint = true;
    kai.setMood("happy", 1500);
    tagSay(text);
    win.setTimeout(() => {
      if (hint) { hint = false; tagFold(); }
    }, 9000);
  };
  const askNow = (qid: string) => {
    if (isOpen()) {
      const q = byId.get(qid);
      if (q) ask(q, log.querySelector<HTMLElement>(".kai-list") ?? el(doc, "div"));
      return;
    }
    pendingAsk = qid;
    closedAt = 0;
    // After the click that asked has finished, or the outside-click rule closes it again.
    win.setTimeout(show, 0);
  };
  return { open: show, close: hide, isOpen, watch, tip, root, ask: askNow };
}

/** Cluster's questions. Short, plain answers; each names the screen it opens.
 * `phrases` are other ways people ask, for typed questions (kaiMatch.ts). */
export const CLUSTER_QUESTIONS: KaiQuestion[] = [
  { id: "read", ask: "Does Cluster read my emails?", answer: "No. It reads senders, subjects, dates, labels and a few sender-check headers, never the message itself. Everything runs in your browser.", follow: ["starred", "undo"],
    phrases: ["is my mail private", "do you send my data anywhere", "is cluster safe", "does it use the cloud or ai"] },
  { id: "sort", ask: "How do I sort my inbox?", answer: "Open Labels, set each label, then press Sort inbox at the top. Nothing moves until you confirm.", screen: "organize", target: "#sort-inbox-bar", follow: ["keep", "undo"],
    phrases: ["put mail into labels", "organize my email", "file mail into folders", "group my emails"] },
  { id: "flagged", ask: "Why was this sender flagged?", answer: "It looked like someone else: a lookalike address, a failed sender check, or a name you know from a new address. Open a row in Look at these to see every reason.", screen: "impersonation", follow: ["read"],
    phrases: ["why is this a scam", "is this email phishing", "why does protect warn me", "what are warning signs"] },
  { id: "undo", ask: "How do I undo something?", answer: "Activity lists everything Cluster did, newest first, with Undo wherever Gmail allows it. Trashed mail also stays in Gmail's Trash for 30 days.", screen: "recent", follow: ["starred"],
    phrases: ["i deleted something by mistake", "get my emails back", "restore trashed mail", "where did my mail go"] },
  { id: "unsub", ask: "How do I unsubscribe from lots at once?", answer: "Open Cleanup, then Mailing lists. Tick the lists and press Unsubscribe.", screen: "delete", target: "#lists-card", follow: ["undo"],
    phrases: ["stop newsletters", "get off mailing lists", "too many marketing emails", "unsubscribe all"] },
  { id: "keep", ask: "Can Cluster keep new mail sorted?", answer: "Yes. Any label on Labels that isn't Off keeps sorting new mail. Sender rules become Gmail filters, so they work with Chrome closed.", screen: "organize", target: "#time-limits-rows", follow: ["rules", "undo"],
    phrases: ["sort new mail automatically", "does it work when chrome is closed", "keep my inbox tidy"] },
  { id: "screener", ask: "What is New senders?", answer: "Turn on Hold mail from new senders, and mail from people you've never emailed waits there, out of your inbox, until you let them in.", screen: "screener", target: "#screener-toggle-row", follow: ["read"],
    phrases: ["hold mail from strangers", "unknown senders", "first time senders", "let someone in"] },
  { id: "starred", ask: "Will it touch my starred mail?", answer: "Never. Starred and important mail is always skipped, and nothing is moved or deleted before you confirm.", follow: ["undo"],
    phrases: ["will it delete important emails", "is starred mail safe", "protect my important mail"] },
  { id: "cleanup", ask: "How do I clear out old mail?", answer: "Open Cleanup. Tick senders in the table and press Trash.", screen: "delete", target: ".cu-cards", follow: ["undo", "starred"],
    phrases: ["delete old emails", "free up space", "trash mail i never open", "remove old codes", "my inbox is full"] },
  { id: "rules", ask: "How do I make a rule?", answer: "In Settings, under Advanced, find Your rules and press New rule. Say who it's from and what to do. Rules about the sender also become Gmail filters.", screen: "settings", target: "#your-rules", follow: ["keep"],
    phrases: ["always label mail from a sender", "create a filter", "if this then that", "automatically archive mail from someone"] },
  { id: "block", ask: "How do I block a scam?", answer: "On Security, press Block on its row. Its mail moves out of your inbox, and with Send held mail to Spam on, Gmail learns from it too.", screen: "impersonation", target: "#security-section", follow: ["flagged"],
    phrases: ["stop a scammer", "mark as spam", "get rid of phishing mail", "block this sender"] },
  { id: "find", ask: "How do I find an email?", answer: "Use the search at the top, or press /. Pick a company or person, or Search all of Gmail for older mail.", target: "#ask-kai-open", follow: ["contacts"],
    phrases: ["search my mail", "look for a message", "where is the search bar", "find mail from someone"] },
  { id: "contacts", ask: "Where are the people who email me?", answer: "Contacts lists everyone who writes to you: People, Companies and Subscriptions. Press a row to see its emails.", screen: "senders", follow: ["find"],
    phrases: ["list of senders", "who sends me the most mail", "see all companies", "my subscriptions"] },
  { id: "keys", ask: "What are the keyboard shortcuts?", answer: "Press ? to see them all. You can change any key in Settings, under Advanced.", screen: "settings", follow: ["find"],
    phrases: ["change a hotkey", "turn off shortcuts", "keyboard keys"] },
  { id: "held", ask: "Where does held mail go?", answer: "Held mail leaves your inbox under a Suspicious label. Open Security to see it and release anything safe.", screen: "impersonation", target: "#report-held-card", follow: ["block"],
    phrases: ["quarantine", "release a held email", "mail went missing", "suspicious label"] },
];

/** Which questions come first on each screen. */
export const CLUSTER_FIRST_ON: Record<string, string[]> = {
  overview: ["read", "sort"],
  delete: ["cleanup", "undo", "starred"],
  senders: ["contacts", "unsub"],
  subscriptions: ["unsub", "undo"],
  settings: ["keys", "read"],
  organize: ["sort", "rules", "keep"],
  impersonation: ["flagged", "block", "held"],
  screener: ["screener", "read"],
  recent: ["undo"],
};
