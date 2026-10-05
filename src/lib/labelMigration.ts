// One-time tidy-up of labels older builds left in the mailbox: "Cluster/…",
// "Declutter/…", and the plain names used between ad10ae6 and the emoji
// rename. Each is renamed in place to today's name (messages and filters
// follow, since both point at the label id) or, when today's label already
// exists too, merged into it.
//
// Re-planning after a partial run yields only what is left — a renamed label
// no longer has an old name and a merged one is deleted at the end of its
// step — so an interrupted tidy-up just resumes the next time it is planned.
import { CLUSTER_LABELS, canonicalLabelName, clusterLabelKeyFor } from "./clusterLabels";
import type { GmailFilterAction, GmailFilterCriteria, GmailFilterResource, GmailLabelInfo } from "./gmailApi";

export interface LabelMigrationStep {
  kind: "rename" | "merge";
  /** The old label being renamed, or merged away and deleted. */
  sourceId: string;
  from: string;
  /** Today's name. */
  to: string;
  /** Label the source's mail ends up under. For a rename that is the source
   * itself; for a merge it may be a label an earlier rename step produces. */
  targetId: string;
  /** Cluster certainly made this label (a prefixed name, or a plain name it
   * recorded creating). Otherwise it may be the user's own: shown, unticked. */
  certain: boolean;
  /** Index of the rename step this merge's target depends on, if any. */
  dependsOn?: number;
}

const PREFIXES = ["cluster/", "declutter/"];

function hasLegacyPrefix(name: string): boolean {
  const lower = name.toLowerCase();
  return PREFIXES.some((p) => lower.startsWith(p));
}

export function planLabelMigration(labels: GmailLabelInfo[], clusterOwnedLabels: string[]): LabelMigrationStep[] {
  const owned = new Set(clusterOwnedLabels.map((n) => n.toLowerCase()));
  const userLabels = labels.filter((l) => l.type !== "system");
  const byLower = new Map(userLabels.map((l) => [l.name.toLowerCase(), l]));

  // target name → old labels that should end up under it
  const groups = new Map<string, { to: string; sources: GmailLabelInfo[] }>();
  const addSource = (to: string, source: GmailLabelInfo) => {
    const key = to.toLowerCase();
    const group = groups.get(key) ?? { to, sources: [] };
    if (!group.sources.some((s) => s.id === source.id)) group.sources.push(source);
    groups.set(key, group);
  };

  for (const spec of Object.values(CLUSTER_LABELS)) {
    for (const legacy of spec.legacyNames) {
      const hit = byLower.get(legacy.toLowerCase());
      if (hit) addSource(spec.name, hit);
    }
  }
  // Per-sender "Keep sorted" labels: "Cluster/Jobright Job Alert" → "Jobright Job Alert".
  for (const label of userLabels) {
    if (hasLegacyPrefix(label.name) && !clusterLabelKeyFor(label.name)) {
      addSource(canonicalLabelName(label.name), label);
    }
  }

  const steps: LabelMigrationStep[] = [];
  for (const { to, sources } of groups.values()) {
    const existingTarget = byLower.get(to.toLowerCase());
    const certain = (l: GmailLabelInfo) => hasLegacyPrefix(l.name) || owned.has(l.name.toLowerCase());
    // Prefixed names first (only Cluster made those), then recorded plain ones.
    const rank = (l: GmailLabelInfo) => (hasLegacyPrefix(l.name) ? 2 : certain(l) ? 1 : 0);
    const pending = sources.filter((s) => s.id !== existingTarget?.id).sort((a, b) => rank(b) - rank(a));
    if (pending.length === 0) continue;

    let targetId: string;
    let dependsOn: number | undefined;
    if (existingTarget) {
      targetId = existingTarget.id;
    } else {
      const first = pending.shift()!;
      targetId = first.id;
      dependsOn = steps.length;
      steps.push({ kind: "rename", sourceId: first.id, from: first.name, to, targetId, certain: certain(first) });
    }
    for (const s of pending) {
      steps.push({ kind: "merge", sourceId: s.id, from: s.name, to, targetId, certain: certain(s), dependsOn });
    }
  }
  return steps;
}

export interface LabelMigrationApi {
  renameLabel(id: string, name: string): Promise<void>;
  deleteLabel(id: string): Promise<void>;
  listMessageIdsInLabel(id: string): Promise<string[]>;
  batchModify(ids: string[], add: string[], remove: string[]): Promise<void>;
  listFilters(): Promise<GmailFilterResource[]>;
  createFilter(criteria: GmailFilterCriteria, action: GmailFilterAction): Promise<string>;
  deleteFilter(id: string): Promise<void>;
}

export interface LabelMigrationResult {
  renamed: number;
  merged: number;
  messagesMoved: number;
  filtersRepointed: number;
}

function swap(ids: string[] | undefined, from: string, to: string): string[] | undefined {
  if (!ids) return ids;
  return [...new Set(ids.map((id) => (id === from ? to : id)))];
}

/** Runs the selected steps in order. A merge whose rename was left unticked is
 * skipped: its target would still carry an old (possibly the user's) name. */
export async function runLabelMigration(
  steps: LabelMigrationStep[],
  selected: Set<number>,
  api: LabelMigrationApi,
): Promise<LabelMigrationResult> {
  const result: LabelMigrationResult = { renamed: 0, merged: 0, messagesMoved: 0, filtersRepointed: 0 };
  for (const [i, step] of steps.entries()) {
    if (!selected.has(i)) continue;
    if (step.dependsOn !== undefined && !selected.has(step.dependsOn)) continue;

    if (step.kind === "rename") {
      await api.renameLabel(step.sourceId, step.to);
      result.renamed++;
      continue;
    }

    const ids = await api.listMessageIdsInLabel(step.sourceId);
    if (ids.length > 0) await api.batchModify(ids, [step.targetId], [step.sourceId]);
    result.messagesMoved += ids.length;

    // Gmail filters can't be edited: re-create each one against the target,
    // then drop the original.
    for (const f of await api.listFilters()) {
      const add = f.action?.addLabelIds ?? [];
      const remove = f.action?.removeLabelIds ?? [];
      if (!add.includes(step.sourceId) && !remove.includes(step.sourceId)) continue;
      const action: GmailFilterAction = {
        ...f.action,
        addLabelIds: swap(f.action?.addLabelIds, step.sourceId, step.targetId),
        removeLabelIds: swap(f.action?.removeLabelIds, step.sourceId, step.targetId),
      };
      try {
        await api.createFilter(f.criteria ?? {}, action);
      } catch (err) {
        // An identical filter for the target already exists: the old one is
        // redundant, so dropping it below is still right.
        if (!/exist/i.test(String(err))) throw err;
      }
      await api.deleteFilter(f.id);
      result.filtersRepointed++;
    }

    await api.deleteLabel(step.sourceId);
    result.merged++;
  }
  return result;
}

/** The current names the tidy-up leaves in place, to record as Cluster's. */
export function migratedLabelNames(steps: LabelMigrationStep[], selected: Set<number>): string[] {
  return [...new Set(steps.filter((_, i) => selected.has(i)).map((s) => s.to))];
}

