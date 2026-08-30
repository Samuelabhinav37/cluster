// Small, dependency-light DOM helpers shared across the dashboard tabs.
// Everything here is pure UI — no settings, no providers, no scan state — so it
// can be pulled out of dashboard.ts and reused by the per-tab modules.
import { log } from "../lib/log";
import type { DomainCategory } from "../lib/domainCategories";

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

  const summary = document.createElement("span");
  summary.textContent = summaryText;
  container.appendChild(summary);

  const confirmBtn = document.createElement("button");
  if (danger) confirmBtn.className = "danger";
  confirmBtn.textContent = "Confirm";

  const cancelBtn = document.createElement("button");
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

export interface CategoryGroup<T> {
  category: DomainCategory;
  items: T[];
  total: number;
}

/** Bucket `items` by `categoryOf`, summing `countOf`, sorted by total desc. */
export function groupByCategory<T>(
  items: T[],
  categoryOf: (item: T) => DomainCategory,
  countOf: (item: T) => number,
): CategoryGroup<T>[] {
  const map = new Map<DomainCategory, CategoryGroup<T>>();
  for (const item of items) {
    const category = categoryOf(item);
    let group = map.get(category);
    if (!group) {
      group = { category, items: [], total: 0 };
      map.set(category, group);
    }
    group.items.push(item);
    group.total += countOf(item);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
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
