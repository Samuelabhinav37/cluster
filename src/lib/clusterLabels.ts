// The one table of every Gmail/Outlook label Cluster creates, and the names
// earlier builds used for the same label. Older builds nested everything under
// "Cluster/" (and, before the rename, "Declutter/"); ad10ae6 flattened the
// names in code but never touched labels already sitting in users' mailboxes,
// so lookups here still recognise those prefixed names.
//
// Names carry a leading emoji so Cluster's labels are easy to spot next to the
// user's own. None use the U+FE0F variation selector: it is invisible, so a
// name with and without it would look identical but compare unequal.

export type ClusterLabelKey =
  | "otp"
  | "receipt"
  | "shipping"
  | "newsletter"
  | "social"
  | "promotions"
  | "shopping"
  | "travel"
  | "finance"
  | "productivity"
  | "education"
  | "muted"
  | "screener"
  | "snoozed"
  | "suspicious"
  | "readLater";

export interface ClusterLabelSpec {
  name: string;
  /** Names earlier builds created this label under, newest first. */
  legacyNames: string[];
}

const LEGACY_PREFIXES = ["Cluster/", "Declutter/"];

function spec(name: string, ...flatLegacy: string[]): ClusterLabelSpec {
  const legacyNames: string[] = [];
  for (const flat of flatLegacy) {
    legacyNames.push(flat);
    for (const prefix of LEGACY_PREFIXES) legacyNames.push(prefix + flat);
  }
  return { name, legacyNames };
}

export const CLUSTER_LABELS: Record<ClusterLabelKey, ClusterLabelSpec> = {
  otp: spec("🔑 One-time codes", "One-time codes"),
  receipt: spec("🧾 Receipts", "Receipts & invoices"),
  shipping: spec("📦 Orders & shipping", "Order & shipping updates"),
  newsletter: spec("📰 Newsletters", "Newsletters"),
  social: spec("💬 Social", "Social"),
  promotions: spec("🏷 Promotions"),
  shopping: spec("🛍 Shopping", "Shopping"),
  travel: spec("🧳 Travel", "Travel"),
  finance: spec("💳 Finance", "Finance"),
  productivity: spec("💼 Work", "Productivity"),
  education: spec("🎓 Education", "Education"),
  muted: spec("🔇 Muted", "Muted"),
  screener: spec("✋ Screener", "Screener"),
  snoozed: spec("💤 Snoozed", "Snoozed"),
  suspicious: spec("🚨 Possible phishing", "Possible Phishing"),
  readLater: spec("📖 Read later", "Read Later"),
};

export function clusterLabelName(key: ClusterLabelKey): string {
  return CLUSTER_LABELS[key].name;
}

function isPrefixedLegacy(name: string): boolean {
  return LEGACY_PREFIXES.some((p) => name.startsWith(p));
}

function stripLegacyPrefix(name: string): string {
  for (const p of LEGACY_PREFIXES) if (name.startsWith(p)) return name.slice(p.length);
  return name;
}

/** The table entry a name belongs to (current or legacy), case-insensitive. */
export function clusterLabelKeyFor(name: string): ClusterLabelKey | null {
  const target = name.toLowerCase();
  for (const [key, s] of Object.entries(CLUSTER_LABELS) as [ClusterLabelKey, ClusterLabelSpec][]) {
    if (s.name.toLowerCase() === target) return key;
    if (s.legacyNames.some((l) => l.toLowerCase() === target)) return key;
  }
  return null;
}

/** The name Cluster should use today for a label stored or passed under any
 * older name. A per-sender "Keep sorted" label just loses its prefix
 * ("Cluster/Jobright Job Alert" → "Jobright Job Alert"); anything else is
 * returned unchanged. */
export function canonicalLabelName(name: string): string {
  const key = clusterLabelKeyFor(name);
  if (key) return CLUSTER_LABELS[key].name;
  return stripLegacyPrefix(name);
}

/** Label names to look for, in order of preference, when resolving `name` to
 * an existing label: the name exactly as given (honours a user's own label a
 * rule points at), then the current name, then the prefixed names earlier
 * builds used. Plain legacy names like "Shopping" are deliberately not
 * searched — the user may own a label by that name — the one-time label
 * tidy-up adopts those only when Cluster is known to have made them. */
export function labelLookupNames(name: string): string[] {
  const key = clusterLabelKeyFor(name);
  const canonical = canonicalLabelName(name);
  const prefixed = key
    ? CLUSTER_LABELS[key].legacyNames.filter(isPrefixedLegacy)
    : LEGACY_PREFIXES.map((p) => p + canonical);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of [name, canonical, ...prefixed]) {
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

/** Should a stored label name be rewritten to its current name? Prefixed
 * names always (only Cluster ever made those); a plain legacy name like
 * "Newsletters" only when Cluster is known to have created it. */
function shouldRewrite(name: string, clusterOwned: Set<string>): boolean {
  if (canonicalLabelName(name) === name) return false;
  return isPrefixedLegacy(name) || clusterOwned.has(name.toLowerCase());
}

const OLD_SORT_RULE_PREFIX = "Auto-sort: ";
export const SORT_RULE_PREFIX = "Sort: ";

type StoredRecord = Record<string, unknown>;

function rewriteLabelField(rec: StoredRecord, owned: Set<string>): StoredRecord {
  const name = rec.labelName;
  if (typeof name !== "string" || !shouldRewrite(name, owned)) return rec;
  return { ...rec, labelName: canonicalLabelName(name) };
}

/** Settings v12 migration for the label rename. Rewrites stored rule label
 * names and "Auto-sort:" rule names to today's names, and canonicalises the
 * Cluster-owned label list. Typed loosely because it runs on raw stored
 * settings, before normalisation. */
export function migrateStoredLabelNames(stored: StoredRecord): StoredRecord {
  const ownedRaw = Array.isArray(stored.clusterOwnedLabels) ? stored.clusterOwnedLabels : [];
  const ownedNames = ownedRaw.filter((n): n is string => typeof n === "string");
  const owned = new Set(ownedNames.map((n) => n.toLowerCase()));
  const isRec = (v: unknown): v is StoredRecord => Boolean(v) && typeof v === "object" && !Array.isArray(v);

  const rules = Array.isArray(stored.rules)
    ? stored.rules.map((rule) => {
        if (!isRec(rule)) return rule;
        let next = rewriteLabelField(rule, owned);
        if (Array.isArray(next.actions)) {
          next = { ...next, actions: next.actions.map((a) => (isRec(a) ? rewriteLabelField(a, owned) : a)) };
        }
        if (typeof next.name === "string" && next.name.startsWith(OLD_SORT_RULE_PREFIX)) {
          const rest = next.name.slice(OLD_SORT_RULE_PREFIX.length);
          const label = clusterLabelKeyFor(rest) ? canonicalLabelName(rest) : rest;
          next = { ...next, name: SORT_RULE_PREFIX + label };
        }
        return next;
      })
    : stored.rules;

  // Choices were keyed by the old desired names; none of those are asked for
  // any more, so they can't match and would only linger.
  const labelChoices = isRec(stored.labelChoices)
    ? Object.fromEntries(Object.entries(stored.labelChoices).filter(([k]) => !clusterLabelKeyFor(k)))
    : stored.labelChoices;

  // Keep the old names alongside today's: the label tidy-up uses them to tell
  // a plain "Shopping" Cluster made from one the user made.
  const clusterOwnedLabels = [...new Set([...ownedNames.map(canonicalLabelName), ...ownedNames])];
  // Only write back fields that were stored: an explicit `undefined` would
  // override the defaults normalisation fills in.
  const out: StoredRecord = { ...stored };
  if (stored.rules !== undefined) out.rules = rules;
  if (stored.labelChoices !== undefined) out.labelChoices = labelChoices;
  if (stored.clusterOwnedLabels !== undefined) out.clusterOwnedLabels = clusterOwnedLabels;
  return out;
}
