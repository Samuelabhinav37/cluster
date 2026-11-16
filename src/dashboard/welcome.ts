// First-run welcome, Duolingo style (research/2026-11-15-onboarding-two-sources.md):
// Kai says hello with one big button, asks your name, then your Gmail address,
// which opens Google's window on that account. Returning users skip this and
// get the plain "Welcome back" gate.
import "./kai/kaiLife.js";
import type { KaiInstance } from "./kai/kaiLife";
import { ctx } from "./state";
import { updateSettings } from "../lib/settingsStore";
import { setGmailLoginHint } from "../lib/gmailWebAuth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Name and email here, then setup: hello, label, scan, found. */
export const ONBOARDING_STEPS = 6;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The thick progress bar along the top, `done` of ONBOARDING_STEPS filled. */
export function progressBar(done: number): HTMLElement {
  const bar = el("div", "wel-bar");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", String(ONBOARDING_STEPS));
  bar.setAttribute("aria-valuenow", String(done));
  const fill = el("span");
  fill.style.width = `${(done / ONBOARDING_STEPS) * 100}%`;
  bar.append(fill);
  return bar;
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
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  let typing = 0;
  const say = (text: string) => {
    clearInterval(typing);
    kai?.talk(Math.min(2400, text.length * 45));
    if (reduced) {
      bubble.textContent = text;
      return;
    }
    let n = 0;
    bubble.textContent = "";
    typing = window.setInterval(() => {
      n += 2;
      bubble.textContent = text.slice(0, n);
      if (n >= text.length) clearInterval(typing);
    }, 22);
  };

  const bigButton = (label: string, onClick: () => void) => {
    const b = el("button", "connect-btn wel-go", label);
    b.type = "button";
    b.onclick = onClick;
    return b;
  };

  let name = ctx.settings.userName;

  function hello() {
    top.replaceChildren();
    wel.className = "wel is-hello";
    const go = bigButton("Get started", askName);
    go.id = "welcome-start";
    stage.replaceChildren(bubble, kaiHost, go);
    say("Hi, I'm Kai! I'll help you sort your Gmail.");
    kai?.do("peek");
    kai?.do("wave");
    go.focus();
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
    stage.replaceChildren(ask, ...rest);
    say(line);
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
