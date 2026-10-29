// Settings page, simple mode and first-run setup.
//
// - Simple mode: bigger text, and the nav shows only Home, Scams and
//   Settings. Home (data-screen="simple") says whether you're protected,
//   how much was held, and one safety tip.
// - Setup (research/2026-10-29-onboarding.md): four questions and a plan,
//   one per screen, a drawing and Kai on the right. Step 2 is a practice
//   inbox of made-up mail; what you do there becomes the answer. Answers
//   are kept in settings.onboarding so Setup reopens with them, and only
//   Start changes anything. Gmail filters are made only for "Tidy for me".
import "./kai/kaiLife.js";
import type { KaiInstance, KaiMood } from "./kai/kaiLife";
import type { ClusterSettings } from "../lib/settingsStore";
import { updateSettings } from "../lib/settingsStore";
import type { SenderSummary } from "../lib/senderModel";
import { log } from "../lib/log";
import {
  buildOnboardingPlan,
  SEEDS,
  type KeepKind,
  type OnboardingAnswers,
  type PracticeChoice,
  type PracticeKind,
  type Who,
} from "../lib/onboardingPlan";
import { ctx } from "./state";
import { renderTimeLimits, turnOnTimeLimits } from "./timeLimitsTab";

const PERSONA_LABELS: Record<Exclude<ClusterSettings["persona"], "">, string> = {
  calm: "Just me",
  business: "I run a business",
  safe: "Keep me safe",
  busy: "Lots of people email me",
};

const SIMPLE_SCREENS = new Set(["simple", "impersonation", "settings"]);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

/** Applies simple mode to the page: body class and which nav items show.
 * Hidden nav items get the `hidden` attribute so arrow keys skip them. */
export function applySimpleMode(on: boolean): void {
  document.body.classList.toggle("simple", on);
  for (const btn of Array.from(
    document.querySelectorAll<HTMLButtonElement>("#sidebar button[data-screen]"),
  )) {
    const screen = btn.dataset.screen!;
    btn.hidden = on ? !SIMPLE_SCREENS.has(screen) : screen === "simple";
  }
  const sw = $<HTMLInputElement>("simple-mode-toggle");
  if (sw) sw.checked = on;
}

/** Overview and Home stand in for each other depending on the mode. */
export function screenForMode(target: string): string {
  const simple = document.body.classList.contains("simple");
  if (simple && target === "overview") return "simple";
  if (!simple && target === "simple") return "overview";
  return target;
}

function personaLabel(persona: ClusterSettings["persona"]): string {
  return persona ? PERSONA_LABELS[persona] : "Not set up yet";
}

export function renderSettingsSetup(): void {
  const label = $("settings-persona");
  if (label) label.textContent = personaLabel(ctx.settings.persona);
}

/** Simple-mode home: protection status, what was held, one safety tip. */
export function renderSimpleHome(securitySenders: SenderSummary[]): void {
  const status = $("simple-status");
  const statusSub = $("simple-status-sub");
  const held = Object.values(ctx.settings.quarantinedSenders).reduce((n, r) => n + r.messageIds.length, 0);
  const warned = securitySenders.filter((s) => s.threatSignals.length > 0).length;
  if (status && statusSub) {
    const on = ctx.settings.autoQuarantineHighRisk;
    status.textContent = on ? "You're protected" : "Scam protection is off";
    statusSub.textContent = on ? "Cluster is checking your email for scams." : "Turn it on in Protect.";
  }
  const heldSub = $("simple-held-sub");
  if (heldSub) {
    heldSub.textContent =
      held > 0
        ? "You don't need to do anything. Look only if you were expecting something."
        : warned > 0
          ? "Look before you reply, click a link or pay anyone."
          : "Cluster keeps checking. You don't need to do anything.";
  }
  const see = $("simple-see-scams");
  if (see) see.hidden = held === 0 && warned === 0;
  const heldText = $("simple-held");
  if (heldText) {
    heldText.textContent =
      held > 0
        ? `${held} email${held === 1 ? "" : "s"} looked like scams. Cluster moved ${held === 1 ? "it" : "them"} away from your inbox.`
        : warned > 0
          ? `${warned} sender${warned === 1 ? "" : "s"} might not be who they say. Have a look before you reply or pay.`
          : "Nothing looks like a scam right now.";
  }
}

// ── Setup flow ───────────────────────────────────────────────────────────

// Drawings for each step: static markup, no user data in them.
const SCENES: Record<Step, string> = {
  who: `<svg viewBox="0 0 440 340"><circle cx="220" cy="170" r="130" fill="#fff" opacity=".6"/><g class="onb-float"><rect x="120" y="90" width="200" height="140" rx="18" fill="#fff" stroke="#e4e4e7"/><path d="M120 108l100 66 100-66" fill="none" stroke="#2f6fe4" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g><g class="onb-float2"><circle cx="95" cy="95" r="26" fill="#f6c453"/><circle cx="95" cy="88" r="9" fill="#fff"/><path d="M78 110a17 13 0 0 1 34 0" fill="#fff"/></g><g class="onb-float"><circle cx="350" cy="110" r="22" fill="#8b5cf6"/><path d="M342 110l6 6 11-12" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></g><g class="onb-float2"><rect x="300" y="230" width="70" height="46" rx="12" fill="#1f9d63"/><path d="M318 253h34M318 263h20" stroke="#fff" stroke-width="4" stroke-linecap="round"/></g><g class="onb-float"><rect x="70" y="220" width="80" height="50" rx="12" fill="#f08a24"/><path d="M88 236h44M88 250h28" stroke="#fff" stroke-width="4" stroke-linecap="round"/></g></svg>`,
  try: `<svg viewBox="0 0 440 340"><g class="onb-float"><rect x="40" y="200" width="110" height="90" rx="16" fill="#fff" stroke="#e4e4e7"/><path d="M60 230h70M60 248h50" stroke="#1f9d63" stroke-width="6" stroke-linecap="round"/></g><g class="onb-float2"><rect x="165" y="190" width="110" height="100" rx="16" fill="#fff" stroke="#e4e4e7"/><circle cx="220" cy="240" r="24" fill="none" stroke="#d88a1c" stroke-width="6"/><path d="M220 226v14l10 8" stroke="#d88a1c" stroke-width="6" stroke-linecap="round" fill="none"/></g><g class="onb-float"><path d="M310 210h100l-10 80h-80z" fill="#fff" stroke="#e4e4e7" stroke-width="2"/><path d="M300 205h120" stroke="#d93f3f" stroke-width="7" stroke-linecap="round"/><path d="M345 230v40M375 230v40" stroke="#d93f3f" stroke-width="5" stroke-linecap="round"/></g><g class="onb-float2"><rect x="150" y="40" width="140" height="96" rx="14" fill="#2f6fe4"/><path d="M150 56l70 46 70-46" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g><path d="M190 140c-50 20-80 40-95 55M220 140v45M250 140c50 20 80 40 105 60" stroke="#a1a1aa" stroke-width="3" stroke-dasharray="6 8" fill="none"/></svg>`,
  keep: `<svg viewBox="0 0 440 340"><g class="onb-float"><path d="M220 40l120 44v80c0 74-52 118-120 136-68-18-120-62-120-136V84z" fill="#fff" stroke="#e4e4e7" stroke-width="2"/><path d="M220 72l88 32v58c0 54-38 86-88 100-50-14-88-46-88-100v-58z" fill="#eaf1fd"/><path d="M180 170l28 28 52-60" stroke="#2f6fe4" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g><g class="onb-float2"><circle cx="70" cy="90" r="24" fill="#1f9d63"/><path d="M62 82h16M62 90h16M62 98h10" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g><g class="onb-float"><circle cx="372" cy="250" r="24" fill="#2f6fe4"/><path d="M360 254l24-10-6 18-6-4-4 4z" fill="#fff"/></g><g class="onb-float2"><circle cx="372" cy="80" r="22" fill="#f08a24"/><rect x="362" y="73" width="20" height="15" rx="3" fill="#fff"/></g></svg>`,
  hands: `<svg viewBox="0 0 440 340"><g class="onb-float"><rect x="40" y="70" width="170" height="200" rx="22" fill="#fff" stroke="#e4e4e7"/><circle cx="125" cy="150" r="40" fill="#f4f4f5"/><circle cx="125" cy="150" r="14" fill="none" stroke="#18181b" stroke-width="5"/><path d="M85 150s15-26 40-26 40 26 40 26-15 26-40 26-40-26-40-26z" fill="none" stroke="#18181b" stroke-width="4"/></g><g class="onb-float2"><rect x="230" y="70" width="170" height="200" rx="22" fill="#18181b"/><path d="M315 108v20M315 168v20M275 148h20M335 148h20M287 120l14 14M329 162l14 14M287 176l14-14M329 134l14-14" stroke="#c4b5fd" stroke-width="5" stroke-linecap="round"/></g></svg>`,
  plan: `<svg viewBox="0 0 440 340"><g class="onb-float"><rect x="110" y="60" width="220" height="230" rx="22" fill="#fff" stroke="#e4e4e7"/><rect x="136" y="92" width="168" height="16" rx="8" fill="#eaf1fd"/><rect x="136" y="122" width="120" height="12" rx="6" fill="#f4f4f5"/><circle cx="148" cy="170" r="12" fill="#1f9d63"/><rect x="170" y="164" width="120" height="12" rx="6" fill="#f4f4f5"/><circle cx="148" cy="206" r="12" fill="#1f9d63"/><rect x="170" y="200" width="100" height="12" rx="6" fill="#f4f4f5"/><circle cx="148" cy="242" r="12" fill="#1f9d63"/><rect x="170" y="236" width="110" height="12" rx="6" fill="#f4f4f5"/></g><g class="onb-float2"><circle cx="350" cy="80" r="30" fill="#f6c453"/><path d="M336 80l10 10 18-20" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`,
};

const ICONS: Record<string, string> = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>',
  brief:
    '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 20a6 6 0 0 0-3-5.2"/>',
  bank: '<path d="M3 10 12 4l9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>',
  plane: '<path d="M2 16l20-8-4 12-6-4-4 4v-6z"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-5.5A8 8 0 1 1 21 12z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  speaker: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
};

function parseSvg(markup: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(
    markup.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '),
    "image/svg+xml",
  );
  const svg = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
  svg.setAttribute("aria-hidden", "true");
  return svg;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function iconTile(name: string, color: string): HTMLElement {
  const tile = el("span", "onb-ic");
  tile.style.background = color;
  tile.append(parseSvg(`<svg viewBox="0 0 24 24">${ICONS[name]}</svg>`));
  return tile;
}

type Step = "who" | "try" | "keep" | "hands" | "plan";
const STEPS: Step[] = ["who", "try", "keep", "hands", "plan"];

// What Kai says on each step.
const KAI_LINES: Record<Step | "done", string> = {
  who: "Hi, I'm Kai. I'll set up Cluster with you. Which of these sounds most like you?",
  try: "This is a practice inbox. Nothing here is real. Sort these five and I'll copy what you do. One of them is a fake.",
  keep: "Some mail should never move on its own. Tick what always stays. People you write to always stay.",
  hands: "Last one. Should I wait for you, or tidy new mail as it arrives? You can undo anything.",
  plan: "Here's the plan. Nothing in Gmail changes until you press Start.",
  done: "All set. I'm reading your mail now. Watch the bar at the bottom.",
};

const PRACTICE: Array<{ kind: PracticeKind; name: string; subject: string; color: string; flag?: string }> = [
  { kind: "promo", name: "Daily Deals", subject: "48 hours only: 60% off everything", color: "#d6409f" },
  { kind: "news", name: "The Morning Brief", subject: "Your weekly digest is here", color: "#12a594" },
  {
    kind: "scam",
    name: "Account Team",
    subject: "Your account is locked. Verify now",
    color: "#71717a",
    flag: "Looks fake",
  },
  { kind: "bank", name: "Northside Bank", subject: "Your October statement is ready", color: "#1f9d63" },
  { kind: "social", name: "Connect", subject: "You appeared in 9 searches this week", color: "#8b5cf6" },
];

const VOICE_PREF = "cluster.kaiVoice";

/** Kai beside the steps: a bubble that types the line, and an optional voice. */
function kaiNarrator(host: HTMLElement) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const bubble = el("p", "onb-bubble");
  bubble.id = "setup-kai-line";
  bubble.setAttribute("aria-live", "polite");
  const kaiHost = el("div", "onb-kai");
  const voiceBtn = el("button", "onb-voice");
  voiceBtn.type = "button";
  voiceBtn.append(parseSvg(`<svg viewBox="0 0 24 24">${ICONS.speaker}</svg>`), el("span", "", "Hear Kai"));
  let voiceOn = false;
  try {
    voiceOn = localStorage.getItem(VOICE_PREF) === "on";
  } catch {
    // Storage blocked: voice starts off.
  }
  const canSpeak = typeof speechSynthesis !== "undefined";
  voiceBtn.hidden = !canSpeak;
  const showVoice = () => voiceBtn.setAttribute("aria-pressed", String(voiceOn));
  showVoice();
  host.append(bubble, kaiHost, voiceBtn);
  const kai: KaiInstance | null = ctx.settings.showKai
    ? window.Kai(kaiHost, { src: "/characters/", imgWidth: 320, calm: true })
    : null;
  let typing = 0;
  let last = "";

  const speak = (text: string) => {
    if (!canSpeak || !voiceOn) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    // A voice on this computer, so the line isn't sent anywhere to be read aloud.
    const local = speechSynthesis.getVoices().find((v) => v.localService && v.lang.startsWith("en"));
    if (local) u.voice = local;
    speechSynthesis.speak(u);
  };

  voiceBtn.onclick = () => {
    voiceOn = !voiceOn;
    try {
      localStorage.setItem(VOICE_PREF, voiceOn ? "on" : "off");
    } catch {
      // Storage blocked: the choice lasts this visit.
    }
    showVoice();
    if (voiceOn) speak(last);
    else speechSynthesis.cancel();
  };

  return {
    say(text: string, mood?: KaiMood) {
      last = text;
      window.clearInterval(typing);
      if (kai) {
        if (mood) kai.setMood(mood, 2400);
        kai.talk(Math.min(4000, text.length * 40));
      }
      speak(text);
      if (reduced) {
        bubble.textContent = text;
        return;
      }
      let n = 0;
      bubble.textContent = "";
      typing = window.setInterval(() => {
        n += 2;
        bubble.textContent = text.slice(0, n);
        if (n >= text.length) window.clearInterval(typing);
      }, 18);
    },
    wave() {
      kai?.do("wave");
    },
    stop() {
      window.clearInterval(typing);
      if (canSpeak) speechSynthesis.cancel();
    },
  };
}

function freshAnswers(): OnboardingAnswers {
  const saved = ctx.settings.onboarding?.answers;
  return saved
    ? { who: saved.who, sorted: { ...saved.sorted }, keep: [...saved.keep], hands: saved.hands }
    : { sorted: {}, keep: ["people"] };
}

/** Saves the answers and applies the plan. Gmail filters only for "Tidy for me". */
async function startPlan(answers: OnboardingAnswers): Promise<{ simple: boolean; tidyFailed: boolean }> {
  const plan = buildOnboardingPlan(answers);
  const patch: Partial<ClusterSettings> = {
    persona: plan.persona,
    setupDone: true,
    onboarding: { version: 1, answers, answeredAt: Date.now() },
    autoSort: {
      ...ctx.settings.autoSort,
      inboxHoursByBucket: { ...ctx.settings.autoSort.inboxHoursByBucket, ...plan.hours },
    },
  };
  if (plan.holdScams) patch.autoQuarantineHighRisk = true;
  if (plan.simpleMode) patch.simpleMode = true;
  ctx.settings = await updateSettings(patch);
  const quarantine = $<HTMLInputElement>("auto-quarantine-toggle");
  if (quarantine && plan.holdScams) quarantine.checked = true;
  if (plan.simpleMode) applySimpleMode(true);
  renderSettingsSetup();
  renderTimeLimits();
  let tidyFailed = false;
  if (plan.tidy) {
    tidyFailed = !(await turnOnTimeLimits().catch((err: unknown) => {
      log.error("Setup could not turn on time limits", err);
      return false;
    }));
  }
  return { simple: plan.simpleMode, tidyFailed };
}

export function wireSetup(select: (screen: string) => Promise<void>): void {
  const root = $("setup-flow");
  if (!root) return;
  const pane = el("div", "onb-pane");
  const scene = el("div", "onb-scene");
  const kaiSpot = el("div", "onb-kai-spot");
  const art = el("div", "onb-art");
  art.append(scene, kaiSpot);
  const skip = el("button", "onb-skip", "I'll set it up myself");
  skip.type = "button";
  skip.id = "setup-not-now";
  const top = el("div", "onb-top");
  top.append(el("div", "connect-logo", "cluster"), skip);
  const side = el("div", "onb-side");
  side.append(top, pane);
  root.replaceChildren(side, art);
  const kai = kaiNarrator(kaiSpot);

  let answers = freshAnswers();
  let at = 0;
  let saidHello = false;

  const button = (label: string, className: string, onClick: () => void, disabled = false) => {
    const b = el("button", className, label);
    b.type = "button";
    b.disabled = disabled;
    b.onclick = onClick;
    return b;
  };

  const option = (
    label: string,
    sub: string,
    icon: string,
    color: string,
    pressed: boolean,
    onClick: () => void,
    locked = false,
  ) => {
    const b = el("button", "onb-opt");
    b.type = "button";
    b.setAttribute("aria-pressed", String(pressed));
    if (locked) b.setAttribute("aria-disabled", "true");
    const words = el("span", "onb-words");
    words.append(el("b", "", label));
    if (sub) words.append(el("small", "", sub));
    const tick = el("span", "onb-chk");
    tick.append(parseSvg(`<svg viewBox="0 0 24 24">${ICONS.check}</svg>`));
    b.append(iconTile(icon, color), words, tick);
    b.onclick = () => {
      if (!locked) onClick();
    };
    return b;
  };

  const goTo = (step: number) => {
    at = Math.max(0, Math.min(STEPS.length - 1, step));
    render(true);
  };

  const nav = (canGo: boolean, label = "Continue", go: () => void = () => goTo(at + 1)) => {
    const row = el("div", "onb-nav");
    if (at > 0) row.append(button("Back", "onb-btn ghost", () => goTo(at - 1)));
    row.append(el("span", "grow"));
    if (STEPS[at] !== "plan") row.append(button("Skip", "onb-btn ghost", () => goTo(at + 1)));
    const next = button(label, "onb-btn dark", go, !canGo);
    next.id = STEPS[at] === "plan" ? "setup-go" : "setup-next";
    row.append(next);
    return row;
  };

  const heading = (kicker: string, title: string, sub: string) => [
    el("p", "onb-kicker", kicker),
    el("h1", "onb-title", title),
    el("p", "onb-sub", sub),
  ];

  function renderWho(body: HTMLElement) {
    body.append(...heading("Step 1 of 4", "What describes you?", "Pick the closest one."));
    const opts = el("div", "onb-opts");
    opts.setAttribute("role", "group");
    opts.setAttribute("aria-label", "What describes you");
    const choices: Array<[Who, string, string, string, string]> = [
      ["me", "Just me", "Personal mail", "user", "#2f6fe4"],
      ["business", "I run a business", "Invoices, suppliers, clients", "brief", "#f08a24"],
      ["safe", "Keep me safe", "Scams worry me most", "shield", "#4f5bd5"],
      ["busy", "Lots of people email me", "I need to find people fast", "users", "#8b5cf6"],
    ];
    for (const [who, label, sub, icon, color] of choices) {
      const b = option(label, sub, icon, color, answers.who === who, () => {
        // A new answer re-seeds the next screens, like Apple Music's artists from your genres.
        answers = { ...answers, who, keep: [...SEEDS[who].keep], hands: SEEDS[who].hands };
        render();
      });
      b.dataset.who = who;
      opts.append(b);
    }
    body.append(opts, nav(Boolean(answers.who)));
  }

  function renderPractice(body: HTMLElement) {
    body.append(
      ...heading(
        "Step 2 of 4 · Try it",
        "Sort five emails",
        "Your choices teach Cluster what you want gone.",
      ),
    );
    const inbox = el("div", "onb-inbox");
    const left = PRACTICE.filter((m) => !answers.sorted[m.kind]);
    for (const m of left) {
      const row = el("div", "onb-mail");
      row.dataset.kind = m.kind;
      const av = el("span", "onb-av", m.name[0]);
      av.style.background = m.color;
      const words = el("span", "onb-mail-words");
      words.append(el("b", "", m.name));
      if (m.flag) words.append(el("span", "onb-flag", m.flag));
      words.append(el("span", "onb-subject", m.subject));
      const pick = (choice: PracticeChoice) => () => {
        row.classList.add(`gone-${choice}`);
        window.setTimeout(() => {
          answers = { ...answers, sorted: { ...answers.sorted, [m.kind]: choice } };
          if (m.kind === "scam")
            kai.say(
              choice === "keep"
                ? "Careful. That one was fake. Real companies don't lock you out by email."
                : "Good catch. That one was fake.",
              choice === "keep" ? "worried" : "happy",
            );
          render();
        }, 380);
      };
      const acts = el("span", "onb-acts");
      acts.append(
        button("Keep", "onb-mini", pick("keep")),
        button("Later", "onb-mini", pick("later")),
        button("Let go", "onb-mini", pick("trash")),
      );
      row.append(av, words, acts);
      inbox.append(row);
    }
    if (left.length === 0)
      inbox.append(el("p", "onb-sub", "All sorted. Cluster will treat mail like these the same way."));
    const count = (c: PracticeChoice) => Object.values(answers.sorted).filter((v) => v === c).length;
    body.append(
      inbox,
      el("p", "onb-tally", `Keep ${count("keep")} · Later ${count("later")} · Let go ${count("trash")}`),
      nav(left.length === 0),
    );
  }

  function renderKeep(body: HTMLElement) {
    body.append(
      ...heading("Step 3 of 4", "What should always stay?", "These never leave your inbox on their own."),
    );
    const opts = el("div", "onb-opts");
    const choices: Array<[KeepKind, string, string, string, string]> = [
      ["bank", "Bank and bills", "", "bank", "#1f9d63"],
      ["work", "Work", "", "brief", "#f08a24"],
      ["travel", "Travel", "", "plane", "#2f6fe4"],
      ["receipts", "Receipts and orders", "", "receipt", "#12a594"],
      ["people", "People you write to", "Always on", "chat", "#4f5bd5"],
    ];
    for (const [kind, label, sub, icon, color] of choices) {
      const on = kind === "people" || answers.keep.includes(kind);
      const toggle = () => {
        const keep = answers.keep.includes(kind)
          ? answers.keep.filter((k) => k !== kind)
          : [...answers.keep, kind];
        answers = { ...answers, keep };
        render();
      };
      opts.append(option(label, sub, icon, color, on, toggle, kind === "people"));
    }
    body.append(opts, nav(true));
  }

  function renderHands(body: HTMLElement) {
    body.append(...heading("Step 4 of 4", "How hands-on?", "You can change this in Organize."));
    const opts = el("div", "onb-opts");
    const choose = (hands: "ask" | "tidy") => () => {
      answers = { ...answers, hands };
      render();
    };
    opts.append(
      option(
        "Ask me first",
        "Nothing moves until you say so",
        "eye",
        "#71717a",
        answers.hands === "ask",
        choose("ask"),
      ),
      option(
        "Tidy for me",
        "New mail sorts itself, and you can undo",
        "spark",
        "#18181b",
        answers.hands === "tidy",
        choose("tidy"),
      ),
    );
    body.append(opts, nav(Boolean(answers.hands)));
  }

  function renderPlan(body: HTMLElement) {
    const plan = buildOnboardingPlan(answers);
    body.append(
      ...heading("Your plan", "Here's what Cluster will do", "Change any of it later in Settings."),
    );
    const list = el("ul", "onb-plan");
    plan.lines.forEach((line, i) => {
      const li = el("li");
      li.style.animationDelay = `${i * 90}ms`;
      const words = el("span", "", line.text);
      if (line.sub) words.append(el("small", "", line.sub));
      li.append(iconTile("check", "#1f9d63"), words);
      list.append(li);
    });
    const start = async () => {
      const go = $<HTMLButtonElement>("setup-go");
      if (go) {
        go.disabled = true;
        go.textContent = "Setting up…";
      }
      try {
        const { simple, tidyFailed } = await startPlan(answers);
        kai.say(
          tidyFailed
            ? "Saved. Gmail didn't take the filters yet, so turn them on in Organize."
            : KAI_LINES.done,
          "happy",
        );
        await select(simple ? "simple" : "overview");
      } catch (err) {
        log.error("Setup could not be saved", err);
        if (go) {
          go.disabled = false;
          go.textContent = "Try again";
        }
      }
    };
    body.append(
      list,
      nav(true, "Start", () => void start()),
    );
  }

  function render(newStep = false) {
    const step = STEPS[at];
    if (newStep) {
      scene.replaceChildren(parseSvg(SCENES[step]));
      kai.say(KAI_LINES[step], step === "plan" ? "proud" : undefined);
      if (!saidHello) {
        kai.wave();
        saidHello = true;
      }
    }
    const dots = el("div", "onb-dots");
    dots.setAttribute("aria-label", `Step ${Math.min(at + 1, 4)} of 4`);
    STEPS.forEach((_, i) => dots.append(el("i", i <= at ? "on" : "")));
    const body = el("div", newStep ? "onb-body onb-in" : "onb-body");
    ({ who: renderWho, try: renderPractice, keep: renderKeep, hands: renderHands, plan: renderPlan })[step](
      body,
    );
    pane.replaceChildren(dots, body);
  }

  skip.onclick = async () => {
    kai.stop();
    ctx.settings = await updateSettings({ setupDone: true });
    renderSettingsSetup();
    await select("overview");
  };

  const change = $<HTMLButtonElement>("settings-change-setup");
  if (change)
    change.onclick = () => {
      answers = freshAnswers();
      at = 0;
      render(true);
      void select("setup");
    };
  render(true);

  const simpleToggle = $<HTMLInputElement>("simple-mode-toggle");
  if (simpleToggle) {
    simpleToggle.onchange = async () => {
      ctx.settings = await updateSettings({ simpleMode: simpleToggle.checked });
      applySimpleMode(simpleToggle.checked);
    };
  }
  const simpleOff = $<HTMLButtonElement>("simple-off");
  if (simpleOff) {
    simpleOff.onclick = async () => {
      ctx.settings = await updateSettings({ simpleMode: false });
      applySimpleMode(false);
      await select("overview");
    };
  }
  const seeHeld = $<HTMLButtonElement>("simple-see-scams");
  if (seeHeld) seeHeld.onclick = () => void select("impersonation");
}
