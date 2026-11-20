// First-run setup, after the welcome (welcome.ts) and sign-in. Duolingo
// style: Kai and a speech bubble at the top of each screen, one big button
// at the bottom (research/2026-11-15-onboarding-two-sources.md).
//
// 1. hello: Kai says hi by name and offers to show how it sorts.
// 2. label: "This is a label": one example email gets its label.
// 3. scan: the newest 100 emails are read (10 s cap). The screen shows that
//    work: a plain bar with the count, and the mail itself streaming in, each
//    one getting its label as in step 2 (Buell & Norton 2011: showing the work
//    makes a wait feel worth it). Kai explains what is happening.
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
import { icon } from "./homeDashboard";
import { senderTile } from "./senderTile";
import { mapWithConcurrency } from "../lib/concurrency";
import { boardOverride, pickPracticeSenders, practiceGuess, type BoardSpot, type PracticeMail, type PracticeSender } from "../lib/practiceSenders";
import type { SortBucket, SortOverride } from "../lib/sortTaxonomy";
import { renderTimeLimits, turnOnTimeLimits } from "./timeLimitsTab";
import { countMailbox } from "../lib/gmailApi";
import { readTimeText } from "../lib/gmailQuotaLedger";
import { MAIL_INDEX_CAP, MAIL_INDEX_MAX } from "../lib/mailIndex";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { categoryLabelName } from "../lib/categoryFilters";
import { showLabel } from "../lib/clusterLabels";
import { progressBar } from "./welcome";
import { stopTyping, typeLine } from "./kaiBubble";
import { startIdle } from "./kaiIdle";
import { rememberKai, travel } from "./kaiTravel";
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
async function scanNewest(onMail: (m: PracticeMail, read: number, total: number) => void): Promise<PracticeMail[]> {
  const mail: PracticeMail[] = [];
  const read = (async () => {
    const token = await gmailProvider.getAuthToken(false);
    const stubs = await gmailProvider.listCandidateMessages(token, SCAN_MAX, 30);
    const total = Math.min(stubs.length, SCAN_MAX);
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
      onMail(one, mail.length, total);
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
      ? // Not calm: in setup Kai floats, breathes and glances around while it talks.
        window.Kai(kaiHost, { src: "/characters/", imgWidth: 320 })
      : null;
  if (!kai) kaiHost.hidden = true;
  let fresh = true;
  let last = "";
  // A small move with each line, so Kai talks with its body as well as the bubble.
  const GESTURES: KaiAction[] = ["nodSmall", "tilt", "nod", "lookAround"];
  let gesture = 0;

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
    instance: kai,
    idle: kai && !reduced ? startIdle(kai) : null,
    say(text: string, mood?: KaiMood) {
      last = text;
      if (kai) {
        if (mood) kai.setMood(mood, 2400);
        kai.talk(Math.min(3000, text.length * 45));
        if (!reduced) kai.do(GESTURES[gesture++ % GESTURES.length]);
      }
      speak(text);
      // The entrance only on a screen's first line; later lines just type.
      typeLine(bubble, text, kai, { pop: fresh });
      fresh = false;
    },
    /** The next line starts a new screen. */
    newScreen() {
      fresh = true;
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
    look(target: Element) {
      kai?.lookAt(target);
    },
    stop() {
      stopTyping(bubble);
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
  labelsOff: SortBucket[] = [],
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
    tidyFailed = !(await turnOnTimeLimits(labelsOff).catch((err: unknown) => {
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
  // The sign-in screens' header (wel-top): the bar in the same place, so moving into setup doesn't jump.
  const top = el("div", "wel-top onb-top");
  top.append(skip);
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
  // The scan: every email read, in order; the screen streams a few of them.
  const readMail: PracticeMail[] = [];
  let readSoFar = 0;
  let scanTotal = SCAN_MAX;
  let scanned = false;
  let scanEnteredAt = 0;
  let signedIn = false;
  let found: PracticeSender[] = [];
  // How many of the scanned emails each label would get, to order the tiles.
  let perLabel = new Map<SortBucket, number>();
  // Labels unticked on the picker: no label, that mail stays in the inbox.
  const off = new Set<SortBucket>();
  let toldOff = false;
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
    body.append(el("h1", "onb-title", name() ? `You're in, ${name()}.` : "You're in."));
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
    tag.append(showLabel(categoryLabelName("shipping", ctx.settings.labelChoices)));
    mail.append(senderTile("ship-confirm@amazon.com", "Amazon", "sz-44"), words, tag);
    demo.append(mail);
    body.append(demo, primary("Got it", () => goTo(at + 1)));
  }

  /** One email as step 2 showed it: logo, sender and subject, and the label it gets. */
  const scanRow = (m: PracticeMail) => {
    const spot: BoardSpot = practiceGuess(m) ?? "keep";
    const li = el("li", "lbl-mail ss-row");
    const words = el("span", "onb-words");
    const sender = m.fromDisplayName.trim() || m.fromAddress;
    words.append(el("b", "", sender), el("small", "", m.subject || "(no subject)"));
    const tag = el("span", `lbl-tag ss-tag${spot === "keep" ? " is-keep" : ""}`);
    const { emoji, name: labelName } = spotParts(spot);
    tag.append(`${emoji} ${labelName}`);
    li.append(senderTile(m.fromAddress, sender, "sz-34"), words, tag);
    return { li, tag, spot, emoji };
  };

  /** The bar and "38 of 100". */
  function paintScanCount(n: number) {
    const count = pane.querySelector("#scan-count");
    if (count) count.textContent = `${n.toLocaleString()} of ${scanTotal.toLocaleString()}`;
    pane.querySelector<HTMLElement>("#scan-fill")?.style.setProperty("width", `${Math.min(100, (n / Math.max(1, scanTotal)) * 100)}%`);
  }

  function renderScan(body: HTMLElement) {
    body.append(el("h1", "onb-title", "Reading your mail"));
    const progress = el("div", "ss-progress");
    const track = el("div", "ss-track");
    track.setAttribute("aria-hidden", "true");
    const fill = el("i", "");
    fill.id = "scan-fill";
    track.append(fill);
    const count = el("span", "ss-count");
    count.id = "scan-count";
    count.setAttribute("role", "status");
    progress.append(track, count);
    const list = el("ul", "ss-list");
    list.id = "scan-list";
    body.append(progress, list);
    queueMicrotask(() => paintScanCount(scanned ? 0 : readSoFar));
  }

  // The stream: one email every 450 ms, one per sender, newest on top, five on screen.
  let streamTimer = 0;
  let streamAt = 0;
  const streamed = new Set<string>();
  let keptOne = false;
  let labelledOne = false;
  function streamNext() {
    const list = pane.querySelector("#scan-list");
    if (!list || STEPS[at] !== "scan") return;
    while (streamAt < readMail.length) {
      const m = readMail[streamAt++];
      const key = m.fromAddress.toLowerCase();
      if (streamed.has(key)) continue;
      streamed.add(key);
      const { li, tag, spot, emoji } = scanRow(m);
      list.prepend(li);
      kai.look(li);
      while (list.children.length > 5) list.lastElementChild?.remove();
      requestAnimationFrame(() => tag.classList.add("in"));
      // Kai explains the first label and the first person, once each.
      if (spot !== "keep" && !labelledOne) {
        labelledOne = true;
        later(500, () => {
          kai.react(tag, "hop", emoji, "joyful");
          kai.say("Each company gets its own label.");
        });
      } else if (spot === "keep" && !keptOne && labelledOne) {
        keptOne = true;
        later(400, () => kai.say("People you know stay in your inbox."));
      }
      break;
    }
    streamTimer = window.setTimeout(streamNext, 450);
  }

  /** A message read mid-scan: the count moves; the stream picks it up. */
  function onScanned(m: PracticeMail, read: number, total: number) {
    readSoFar = read;
    scanTotal = total;
    readMail.push(m);
    if (STEPS[at] === "scan") paintScanCount(read);
  }

  /** "I found these": companies under Cluster's labels. In change mode they move. */
  function renderFound(body: HTMLElement) {
    if (found.length === 0) {
      body.append(el("h1", "onb-title", "Ready to sort"));
    } else {
      body.append(el("h1", "onb-title", changing ? "Move any that are wrong" : "Pick your labels"));
      if (changing) body.append(el("p", "onb-hint", "Drag a company to another label. Or tap it, then tap the label."));
      body.append(changing ? renderBoard() : renderTiles());
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
      actions.append(primary(found.length ? "Use these" : "Yes, sort my mail", () => void finish("tidy"), "setup-go"));
      if (found.length) {
        actions.append(
          button("Move a company", "onb-btn ghost onb-wide", () => {
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

  /** The labels as big tiles with a tick, like a console's app picker. Tap or
   * Space toggles one; the arrow keys move between tiles. */
  function renderTiles(): HTMLElement {
    const spots = [...new Set(found.map(spotOf))]
      .filter((s): s is SortBucket => s !== "keep")
      .sort((a, b) => (perLabel.get(b) ?? 0) - (perLabel.get(a) ?? 0));
    const grid = el("div", "lbl-tiles");
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "Labels");
    for (const spot of spots) {
      const { emoji, name: label } = spotParts(spot);
      const who = found.filter((p) => spotOf(p) === spot);
      const tile = el("button", "lbl-tile");
      tile.type = "button";
      tile.dataset.spot = spot;
      tile.setAttribute("role", "checkbox");
      const sync = () => tile.setAttribute("aria-checked", String(!off.has(spot)));
      sync();
      // Each company with its logo, so you see whose mail goes here.
      const companies = el("span", "lbl-tile-who");
      for (const p of who.slice(0, 2)) {
        const row = el("span", "lbl-tile-co");
        row.append(senderTile(p.address, p.name, "sz-26"), el("span", "", p.name));
        companies.append(row);
      }
      const head = el("span", "lbl-tile-head");
      head.append(el("span", "lbl-tile-emoji", emoji), el("b", "lbl-tile-name", label), el("span", "lbl-tile-check"));
      tile.append(head, companies);
      tile.onclick = () => {
        if (off.has(spot)) off.delete(spot);
        else off.add(spot);
        sync();
        if (off.has(spot) && !toldOff) {
          toldOff = true;
          kai.say(`Okay. ${label} mail stays in your inbox.`);
        } else kai.look(tile);
      };
      grid.append(tile);
    }
    grid.onkeydown = (e) => {
      const tiles = Array.from(grid.querySelectorAll<HTMLElement>(".lbl-tile"));
      const i = tiles.indexOf(document.activeElement as HTMLElement);
      const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
      const d = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols } as Record<string, number>)[e.key];
      if (i < 0 || !d) return;
      e.preventDefault();
      tiles[Math.max(0, Math.min(tiles.length - 1, i + d))].focus();
    };
    return grid;
  }

  /** Kai points at the first company and it glows softly once, so you know what to grab. */
  function demoDrag() {
    const chip = pane.querySelector<HTMLElement>(".board-chip");
    if (!chip) return;
    kai.pointAt(chip);
    later(400, () => chip.classList.add("hint"));
    later(2000, () => chip.classList.remove("hint"));
  }

  function renderBoard(): HTMLElement {
    const keepUsed = changing || found.some((p) => spotOf(p) === "keep");
    const spots: BoardSpot[] = [...new Set(found.map((p) => p.guess)), ...(keepUsed ? (["keep"] as const) : [])];
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
      const { tidyFailed } = await startPlan(plan, readAll ? MAIL_INDEX_MAX : MAIL_INDEX_CAP, corrections(), [...off]);
      if (go) go.textContent = "All set";
      kai.say(tidyFailed ? "Saved. You can turn on the labels in Labels." : "Okay, let's go to your dashboard!", "joyful");
      kai.do("celebrate");
      await wait(1600);
      const host = kai.row.querySelector<HTMLElement>(".onb-kai");
      if (host) rememberKai(host);
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
    top.replaceChildren(progressBar(BEFORE + at + 1), skip);
    // Keep Kai's row in place between steps so Kai doesn't vanish and reappear.
    if (kai.row.parentNode === pane) {
      while (kai.row.nextSibling) kai.row.nextSibling.remove();
      pane.append(body);
    } else {
      pane.replaceChildren(kai.row, body);
      // The same Kai as the welcome: it flies over from where it stood there.
      travel(kai.row.querySelector<HTMLElement>(".onb-kai")!, kai.instance);
    }
    kai.idle?.reset();
    if (newStep) kai.newScreen();
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
      kai.say("Now I'm reading your newest emails and labelling each one.");
      kai.do("tilt");
      scanEnteredAt = Date.now();
      window.clearTimeout(streamTimer);
      streamNext();
      if (scanned) countUp();
      scanDone();
    } else if (found.length === 0) {
      kai.say("I'll label new mail as it comes in. Okay?");
    } else {
      kai.say("These are the labels I'd use. Untick any you don't want.", "proud");
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
      perLabel = new Map();
      for (const m of mail) {
        const b = practiceGuess(m);
        if (b) perLabel.set(b, (perLabel.get(b) ?? 0) + 1);
      }
      scanned = true;
      scanDone();
    });
  };

  /** The count runs up to what was read, for a scan that finished before its screen. */
  function countUp() {
    if (reducedMotion()) return paintScanCount(readSoFar);
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 4000);
      paintScanCount(Math.round(readSoFar * k));
      if (k < 1 && STEPS[at] === "scan") requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Leaves the scan screen once the scan is done and it has shown for 5 s (time for Kai's lines). */
  function scanDone() {
    if (!scanned || STEPS[at] !== "scan" || ctx.settings.setupDone) return;
    later(Math.max(0, 5000 - (Date.now() - scanEnteredAt)), () => {
      window.clearTimeout(streamTimer);
      kai.say("Done. Let me group them for you.", "joyful");
      later(1400, () => goTo(at + 1));
    });
  }
}

let beginScan = () => {};
/** Called once Gmail is signed in: Kai says hello and the scan of the newest mail starts. */
export function setupSignedIn(): void {
  beginScan();
}
