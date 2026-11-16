// First-run setup, after the welcome (welcome.ts) and sign-in:
//
// 1. scan: Cluster reads the newest 100 emails and the companies pop in as they're found.
// 2. board: up to 8 of them already in Cluster's guess; drag (or tap, then tap a
//    label) any that look wrong. Only moves are saved, as sender corrections.
// 3. one question, "Tidy for me" or "Ask me first", then Start.
// research/2026-11-15-onboarding-two-sources.md. Only Start changes anything;
// Gmail filters are made only for "Tidy for me".
import "./kai/kaiLife.js";
import type { KaiAction, KaiInstance, KaiMood } from "./kai/kaiLife";
import type { ClusterSettings } from "../lib/settingsStore";
import { updateSettings } from "../lib/settingsStore";
import { log } from "../lib/log";
import { buildOnboardingPlan, type OnboardingAnswers } from "../lib/onboardingPlan";
import { ctx } from "./state";
import { gmailLabelIcon, icon } from "./homeDashboard";
import { senderTile } from "./senderTile";
import { mapWithConcurrency } from "../lib/concurrency";
import { boardOverride, isCompanyMail, pickPracticeSenders, type BoardSpot, type PracticeMail, type PracticeSender } from "../lib/practiceSenders";
import type { SortOverride } from "../lib/sortTaxonomy";
import { renderTimeLimits, turnOnTimeLimits } from "./timeLimitsTab";
import { countMailbox } from "../lib/gmailApi";
import { readTimeText } from "../lib/gmailQuotaLedger";
import { MAIL_INDEX_CAP, MAIL_INDEX_MAX } from "../lib/mailIndex";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { ALL_SORT_BUCKETS } from "../lib/sortTaxonomy";
import { categoryLabelName } from "../lib/categoryFilters";
import { CLUSTER_LABEL_COLORS, showLabel } from "../lib/clusterLabels";
import { ONBOARDING_STEPS, progressBar } from "./welcome";
import { registrableDomain } from "../lib/registrableDomain";

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

type Step = "scan" | "board" | "hands";
// "board" drops out when the scan finds no company mail.
let STEPS: Step[] = ["scan", "board", "hands"];

// What Kai says beside an option when you point at it.
const HINTS: Record<string, string> = {
  ask: "I'll show you first. You decide.",
  tidy: "I sort new mail myself.",
  "read-newest": "Quicker to start.",
  "read-all": "Every email. Takes longer.",
};

const SCAN_MAX = 100;
const SCAN_MS = 10_000;
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/** Reads the newest mail one message at a time (each one reported as it lands), for at most 10 s. */
async function scanNewest(onMail: (m: PracticeMail, read: number) => void): Promise<PracticeMail[]> {
  const mail: PracticeMail[] = [];
  const read = (async () => {
    const token = await gmailProvider.getAuthToken(false);
    const stubs = await gmailProvider.listCandidateMessages(token, SCAN_MAX, 30);
    await mapWithConcurrency(stubs.slice(0, SCAN_MAX), 6, async (stub) => {
      const m = await gmailProvider.getMessageMetadata(token, stub.id).catch(() => null);
      if (!m) return;
      const one: PracticeMail = {
        fromAddress: m.fromAddress,
        fromDisplayName: m.fromDisplayName,
        subject: m.subject,
        promotion: m.gmailPromotion,
        listMail: Boolean(m.unsubscribe?.postUrl || m.unsubscribe?.httpUrl || m.unsubscribe?.mailto),
      };
      mail.push(one);
      onMail(one, mail.length);
    });
  })().catch((err: unknown) => log.error("Setup could not read recent senders", err));
  await Promise.race([read, wait(SCAN_MS)]);
  return [...mail];
}

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
async function startPlan(
  answers: OnboardingAnswers,
  readCap: number,
  corrections: Record<string, SortOverride> = {},
): Promise<{ tidyFailed: boolean }> {
  const plan = buildOnboardingPlan(answers);
  const patch: Partial<ClusterSettings> = {
    readCap,
    sortOverrides: { ...ctx.settings.sortOverrides, ...corrections },
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
  // Counted on the last step (16 quota units, nothing read). Only a mailbox
  // over 20,000 gets the question; smaller ones are read in full.
  let mailCount: number | null | undefined;
  let readAll = false;
  // The scan: companies as they're found, then the board's senders.
  const seen = new Map<string, { address: string; name: string }>();
  let readSoFar = 0;
  let found: PracticeSender[] | null = null;
  // Where each board sender sits (by host); missing means Cluster's guess.
  const placed = new Map<string, BoardSpot>();
  let selected = "";
  const spotOf = (p: PracticeSender): BoardSpot => placed.get(p.host) ?? p.guess;
  const corrections = () => {
    const out: Record<string, SortOverride> = {};
    for (const p of found ?? []) {
      const saved = boardOverride(p, spotOf(p));
      if (saved) out[saved[0]] = saved[1];
    }
    return out;
  };
  const spotParts = (spot: BoardSpot) => {
    if (spot === "keep") return { emoji: "📥", name: "Keep in inbox" };
    const [emoji, ...rest] = showLabel(categoryLabelName(spot, ctx.settings.labelChoices)).split(" ");
    return { emoji, name: rest.join(" ") };
  };
  const hello = () => (ctx.settings.userName ? `Hi ${ctx.settings.userName}! ` : "");

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
  ) => {
    const b = el("button", `onb-opt${picked === key ? " picked" : ""}`);
    b.type = "button";
    b.setAttribute("aria-pressed", String(pressed));
    b.dataset.pick = key;
    const words = el("span", "onb-words");
    words.append(el("b", "", label));
    if (sub) words.append(el("small", "", sub));
    const tick = el("span", "onb-chk");
    tick.append(icon("check"));
    b.append(iconTile(ic, tone), words, tick);
    b.onclick = () => {
      stopTour();
      hinted = key;
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
    // The scan can't be gone back to.
    if (at > 0 && STEPS[at - 1] !== "scan") row.append(button("Back", "onb-btn ghost", () => goTo(at - 1)));
    row.append(el("span", "grow"));
    const next = button(label, "onb-btn dark", go, !canGo);
    next.id = STEPS[at] === "hands" ? "setup-go" : "setup-next";
    row.append(next);
    return row;
  };

  const heading = (title: string) => [el("h1", "onb-title", title)];

  /** One company tile for the scan grid. */
  const scanTile = (address: string, name: string) => {
    const li = el("li", "scan-tile");
    li.append(senderTile(address, name, "sz-44"), el("span", "", name));
    return li;
  };

  function renderScan(body: HTMLElement) {
    body.append(...heading("Reading your mail"));
    const count = el("p", "onb-count", `${readSoFar} emails`);
    count.id = "scan-count";
    const bar = el("div", "scan-bar");
    const fill = el("span");
    fill.style.width = `${Math.min(100, (readSoFar / SCAN_MAX) * 100)}%`;
    bar.append(fill);
    const grid = el("ul", "scan-grid");
    grid.id = "scan-grid";
    for (const s of seen.values()) grid.append(scanTile(s.address, s.name));
    body.append(count, bar, grid);
  }

  /** A message read mid-scan: count up, and a new company pops into the grid. */
  function onScanned(m: PracticeMail, read: number) {
    readSoFar = read;
    const count = pane.querySelector("#scan-count");
    if (count) count.textContent = `${read} emails`;
    pane.querySelector<HTMLElement>(".scan-bar span")?.style.setProperty("width", `${Math.min(100, (read / SCAN_MAX) * 100)}%`);
    if (!isCompanyMail(m)) return;
    const key = registrableDomain(m.fromAddress.toLowerCase().split("@")[1] ?? "");
    if (seen.has(key) || seen.size >= 12) return;
    const name = m.fromDisplayName.trim() || key;
    seen.set(key, { address: m.fromAddress, name });
    pane.querySelector("#scan-grid")?.append(scanTile(m.fromAddress, name));
    if (seen.size === 6) kai.say("Lots of companies here.");
  }

  /** Up to 8 senders already in Cluster's guess; drag, or tap one then tap a label. */
  function renderBoard(body: HTMLElement) {
    const senders = found ?? [];
    body.append(...heading("Here's how I'd sort them"));
    const spots: BoardSpot[] = [...new Set(senders.map((p) => p.guess)), "keep"];
    const board = el("div", `board${selected ? " picking" : ""}`);
    for (const spot of spots) {
      const { emoji, name } = spotParts(spot);
      const col = el("section", "board-col");
      col.dataset.spot = spot;
      const head = el("button", "board-head");
      head.type = "button";
      head.append(el("span", "board-emoji", emoji), el("b", "", name));
      head.setAttribute("aria-label", selected ? `Move here: ${name}` : name);
      const chips = el("div", "board-chips");
      for (const p of senders.filter((x) => spotOf(x) === spot)) {
        const chip = el("button", `board-chip${selected === p.host ? " on" : ""}`);
        chip.type = "button";
        chip.draggable = true;
        chip.dataset.host = p.host;
        chip.setAttribute("aria-pressed", String(selected === p.host));
        chip.append(senderTile(p.address, p.name, "sz-26"), el("span", "", p.name));
        chip.onclick = (e) => {
          e.stopPropagation();
          selected = selected === p.host ? "" : p.host;
          stopTour();
          render();
          if (selected) {
            // Beside the board, never on top of it; Kai looks at the pick.
            kai.goTo(pane.querySelector(".board"));
            kai.pointAt(pane.querySelector(`[data-host="${CSS.escape(p.host)}"]`) ?? pane);
            kai.say(`Now tap where ${p.name} goes.`);
          }
        };
        chip.ondragstart = (e) => {
          stopTour();
          e.dataTransfer?.setData("text/plain", p.host);
          chip.classList.add("dragging");
        };
        chip.ondragend = () => chip.classList.remove("dragging");
        chips.append(chip);
      }
      col.ondragover = (e) => {
        e.preventDefault();
        col.classList.add("over");
      };
      col.ondragleave = () => col.classList.remove("over");
      col.ondrop = (e) => {
        e.preventDefault();
        col.classList.remove("over");
        const host = e.dataTransfer?.getData("text/plain");
        if (host) move(host, spot);
      };
      // The header (a button, for the keyboard) or anywhere in the column takes the picked sender.
      col.onclick = () => {
        if (selected) move(selected, spot);
      };
      col.append(head, chips);
      board.append(col);
    }
    body.append(board, nav(true, "Looks good"));
  }

  /** Moves a board sender, sliding every chip from where it was (FLIP). */
  function move(host: string, spot: BoardSpot) {
    const p = (found ?? []).find((x) => x.host === host);
    selected = "";
    if (!p || spotOf(p) === spot) {
      render();
      return;
    }
    const before = new Map<string, DOMRect>();
    pane.querySelectorAll<HTMLElement>(".board-chip").forEach((c) => before.set(c.dataset.host ?? "", c.getBoundingClientRect()));
    if (spot === p.guess) placed.delete(host);
    else placed.set(host, spot);
    render();
    if (!reducedMotion()) {
      pane.querySelectorAll<HTMLElement>(".board-chip").forEach((c) => {
        const was = before.get(c.dataset.host ?? "");
        if (!was || typeof c.animate !== "function") return;
        const now = c.getBoundingClientRect();
        const dx = was.left - now.left;
        const dy = was.top - now.top;
        if (dx || dy) c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 420, easing: SPRING });
      });
    }
    const col = pane.querySelector(`[data-spot="${spot}"]`);
    const { emoji, name } = spotParts(spot);
    kai.goTo(pane.querySelector(".board"));
    if (col) kai.react(col, "nodSmall", emoji);
    kai.say(spot === "keep" ? `Got it. ${p.name} stays in your inbox.` : `Got it. ${p.name} goes to ${name}.`);
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
      option("ask", "Ask me first", "", "eye", "gray", answers.hands === "ask", choose("ask")),
      option("tidy", "Tidy for me", "New mail sorts itself", "sparkles", "purple", answers.hands === "tidy", choose("tidy")),
    );
    const readChoice = renderReadChoice();
    const tidy = buildOnboardingPlan(answers).tidy;
    body.append(opts, ...(readChoice ? [readChoice] : []), nav(true, tidy ? "Sort my inbox" : "Save", () => void start()));
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
          if (n > MAIL_INDEX_CAP && STEPS[at] === "hands") render();
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

  async function start() {
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
      const { tidyFailed } = await startPlan(answers, readAll ? MAIL_INDEX_MAX : MAIL_INDEX_CAP, corrections());
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
        pane.replaceChildren(progressBar(ONBOARDING_STEPS), body);
        kai.goTo(body.querySelector(".onb-title"));
        const reading =
          typeof mailCount === "number" && mailCount > 0
            ? ` Sorting ${Math.min(mailCount, readAll ? MAIL_INDEX_MAX : MAIL_INDEX_CAP).toLocaleString("en-US")} emails.`
            : "";
        kai.say(`All ${on.length} labels ready.${reading}`, "joyful");
        kai.celebrate();
        await wait(1800 + on.length * 50);
      } else {
        kai.say(tidyFailed ? "Saved. Turn on the filters in Labels." : "All set. Reading your mail now.", "happy");
        // Long enough to see "All set", short enough not to wait on it.
        await wait(400);
      }
      await select("overview");
    } catch (err) {
      log.error("Setup could not be saved", err);
      if (go) {
        go.disabled = false;
        go.textContent = "Try again";
      }
    }
  }

  function render(newStep = false) {
    const step = STEPS[at];
    if (newStep) {
      picked = "";
      hinted = "";
    }
    // Name and email were the first two, on the welcome screens.
    const done = 2 + ((ONBOARDING_STEPS - 2) * at) / STEPS.length;
    const body = el("div", newStep ? "onb-body onb-in" : "onb-body");
    ({ scan: renderScan, board: renderBoard, hands: renderHands })[step](body);
    pane.replaceChildren(progressBar(done), body);
    picked = "";
    if (newStep) guide(step);
  }

  /** Kai's walk for a new step: to the title with the line, then to what matters next. */
  function guide(step: Step) {
    kai.goTo(pane.querySelector(".onb-title"));
    if (!saidHello) {
      kai.wave();
      saidHello = true;
    }
    if (step === "scan") {
      kai.say(`${hello()}Reading your newest mail.`);
    } else if (step === "board") {
      kai.say("Here's my guess.", "proud");
      walk([
        [2200, () => { kai.goTo(pane.querySelector(".board")); kai.pointAt(pane.querySelector(".board-chip") ?? pane); kai.say("Drag any that look wrong."); }],
        [3200, () => { kai.goTo(pane.querySelector("#setup-next")); kai.say("Or tap Looks good."); }],
      ]);
    } else {
      kai.say("Last one. Should I sort, or ask first?");
      walk([[2400, () => { kai.goTo(pickEl("tidy")); kai.say(HINTS.tidy); }]]);
    }
  }

  skip.onclick = async () => {
    stopTour();
    kai.stop();
    ctx.settings = await updateSettings({ setupDone: true });
    await select("overview");
  };

  STEPS = ["scan", "board", "hands"];
  render(true);
  // Setup draws behind the sign-in screen; the scan starts once signed in.
  beginScan = () => {
    beginScan = () => {};
    if (ctx.settings.setupDone) return;
    if (STEPS[at] === "scan") guide("scan");
    const shownAt = Date.now();
    void scanNewest(onScanned).then(async (mail) => {
      // Long enough to watch the companies land.
      await wait(Math.max(0, 2500 - (Date.now() - shownAt)));
      found = pickPracticeSenders(mail, 8);
      if (ctx.settings.setupDone) return;
      if (found.length === 0) STEPS = STEPS.filter((st) => st !== "board");
      else kai.say(`Found ${seen.size} companies.`, "joyful");
      if (STEPS[at] === "scan") {
        await wait(found.length ? 900 : 0);
        if (!ctx.settings.setupDone) goTo(at + 1);
      }
    });
  };
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

let beginScan = () => {};
/** Called once Gmail is signed in: starts setup's scan of the newest mail. */
export function setupSignedIn(): void {
  beginScan();
}
