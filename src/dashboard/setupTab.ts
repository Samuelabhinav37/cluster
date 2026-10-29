// Settings page, simple mode and first-run setup.
//
// - Simple mode: bigger text, and the nav shows only Home, Scams and
//   Settings. Home (data-screen="simple") says whether you're protected,
//   how much was held, and one safety tip.
// - Setup (research/2026-10-29-onboarding.md): four questions and a plan,
//   one per screen. On the right, Kai and a card that fills in as you answer
//   (research/2026-10-29-onboarding-audit.md). Step 2 is a practice
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
import { icon } from "./homeDashboard";
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

/** A Lucide icon on a gradient squircle, like the app icons on Home. */
function iconTile(name: string, tone: string): HTMLElement {
  const tile = el("span", `onb-ic tone-${tone}`);
  tile.append(icon(name));
  return tile;
}

type Step = "who" | "try" | "keep" | "hands" | "plan";
const STEPS: Step[] = ["who", "try", "keep", "hands", "plan"];

// What Kai says on each step: one short line, like Duolingo's owl.
const KAI_LINES: Record<Step | "done", string> = {
  who: "Hi, I'm Kai. Let's set up Cluster.",
  try: "Practice mail. One of these is fake.",
  keep: "What should never move?",
  hands: "Should I wait for you?",
  plan: "Nothing changes until you press Start.",
  done: "All set. I'm reading your mail now.",
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

const GONE_LABEL: Record<PracticeChoice, string> = { keep: "Kept", later: "Later", trash: "Let go" };

const VOICE_PREF = "cluster.kaiVoice";

/** Kai at the top of the preview: a small bubble that types the line, and an optional voice. */
function kaiNarrator(host: HTMLElement) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const bubble = el("p", "onb-bubble");
  bubble.id = "setup-kai-line";
  bubble.setAttribute("aria-live", "polite");
  const kaiHost = el("div", "onb-kai");
  const voiceBtn = el("button", "onb-voice");
  voiceBtn.type = "button";
  voiceBtn.setAttribute("aria-label", "Hear Kai");
  voiceBtn.title = "Hear Kai";
  voiceBtn.append(icon("volume"));
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
  host.append(kaiHost, bubble, voiceBtn);
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
        kai.talk(Math.min(3000, text.length * 45));
      }
      speak(text);
      // Restart the pop from the tail for each new line.
      bubble.classList.remove("pop");
      void bubble.offsetWidth;
      bubble.classList.add("pop");
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
      }, 22);
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

const WHO_LABEL: Record<Who, string> = {
  me: "Just me",
  business: "I run a business",
  safe: "Keep me safe",
  busy: "Lots of people email me",
};

export function wireSetup(select: (screen: string) => Promise<void>): void {
  const root = $("setup-flow");
  if (!root) return;
  const pane = el("div", "onb-pane");
  // The right side: the sign-in photo, Kai, and a card that fills in as you answer.
  const kaiSpot = el("div", "onb-kai-spot");
  const card = el("div", "onb-card");
  const cardList = el("ul", "onb-card-list");
  card.append(el("p", "onb-card-title", "Your Cluster"), cardList);
  const art = el("div", "onb-art");
  art.append(kaiSpot, card);
  const skip = el("button", "onb-skip", "I'll set it up myself");
  skip.type = "button";
  skip.id = "setup-not-now";
  const top = el("div", "onb-top");
  const logo =
    document.querySelector("#connect-gate .connect-logo")?.cloneNode(true) ??
    el("div", "connect-logo", "Cluster");
  top.append(logo, skip);
  const side = el("div", "onb-side");
  side.append(top, pane);
  root.replaceChildren(side, art);
  const kai = kaiNarrator(kaiSpot);

  let answers = freshAnswers();
  let at = 0;
  let saidHello = false;
  // What just changed, so only that piece animates on the next render.
  let picked = "";
  let bumped: PracticeChoice | "" = "";
  let couldGo = false;
  let shown = new Set<string>();

  const button = (label: string, className: string, onClick: () => void, disabled = false) => {
    const b = el("button", className, label);
    b.type = "button";
    b.disabled = disabled;
    b.onclick = onClick;
    return b;
  };

  const option = (
    key: string,
    label: string,
    sub: string,
    ic: string,
    tone: string,
    pressed: boolean,
    onClick: () => void,
    locked = false,
  ) => {
    const b = el("button", `onb-opt${picked === key ? " picked" : ""}`);
    b.type = "button";
    b.setAttribute("aria-pressed", String(pressed));
    if (locked) b.setAttribute("aria-disabled", "true");
    const words = el("span", "onb-words");
    words.append(el("b", "", label));
    if (sub) words.append(el("small", "", sub));
    const tick = el("span", "onb-chk");
    tick.append(icon("check"));
    b.append(iconTile(ic, tone), words, tick);
    b.onclick = () => {
      if (locked) return;
      picked = key;
      onClick();
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
    // Continue lifts once when it unlocks.
    if (canGo && !couldGo) next.classList.add("ready");
    couldGo = canGo;
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
    const choices: Array<[Who, string, string, string]> = [
      ["me", "Personal mail", "user", "blue"],
      ["business", "Invoices, suppliers, clients", "briefcase", "orange"],
      ["safe", "Scams worry me most", "shield-check", "indigo"],
      ["busy", "I need to find people fast", "users", "purple"],
    ];
    for (const [who, sub, ic, tone] of choices) {
      const b = option(`who-${who}`, WHO_LABEL[who], sub, ic, tone, answers.who === who, () => {
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
        if (row.dataset.gone) return;
        row.dataset.gone = GONE_LABEL[choice];
        row.classList.add(`gone-${choice}`);
        window.setTimeout(() => {
          answers = { ...answers, sorted: { ...answers.sorted, [m.kind]: choice } };
          bumped = choice;
          if (m.kind === "scam")
            kai.say(
              choice === "keep" ? "Careful. That one was fake." : "Good catch. That one was fake.",
              choice === "keep" ? "worried" : "happy",
            );
          render();
        }, 420);
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
    if (left.length === 0) {
      const done = el("p", "onb-done");
      done.append(
        iconTile("check", "green"),
        el("span", "", "All sorted. Cluster will treat mail like this the same way."),
      );
      inbox.append(done);
    }
    const tally = el("p", "onb-tally");
    for (const c of ["keep", "later", "trash"] as const) {
      const n = Object.values(answers.sorted).filter((v) => v === c).length;
      const part = el("span", bumped === c ? "bump" : "");
      part.append(`${GONE_LABEL[c]} `, el("b", "", String(n)));
      tally.append(part);
    }
    bumped = "";
    body.append(inbox, tally, nav(left.length === 0));
  }

  function renderKeep(body: HTMLElement) {
    body.append(
      ...heading("Step 3 of 4", "What should always stay?", "These never leave your inbox on their own."),
    );
    const opts = el("div", "onb-opts");
    const choices: Array<[KeepKind, string, string, string, string]> = [
      ["bank", "Bank and bills", "", "landmark", "green"],
      ["work", "Work", "", "briefcase", "orange"],
      ["travel", "Travel", "", "plane", "blue"],
      ["receipts", "Receipts and orders", "", "receipt", "teal"],
      ["people", "People you write to", "Always on", "message", "indigo"],
    ];
    for (const [kind, label, sub, ic, tone] of choices) {
      const on = kind === "people" || answers.keep.includes(kind);
      const toggle = () => {
        const keep = answers.keep.includes(kind)
          ? answers.keep.filter((k) => k !== kind)
          : [...answers.keep, kind];
        answers = { ...answers, keep };
        render();
      };
      opts.append(option(`keep-${kind}`, label, sub, ic, tone, on, toggle, kind === "people"));
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
        "ask",
        "Ask me first",
        "Nothing moves until you say so",
        "eye",
        "gray",
        answers.hands === "ask",
        choose("ask"),
      ),
      option(
        "tidy",
        "Tidy for me",
        "New mail sorts itself, and you can undo",
        "sparkles",
        "purple",
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
      li.style.setProperty("--i", String(i));
      const words = el("span", "", line.text);
      if (line.sub) words.append(el("small", "", line.sub));
      li.append(iconTile("check", "green"), words);
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
        if (go) {
          go.textContent = "All set";
          go.classList.add("done");
        }
        kai.say(tidyFailed ? "Saved. Turn on the filters in Organize." : KAI_LINES.done, "happy");
        // Let Kai's line land before Home opens.
        await new Promise((r) => window.setTimeout(r, 1100));
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

  /** The preview card: who you are, then the plan so far. New rows rise in. */
  function renderCard() {
    const plan = buildOnboardingPlan(answers);
    const rows: Array<{ text: string; ic: string; tone: string }> = [];
    if (answers.who) rows.push({ text: WHO_LABEL[answers.who], ic: "user", tone: "blue" });
    for (const line of plan.lines) rows.push({ text: line.text, ic: "check", tone: "green" });
    const now = new Set(rows.map((r) => r.text));
    cardList.replaceChildren(
      ...rows.map((r) => {
        const li = el("li", shown.has(r.text) ? "" : "new");
        li.append(iconTile(r.ic, r.tone), el("span", "", r.text));
        return li;
      }),
    );
    if (rows.length === 0) cardList.append(el("li", "onb-card-empty", "Your answers build your plan here."));
    shown = now;
  }

  function render(newStep = false) {
    const step = STEPS[at];
    if (newStep) {
      couldGo = true;
      picked = "";
      kai.say(KAI_LINES[step], step === "plan" ? "proud" : undefined);
      if (!saidHello) {
        kai.wave();
        saidHello = true;
      }
    }
    const dots = el("div", "onb-dots");
    dots.setAttribute("aria-label", `Step ${Math.min(at + 1, 4)} of 4`);
    STEPS.forEach((_, i) => dots.append(el("i", i < at ? "on" : i === at ? "on now" : "")));
    const body = el("div", newStep ? "onb-body onb-in" : "onb-body");
    ({ who: renderWho, try: renderPractice, keep: renderKeep, hands: renderHands, plan: renderPlan })[step](
      body,
    );
    pane.replaceChildren(dots, body);
    renderCard();
    picked = "";
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
