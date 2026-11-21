// First-run welcome, Duolingo style (research/2026-11-15-onboarding-two-sources.md):
// Kai says hello with one big button, asks your name, then Continue with Google
// opens Google's window to pick an account. Returning users skip this and
// get the plain "Welcome back" gate.
import "./kai/kaiLife.js";
import "./sky/skyEngine.js";
import type { KaiInstance, KaiMood } from "./kai/kaiLife";
import { ctx } from "./state";
import { startIdle } from "./kaiIdle";
import { typeLine } from "./kaiBubble";
import { inboxPreview } from "./inboxPreview";
import { dressUpOnClick } from "./kaiWardrobe";
import { updateSettings } from "../lib/settingsStore";

/** Step 1's two lines, said one after the other. */
export const HELLO_LINES = ["Hi, I'm Kai!", "I'll help you sort your email."] as const;
/** Step 1's beats in ms from the start: Kai pops in (wel-appear, 1.2 s, in
 * dashboard.css), lands and waves hello, says line 2, then Get started rises in. */
const HELLO_BEATS = { land: 1300, line1: 1500, line2: 3300, button: 4500 };
/** Reduced motion or no Kai: no entrance, the lines and the button keep their order. */
const HELLO_BEATS_REDUCED = { land: 0, line1: 200, line2: 1600, button: 2600 };
/** Kai looks at the cursor this long after it moves, and back at you after it rests (research 2026-11-20 #2). */
const LOOK_DELAY_MS = 200;
const LOOK_BACK_MS = 1500;
/** The mouse this close to Get started makes Kai look at it and smile, at most every 5 s (#7). */
const NEAR_BUTTON_PX = 140;
const NEAR_COOLDOWN_MS = 5000;

/** Name and email here, then setup: label, scan, found. */
export const ONBOARDING_STEPS = 5;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The parts of setup and the screens in each (1 = name ... 5 = labels).
 * Tour is last so the dashboard tour reads as part of setup, not a restart. */
export const SETUP_PARTS = [
  { name: "You", screens: [1] },
  { name: "Gmail", screens: [2] },
  { name: "Your mail", screens: [3, 4] },
  { name: "Labels", screens: [5] },
  { name: "Tour", screens: [6] },
] as const;

/** A thin drawn tick (not a font glyph, which looks different on every system). */
function tick(): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M20 6 9 17l-5-5");
  svg.append(path);
  return svg;
}

/** Where you are in setup, as a list at the foot of the panel: a tick by
 * each part that's done, the current part in bold, then the parts to come.
 * `done` is the current screen. */
export function progressBar(done: number): HTMLElement {
  const track = el("ol", "step-list");
  const now = SETUP_PARTS.findIndex((p) => (p.screens as readonly number[]).includes(done));
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", String(ONBOARDING_STEPS));
  track.setAttribute("aria-valuenow", String(done));
  track.setAttribute("aria-valuetext", `${SETUP_PARTS[now]?.name ?? ""}, part ${now + 1} of ${SETUP_PARTS.length}`);
  SETUP_PARTS.forEach((part, i) => {
    const state = i < now ? "done" : i === now ? "now" : "next";
    const node = el("li", `step-item is-${state}`);
    const mark = el("span", "step-mark");
    if (state === "done") mark.append(tick());
    else mark.textContent = String(i + 1);
    node.append(mark, el("span", "step-name", part.name));
    if (state === "now") node.setAttribute("aria-current", "step");
    track.append(node);
  });
  return track;
}

/** The page header: Cluster's logo on the left (a copy of the gate's), and
 * whatever goes on the right. */
export function pageHeader(...right: HTMLElement[]): HTMLElement {
  const head = el("header", "onb-head");
  const logo = document.querySelector(".connect-logo")?.cloneNode(true);
  if (logo instanceof HTMLElement) head.append(logo);
  const end = el("div", "onb-head-end");
  end.append(...right);
  head.append(end);
  return head;
}

/** The left panel: the portfolio's night sky (black and white, stars,
 * slow clouds), with the inbox preview and the steps on it. */
export function worldPanel(): HTMLElement {
  const world = el("div", "onb-world");
  const sky = el("canvas", "onb-sky");
  const fx = el("canvas", "onb-sky");
  sky.setAttribute("aria-hidden", "true");
  fx.setAttribute("aria-hidden", "true");
  world.append(sky, fx);
  // No WebGL (or no 2D canvas, as in tests): the panel stays plain black.
  if (typeof window.SiteSky !== "object" || !sky.getContext("webgl") || !fx.getContext("2d")) return world;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const engine = window.SiteSky.create(sky, fx, { tier: reduced ? "still" : "full", tone: "night" });
  // Sized to the panel, and only drawn while the panel is on screen (the welcome and setup each have one).
  new ResizeObserver(([e]) => {
    const { width, height } = e.contentRect;
    if (width && height) engine.handle({ type: "size", w: width, h: height, dpr: window.devicePixelRatio || 1 });
  }).observe(world);
  new IntersectionObserver(([e]) => engine.handle({ type: "running", on: e.isIntersecting })).observe(world);
  return world;
}

/** Puts `nodes` on the panel, keeping its sky canvases. */
export function setWorld(world: HTMLElement, ...nodes: Node[]): void {
  world.replaceChildren(...Array.from(world.querySelectorAll(":scope > .onb-sky")), ...nodes);
}

/** Kai pays attention on every onboarding screen: it looks where the cursor
 * goes (a short delay, then back at you), looks at the field you type in and
 * holds still while you type. Off with reduced motion. Returns a stop. */
function attend(kai: KaiInstance | null, root: HTMLElement, skipWhen: () => boolean = () => false): () => void {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  if (!kai || reduced) return () => {};
  const stop = new AbortController();
  const on = { signal: stop.signal };
  let look = 0;
  let back = 0;
  let typingUntil = 0;
  root.addEventListener(
    "pointermove",
    (e) => {
      if (skipWhen() || performance.now() < typingUntil) return;
      clearTimeout(look);
      clearTimeout(back);
      look = window.setTimeout(() => kai.lookAt({ x: e.clientX, y: e.clientY }), LOOK_DELAY_MS);
      back = window.setTimeout(() => kai.lookAt(null), LOOK_DELAY_MS + LOOK_BACK_MS);
    },
    on,
  );
  const lookAtField = (e: Event) => {
    if (!(e.target instanceof HTMLInputElement)) return;
    clearTimeout(look);
    clearTimeout(back);
    kai.lookAt(e.target);
  };
  root.addEventListener("focusin", lookAtField, on);
  root.addEventListener(
    "input",
    (e) => {
      typingUntil = performance.now() + 1500;
      lookAtField(e);
    },
    on,
  );
  return () => stop.abort();
}

/** First word of what they typed: "Samuel Boman" is "Samuel". */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/**
 * Builds the welcome inside the gate. The last screen holds the gate's own
 * Connect button, error line and trust note, so the sign-in code is unchanged.
 */
/** The welcome's Kai, for setup's steps: its spot (Kai and bubble) and a way to say a line. */
let dock: { spot: HTMLElement; say(text: string, mood?: KaiMood): void } | null = null;
export const kaiDock = () => dock;

export function showWelcome(gate: HTMLElement, connectBtn: HTMLButtonElement): void {
  const errorEl = document.getElementById("connect-error");
  const trust = gate.querySelector(".connect-trust:not(#connect-testing-note)");
  const wel = el("div", "wel");
  const world = worldPanel();
  const preview = inboxPreview(ctx.settings.userName);
  const stage = el("div", "wel-stage");
  // Back sits in the top left corner of the right column, on the header's line (CSS grid row 1).
  const backBtn = el("button", "wel-back", "Back");
  backBtn.type = "button";
  backBtn.hidden = true;
  wel.append(pageHeader(), world, stage, backBtn);
  gate.classList.add("is-welcome");
  gate.append(wel);

  const kaiHost = el("div", "onb-kai wel-kai");
  const bubble = el("p", "onb-bubble wel-bubble");
  bubble.id = "welcome-kai-line";
  // Kai and its line: big in the left panel on the hello screen, then small right over each question.
  const spot = el("div", "onb-kai-spot");
  bubble.setAttribute("aria-live", "polite");
  const kai: KaiInstance | null =
    ctx.settings.showKai && typeof window.Kai === "function"
      ? // Not calm: Kai breathes, floats and sways while it waits for you.
        window.Kai(kaiHost, { src: "/characters/", imgWidth: 320 })
      : null;
  if (!kai) kaiHost.hidden = true;
  dressUpOnClick(kai);
  spot.append(bubble, kaiHost);
  // The hello screen has its own watcher (it also smiles at Get started).
  attend(kai, wel, () => wel.classList.contains("is-hello"));
  // Drop the entrance once it has played: moving Kai to the next step would replay it.
  kaiHost.addEventListener("animationend", (e) => {
    if (e.animationName === "wel-appear" || e.animationName === "wel-fade") kaiHost.classList.remove("wel-appear");
  });
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  if (kai && !reduced) startIdle(kai);
  const say = (text: string, pop = false) => typeLine(bubble, text, kai, { pop });
  // Setup (setupTab.ts) borrows this Kai for its steps once signed in.
  dock = {
    spot,
    say(text, mood) {
      if (mood) kai?.setMood(mood, 2400);
      say(text, true);
    },
  };

  const bigButton = (label: string, onClick: () => void) => {
    const b = el("button", "connect-btn wel-go", label);
    b.type = "button";
    b.onclick = onClick;
    return b;
  };

  let name = ctx.settings.userName;

  /** Timers of the hello entrance, cleared when the user moves on early. */
  const helloTimers: number[] = [];
  const after = (ms: number, fn: () => void) => helloTimers.push(window.setTimeout(fn, ms));

  /** Step 1. Kai pops in (fade, grow, unblur) already awake, lands, waves
   * "Hi, I'm Kai!", nods the second line, and only then does Get started rise in. A click or key during the
   * intro skips to the end. Timings: HELLO_BEATS. */
  function hello() {
    wel.className = "wel is-hello";
    helloTimers.splice(0).forEach(clearTimeout);
    const go = bigButton("Get started", () => {
      helloTimers.splice(0).forEach(clearTimeout);
      skip.abort();
      watch.abort();
      kai?.lookAt(null);
      kai?.do("nodSmall");
      askName();
    });
    go.id = "welcome-start";
    go.classList.add("wel-wait");
    bubble.textContent = "";
    setWorld(world, spot);
    backBtn.hidden = true;
    stage.replaceChildren(
      // One short line under one short heading, like Notion Mail's and Superhuman's welcome (Mobbin).
      el("h1", "wel-title", "Welcome to Cluster"),
      el("p", "wel-lead", "Let's sort your Gmail."),
      go,
    );
    const skip = new AbortController();
    const showButton = () => {
      if (!go.classList.contains("wel-wait")) return;
      skip.abort();
      go.classList.replace("wel-wait", "wel-rise");
      go.focus();
    };
    // Impatient or seen it before: any click or key jumps to the end.
    const jump = () => {
      helloTimers.splice(0).forEach(clearTimeout);
      kaiHost.classList.remove("wel-appear");
      typeLine(bubble, HELLO_LINES[1], kai, { instant: true });
      kai?.setMood("happy");
      showButton();
    };
    const plain = reduced || !kai;
    const b = plain ? HELLO_BEATS_REDUCED : HELLO_BEATS;
    after(300, () => {
      window.addEventListener("pointerdown", jump, { signal: skip.signal });
      window.addEventListener("keydown", jump, { signal: skip.signal });
    });
    if (!plain) {
      kaiHost.classList.add("wel-appear");
      kai?.setMood("excited");
    }
    after(b.land, () => kai?.do("land"));
    after(b.line1, () => {
      kai?.setMood("joyful", 1800);
      kai?.do("wave");
      say(HELLO_LINES[0], true);
    });
    after(b.line2, () => {
      kai?.setMood("happy");
      kai?.do("nod");
      say(HELLO_LINES[1]);
    });
    after(b.button, showButton);

    // Kai watches the cursor, and smiles at the button when you go for it.
    const watch = new AbortController();
    if (!plain) {
      let look = 0;
      let back = 0;
      let nearAt = 0;
      window.addEventListener(
        "pointermove",
        (e) => {
          if (!wel.isConnected || !wel.classList.contains("is-hello")) return watch.abort();
          clearTimeout(look);
          clearTimeout(back);
          const r = go.getBoundingClientRect();
          const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
          const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
          const now = performance.now();
          if (go.classList.contains("wel-rise") && Math.hypot(dx, dy) < NEAR_BUTTON_PX && now - nearAt > NEAR_COOLDOWN_MS) {
            nearAt = now;
            kai?.lookAt(go);
            kai?.setMood("happy", 1200);
          } else {
            look = window.setTimeout(() => kai?.lookAt({ x: e.clientX, y: e.clientY }), LOOK_DELAY_MS);
          }
          back = window.setTimeout(() => kai?.lookAt(null), LOOK_DELAY_MS + LOOK_BACK_MS);
        },
        { signal: watch.signal },
      );
    }
  }

  /** The question and why we ask sit over the field; Kai's bubble adds a short aside, never the same words. */
  function question(done: number, title: string, why: string, line: string, back: (() => void) | null, ...rest: HTMLElement[]) {
    wel.className = "wel is-ask";
    backBtn.onclick = () => back?.();
    backBtn.hidden = !back;
    // Kai sits in the panel at the inbox window's corner with one short line; the right side is only the question.
    setWorld(world, preview.el, spot, progressBar(done));
    stage.replaceChildren(el("h1", "wel-title", title), ...(why ? [el("p", "wel-lead", why)] : []), ...rest);
    say(line, true);
  }

  function askName() {
    const input = el("input", "wel-input");
    input.id = "welcome-name";
    input.type = "text";
    input.autocomplete = "given-name";
    input.placeholder = "Your name";
    input.maxLength = 40;
    input.value = name;
    input.setAttribute("aria-label", "Your name");
    const go = bigButton("Continue", () => void save());
    go.id = "welcome-name-next";
    const ok = () => {
      go.disabled = !input.value.trim();
    };
    const save = async () => {
      if (!input.value.trim()) return;
      name = firstName(input.value);
      ctx.settings = await updateSettings({ userName: name });
      askGmail();
    };
    input.oninput = () => {
      ok();
      // The preview's title fills in as you type, like Slack's workspace name.
      preview.setName(input.value);
    };
    input.onkeydown = (e) => {
      if (e.key === "Enter") void save();
    };
    ok();
    question(1, "What should I call you?", "", "Let's start with you.", hello, input, go);
    input.focus();
  }

  /** No address to type: Google's own window lets you pick the account (Notion, Slack). */
  function askGmail() {
    connectBtn.textContent = "Continue with Google";
    connectBtn.classList.add("wel-go");
    connectBtn.disabled = false;
    const rest: HTMLElement[] = [connectBtn];
    if (errorEl) rest.push(errorEl);
    if (trust instanceof HTMLElement) rest.push(trust);
    question(2, "Connect your Gmail", "Google will ask you to pick an account.", name ? `Nice to meet you, ${name}!` : "Nice to meet you!", askName, ...rest);
    kai?.setMood("joyful", 1600);
    connectBtn.focus();
  }

  if (name) askGmail();
  else hello();
}
