// "Tidy up Cluster's labels": a one-time card that renames the labels older
// builds left behind ("Cluster/Shopping", "Declutter/Screener", …) to today's
// names, or merges them when today's label already exists. Planning and the
// Gmail calls live in lib/labelMigration.ts; this is just the preview + apply.
import {
  batchModify,
  createFilter,
  deleteFilter,
  deleteLabel,
  getLabel,
  listFilters,
  listLabels,
  listMessageIdsInLabel,
  renameLabel,
} from "../lib/gmailApi";
import { migratedLabelNames, planLabelMigration, runLabelMigration } from "../lib/labelMigration";
import type { LabelMigrationStep } from "../lib/labelMigration";
import { log } from "../lib/log";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { updateSettings } from "../lib/settingsStore";
import { logAction } from "./recentTab";
import { ctx } from "./state";

const cardEl = document.getElementById("label-tidy-banner") as HTMLDivElement;

function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

function stepRow(step: LabelMigrationStep, count: number | null, checkbox: HTMLInputElement): HTMLElement {
  const row = document.createElement("label");
  row.className = "tidy-row";
  const text = document.createElement("span");
  const verb = step.kind === "rename" ? "Rename" : "Merge";
  const countText = count === null ? "" : ` · ${plural(count, "message")}`;
  text.textContent = `${verb} “${step.from}” → “${step.to}”${countText}`;
  row.append(checkbox, text);
  if (!step.certain) {
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = " (may be your own label: tick to include)";
    row.appendChild(hint);
  }
  return row;
}

export async function maybeShowLabelTidyCard(): Promise<void> {
  if (!cardEl || ctx.settings.labelTidyDismissed) return;

  let token: string;
  let steps: LabelMigrationStep[];
  try {
    token = await gmailProvider.getAuthToken(false);
    steps = planLabelMigration(await listLabels(token), ctx.settings.clusterOwnedLabels);
  } catch (err) {
    log.error("label tidy-up: could not read labels", err);
    return;
  }
  if (steps.length === 0) return;

  const counts = await Promise.all(
    steps.map((s) =>
      getLabel(token, s.sourceId)
        .then((l) => l.messagesTotal ?? null)
        .catch(() => null),
    ),
  );

  cardEl.innerHTML = "";
  const intro = document.createElement("p");
  intro.innerHTML =
    "<strong>Tidy up Cluster's labels.</strong> Older versions of Cluster nested its labels under " +
    "“Cluster/” or “Declutter/”. Cluster now uses plain names with an icon, so they're easy to spot " +
    "next to your own. Your mail and Gmail filters move with the label. Nothing is deleted.";
  cardEl.appendChild(intro);

  const list = document.createElement("div");
  list.className = "tidy-list";
  const boxes = steps.map((step) => {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = step.certain;
    return box;
  });
  steps.forEach((step, i) => list.appendChild(stepRow(step, counts[i], boxes[i])));
  cardEl.appendChild(list);

  const actions = document.createElement("div");
  actions.className = "tidy-actions";
  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "btn btn-accent";
  apply.textContent = "Tidy up labels";
  const later = document.createElement("button");
  later.type = "button";
  later.className = "btn";
  later.textContent = "Not now";
  const status = document.createElement("span");
  status.className = "hint";
  status.setAttribute("role", "status");
  actions.append(apply, later, status);
  cardEl.appendChild(actions);

  later.onclick = async () => {
    cardEl.hidden = true;
    ctx.settings = await updateSettings({ labelTidyDismissed: true });
  };

  apply.onclick = async () => {
    const selected = new Set(boxes.flatMap((b, i) => (b.checked ? [i] : [])));
    if (selected.size === 0) {
      status.textContent = "Nothing ticked.";
      return;
    }
    apply.disabled = true;
    later.disabled = true;
    status.textContent = "Tidying…";
    try {
      const result = await runLabelMigration(steps, selected, {
        renameLabel: (id, name) => renameLabel(token, id, name),
        deleteLabel: (id) => deleteLabel(token, id),
        listMessageIdsInLabel: (id) => listMessageIdsInLabel(token, id),
        batchModify: (ids, add, remove) => batchModify(token, ids, add, remove),
        listFilters: () => listFilters(token),
        createFilter: (criteria, action) => createFilter(token, criteria, action),
        deleteFilter: (id) => deleteFilter(token, id),
      });
      ctx.settings = await updateSettings({
        clusterOwnedLabels: [
          ...new Set([...ctx.settings.clusterOwnedLabels, ...migratedLabelNames(steps, selected)]),
        ],
      });
      const parts = [
        result.renamed > 0 ? `renamed ${plural(result.renamed, "label")}` : "",
        result.merged > 0 ? `merged ${plural(result.merged, "label")} (${plural(result.messagesMoved, "message")})` : "",
        result.filtersRepointed > 0 ? `updated ${plural(result.filtersRepointed, "filter")}` : "",
      ].filter(Boolean);
      const summary = `Tidied labels: ${parts.join(", ")}`;
      await logAction("labels", summary);
      status.textContent = `${summary}.`;
      later.textContent = "Close";
      later.disabled = false;
      later.onclick = () => {
        cardEl.hidden = true;
      };
    } catch (err) {
      log.error("label tidy-up failed", err);
      // Re-planning picks up wherever this stopped, so a retry is safe.
      status.textContent = "Something went wrong part-way. Trying again picks up where it stopped.";
      apply.textContent = "Try again";
      apply.disabled = false;
      apply.onclick = () => void maybeShowLabelTidyCard();
      later.disabled = false;
    }
  };

  cardEl.hidden = false;
}
