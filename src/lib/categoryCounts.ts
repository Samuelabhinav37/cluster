// The first screen's "how much is there" line, from the provider's exact
// category counts (Gmail labels.get, one cheap call each), shown while the
// first build is still reading mail.
import type { CategoryCount } from "./providers/emailProvider";

const NAMES: Record<CategoryCount["category"], [one: string, many: string]> = {
  promotions: ["promotion", "promotions"],
  updates: ["update", "updates"],
  social: ["social message", "social messages"],
  forums: ["forum message", "forum messages"],
};

/** "12,431 promotions, 3,210 updates and 1,120 social messages", largest
 * first, empty categories left out. Empty when there's nothing to count. */
export function describeCategoryCounts(counts: readonly CategoryCount[]): string {
  const totals = new Map<CategoryCount["category"], number>();
  for (const c of counts) totals.set(c.category, (totals.get(c.category) ?? 0) + c.total);
  const parts = [...totals]
    .filter(([, total]) => total > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([category, total]) => `${total.toLocaleString("en-US")} ${NAMES[category][total === 1 ? 0 : 1]}`);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
