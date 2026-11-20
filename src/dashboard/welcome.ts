// First-run welcome, Duolingo style (research/2026-11-15-onboarding-two-sources.md):
// Kai says hello with one big button, asks your name, then your Gmail address,
// which opens Google's window on that account. Returning users skip this and
// get the plain "Welcome back" gate.
import "./kai/kaiLife.js";
import type { KaiInstance } from "./kai/kaiLife";
import { ctx } from "./state";
import { startIdle } from "./kaiIdle";
import { rememberKai, travel } from "./kaiTravel";
import { typeLine } from "./kaiBubble";
import { updateSettings } from "../lib/settingsStore";
import { setGmailLoginHint } from "../lib/gmailWebAuth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Step 1's two lines, said one after the other. */
export const HELLO_LINES = ["Hi, I am Kai!", "I am going to help you with your email."] as const;
/** Step 1's beats in ms from the start: Kai appears (wel-appear, 1.2 s, in
 * dashboard.css) and wakes, says line 1, line 2, then Get started rises in. */
const HELLO_BEATS = { land: 1500, wake: 1800, line1: 2900, line2: 5000, button: 6400 };
/** Reduced motion or no Kai: no appearing or waking, the lines and the button keep their order. */
const HELLO_BEATS_REDUCED = { land: 0, wake: 0, line1: 200, line2: 1600, button: 2600 };
/** Kai looks at the cursor this long after it moves, and back at you after it rests (research 2026-11-20 #2). */
const LOOK_DELAY_MS = 200;
const LOOK_BACK_MS = 1500;
/** The mouse this close to Get started makes Kai look at it and smile, at most every 5 s (#7). */
const NEAR_BUTTON_PX = 140;
const NEAR_COOLDOWN_MS = 5000;

/** Name and email here, then setup: hello, label, scan, found. */
export const ONBOARDING_STEPS = 6;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The parts of setup and the screens in each (1 = name ... 6 = labels).
 * Tour is last so the dashboard tour reads as part of setup, not a restart. */
export const SETUP_PARTS = [
  { name: "You", screens: [1] },
  { name: "Gmail", screens: [2] },
  { name: "Your mail", screens: [3, 4, 5] },
  { name: "Labels", screens: [6] },
  { name: "Tour", screens: [7] },
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

/** Where you are in setup, bottom left like a console's setup: a tick over
 * each part that's done, the current part's name over a thin bar, and
 * empty bars for what's left. `done` is the current screen. */
export function progressBar(done: number): HTMLElement {
  const track = el("div", "step-track");
  const now = SETUP_PARTS.findIndex((p) => (p.screens as readonly number[]).includes(done));
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", String(ONBOARDING_STEPS));
  track.setAttribute("aria-valuenow", String(done));
  track.setAttribute("aria-valuetext", `${SETUP_PARTS[now]?.name ?? ""}, part ${now + 1} of ${SETUP_PARTS.length}`);
  SETUP_PARTS.forEach((part, i) => {
    const state = i < now ? "done" : i === now ? "now" : "next";
    const node = el("div", `step-part is-${state}`);
    const bar = el("i");
    const fill = el("span");
    const pos = (part.screens as readonly number[]).indexOf(done);
    fill.style.width = state === "done" ? "100%" : state === "now" ? `${((pos + 0.5) / part.screens.length) * 100}%` : "0";
    bar.append(fill);
    const head = el("b", "", state === "now" ? part.name : "");
    if (state === "done") head.append(tick());
    node.append(head, bar);
    track.append(node);
  });
  return track;
}

/** First word of what they typed: "Samuel Boman" is "Samuel". */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/**
 * Builds the welcome inside the gate. The last screen holds the gate's own
 * Connect button, error line and trust note, so the sign-in code is unchanged.
 */
export function showWelcome(gate: HTMLElement, connectBtn: HTMLButtonElement): void {
  const errorEl = document.getElementById("connect-error");
  const trust = gate.querySelector(".connect-trust:not(#connect-testing-note)");
  const wel = el("div", "wel");
  const top = el("div", "wel-top");
  const stage = el("div", "wel-stage");
  wel.append(top, stage);
  gate.classList.add("is-welcome");
  gate.append(wel);

  const kaiHost = el("div", "onb-kai wel-kai");
  const bubble = el("p", "onb-bubble wel-bubble");
  bubble.id = "welcome-kai-line";
  bubble.setAttribute("aria-live", "polite");
  const kai: KaiInstance | null =
    ctx.settings.showKai && typeof window.Kai === "function"
      ? window.Kai(kaiHost, { src: "/characters/", imgWidth: 320, calm: true })
      : null;
  if (!kai) kaiHost.hidden = true;
  // Drop the entrance once it has played: moving Kai to the next step would replay it.
  kaiHost.addEventListener("animationend", (e) => {
    if (e.animationName === "wel-appear" || e.animationName === "wel-fade") kaiHost.classList.remove("wel-appear");
  });
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const idle = kai && !reduced ? startIdle(kai) : null;
  const say = (text: string, pop = false) => typeLine(bubble, text, kai, { pop });

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

  /** Step 1. Kai appears out of nowhere (fade, grow, unblur) with eyes
   * closed, wakes up and looks around, waves "Hi, I am Kai!", nods the second
   * line, and only then does Get started rise in. A click or key during the
   * intro skips to the end. Timings: HELLO_BEATS. */
  function hello() {
    top.replaceChildren();
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
    stage.replaceChildren(bubble, kaiHost, go);
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
      kai?.setMood("asleep");
    }
    after(b.land, () => kai?.do("land"));
    // Waking up (#8): eyes half open, a double blink, a look at you, then around.
    after(b.wake, () => {
      kai?.setMood("sleepy");
      after(350, () => kai?.blink(true));
      after(800, () => {
        kai?.setMood("curious");
        kai?.lookAt(null);
      });
      after(1200, () => kai?.do("lookAround"));
    });
    after(b.line1, () => {
      kai?.setMood("happy");
      kai?.do("wave");
      say(HELLO_LINES[0], true);
    });
    after(b.line2, () => {
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

  /** Kai on the left with the question in a bubble, the answer below, Continue at the bottom. */
  function question(done: number, line: string, back: (() => void) | null, ...rest: HTMLElement[]) {
    wel.className = "wel is-ask";
    const backBtn = el("button", "wel-back", "Back");
    backBtn.type = "button";
    backBtn.onclick = () => back?.();
    backBtn.hidden = !back;
    top.replaceChildren(backBtn, progressBar(done));
    const ask = el("div", "wel-ask");
    ask.append(kaiHost, bubble);
    rememberKai(kaiHost);
    stage.replaceChildren(ask, ...rest);
    // Kai flies from the middle to its spot by the question, instead of popping in there.
    travel(kaiHost, kai);
    idle?.reset();
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
    const ok = () => (go.disabled = !input.value.trim());
    const save = async () => {
      if (!input.value.trim()) return;
      name = firstName(input.value);
      ctx.settings = await updateSettings({ userName: name });
      kai?.do("nod");
      askEmail();
    };
    input.oninput = ok;
    input.onkeydown = (e) => {
      if (e.key === "Enter") void save();
    };
    ok();
    question(1, "What should I call you?", hello, input, go);
    input.focus();
  }

  function askEmail() {
    const input = el("input", "wel-input");
    input.id = "welcome-email";
    input.type = "email";
    input.autocomplete = "email";
    input.placeholder = "you@gmail.com";
    input.setAttribute("aria-label", "Your Gmail address");
    connectBtn.textContent = "Continue with Google";
    connectBtn.classList.add("wel-go");
    const ok = () => {
      const valid = EMAIL_RE.test(input.value.trim());
      connectBtn.disabled = !valid;
      if (valid) setGmailLoginHint(input.value);
    };
    input.oninput = ok;
    input.onkeydown = (e) => {
      if (e.key === "Enter" && !connectBtn.disabled) connectBtn.click();
    };
    ok();
    const rest: HTMLElement[] = [input, connectBtn];
    if (errorEl) rest.push(errorEl);
    if (trust instanceof HTMLElement) rest.push(trust);
    question(2, `Nice to meet you, ${name}! What's your Gmail?`, askName, ...rest);
    kai?.setMood("happy", 1600);
    input.focus();
  }

  if (name) askEmail();
  else hello();
}
