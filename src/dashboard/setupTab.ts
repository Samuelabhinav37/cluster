// First-run setup, after the welcome (welcome.ts) and sign-in. Duolingo
// style: Kai and a speech bubble at the top of each screen, one big button
// at the bottom (research/2026-11-15-onboarding-two-sources.md).
//
// 1. hello: Kai says hi by name and offers to show how it sorts.
// 2. label: "This is a label": one example email gets its label.
// 3. scan: the newest 100 emails are read (10 s cap) under a radar, and the
//    companies pop in as they're found.
// 4. found: "I found these", grouped under Cluster's labels. "Yes, use these"
//    (Tidy for me), "Change some" (drag or tap to move), or "No, ask me first".
// Then Kai heads to the dashboard and gives a short tour (dashboardTour.ts).
// Only the last button changes anything; only moved companies are saved.
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
import { categoryLabelName } from "../lib/categoryFilters";
import { CLUSTER_LABEL_COLORS, showLabel } from "../lib/clusterLabels";
import { progressBar } from "./welcome";
import { registrableDomain } from "../lib/registrableDomain";
import { startDashboardTour } from "./dashboardTour";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

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

type Step = "hello" | "label" | "scan" | "found";
const STEPS: Step[] = ["hello", "label", "scan", "found"];
/** The welcome's name and email come first. */
const BEFORE = 2;

const SCAN_MAX = 100;
const SCAN_MS = 10_000;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
const SPRING = "linear(0, 0.062, 0.198, 0.356, 0.509, 0.642, 0.75, 0.833, 0.895, 0.938, 0.967, 0.985, 0.996, 1.003, 1.005, 1.006, 1)";

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

/** Kai with a speech bubble that types the line, and an optional voice. One row, moved between screens. */
function kaiNarrator() {
  const reduced = reducedMotion();
  const row = el("div", "wel-ask onb-kai-row");
  const bubble = el("p", "onb-bubble wel-bubble");
  bubble.id = "setup-kai-line";
  bubble.setAttribute("aria-live", "polite");
  const kaiHost = el("div", "onb-kai wel-kai");
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
  const words = el("div", "onb-kai-words");
  words.append(bubble, voiceBtn);
  row.append(kaiHost, words);
  const kai: KaiInstance | null =
    ctx.settings.showKai && typeof window.Kai === "function"
      ? window.Kai(kaiHost, { src: "/characters/", imgWidth: 320, calm: true })
      : null;
  if (!kai) kaiHost.hidden = true;
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
    row,
    say(text: string, mood?: KaiMood) {
      last = text;
      clearInterval(typing);
      if (kai) {
        if (mood) kai.setMood(mood, 2400);
        kai.talk(Math.min(3000, text.length * 45));
      }
      speak(text);
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
        if (n >= text.length) clearInterval(typing);
      }, 22);
    },
    do(action: KaiAction) {
      kai?.do(action);
    },
    /** One beat for something on screen: look at it, a small move, and maybe its emoji. */
    react(target: Element, action: KaiAction, emoji?: string, mood?: KaiMood) {
      if (!kai) return;
      kai.lookAt(target);
      kai.do(action);
      if (mood) kai.setMood(mood, 1600);
      if (emoji && !reduced) kai.emote(emoji);
    },
    pointAt(target: Element | null) {
      if (target) kai?.pointAt(target);
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
  const kai = kaiNarrator();
  const timers: number[] = [];
  const later = (ms: number, run: () => void) => timers.push(window.setTimeout(run, ms));
  const clearLater = () => timers.splice(0).forEach((t) => window.clearTimeout(t));

  const answers = freshAnswers();
  let at = 0;
  let busy = false;
  // Counted on the last screen (16 quota units, nothing read). Only a mailbox
  // over 20,000 gets the question; smaller ones are read in full.
  let mailCount: number | null | undefined;
  let readAll = false;
  // The scan: companies as they're found, then the board's senders.
  const seen = new Map<string, { address: string; name: string }>();
  let readSoFar = 0;
  let scanned = false;
  let scanEnteredAt = 0;
  let signedIn = false;
  let found: PracticeSender[] = [];
  // Where each board sender sits (by host); missing means Cluster's guess.
  const placed = new Map<string, BoardSpot>();
  let changing = false;
  let selected = "";
  const spotOf = (p: PracticeSender): BoardSpot => placed.get(p.host) ?? p.guess;
  const corrections = () => {
    const out: Record<string, SortOverride> = {};
    for (const p of found) {
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
  const name = () => ctx.settings.userName;

  const button = (label: string, className: string, onClick: () => void, id = "") => {
    const b = el("button", className, label);
    b.type = "button";
    if (id) b.id = id;
    b.onclick = onClick;
    return b;
  };
  /** The one big raised button at the bottom of a screen. */
  const primary = (label: string, onClick: () => void, id = "setup-next") =>
    button(label, "connect-btn wel-go", onClick, id);

  const goTo = (step: number) => {
    clearLater();
    at = Math.max(0, Math.min(STEPS.length - 1, step));
    render(true);
  };

  function renderHello(body: HTMLElement) {
    body.append(el("h1", "onb-title", name() ? `You're in, ${name()}!` : "You're in!"));
    body.append(primary("Show me", () => goTo(at + 1)));
  }

  /** One example email, and its label landing on it. */
  function renderLabel(body: HTMLElement) {
    body.append(el("h1", "onb-title", "This is a label"));
    const demo = el("div", "lbl-demo");
    const mail = el("div", "lbl-mail");
    const words = el("span", "onb-words");
    words.append(el("b", "", "Amazon"), el("small", "", "Your order has shipped"));
    const tag = el("span", "lbl-tag");
    tag.append(gmailLabelIcon(CLUSTER_LABEL_COLORS.shipping?.backgroundColor), showLabel(categoryLabelName("shipping", ctx.settings.labelChoices)));
    mail.append(senderTile("ship-confirm@amazon.com", "Amazon", "sz-44"), words, tag);
    demo.append(mail);
    body.append(demo, primary("Got it", () => goTo(at + 1)));
  }

  /** One company tile for the scan grid. */
  const scanTile = (address: string, label: string) => {
    const li = el("li", "scan-tile");
    li.append(senderTile(address, label, "sz-44"), el("span", "", label));
    return li;
  };

  function renderScan(body: HTMLElement) {
    body.append(el("h1", "onb-title", "Scanning your emails"));
    const radar = el("div", "scan-radar");
    radar.setAttribute("aria-hidden", "true");
    radar.append(el("span", "scan-sweep"), el("span", "scan-ring"), el("span", "scan-ring r2"));
    const count = el("p", "onb-count");
    count.id = "scan-count";
    count.textContent = `${readSoFar} emails`;
    const head = el("div", "scan-head");
    const words = el("div", "");
    words.append(count, el("p", "scan-sub", "read so far"));
    head.append(radar, words);
    const grid = el("ul", "scan-grid");
    grid.id = "scan-grid";
    // Finished before this screen opened: the logos land one by one anyway.
    [...seen.values()].forEach((s, i) => {
      const tile = scanTile(s.address, s.name);
      tile.style.setProperty("--i", String(i));
      grid.append(tile);
    });
    body.append(head, grid);
  }

  /** A message read mid-scan: count up, and a new company pops into the grid. */
  function onScanned(m: PracticeMail, read: number) {
    readSoFar = read;
    const count = pane.querySelector("#scan-count");
    if (count) count.textContent = `${read} emails`;
    if (!isCompanyMail(m)) return;
    const key = registrableDomain(m.fromAddress.toLowerCase().split("@")[1] ?? "");
    if (seen.has(key) || seen.size >= 12) return;
    const label = m.fromDisplayName.trim() || key;
    seen.set(key, { address: m.fromAddress, name: label });
    pane.querySelector("#scan-grid")?.append(scanTile(m.fromAddress, label));
    if (STEPS[at] === "scan" && seen.size === 4) kai.say("Ooh, I know these.");
  }

  /** "I found these": companies under Cluster's labels. In change mode they move. */
  function renderFound(body: HTMLElement) {
    if (found.length === 0) {
      body.append(el("h1", "onb-title", "Ready to sort"));
    } else {
      body.append(el("h1", "onb-title", changing ? "Move any that are wrong" : "I found these"));
      if (changing) body.append(el("p", "onb-hint", "Drag a company to another label. Or tap it, then tap the label."));
      body.append(renderBoard());
    }
    const readChoice = renderReadChoice();
    if (readChoice) body.append(readChoice);
    const actions = el("div", "onb-actions");
    if (changing) {
      actions.append(
        primary("Done", () => {
          changing = false;
          selected = "";
          render();
          kai.say("Looks good to me. Shall we?", "happy");
        }),
      );
    } else {
      actions.append(primary(found.length ? "Yes, use these" : "Yes, sort my mail", () => void finish("tidy"), "setup-go"));
      if (found.length) {
        actions.append(
          button("Change some", "onb-btn ghost onb-wide", () => {
            changing = true;
            render();
            kai.say("Grab one and drop it on another label.");
            demoDrag();
          }, "setup-change"),
        );
      }
      actions.append(button("No, ask me first", "onb-link", () => void finish("ask"), "setup-ask"));
    }
    body.append(actions);
  }

  /** Kai shows the move once: the first company lifts and nudges toward the next label. */
  function demoDrag() {
    const chip = pane.querySelector<HTMLElement>(".board-chip");
    const cols = pane.querySelectorAll<HTMLElement>(".board-col");
    if (!chip || cols.length < 2 || reducedMotion() || typeof chip.animate !== "function") return;
    kai.pointAt(chip);
    const from = chip.getBoundingClientRect();
    const to = cols[1].getBoundingClientRect();
    const dx = to.left + 12 - from.left;
    const dy = to.top + 44 - from.top;
    later(500, () =>
      chip.animate(
        [
          { transform: "none" },
          { transform: "translateY(-6px) scale(1.04)", offset: 0.2 },
          { transform: `translate(${dx}px, ${dy}px) scale(1.04)`, offset: 0.6 },
          { transform: `translate(${dx}px, ${dy}px) scale(1.04)`, offset: 0.75 },
          { transform: "none" },
        ],
        { duration: 1800, easing: "ease-in-out" },
      ),
    );
  }

  function renderBoard(): HTMLElement {
    const spots: BoardSpot[] = [...new Set(found.map((p) => p.guess)), "keep"];
    const board = el("div", `board${changing ? " editing" : ""}${selected ? " picking" : ""}`);
    for (const spot of spots) {
      const { emoji, name: label } = spotParts(spot);
      const col = el("section", "board-col");
      col.dataset.spot = spot;
      const head = el("button", "board-head");
      head.type = "button";
      head.tabIndex = changing ? 0 : -1;
      head.append(el("span", "board-emoji", emoji), el("b", "", label));
      head.setAttribute("aria-label", selected ? `Move here: ${label}` : label);
      const chips = el("div", "board-chips");
      for (const p of found.filter((x) => spotOf(x) === spot)) {
        const chip = el("button", `board-chip${selected === p.host ? " on" : ""}`);
        chip.type = "button";
        chip.dataset.host = p.host;
        chip.setAttribute("aria-pressed", String(selected === p.host));
        if (changing) {
          chip.draggable = true;
          chip.append(el("span", "board-grip", "⠿"));
        } else chip.tabIndex = -1;
        chip.append(senderTile(p.address, p.name, "sz-26"), el("span", "board-name", p.name));
        chip.onclick = (e) => {
          e.stopPropagation();
          if (!changing) {
            // A tap outside change mode starts it, with this company picked.
            changing = true;
            kai.say("Grab one and drop it on another label.");
          }
          selected = selected === p.host ? "" : p.host;
          render();
          if (selected) kai.say(`Now tap where ${p.name} goes.`);
        };
        chip.ondragstart = (e) => {
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
      // The header (a button, for the keyboard) or anywhere in the column takes the picked company.
      col.onclick = () => {
        if (selected) move(selected, spot);
      };
      col.append(head, chips);
      board.append(col);
    }
    return board;
  }

  /** Moves a board company, sliding every chip from where it was (FLIP). */
  function move(host: string, spot: BoardSpot) {
    const p = found.find((x) => x.host === host);
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
    const { emoji, name: label } = spotParts(spot);
    if (col) kai.react(col, "nodSmall", emoji);
    kai.say(spot === "keep" ? `Got it. ${p.name} stays in your inbox.` : `Got it. ${p.name} goes to ${label}.`);
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
          if (n > MAIL_INDEX_CAP && STEPS[at] === "found") render();
        })
        .catch((err: unknown) => log.error("Setup could not count the mailbox", err));
    }
    if (!mailCount || mailCount <= MAIL_INDEX_CAP) return null;
    const all = Math.min(mailCount, MAIL_INDEX_MAX);
    const box = el("div", "onb-read");
    box.append(el("p", "onb-read-title", `You have ${mailCount.toLocaleString()} emails`));
    const opts = el("div", "onb-read-opts");
    opts.setAttribute("role", "group");
    opts.setAttribute("aria-label", "How much mail to read");
    const pick = (value: boolean, key: string, label: string, sub: string) => {
      const b = el("button", "onb-opt");
      b.type = "button";
      b.dataset.pick = key;
      b.setAttribute("aria-pressed", String(readAll === value));
      const words = el("span", "onb-words");
      words.append(el("b", "", label), el("small", "", sub));
      b.append(words);
      b.onclick = () => {
        readAll = value;
        render();
      };
      return b;
    };
    opts.append(
      pick(false, "read-newest", `Newest ${MAIL_INDEX_CAP.toLocaleString()}`, readTimeText(MAIL_INDEX_CAP)),
      pick(true, "read-all", all === mailCount ? `All ${all.toLocaleString()}` : `Newest ${all.toLocaleString()}`, readTimeText(all)),
    );
    box.append(opts);
    return box;
  }

  /** Saves, makes the labels (Tidy for me), then heads to the dashboard and its tour. */
  async function finish(hands: "tidy" | "ask") {
    if (busy) return;
    busy = true;
    clearLater();
    // Asked on this click (a user gesture) so the scan can say when it's done.
    chrome.permissions?.request({ permissions: ["notifications"] }).catch(() => {});
    const go = $<HTMLButtonElement>("setup-go");
    if (go) {
      go.disabled = true;
      go.textContent = "Setting up…";
    }
    const plan = { ...answers, hands };
    if (hands === "tidy") kai.say("Making your labels.");
    try {
      const { tidyFailed } = await startPlan(plan, readAll ? MAIL_INDEX_MAX : MAIL_INDEX_CAP, corrections());
      if (go) go.textContent = "All set";
      kai.say(tidyFailed ? "Saved. You can turn on the labels in Labels." : "Okay, let's go to your dashboard!", "joyful");
      kai.do("celebrate");
      await wait(1600);
      await select("overview");
      startDashboardTour();
    } catch (err) {
      log.error("Setup could not be saved", err);
      busy = false;
      if (go) {
        go.disabled = false;
        go.textContent = "Try again";
      }
    }
  }

  function render(newStep = false) {
    const step = STEPS[at];
    const body = el("div", newStep ? "onb-body onb-in" : "onb-body");
    ({ hello: renderHello, label: renderLabel, scan: renderScan, found: renderFound })[step](body);
    pane.className = `onb-pane is-${step}`;
    pane.replaceChildren(progressBar(BEFORE + at + 1), kai.row, body);
    if (newStep) guide(step);
  }

  /** What Kai says and does when a screen opens. */
  function guide(step: Step) {
    if (step === "hello") {
      if (!signedIn) return;
      kai.do("peek");
      kai.do("wave");
      kai.say(`Hi${name() ? ` ${name()}` : ""}! I'm Kai. I'll sort your mail into labels for you.`, "happy");
      later(2600, () => kai.say("Let me show you how it works."));
    } else if (step === "label") {
      const tag = pane.querySelector(".lbl-tag");
      kai.say("Every email gets a label like this one.");
      later(900, () => {
        tag?.classList.add("in");
        if (tag) kai.react(tag, "hop", "📦", "joyful");
      });
      later(3200, () => kai.say("I'll do this for all your mail."));
    } else if (step === "scan") {
      kai.say("Now let's look at your mail.");
      kai.do("tilt");
      scanEnteredAt = Date.now();
      if (scanned) countUp();
      scanDone();
    } else if (found.length === 0) {
      kai.say("I'll label new mail as it comes in. Okay?");
    } else {
      kai.say(`I found ${found.length} companies. Are these labels okay?`, "proud");
    }
  }

  skip.onclick = async () => {
    clearLater();
    kai.stop();
    ctx.settings = await updateSettings({ setupDone: true });
    await select("overview");
  };

  render(true);
  // Setup draws behind the sign-in screen; Kai says hello and the scan starts once signed in.
  beginScan = () => {
    beginScan = () => {};
    if (ctx.settings.setupDone) return;
    signedIn = true;
    // Drawn before the welcome asked the name: redraw with it.
    if (STEPS[at] === "hello") {
      render();
      guide("hello");
    }
    void scanNewest(onScanned).then(async (mail) => {
      found = pickPracticeSenders(mail, 8);
      scanned = true;
      scanDone();
    });
  };

  /** The count runs up to what was read, for a scan that finished before its screen. */
  function countUp() {
    const count = pane.querySelector("#scan-count");
    if (!count || reducedMotion()) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 2200);
      count.textContent = `${Math.round(readSoFar * k)} emails`;
      if (k < 1 && STEPS[at] === "scan") requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Leaves the scan screen once the scan is done and it has shown for 3.5 s. */
  function scanDone() {
    if (!scanned || STEPS[at] !== "scan" || ctx.settings.setupDone) return;
    later(Math.max(0, 3500 - (Date.now() - scanEnteredAt)), () => {
      kai.say("Done!", "joyful");
      later(800, () => goTo(at + 1));
    });
  }
}

let beginScan = () => {};
/** Called once Gmail is signed in: Kai says hello and the scan of the newest mail starts. */
export function setupSignedIn(): void {
  beginScan();
}
