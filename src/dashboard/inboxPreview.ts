// A mail window on the onboarding panel that fills in as you answer
// (research/2026-11-20-mobbin-onboarding-audit.md #9, after Slack's live
// workspace preview): your name in its title, your newest mail with its
// sender's logo and label as the scan reads it, and the labels you keep.
// Placeholder bars until then. Laid out like Gmail: search on top, Inbox
// and labels down the side, the mail list on the right.
import { senderTile } from "./senderTile";

export interface PreviewLabel {
  emoji: string;
  name: string;
}

export interface InboxPreview {
  el: HTMLElement;
  setName(name: string): void;
  /** Newest on top; the window shows six. A null label means the mail stays in the inbox. */
  addMail(sender: string, subject: string, label: PreviewLabel | null, address?: string): void;
  setLabels(labels: PreviewLabel[]): void;
}

const ROWS = 6;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const bar = (width: number) => {
  const b = el("i", "ip-bar");
  b.style.width = `${width}%`;
  return b;
};

export function inboxPreview(name = ""): InboxPreview {
  const root = el("figure", "ip");
  root.setAttribute("aria-hidden", "true");
  const head = el("div", "ip-head");
  const title = el("span", "ip-title");
  const search = el("span", "ip-search", "Search mail");
  head.append(el("span", "ip-dots"), title, search);
  const side = el("div", "ip-side");
  const inbox = el("span", "ip-inbox");
  const count = el("span", "ip-count");
  inbox.append(el("b", "", "Inbox"), count);
  const labels = el("ul", "ip-labels");
  side.append(inbox, el("span", "ip-side-head", "Labels"), labels);
  const rows = el("ul", "ip-rows");
  const body = el("div", "ip-body");
  body.append(side, rows);
  root.append(head, body);
  let read = 0;

  const setName = (n: string) => {
    const first = n.trim().split(/\s+/)[0] ?? "";
    title.textContent = first ? `${first}'s inbox` : "Your inbox";
  };
  const setLabels = (list: PreviewLabel[]) => {
    labels.replaceChildren(
      ...(list.length
        ? list.map((l) => {
            const li = el("li", "ip-label ip-in");
            li.append(el("span", "ip-label-emoji", l.emoji), el("span", "", l.name));
            return li;
          })
        : [70, 55, 62, 48].map((w) => {
            const li = el("li", "ip-label");
            li.append(bar(w));
            return li;
          })),
    );
  };
  for (const w of [80, 64, 72, 58, 68, 50]) {
    const li = el("li", "ip-row is-blank");
    li.append(el("span", "ip-dot"), bar(w));
    rows.append(li);
  }
  setName(name);
  setLabels([]);

  return {
    el: root,
    setName,
    setLabels,
    addMail(sender, subject, label, address = "") {
      const li = el("li", "ip-row ip-in");
      const words = el("span", "ip-words");
      words.append(el("b", "", sender), el("small", "", subject || "(no subject)"));
      li.append(senderTile(address, sender, "sz-26"), words);
      if (label) li.append(el("span", "ip-tag", `${label.emoji} ${label.name}`));
      rows.prepend(li);
      while (rows.children.length > ROWS) rows.lastElementChild?.remove();
      count.textContent = String(++read);
    },
  };
}
