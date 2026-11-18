// When each reference list was built (plan step 3.6). The published lists are
// plain arrays, so the publish job adds listDates.json (signed like the rest);
// before one is fetched, the bundled lists' own dates stand.
import malware from "./data/malwareDomains.generated.json";
import spam from "./data/spamDomains.generated.json";
import { getDataset, refreshDataset } from "./remoteDataset";

export interface ListDates {
  spam: string;
  malware: string;
  brands?: string;
}

/** Older than this, Settings says the lists are out of date. */
export const STALE_DAYS = 30;

const BUNDLED: ListDates = { spam: spam.generatedAt, malware: malware.generatedAt };

function isListDates(v: unknown): v is ListDates {
  const d = v as ListDates;
  return typeof d?.spam === "string" && typeof d.malware === "string" && !Number.isNaN(Date.parse(d.spam)) && !Number.isNaN(Date.parse(d.malware));
}

export async function listDates(): Promise<ListDates> {
  const remote = await getDataset<ListDates | null>("listDates", null);
  return isListDates(remote) && Date.parse(remote.spam) >= Date.parse(BUNDLED.spam) ? remote : BUNDLED;
}

export function refreshListDates(publicKeyB64?: string): Promise<boolean> {
  return refreshDataset("listDates", "listDates.json", isListDates, "block", publicKeyB64);
}

/** The oldest list's date, and whether it is past STALE_DAYS. */
export function listAge(d: ListDates, now = Date.now()): { oldest: number; stale: boolean } {
  const oldest = Math.min(...[d.spam, d.malware, d.brands].filter((x): x is string => !!x).map(Date.parse));
  return { oldest, stale: now - oldest > STALE_DAYS * 86_400_000 };
}
