// Flat-label collision guard. Cluster's labels are flat ("Shopping",
// "Newsletters", …) with no "Cluster/" parent, so a bucket label can clash by
// name with a label the user already made. This module decides, for one
// desired name, whether Cluster can just use it, must reuse the user's
// existing label, or needs to ask.
//
// Pure — no chrome, no fetch. The dashboard feeds it the label list plus the
// persisted state from settingsStore (clusterOwnedLabels, labelChoices) and
// acts on the result.

export type LabelResolution =
  | { name: string }
  | { conflict: { desired: string; existingUserLabel: string } };

export type LabelChoice = "reuse" | "suffix";

function ciEquals(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * What label name to actually use for `desired`.
 * - a prior user decision in `choices` always wins;
 * - no existing label with this name (case-insensitive) → use `desired` as-is;
 * - an existing label that Cluster created (`owned`) → reuse it;
 * - an existing label the user made → `conflict`, caller must ask.
 */
export function resolveLabelName(
  desired: string,
  existingLabelNames: string[],
  owned: string[],
  choices: Record<string, string>,
): LabelResolution {
  const decided = choices[desired];
  if (decided) return { name: decided };

  const existing = existingLabelNames.find((n) => ciEquals(n, desired));
  if (!existing) return { name: desired };

  if (owned.some((n) => ciEquals(n, desired))) return { name: existing };

  return { conflict: { desired, existingUserLabel: existing } };
}

/** The name a collision choice resolves to: reuse the user's, or keep Cluster's
 * separate with a " (Cluster)" suffix. */
export function applyLabelChoice(desired: string, choice: LabelChoice): string {
  return choice === "suffix" ? `${desired} (Cluster)` : desired;
}
