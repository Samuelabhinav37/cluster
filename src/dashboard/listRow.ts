// Shared row builder for every glass list (senders, subscriptions, rules,
// screener, recent, quarantine, …). Each caller used to hand-build a
// `.list-row` grid with an inline `gridTemplateColumns`; this centralises the
// grid shape as a named modifier class (see dashboard.css) so a row's layout
// is declared once, not once per call site.
export interface ListRowSpec {
  selectable?: {
    checked: boolean;
    disabled?: boolean;
    label: string;
    onChange: (checked: boolean) => void;
    /** Extra `data-*` attributes on the checkbox itself (e.g. a sender key),
     * for callers that sync checked state across rows without a full
     * re-render — see `refreshSenderCheckboxes`. */
    data?: Record<string, string>;
  };
  /** Tile / icon shown before the title. Wrapped together with title+sub. */
  lead?: HTMLElement;
  title: string;
  titleBadges?: HTMLElement[];
  sub?: string | HTMLElement;
  /** Right-aligned content between the media block and actions (a count, an
   * engagement bar, a timestamp). */
  meta?: HTMLElement;
  actions?: HTMLElement[];
  /** A full-width strip rendered directly below the row (an "Options"
   * disclosure, a confirm step). Returned as a sibling, not a grid cell. */
  disclosure?: HTMLElement;
  href?: () => void;
}

/** Modifier class encoding which grid cells this row has. Add the matching
 * `.list-row--<name>` rule in dashboard.css when a new combination shows up —
 * there is no inline `gridTemplateColumns` fallback by design. */
function gridModifier(spec: ListRowSpec): string {
  const parts: string[] = [];
  if (spec.selectable) parts.push("check");
  parts.push("media");
  if (spec.meta) parts.push("meta");
  if (spec.actions && spec.actions.length > 0) parts.push("actions");
  return `list-row--${parts.join("-")}`;
}

export function listRow(spec: ListRowSpec): HTMLElement {
  const row = document.createElement("div");
  row.className = `list-row ${gridModifier(spec)}`;

  if (spec.selectable) {
    const label = document.createElement("label");
    label.className = "check-label";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "check";
    input.checked = spec.selectable.checked;
    input.disabled = spec.selectable.disabled ?? false;
    input.setAttribute("aria-label", spec.selectable.label);
    if (spec.selectable.data) Object.assign(input.dataset, spec.selectable.data);
    input.onchange = () => spec.selectable!.onChange(input.checked);
    label.appendChild(input);
    row.appendChild(label);
  }

  const media = document.createElement("div");
  media.className = "row-media";
  if (spec.lead) media.appendChild(spec.lead);
  const textWrap = document.createElement("div");
  textWrap.className = "row-title-wrap";
  const title = document.createElement("div");
  title.className = "row-title";
  title.title = spec.title;
  title.textContent = spec.title;
  if (spec.titleBadges && spec.titleBadges.length > 0) {
    const titleLine = document.createElement("div");
    titleLine.className = "row-title-line";
    title.title = spec.title;
    titleLine.appendChild(title);
    for (const badge of spec.titleBadges) titleLine.appendChild(badge);
    textWrap.appendChild(titleLine);
  } else {
    textWrap.appendChild(title);
  }
  if (spec.sub !== undefined) {
    const sub = document.createElement("div");
    sub.className = "row-sub";
    if (typeof spec.sub === "string") sub.textContent = spec.sub;
    else sub.appendChild(spec.sub);
    textWrap.appendChild(sub);
  }
  media.appendChild(textWrap);
  row.appendChild(media);

  if (spec.meta) row.appendChild(spec.meta);

  if (spec.actions && spec.actions.length > 0) {
    const actions = document.createElement("div");
    actions.className = "row-actions";
    for (const action of spec.actions) actions.appendChild(action);
    row.appendChild(actions);
  }

  if (spec.href) {
    row.classList.add("row-link");
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.onclick = (e) => {
      if (e.target instanceof HTMLElement && e.target.closest("button, a, input, label")) return;
      spec.href!();
    };
    row.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        spec.href!();
      }
    };
  }

  if (!spec.disclosure) return row;

  const wrap = document.createElement("div");
  wrap.append(row, spec.disclosure);
  return wrap;
}

/** Wraps rows in `.grouped-list` with a `.row-sep` between each (not before
 * the first). `inset` matches the existing 56px-from-left separator used
 * wherever rows have a checkbox or tile column. */
export function listGroup(rows: HTMLElement[], options: { inset?: boolean } = {}): HTMLDivElement {
  const list = document.createElement("div");
  list.className = "grouped-list";
  rows.forEach((row, i) => {
    if (i > 0) {
      const sep = document.createElement("div");
      sep.className = options.inset === false ? "row-sep" : "row-sep inset";
      list.appendChild(sep);
    }
    list.appendChild(row);
  });
  return list;
}
