// Small, dependency-light DOM helpers shared across the dashboard tabs.
// Everything here is pure UI — no settings, no providers, no scan state — so it
// can be pulled out of dashboard.ts and reused by the per-tab modules.
import { log } from "../lib/log";

/** Drop any key from `selection` that isn't in `validKeys` — call after a
 * rescan so a stale checkbox selection doesn't act on a vanished row. */
export function pruneSelection(selection: Set<string>, validKeys: string[]): void {
  const valid = new Set(validKeys);
  for (const key of selection) {
    if (!valid.has(key)) selection.delete(key);
  }
}

/** Two-step confirm UI used by single-row and bulk actions alike: replaces
 * `container`'s contents with a summary + Confirm/Cancel; on confirm, runs
 * `onConfirm` and shows its returned string; Cancel restores via `resetContent`. */
export function renderConfirmStep(
  container: HTMLElement,
  resetContent: () => void,
  summaryText: string,
  danger: boolean,
  onConfirm: (summary: HTMLElement) => Promise<string>,
): void {
  container.innerHTML = "";
  container.classList.add("confirm-slot");

  const summary = document.createElement("span");
  summary.className = "confirm-summary";
  summary.textContent = summaryText;
  container.appendChild(summary);

  const confirmBtn = document.createElement("button");
  confirmBtn.className = danger ? "btn btn-danger btn-sm" : "btn btn-accent btn-sm";
  confirmBtn.textContent = "Confirm";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn-sm";
  cancelBtn.textContent = "Cancel";
  cancelBtn.onclick = resetContent;

  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    try {
      summary.textContent = await onConfirm(summary);
    } catch (err) {
      summary.textContent = "Action failed, try again";
      log.error(err);
    }
  };

  container.append(confirmBtn, cancelBtn);
}

/** For reversible actions (archive, label): runs at once in `container`
 * and shows the returned "Done" text, with Undo in Activity instead of a
 * confirm first. */
export function runNow(container: HTMLElement, onRun: (summary: HTMLElement) => Promise<string>): void {
  const summary = Object.assign(document.createElement("span"), { className: "confirm-summary", textContent: "…" });
  container.replaceChildren(summary);
  container.classList.add("confirm-slot");
  onRun(summary).then(
    (text) => (summary.textContent = text),
    (err) => {
      summary.textContent = "Action failed, try again";
      log.error(err);
    },
  );
}

export function headerRow(labels: string[]): HTMLTableRowElement {
  const row = document.createElement("tr");
  for (const label of labels) {
    const th = document.createElement("th");
    th.textContent = label;
    row.appendChild(th);
  }
  return row;
}

export function formatRelativeTime(epochMs: number): string {
  const minutes = Math.floor((Date.now() - epochMs) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

let infoCount = 0;
/** An (i) that explains on click (the native popover), so the screen itself
 * carries no explanation lines. Returns the button and its popover; place
 * both, the popover anywhere. */
export function infoButton(text: string, about: string): [HTMLButtonElement, HTMLElement] {
  const id = `info-${++infoCount}`;
  const pop = Object.assign(document.createElement("div"), { id, className: "info-pop", textContent: text });
  pop.setAttribute("popover", "");
  const btn = Object.assign(document.createElement("button"), { type: "button", className: "info", textContent: "i" });
  btn.setAttribute("popovertarget", id);
  btn.setAttribute("aria-label", about);
  return [btn, pop];
}
