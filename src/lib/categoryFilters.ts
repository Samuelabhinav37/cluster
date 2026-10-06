// Keeps Cluster's per-category Gmail filters in line with settings. Which
// categories get a filter, and what it does, comes from settings alone (never
// from what the latest scan happened to contain), so re-running Sort my inbox
// can no longer delete the filter of a category that was empty this time.
//
// A filter adds the category's label on arrival. It also takes the mail out
// of the inbox only when that category's time limit is 0 ("straight to the
// label"); otherwise mail stays in the inbox and the time sweep
// (inboxTimeLimits.ts) moves it out once the limit passes.
import { categoryQuery } from "./categoryQueries";
import type { GmailFilterAction, GmailFilterCriteria, GmailFilterResource } from "./gmailApi";
import type { ClusterSettings } from "./settingsStore";
import { ALL_SORT_BUCKETS, DEFAULT_FILE_OUT_OF_INBOX, bucketLabelName, type SortBucket } from "./sortTaxonomy";
import { createFilter, deleteFilter, getOrCreateLabel, listFilters } from "./gmailApi";

export interface CategoryFilterSpec {
  bucket: SortBucket;
  labelName: string;
  criteria: GmailFilterCriteria;
  fileOut: boolean;
}

/** The label a category's mail goes under, honouring a clash the user
 * resolved in Sort my inbox ("Use my Shopping" / "keep separate"). */
export function categoryLabelName(bucket: SortBucket, labelChoices: Record<string, string>): string {
  const name = bucketLabelName(bucket);
  return labelChoices[name] ?? name;
}

/** Categories that should have a filter right now. */
export function filteredCategories(settings: ClusterSettings): SortBucket[] {
  const { autoSort } = settings;
  return ALL_SORT_BUCKETS.filter(
    (b) => autoSort.timeLimitsEnabled || (autoSort.keepSorting && autoSort.enabledBuckets.includes(b)),
  );
}

/** Whether a category's filter takes mail out of the inbox on arrival. With
 * time limits on, only a 0-hour limit does (the sweep handles the rest);
 * plain "keep sorting" keeps its per-category file-out choice. */
function fileOutOnArrival(settings: ClusterSettings, bucket: SortBucket): boolean {
  const { autoSort } = settings;
  // Only Promotions may skip the inbox on arrival (see timeLimitsTab).
  if (autoSort.timeLimitsEnabled) return bucket === "promotions" && autoSort.inboxHoursByBucket[bucket] === 0;
  return autoSort.fileOutByBucket[bucket] ?? DEFAULT_FILE_OUT_OF_INBOX[bucket];
}

export function desiredCategoryFilters(settings: ClusterSettings): CategoryFilterSpec[] {
  const specs: CategoryFilterSpec[] = [];
  for (const bucket of filteredCategories(settings)) {
    const query = categoryQuery(bucket, settings.sortOverrides);
    if (!query) continue;
    specs.push({
      bucket,
      labelName: categoryLabelName(bucket, settings.labelChoices),
      criteria: { query },
      fileOut: fileOutOnArrival(settings, bucket),
    });
  }
  return specs;
}

/** A stable fingerprint of what a filter does, to tell whether the stored
 * one is still right. Includes the label name: a rename means a new id. */
export function specKey(spec: CategoryFilterSpec): string {
  return JSON.stringify([spec.labelName, spec.criteria.query ?? "", spec.fileOut]);
}

export interface CategoryFilterApi {
  labelIdFor(name: string): Promise<string>;
  createFilter(criteria: GmailFilterCriteria, action: GmailFilterAction): Promise<string>;
  deleteFilter(id: string): Promise<void>;
  listFilters(): Promise<GmailFilterResource[]>;
}

export interface CategoryFilterState {
  filterIdsByBucket: Record<string, string[]>;
  filterSpecByBucket: Record<string, string>;
}

export interface CategoryFilterSyncResult extends CategoryFilterState {
  created: number;
  deleted: number;
  kept: number;
}

async function deleteQuietly(api: CategoryFilterApi, id: string): Promise<boolean> {
  try {
    await api.deleteFilter(id);
    return true;
  } catch (err) {
    // Already gone (the user deleted it in Gmail): nothing to do.
    if (/404|not ?found/i.test(String(err))) return false;
    throw err;
  }
}

export async function syncCategoryFilters(
  desired: CategoryFilterSpec[],
  current: CategoryFilterState,
  api: CategoryFilterApi,
): Promise<CategoryFilterSyncResult> {
  const filterIdsByBucket: Record<string, string[]> = {};
  const filterSpecByBucket: Record<string, string> = {};
  let created = 0;
  let deleted = 0;
  let kept = 0;
  const wanted = new Set(desired.map((d) => d.bucket as string));

  for (const [bucket, ids] of Object.entries(current.filterIdsByBucket)) {
    if (wanted.has(bucket)) continue;
    for (const id of ids) if (await deleteQuietly(api, id)) deleted++;
  }

  for (const spec of desired) {
    const key = specKey(spec);
    const oldIds = current.filterIdsByBucket[spec.bucket] ?? [];
    if (current.filterSpecByBucket[spec.bucket] === key && oldIds.length > 0) {
      filterIdsByBucket[spec.bucket] = oldIds;
      filterSpecByBucket[spec.bucket] = key;
      kept++;
      continue;
    }
    for (const id of oldIds) if (await deleteQuietly(api, id)) deleted++;

    const labelId = await api.labelIdFor(spec.labelName);
    const action: GmailFilterAction = {
      addLabelIds: [labelId],
      removeLabelIds: spec.fileOut ? ["INBOX"] : [],
    };
    let id: string;
    try {
      id = await api.createFilter(spec.criteria, action);
    } catch (err) {
      if (!/exist/i.test(String(err))) throw err;
      // Gmail refuses an exact duplicate: adopt the one already there.
      const same = (await api.listFilters()).find(
        (f) => f.criteria?.query === spec.criteria.query && (f.action?.addLabelIds ?? []).includes(labelId),
      );
      if (!same) throw err;
      id = same.id;
    }
    filterIdsByBucket[spec.bucket] = [id];
    filterSpecByBucket[spec.bucket] = key;
    created++;
  }

  return { filterIdsByBucket, filterSpecByBucket, created, deleted, kept };
}

/** Sync against the live Gmail account. */
export function syncGmailCategoryFilters(settings: ClusterSettings, token: string) {
  return syncCategoryFilters(desiredCategoryFilters(settings), settings.autoSort, {
    labelIdFor: (name) => getOrCreateLabel(token, name),
    createFilter: (criteria, action) => createFilter(token, criteria, action),
    deleteFilter: (id) => deleteFilter(token, id),
    listFilters: () => listFilters(token),
  });
}
