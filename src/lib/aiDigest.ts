import { categorizeDomain, DOMAIN_CATEGORY_LABELS, type DomainCategory } from "./domainCategories";
import { domainOf } from "./domainGrouping";
import type { ExpiryBucket } from "./expiryTriage";
import type { SenderSummary } from "./senderModel";

// Only counts, category labels, and sender display names go in here — the
// same fields already shown in the dashboard's own tables. Never subjects
// or message bodies, so the on-device model only ever narrates aggregates
// this extension already computed for itself.
export function buildDigestInput(senders: SenderSummary[], expiryBuckets: ExpiryBucket[]): string {
  const byCategory = new Map<DomainCategory, { messages: number; senders: number }>();
  for (const s of senders) {
    const category = categorizeDomain(domainOf(s.address));
    const entry = byCategory.get(category) ?? { messages: 0, senders: 0 };
    entry.messages += s.count;
    entry.senders += 1;
    byCategory.set(category, entry);
  }

  const categoryLines = [...byCategory.entries()]
    .sort((a, b) => b[1].messages - a[1].messages)
    .map(([category, { messages, senders: senderCount }]) =>
      `${DOMAIN_CATEGORY_LABELS[category]}: ${messages} messages from ${senderCount} senders`,
    );

  const topSenders = [...senders]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((s) => `${s.displayName || s.address} (${s.count})`);

  const expiryLines = expiryBuckets
    .filter((b) => b.count > 0)
    .map((b) => `${b.count} ${b.label.toLowerCase()}, ${b.retentionDays}+ days old`);

  return [
    `Mail by category: ${categoryLines.join("; ") || "none"}.`,
    `Top senders by volume: ${topSenders.join(", ") || "none"}.`,
    expiryLines.length > 0 ? `Ready to clean up: ${expiryLines.join("; ")}.` : "Nothing flagged as ready to clean up.",
  ].join("\n");
}

export async function checkDigestAvailability(): Promise<SummarizerAvailability> {
  if (typeof Summarizer === "undefined") return "unavailable";
  try {
    return await Summarizer.availability();
  } catch {
    return "unavailable";
  }
}

export async function generateDigest(input: string, onDownloadProgress?: (fraction: number) => void): Promise<string> {
  if (typeof Summarizer === "undefined") {
    throw new Error("On-device summarization isn't available in this browser");
  }
  const summarizer = await Summarizer.create({
    type: "tldr",
    format: "plain-text",
    length: "short",
    sharedContext: "An email inbox-cleanup dashboard, summarizing counts of already-categorized mail for the user.",
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (e) => onDownloadProgress?.(e.loaded));
    },
  });
  try {
    return await summarizer.summarize(input);
  } finally {
    summarizer.destroy();
  }
}
