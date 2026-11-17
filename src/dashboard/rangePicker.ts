// Date range picker (2026-11): presets on the left, two months side by side, one
// surface for both ends. First click sets the start, the band follows the pointer,
// second click sets the end (swapped if it's earlier). Patterns from the range-picker
// research: presets list, two months, hover preview, distinct ends, a hint while waiting.

/** Local midnights of the first and last day (both included). */
export interface DayRange {
  start: number;
  end: number;
}

const midnight = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
const addDays = (ms: number, n: number) => {
  const d = new Date(ms);
  d.setDate(d.getDate() + n);
  return d.getTime();
};

export function orderRange(a: number, b: number): DayRange {
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

/** The presets, each from today. */
export function presetRanges(today: number): Array<{ label: string; range: DayRange }> {
  const t = new Date(today);
  const last = (n: number) => ({ start: addDays(today, -(n - 1)), end: today });
  return [
    { label: "Last 7 days", range: last(7) },
    { label: "Last 30 days", range: last(30) },
    { label: "Last 90 days", range: last(90) },
    { label: "This month", range: { start: new Date(t.getFullYear(), t.getMonth(), 1).getTime(), end: today } },
    { label: "Last month", range: { start: new Date(t.getFullYear(), t.getMonth() - 1, 1).getTime(), end: new Date(t.getFullYear(), t.getMonth(), 0).getTime() } },
    { label: "This year", range: { start: new Date(t.getFullYear(), 0, 1).getTime(), end: today } },
  ];
}

/** The days of one month in a Sunday-first grid; null pads the first week. */
export function monthCells(year: number, month: number): Array<number | null> {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = new Array<number | null>(first.getDay()).fill(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d).getTime());
  return cells;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
};

export interface RangePickerOptions {
  button: HTMLButtonElement;
  pop: HTMLElement;
  current: () => DayRange;
  /** The oldest day that can be picked (what Cluster has read). */
  oldest: () => number | undefined;
  onPick: (r: DayRange) => void;
}

export function createRangePicker(o: RangePickerOptions): void {
  const { button, pop } = o;
  let draft: DayRange = o.current();
  /** The first click, while the end is still to pick. */
  let anchor: number | null = null;
  let hover: number | null = null;
  /** First day of the left month. */
  let view = 0;
  let today = midnight(Date.now());
  let min: number | undefined;

  const presets = el("div", "rp-presets");
  presets.setAttribute("role", "listbox");
  presets.setAttribute("aria-label", "Ranges");
  const months = el("div", "rp-months");
  const prev = el("button", "rp-nav rp-prev");
  const next = el("button", "rp-nav rp-next");
  prev.type = next.type = "button";
  prev.setAttribute("aria-label", "Earlier months");
  next.setAttribute("aria-label", "Later months");
  prev.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>';
  next.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>';
  const summary = el("p", "rp-summary");
  summary.setAttribute("aria-live", "polite");
  const cancel = el("button", "btn rp-cancel", "Cancel");
  const apply = el("button", "btn btn-accent-solid rp-apply", "Apply");
  cancel.type = apply.type = "button";
  const foot = el("div", "rp-foot");
  foot.append(summary, cancel, apply);
  const cal = el("div", "rp-cal");
  cal.append(prev, next, months);
  const main = el("div", "rp-main");
  main.append(cal, foot);
  pop.replaceChildren(presets, main);
  pop.classList.add("rp");

  const close = () => {
    pop.hidden = true;
    button.setAttribute("aria-expanded", "false");
  };
  const pick = (r: DayRange) => {
    // shortcut: two years at most, longer would draw hairline bars.
    const cap = new Date(r.end);
    cap.setFullYear(cap.getFullYear() - 2);
    close();
    o.onPick({ start: Math.max(r.start, cap.getTime() + 86_400_000), end: r.end });
  };
  const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const disabled = (day: number) => day > today || (min !== undefined && day < min);

  const paintPresets = () => {
    presets.replaceChildren(
      ...presetRanges(today).map(({ label, range }) => {
        const b = el("button", "rp-preset", label);
        b.type = "button";
        b.setAttribute("role", "option");
        const on = anchor === null && range.start === draft.start && range.end === draft.end;
        b.setAttribute("aria-selected", String(on));
        b.onclick = () => pick(range);
        return b;
      }),
    );
  };

  const buildMonths = () => {
    months.replaceChildren();
    const left = new Date(view);
    for (let k = 0; k < 2; k++) {
      const y = left.getFullYear();
      const m = left.getMonth() + k;
      const head = new Date(y, m, 1);
      const box = el("div", "rp-month");
      box.append(el("h3", "rp-title", head.toLocaleDateString(undefined, { month: "long", year: "numeric" })));
      const grid = el("div", "rp-grid");
      grid.setAttribute("role", "grid");
      for (let w = 0; w < 7; w++) {
        const name = el("span", "rp-dow", new Date(2024, 0, 7 + w).toLocaleDateString(undefined, { weekday: "narrow" }));
        name.setAttribute("aria-hidden", "true");
        grid.append(name);
      }
      for (const day of monthCells(head.getFullYear(), head.getMonth())) {
        if (day === null) {
          grid.append(el("span", "rp-pad"));
          continue;
        }
        const b = el("button", "rp-day", String(new Date(day).getDate()));
        b.type = "button";
        b.dataset.day = String(day);
        b.setAttribute("aria-label", new Date(day).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }));
        b.disabled = disabled(day);
        if (day === today) b.classList.add("today");
        grid.append(b);
      }
      box.append(grid);
      months.append(box);
    }
    const lastShown = new Date(left.getFullYear(), left.getMonth() + 2, 0).getTime();
    next.disabled = lastShown >= today;
    prev.disabled = min !== undefined && view <= min;
    paint();
  };

  /** Classes only, so hovering doesn't rebuild the grid under the pointer. */
  const paint = () => {
    const shown = anchor !== null && hover !== null ? orderRange(anchor, hover) : anchor !== null ? { start: anchor, end: anchor } : draft;
    for (const b of Array.from(months.querySelectorAll<HTMLButtonElement>(".rp-day"))) {
      const day = Number(b.dataset.day);
      const inside = day >= shown.start && day <= shown.end;
      b.classList.toggle("in", inside);
      b.classList.toggle("start", day === shown.start);
      b.classList.toggle("end", day === shown.end);
      b.classList.toggle("preview", anchor !== null && inside);
      b.setAttribute("aria-selected", String(inside));
    }
    const days = Math.round((shown.end - shown.start) / 86_400_000) + 1;
    summary.textContent = anchor !== null ? "Pick the last day" : `${fmt(draft.start)} to ${fmt(draft.end)} · ${days} day${days === 1 ? "" : "s"}`;
    summary.classList.toggle("waiting", anchor !== null);
    apply.disabled = anchor !== null;
    paintPresets();
  };

  months.addEventListener("click", (e) => {
    const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>(".rp-day") : null;
    if (!b || b.disabled) return;
    const day = Number(b.dataset.day);
    if (anchor === null) {
      anchor = day;
      hover = day;
    } else {
      draft = orderRange(anchor, day);
      anchor = hover = null;
    }
    paint();
  });
  months.addEventListener("mouseover", (e) => {
    const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>(".rp-day") : null;
    if (anchor === null || !b || b.disabled) return;
    const day = Number(b.dataset.day);
    if (day !== hover) {
      hover = day;
      paint();
    }
  });
  // Arrow keys move a day or a week; the band follows focus like it follows the pointer.
  months.addEventListener("keydown", (e) => {
    const b = e.target instanceof HTMLButtonElement ? e.target : null;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!b?.dataset.day || step === undefined) return;
    e.preventDefault();
    const day = addDays(Number(b.dataset.day), step);
    if (disabled(day)) return;
    const shownFirst = view;
    const shownLast = new Date(new Date(view).getFullYear(), new Date(view).getMonth() + 2, 0).getTime();
    if (day < shownFirst || day > shownLast) {
      view = new Date(new Date(view).getFullYear(), new Date(view).getMonth() + (day < shownFirst ? -1 : 1), 1).getTime();
      buildMonths();
    }
    if (anchor !== null) {
      hover = day;
      paint();
    }
    months.querySelector<HTMLButtonElement>(`.rp-day[data-day="${day}"]`)?.focus();
  });
  prev.onclick = () => {
    view = new Date(new Date(view).getFullYear(), new Date(view).getMonth() - 1, 1).getTime();
    buildMonths();
  };
  next.onclick = () => {
    view = new Date(new Date(view).getFullYear(), new Date(view).getMonth() + 1, 1).getTime();
    buildMonths();
  };
  cancel.onclick = () => {
    close();
    button.focus();
  };
  apply.onclick = () => pick(draft);

  button.onclick = () => {
    if (!pop.hidden) return close();
    today = midnight(Date.now());
    const oldest = o.oldest();
    min = oldest === undefined ? undefined : midnight(oldest);
    draft = o.current();
    anchor = hover = null;
    // The end's month on the right.
    const end = new Date(draft.end);
    view = new Date(end.getFullYear(), end.getMonth() - 1, 1).getTime();
    buildMonths();
    pop.hidden = false;
    button.setAttribute("aria-expanded", "true");
    (presets.querySelector<HTMLElement>('[aria-selected="true"]') ?? months.querySelector<HTMLElement>(".rp-day.end"))?.focus();
  };
  document.addEventListener("click", (e) => {
    if (!pop.hidden && e.target instanceof Node && !pop.contains(e.target) && !button.contains(e.target)) close();
  });
  pop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      button.focus();
    }
  });
}
