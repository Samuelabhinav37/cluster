// Home: one sentence about the inbox right now, two status pills, and a
// short list of recommendations with one button each (the shape of Apple's
// Weather summary and iPhone Storage recommendations, see
// research/2026-10-10-apple-style-redesign.md). The facts come from the
// scan; this file only decides what to say and where each button goes.

export interface HomeFacts {
  /** Senders with scam warnings. */
  suspicious: number;
  /** New senders waiting in the screener. */
  waiting: number;
  /** Messages in the Clear out plan. */
  cleanupMessages: number;
  /** Senders that deserve a mute / sort / unsubscribe decision. */
  decisionSenders: number;
  /** Senders that support unsubscribing. */
  unsubscribable: number;
  /** Scam holding (auto-quarantine) is on. */
  holdingOn: boolean;
  /** Inbox time limits or keep-sorting is on. */
  sortingOn: boolean;
}

export interface Recommendation {
  id: string;
  title: string;
  detail: string;
  action: string;
  /** Screen the button opens. */
  screen: string;
  /** Element to scroll to once the screen is open. */
  focus?: string;
  danger?: boolean;
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** The one sentence at the top of Home. Most urgent thing first. */
export function homeHeadline(f: HomeFacts): string {
  if (f.suspicious > 0) {
    return `${count(f.suspicious, "sender")} ${f.suspicious === 1 ? "looks" : "look"} suspicious. Check before you act.`;
  }
  if (f.waiting > 0) {
    return `Nothing looks like a scam. ${count(f.waiting, "new sender")} ${f.waiting === 1 ? "is" : "are"} waiting for you.`;
  }
  if (f.cleanupMessages > 0) {
    return `Nothing looks like a scam. ${count(f.cleanupMessages, "email")} can be cleared out.`;
  }
  return "Nothing looks like a scam, and nothing needs you right now.";
}

/** Recommendations, most urgent first. Only what applies right now. Scam
 * holding being off shows as a status pill, not a recommendation. */
export function homeRecommendations(f: HomeFacts): Recommendation[] {
  const recs: Recommendation[] = [];
  if (f.suspicious > 0) {
    recs.push({
      id: "suspicious",
      title: `Check ${count(f.suspicious, "suspicious sender")}`,
      detail: "They claim to be someone they're not.",
      action: "Review",
      screen: "impersonation",
      danger: true,
    });
  }
  if (f.waiting > 0) {
    recs.push({
      id: "waiting",
      title: `Let in or block ${count(f.waiting, "new sender")}`,
      detail: "Held out of your inbox until you decide.",
      action: "Review",
      screen: "screener",
    });
  }
  if (f.cleanupMessages > 0) {
    recs.push({
      id: "cleanup",
      title: `Clear out ${count(f.cleanupMessages, "email")}`,
      detail: "They go to Trash, which keeps them for 30 days.",
      action: "Review",
      screen: "delete",
    });
  }
  if (f.decisionSenders > 0) {
    recs.push({
      id: "decide",
      title: `Decide about ${count(f.decisionSenders, "sender")}`,
      detail: "Mute, sort or unsubscribe.",
      action: "Review",
      screen: "delete",
      focus: "senders-worth-decision",
    });
  }
  if (f.unsubscribable > 0) {
    recs.push({
      id: "unsubscribe",
      title: `Unsubscribe from newsletters`,
      detail: `${count(f.unsubscribable, "sender")} you can leave in one step.`,
      action: "Review",
      screen: "subscriptions",
    });
  }
  return recs;
}

const ICON_SHIELD =
  '<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.9 4.2 5v4.6c0 3.2 2.3 6 5.8 7.5 3.5-1.5 5.8-4.3 5.8-7.5V5z"></path></svg>';
const ICON_LAYERS =
  '<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.4 3.2 7.4 10 11.4 16.8 7.4Z"></path><path d="M3.2 11 10 15 16.8 11"></path></svg>';

function statusPill(icon: "shield" | "layers", text: string, on: boolean, link: string, go: () => void): HTMLElement {
  const pill = document.createElement("div");
  pill.className = `home-pill${on ? " on" : ""}`;
  const label = document.createElement("span");
  if (icon === "shield") label.innerHTML = ICON_SHIELD;
  else label.innerHTML = ICON_LAYERS;
  label.append(document.createTextNode(text));
  const a = document.createElement("a");
  a.href = "#";
  a.textContent = link;
  a.onclick = (e) => {
    e.preventDefault();
    go();
  };
  pill.append(label, a);
  return pill;
}

/** Status pills and the recommendations list, appended to `stack`. */
export function renderHomeTop(stack: HTMLElement, f: HomeFacts, go: (screen: string, focus?: string) => void): void {
  const pills = document.createElement("div");
  pills.className = "home-pills";
  pills.append(
    statusPill("shield", f.holdingOn ? "Scam holding is on" : "Scam holding is off", f.holdingOn, f.holdingOn ? "Open" : "Turn on", () =>
      go("impersonation"),
    ),
    statusPill("layers", f.sortingOn ? "Sorting is on" : "Sorting is off", f.sortingOn, f.sortingOn ? "Change" : "Set up", () =>
      go("organize"),
    ),
  );
  stack.appendChild(pills);

  const wrap = document.createElement("section");
  wrap.className = "home-recs";
  wrap.setAttribute("aria-labelledby", "home-recs-title");
  const head = document.createElement("div");
  head.className = "section-head";
  head.innerHTML = '<h2 class="section-label" id="home-recs-title">Recommendations</h2>';
  const list = document.createElement("div");
  list.className = "grouped-list";
  const recs = homeRecommendations(f);
  if (recs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "list-row home-rec-empty";
    empty.textContent = "Nothing to do. Cluster keeps checking in the background.";
    list.appendChild(empty);
  }
  recs.forEach((rec, i) => {
    if (i > 0) {
      const sep = document.createElement("div");
      sep.className = "row-sep";
      list.appendChild(sep);
    }
    const row = document.createElement("div");
    row.className = `list-row home-rec${rec.danger ? " danger" : ""}`;
    row.dataset.rec = rec.id;
    const text = document.createElement("div");
    text.className = "row-title-wrap";
    const title = document.createElement("div");
    title.className = "row-title wrap";
    title.textContent = rec.title;
    const sub = document.createElement("div");
    sub.className = "row-sub wrap";
    sub.textContent = rec.detail;
    text.append(title, sub);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm";
    btn.textContent = rec.action;
    btn.setAttribute("aria-label", `${rec.action}: ${rec.title}`);
    btn.onclick = () => go(rec.screen, rec.focus);
    row.append(text, btn);
    list.appendChild(row);
  });
  wrap.append(head, list);
  stack.appendChild(wrap);
}
