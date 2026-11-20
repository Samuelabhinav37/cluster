// A small inbox window on the onboarding panel that fills in as you answer
// (research/2026-11-20-mobbin-onboarding-audit.md #9, after Slack's live
// workspace preview): your name in its title, your newest mail with its label
// as the scan reads it, and the labels you keep. Placeholder bars until then.

export interface PreviewLabel {
  emoji: string;
  name: string;
}

export interface InboxPreview {
  el: HTMLElement;
  setName(name: string): void;
  /** Newest on top; the window shows four. A null label means the mail stays in the inbox. */
  addMail(sender: string, subject: string, label: PreviewLabel | null): void;
  setLabels(labels: PreviewLabel[]): void;
}

const ROWS = 4;

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
  head.append(el("span", "ip-dots"), title);
  const side = el("ul", "ip-side");
  const rows = el("ul", "ip-rows");
  const body = el("div", "ip-body");
  body.append(side, rows);
  root.append(head, body);

  const setName = (n: string) => {
    const first = n.trim().split(/\s+/)[0] ?? "";
    title.textContent = first ? `${first}'s inbox` : "Your inbox";
  };
  const setLabels = (labels: PreviewLabel[]) => {
    side.replaceChildren(
      ...(labels.length
        ? labels.map((l) => el("li", "ip-label", `${l.emoji} ${l.name}`))
        : [70, 55, 62].map((w) => {
            const li = el("li", "ip-label");
            li.append(bar(w));
            return li;
          })),
    );
  };
  for (const w of [80, 64, 72, 58]) {
    const li = el("li", "ip-row is-blank");
    li.append(bar(w));
    rows.append(li);
  }
  setName(name);
  setLabels([]);

  return {
    el: root,
    setName,
    setLabels,
    addMail(sender, subject, label) {
      const li = el("li", "ip-row ip-in");
      const words = el("span", "ip-words");
      words.append(el("b", "", sender), el("small", "", subject || "(no subject)"));
      li.append(words);
      if (label) li.append(el("span", "ip-tag", `${label.emoji} ${label.name}`));
      rows.prepend(li);
      while (rows.children.length > ROWS) rows.lastElementChild?.remove();
    },
  };
}
