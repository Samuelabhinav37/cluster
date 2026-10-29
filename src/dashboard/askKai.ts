// Ask Kai: a box that understands what you type and takes you there, like
// Windows search (approved mockup research/2026-10-27-home-cleanup-mockup.html).
// Nothing runs from here directly: every hit opens a place, Details, or a
// place's own confirm step, so protection checks and Undo stay where they are.
// shortcut: keyword intents only; Chrome's on-device Prompt API could read free
// text later.

import type { DetailSender, DetailsFilter } from "./detailsPanel";
import { HOME_KINDS, type HomeAct, type HomeKind } from "./homeDashboard";

export interface AskHit {
  title: string;
  sub: string;
  verb: string;
  run: () => void;
}

export interface AskActions {
  details(filter: DetailsFilter): void;
  go(screen: string, act?: HomeAct): void;
}

export interface AskFacts {
  senders: readonly DetailSender[];
  kinds: Record<HomeKind, number>;
  scams: number;
  waiting: number;
}

const KIND_WORDS: Record<HomeKind, RegExp> = {
  primary: /primary|personal|people/,
  trans: /receipt|order|invoice|bill|transaction|payment/,
  updates: /update|notification|alert/,
  promo: /promo|ads|advert|marketing|sale|offer|deal/,
};

const PLACES: ReadonlyArray<[screen: string, label: string]> = [
  ["overview", "Home"],
  ["delete", "Clean up"],
  ["subscriptions", "Stop mail"],
  ["organize", "Organize"],
  ["impersonation", "Protect"],
  ["senders", "Senders"],
  ["recent", "Activity"],
  ["settings", "Settings"],
];

export const ASK_EXAMPLES = ["linkedin emails this week", "how many promotions", "mail i never open", "old codes", "scams"];

const plural = (n: number, one: string) => `${n.toLocaleString()} ${n === 1 ? one : `${one}s`}`;

function findSender(q: string, senders: readonly DetailSender[]): DetailSender | undefined {
  const words = q.split(/[^a-z0-9.&]+/).filter((w) => w.length >= 3);
  return senders.find((s) => {
    const name = s.name.toLowerCase();
    const domain = s.address.split("@")[1]?.toLowerCase() ?? "";
    return words.some((w) => name.startsWith(w) || domain.startsWith(w));
  });
}

/** Up to six hits for what was typed, best first. */
export function askIntents(raw: string, f: AskFacts, act: AskActions): AskHit[] {
  const q = raw.toLowerCase().trim();
  if (!q) return [];
  const out: Array<AskHit & { score: number }> = [];
  const add = (score: number, hit: AskHit) => out.push({ score, ...hit });
  const has = (re: RegExp) => re.test(q);
  const show = has(/show|find|where|see|open|look|check|list/);
  const count = has(/how many|how much|count|number of/);
  const week = has(/this week|today|recent/) ? 7 : has(/last week/) ? 6 : null;
  const when = week === 7 ? " this week" : week === 6 ? " last week" : "";

  const sender = findSender(q, f.senders);
  if (sender)
    add(show || week !== null ? 99 : 90, {
      title: `${sender.name} emails${when}`,
      sub: `${plural(sender.emails, "email")}, ${sender.opened === 0 ? "none" : sender.opened} opened`,
      verb: "Show",
      run: () => act.details({ view: "emails", senderKey: sender.key, week }),
    });
  for (const k of HOME_KINDS) {
    if (!has(KIND_WORDS[k.key])) continue;
    add(count ? 95 : show ? 92 : 70, {
      title: `${k.label}${when}`,
      sub: week === null ? plural(f.kinds[k.key], "email") : "Open them in Details",
      verb: "Show",
      run: () => act.details({ view: "emails", kind: k.key, week }),
    });
  }
  if (has(/never open|don'?t open|unread|ignore/)) {
    add(96, { title: "Trash mail from senders you never open", sub: "Clean up", verb: "Trash", run: () => act.go("delete", "trash-never-opened") });
    add(80, { title: "Senders you never open", sub: "Open them in Details", verb: "Show", run: () => act.details({ view: "senders", never: true }) });
  }
  if (has(/code|otp|verif|expired|old mail|past its date/))
    add(94, { title: "Trash old codes and mail past its date", sub: "Clean up", verb: "Trash", run: () => act.go("delete", "trash-past-date") });
  if (has(/scam|phish|fraud|fake|suspicious|danger|hack/))
    add(93, { title: `${plural(f.scams, "sender")} that look like scams`, sub: "Protect", verb: "Review", run: () => act.go("impersonation") });
  if (has(/new sender|stranger|unknown|screen|first time|let in|allow/))
    add(91, { title: `${plural(f.waiting, "new sender")} waiting`, sub: "Protect", verb: "Review", run: () => act.go("screener") });
  if (has(/unsub|stop|no more|newsletter/))
    add(sender ? 60 : 89, { title: "Stop mail", sub: "Unsubscribe from lists", verb: "Open", run: () => act.go("subscriptions") });
  if (week !== null && out.length === 0)
    add(88, { title: `Everything from ${week === 7 ? "this" : "last"} week`, sub: "Open in Details", verb: "Show", run: () => act.details({ view: "emails", week }) });
  for (const [screen, label] of PLACES) {
    const name = label.toLowerCase();
    if (name.startsWith(q) || q.includes(name)) add(65, { title: label, sub: "Go there", verb: "Open", run: () => act.go(screen) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 6);
}

/** The box itself: opened by the sidebar's Ask Kai, "/" or Ctrl+K. */
export function initAskKai(trigger: HTMLElement, facts: () => AskFacts, act: AskActions): { open(): void; close(): void } {
  const backdrop = document.createElement("div");
  backdrop.className = "ask";
  backdrop.hidden = true;
  const box = document.createElement("div");
  box.className = "ask-box";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Ask Kai");
  const input = document.createElement("input");
  input.className = "ask-input";
  input.placeholder = "Ask Kai or say what to do";
  input.autocomplete = "off";
  input.setAttribute("aria-label", "Ask Kai");
  const results = document.createElement("div");
  results.className = "ask-results";
  results.setAttribute("role", "listbox");
  const hint = document.createElement("div");
  hint.className = "ask-hint";
  for (const t of ["↑↓ choose", "Enter go", "Esc close"]) hint.append(Object.assign(document.createElement("span"), { textContent: t }));
  box.append(input, results, hint);
  backdrop.append(box);
  document.body.append(backdrop);

  let hits: AskHit[] = [];
  let sel = 0;

  const heading = (text: string) => Object.assign(document.createElement("h3"), { textContent: text });
  function row(title: string, sub: string, selected: boolean, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ask-row";
    b.setAttribute("role", "option");
    b.setAttribute("aria-selected", String(selected));
    const t = Object.assign(document.createElement("span"), { textContent: title });
    b.append(t);
    if (sub) b.append(Object.assign(document.createElement("small"), { textContent: sub }));
    b.onclick = onClick;
    return b;
  }

  function render() {
    hits = askIntents(input.value, facts(), act);
    sel = Math.min(sel, Math.max(0, hits.length - 1));
    if (!input.value.trim()) {
      results.replaceChildren(
        heading("Try"),
        ...ASK_EXAMPLES.map((t) =>
          row(t, "", false, () => {
            input.value = t;
            render();
            input.focus();
          }),
        ),
      );
      return;
    }
    if (hits.length === 0) {
      results.replaceChildren(heading("Kai didn't get that. Try a sender's name or “old codes”."));
      return;
    }
    results.replaceChildren(
      ...hits.flatMap((h, i) => {
        const r = row(h.title, h.sub, i === sel, () => runHit(i));
        r.append(Object.assign(document.createElement("em"), { textContent: h.verb }));
        return i === 0 ? [heading("Best match"), r] : i === 1 ? [heading("More"), r] : [r];
      }),
    );
  }

  function runHit(i: number) {
    const h = hits[i];
    if (!h) return;
    close();
    h.run();
  }
  function open() {
    backdrop.hidden = false;
    input.value = "";
    sel = 0;
    render();
    input.focus();
  }
  function close() {
    backdrop.hidden = true;
  }

  input.oninput = () => {
    sel = 0;
    render();
  };
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };
  trigger.addEventListener("click", open);
  trigger.addEventListener("focus", open);
  document.addEventListener("keydown", (e) => {
    if (!backdrop.hidden) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowDown") sel = Math.min(sel + 1, hits.length - 1);
      else if (e.key === "ArrowUp") sel = Math.max(sel - 1, 0);
      else if (e.key === "Enter") return runHit(sel);
      else return;
      e.preventDefault();
      if (!backdrop.hidden) render();
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const typing = active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
    if ((e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) || (e.key === "k" && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      open();
    }
  });
  return { open, close };
}
