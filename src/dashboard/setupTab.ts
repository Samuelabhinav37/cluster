// First-run setup: opens once, for a new user.
//
// - Setup (research/2026-10-29-onboarding.md): four questions and a plan,
//   one per screen. On the right, Kai and a card that fills in as you answer
//   (research/2026-10-29-onboarding-audit.md). Round 2 (2026-10-30): three
//   questions and the plan, no practice inbox, no kickers or subtitles, gray
//   icons. 2026-11-15: "What describes you?" dropped (it changed nothing),
//   answers start on the defaults, Kai never repeats the title, calmer motion
//   (research/2026-11-15-animation-onboarding-apple.md). Answers are kept in settings.onboarding so Setup reopens with them, and only
//   Start changes anything. Gmail filters are made only for "Tidy for me".
import "./kai/kaiLife.js";
import type { KaiAction, KaiInstance, KaiMood } from "./kai/kaiLife";
import type { ClusterSettings } from "../lib/settingsStore";
import { updateSettings } from "../lib/settingsStore";
import { log } from "../lib/log";
import { buildOnboardingPlan, labelEmoji, type KeepKind, type OnboardingAnswers } from "../lib/onboardingPlan";
import { ctx } from "./state";
import { gmailLabelIcon, icon } from "./homeDashboard";
import { renderTimeLimits, turnOnTimeLimits } from "./timeLimitsTab";
import { countMailbox } from "../lib/gmailApi";
import { readTimeText } from "../lib/gmailQuotaLedger";
import { MAIL_INDEX_CAP, MAIL_INDEX_MAX } from "../lib/mailIndex";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { ALL_SORT_BUCKETS } from "../lib/sortTaxonomy";
import { categoryLabelName } from "../lib/categoryFilters";
import { CLUSTER_LABEL_COLORS, showLabel } from "../lib/clusterLabels";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

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

const isEmoji = (name: string) => /^\p{Extended_Pictographic}/u.test(name);

/** A label emoji, or a Lucide icon, on a soft tile. */
function iconTile(name: string, tone: string): HTMLElement {
  const tile = el("span", `onb-ic tone-${tone}${isEmoji(name) ? " onb-emoji" : ""}`);
  if (isEmoji(name)) tile.textContent = name;
  else tile.append(icon(name));
  return tile;
}

/** The same in a soft circle for plan rows, like the lists elsewhere. */
function glyph(name: string): HTMLElement {
  const g = el("span", `onb-glyph${isEmoji(name) ? " onb-emoji" : ""}`);
  if (isEmoji(name)) g.textContent = name;
  else g.append(icon(name));
  return g;
}

type Step = "keep" | "hands" | "plan";
const STEPS: Step[] = ["keep", "hands", "plan"];

// What Kai says on each step: one short line the title doesn't already say.
const KAI_LINES: Record<Step | "done", string> = {
  keep: "Hi, I'm Kai. Pick what stays.",
  hands: "Should I sort, or ask first?",
  plan: "Here's what I'll do.",
  done: "All set. Reading your mail now.",
};

// What Kai says beside an option when you point at it.
const HINTS: Record<string, string> = {
  "keep-bank": "Bills and statements stay in view.",
  "keep-work": "Work mail stays put.",
  "keep-travel": "Trips stay where you can see them.",
  "keep-receipts": "Receipts and orders stay too.",
  "keep-people": "People always stay. That one's fixed.",
  ask: "I'll show you first. You decide.",
  tidy: "I sort new mail myself.",
  "read-newest": "Quicker to start.",
  "read-all": "Every email. Takes longer.",
};

const VOICE_PREF = "cluster.kaiVoice";
const SPRING = "linear(0, 0.062, 0.198, 0.356, 0.509, 0.642, 0.75, 0.833, 0.895, 0.938, 0.967, 0.985, 0.996, 1.003, 1.005, 1.006, 1)";

/** Kai as a guide: moves beside what it talks about, with a bubble that types the line. */
function kaiNarrator(stage: HTMLElement) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const host = el("div", "onb-guide");
  stage.append(host);
  let at = { x: 0, y: 0 };
  let placed = false;
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
      clearInterval(typing);
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
      typing = setInterval(() => {
        n += 2;
        bubble.textContent = text.slice(0, n);
        if (n >= text.length) clearInterval(typing);
      }, 22);
    },
    wave() {
      kai?.do("wave");
    },
    celebrate() {
      kai?.do("celebrate");
    },
    /** One beat for a pick: look at it, then a small move and maybe its emoji. */
    react(target: Element, action: KaiAction, emoji?: string, mood?: KaiMood) {
      if (!kai) return;
      kai.lookAt(target);
      kai.do(action);
      if (mood) kai.setMood(mood, 1600);
      if (emoji && !reduced) kai.emote(emoji);
    },
    pointAt(target: Element) {
      kai?.pointAt(target);
    },
    /** Kai travels to the right of `target` (above it when there's no room), looking at it. */
    goTo(target: Element | null) {
      if (!target) return;
      const r = target.getBoundingClientRect();
      const box = stage.getBoundingClientRect();
      const size = 96;
      let x = r.right - box.left + 20;
      let y = r.top - box.top + stage.scrollTop + r.height / 2 - size / 2;
      if (x + size + 280 > box.width) {
        x = Math.max(8, r.left - box.left);
        y = r.top - box.top + stage.scrollTop - size - 12;
      }
      const to = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      const moved = Math.hypot(x - at.x, y - at.y);
      if (reduced || typeof host.animate !== "function" || (placed && moved < 2)) {
        host.style.transform = to;
      } else {
        const from = placed
          ? `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`
          : `translate(${Math.round(x)}px, ${Math.round(y + 40)}px)`;
        host.animate([{ transform: from, opacity: placed ? 1 : 0 }, { transform: to, opacity: 1 }], {
          duration: placed ? Math.min(800, 380 + moved * 0.6) : 500,
          easing: SPRING,
        });
        host.style.transform = to;
        if (moved > 40) kai?.do("hop");
      }
      at = { x, y };
      placed = true;
      kai?.lookAt(target);
    },
    stop() {
      clearInterval(typing);
      if (canSpeak) speechSynthesis.cancel();
    },
  };
}

function freshAnswers(): OnboardingAnswers {
  const saved = ctx.settings.onboarding?.answers;
  return saved
    ? { who: saved.who, sorted: { ...saved.sorted }, keep: [...saved.keep], hands: saved.hands }
    : { sorted: {}, keep: ["people"], hands: "tidy" };
}

/** Saves the answers and applies the plan. Gmail filters only for "Tidy for me". */
async function startPlan(answers: OnboardingAnswers, readCap: number): Promise<{ tidyFailed: boolean }> {
  const plan = buildOnboardingPlan(answers);
  const patch: Partial<ClusterSettings> = {
    readCap,
    persona: plan.persona,
    setupDone: true,
    onboarding: { version: 1, answers, answeredAt: Date.now() },
    autoSort: {
      ...ctx.settings.autoSort,
      inboxHoursByBucket: { ...ctx.settings.autoSort.inboxHoursByBucket, ...plan.hours },
    },
  };
  if (plan.holdScams) patch.autoQuarantineHighRisk = true;
  ctx.settings = await updateSettings(patch);
  const quarantine = $<HTMLInputElement>("auto-quarantine-toggle");
  if (quarantine && plan.holdScams) quarantine.checked = true;
  renderTimeLimits();
  let tidyFailed = false;
  if (plan.tidy) {
    tidyFailed = !(await turnOnTimeLimits().catch((err: unknown) => {
      log.error("Setup could not turn on time limits", err);
      return false;
    }));
  }
  return { tidyFailed };
}

export function wireSetup(select: (screen: string) => Promise<void>): void {
  const root = $("setup-flow");
  if (!root) return;
  const pane = el("div", "onb-pane");
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
  root.replaceChildren(side);
  // Kai walks the page: title first, then the options, then Continue or Start.
  const kai = kaiNarrator(root);
  let tour: number[] = [];
  const stopTour = () => {
    tour.forEach((t) => window.clearTimeout(t));
    tour = [];
  };
  /** Steps Kai takes by itself, each `ms` after the last, until the user does something. */
  const walk = (steps: Array<[number, () => void]>) => {
    stopTour();
    let t = 0;
    for (const [ms, run] of steps) {
      t += ms;
      tour.push(window.setTimeout(run, t));
    }
  };
  const pickEl = (key: string) => pane.querySelector(`[data-pick="${key}"]`);
  let hinted = "";
  /** Kai goes to the option you point at and says what it does. */
  const hint = (key: string) => {
    if (key === hinted || !HINTS[key]) return;
    hinted = key;
    stopTour();
    kai.goTo(pickEl(key));
    kai.say(HINTS[key]);
  };

  let answers = freshAnswers();
  let at = 0;
  let saidHello = false;
  // What just changed, so only that piece animates on the next render.
  let picked = "";
  // Counted on the plan screen (16 quota units, nothing read). Only a mailbox
  // over 20,000 gets the question; smaller ones are read in full.
  let mailCount: number | null | undefined;
  let readAll = false;

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
    b.dataset.pick = key;
    if (locked) b.setAttribute("aria-disabled", "true");
    const words = el("span", "onb-words");
    words.append(el("b", "", label));
    if (sub) words.append(el("small", "", sub));
    const tick = el("span", "onb-chk");
    tick.append(icon("check"));
    b.append(iconTile(ic, tone), words, tick);
    b.onclick = () => {
      stopTour();
      hinted = key;
      if (locked) {
        kai.goTo(pickEl(key));
        if (HINTS[key]) kai.say(HINTS[key]);
        return;
      }
      picked = key;
      onClick();
      kai.goTo(pickEl(key));
    };
    b.onpointerenter = () => hint(key);
    b.onfocus = () => hint(key);
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
    const next = button(label, "onb-btn dark", go, !canGo);
    next.id = STEPS[at] === "plan" ? "setup-go" : "setup-next";
    row.append(next);
    return row;
  };

  const heading = (title: string) => [el("h1", "onb-title", title)];

  function renderKeep(body: HTMLElement) {
    body.append(
      ...heading("What should always stay?"),
    );
    const opts = el("div", "onb-opts");
    const choices: Array<[KeepKind, string, string, string, string]> = [
      ["bank", "Bank and bills", "", labelEmoji("finance"), "green"],
      ["work", "Work", "", labelEmoji("productivity"), "orange"],
      ["travel", "Travel", "", labelEmoji("travel"), "blue"],
      ["receipts", "Receipts and orders", "", labelEmoji("receipt"), "teal"],
      ["people", "People you write to", "", labelEmoji("personal"), "indigo"],
    ];
    for (const [kind, label, sub, ic, tone] of choices) {
      const on = kind === "people" || answers.keep.includes(kind);
      const toggle = () => {
        const adding = !answers.keep.includes(kind);
        const keep = adding ? [...answers.keep, kind] : answers.keep.filter((k) => k !== kind);
        answers = { ...answers, keep };
        render();
        const now = document.querySelector(`[data-pick="keep-${kind}"]`);
        if (now) kai.react(now, adding ? "nodSmall" : "tilt", adding ? ic : undefined);
      };
      opts.append(option(`keep-${kind}`, label, sub, ic, tone, on, toggle, kind === "people"));
    }
    body.append(opts, nav(true));
  }

  function renderHands(body: HTMLElement) {
    body.append(...heading("How hands-on?"));
    const opts = el("div", "onb-opts");
    const choose = (hands: "ask" | "tidy") => () => {
      answers = { ...answers, hands };
      render();
      const now = document.querySelector(`[data-pick="${hands}"]`);
      if (!now) return;
      if (hands === "tidy") {
        kai.react(now, "puff", undefined, "proud");
        kai.say("Nice. I'll keep it tidy.");
      } else {
        kai.react(now, "nod");
        kai.say("Fine by me. I'll wait.");
      }
    };
    opts.append(
      option(
        "ask",
        "Ask me first",
        "",
        "eye",
        "gray",
        answers.hands === "ask",
        choose("ask"),
      ),
      option(
        "tidy",
        "Tidy for me",
        "New mail sorts itself",
        "sparkles",
        "purple",
        answers.hands === "tidy",
        choose("tidy"),
      ),
    );
    body.append(opts, nav(Boolean(answers.hands)));
  }

  /** "You have 48,210 emails": read the newest 20,000, or all of them. */
  function renderReadChoice(): HTMLElement | null {
    if (mailCount === undefined) {
      mailCount = null;
      void gmailProvider
        .getAuthToken(false)
        .then(countMailbox)
        .then((n) => {
          mailCount = n;
          if (n > MAIL_INDEX_CAP && STEPS[at] === "plan") render();
        })
        .catch((err: unknown) => log.error("Setup could not count the mailbox", err));
    }
    if (!mailCount || mailCount <= MAIL_INDEX_CAP) return null;
    const all = Math.min(mailCount, MAIL_INDEX_MAX);
    const box = el("div", "onb-read");
    box.append(el("p", "onb-read-title", `You have ${mailCount.toLocaleString()} emails`));
    const opts = el("div", "onb-opts");
    opts.setAttribute("role", "group");
    opts.setAttribute("aria-label", "How much mail to read");
    const pick = (value: boolean) => () => {
      readAll = value;
      render();
    };
    opts.append(
      option("read-newest", `Newest ${MAIL_INDEX_CAP.toLocaleString()}`, readTimeText(MAIL_INDEX_CAP), "clock", "blue", !readAll, pick(false)),
      option(
        "read-all",
        all === mailCount ? `All ${all.toLocaleString()}` : `Newest ${all.toLocaleString()}`,
        readTimeText(all),
        "layers",
        "purple",
        readAll,
        pick(true),
      ),
    );
    box.append(opts);
    return box;
  }

  function renderPlan(body: HTMLElement) {
    const plan = buildOnboardingPlan(answers);
    body.append(
      ...heading("Here's your plan"),
    );
    const list = el("ul", "onb-plan");
    plan.lines.forEach((line, i) => {
      const li = el("li");
      li.style.setProperty("--i", String(i));
      const words = el("span", "", line.text);
      if (line.sub) words.append(el("small", "", line.sub));
      li.append(glyph(line.icon), words);
      list.append(li);
    });
    const start = async () => {
      // Asked on this click (a user gesture) so the scan can say when it's done.
      chrome.permissions?.request({ permissions: ["notifications"] }).catch(() => {});
      const go = $<HTMLButtonElement>("setup-go");
      if (go) {
        go.disabled = true;
        go.textContent = "Setting up…";
      }
      const tidy = buildOnboardingPlan(answers).tidy;
      stopTour();
      kai.goTo(go);
      if (tidy) kai.say("Making your labels.");
      try {
        const { tidyFailed } = await startPlan(answers, readAll ? MAIL_INDEX_MAX : MAIL_INDEX_CAP);
        if (go) {
          go.textContent = "All set";
          go.classList.add("done");
        }
        if (tidy && !tidyFailed) {
          // The milestone: every label Gmail now has, landing one by one, and one cheer.
          const on = ALL_SORT_BUCKETS.filter((b) => !ctx.settings.autoSort.labelsOff.includes(b));
          const chips = el("ul", "onb-labels");
          on.forEach((b, i) => {
            const chip = el("li");
            chip.style.setProperty("--i", String(i));
            chip.append(gmailLabelIcon(CLUSTER_LABEL_COLORS[b]?.backgroundColor), showLabel(categoryLabelName(b, ctx.settings.labelChoices)));
            chips.append(chip);
          });
          const body = el("div", "onb-body onb-in");
          body.append(el("h1", "onb-title", "Your labels"), chips);
          pane.replaceChildren(body);
          kai.goTo(body.querySelector(".onb-title"));
          kai.say(`All ${on.length} labels ready.`, "joyful");
          kai.celebrate();
          await new Promise((r) => window.setTimeout(r, 1800 + on.length * 50));
        } else {
          kai.say(tidyFailed ? "Saved. Turn on the filters in Labels." : KAI_LINES.done, "happy");
          // Long enough to see "All set", short enough not to wait on it.
          await new Promise((r) => window.setTimeout(r, 400));
        }
        await select("overview");
      } catch (err) {
        log.error("Setup could not be saved", err);
        if (go) {
          go.disabled = false;
          go.textContent = "Try again";
        }
      }
    };
    const readChoice = renderReadChoice();
    body.append(
      list,
      ...(readChoice ? [readChoice] : []),
      nav(true, "Start", () => void start()),
    );
  }

  function render(newStep = false) {
    const step = STEPS[at];
    if (newStep) {
      picked = "";
      hinted = "";
    }
    const dots = el("div", "onb-dots");
    dots.setAttribute("aria-label", `Step ${at + 1} of ${STEPS.length}`);
    STEPS.forEach((_, i) => dots.append(el("i", i < at ? "on" : i === at ? "on now" : "")));
    const body = el("div", newStep ? "onb-body onb-in" : "onb-body");
    ({ keep: renderKeep, hands: renderHands, plan: renderPlan })[step](
      body,
    );
    pane.replaceChildren(dots, body);
    picked = "";
    if (newStep) guide(step);
  }

  /** Kai's walk for a new step: to the title with the line, then to what matters next. */
  function guide(step: Step) {
    kai.goTo(pane.querySelector(".onb-title"));
    kai.say(KAI_LINES[step], step === "plan" ? "proud" : undefined);
    if (!saidHello) {
      kai.wave();
      saidHello = true;
    }
    const next = () => pane.querySelector<HTMLElement>(step === "plan" ? "#setup-go" : "#setup-next");
    if (step === "keep") {
      walk([
        [2600, () => { kai.goTo(pane.querySelector(".onb-opt")); kai.say("Tap one to keep it in your inbox."); }],
        [3200, () => { kai.goTo(next()); kai.say("Then Continue."); }],
      ]);
    } else if (step === "hands") {
      walk([[2400, () => { kai.goTo(pickEl("tidy")); kai.say(HINTS.tidy); }]]);
    } else {
      // Kai points down the plan one row at a time, then waits by Start.
      const rows = Array.from(pane.querySelectorAll(".onb-plan li"));
      walk([
        ...rows.map((row, i): [number, () => void] => [i === 0 ? 1600 : 900, () => { kai.goTo(row); kai.react(row, "nodSmall"); }]),
        [1000, () => { kai.goTo(next()); kai.say("Press Start when you're ready."); }],
      ]);
    }
  }

  skip.onclick = async () => {
    stopTour();
    kai.stop();
    ctx.settings = await updateSettings({ setupDone: true });
    await select("overview");
  };

  render(true);

}
