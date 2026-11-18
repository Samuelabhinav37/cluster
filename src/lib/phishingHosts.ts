// Phishing hosts from phishunt.io (CC0), plan step 3.8. A suspicion, not a
// verdict: used only for links in mail Cluster checks (bodyChecks.ts), where a
// hit is a "blocklisted-link" warning that holds only with another sign.
import { createBlocklist, isBlockedDomain } from "./blocklist";
import { getDataset, refreshDataset } from "./remoteDataset";

// Not bundled: phishing sites live days, so a copy from release day is stale,
// and it cost 37 KB in the worker. The daily fetch fills it (signed, like the rest).
let list = createBlocklist([]);

const isDomainList = (data: unknown): data is string[] => Array.isArray(data) && data.every((d) => typeof d === "string");

// From the local cache only; never waits on the network.
void getDataset<string[]>("phishingHosts", []).then((fresh) => {
  if (isDomainList(fresh) && fresh.length > 0) list = createBlocklist(fresh);
});

export async function refreshPhishingHosts(publicKeyB64?: string): Promise<boolean> {
  const updated = await refreshDataset("phishingHosts", "phishingHosts.json", isDomainList, "block", publicKeyB64);
  if (updated) {
    const fresh = await getDataset<string[]>("phishingHosts", []);
    if (isDomainList(fresh) && fresh.length > 0) list = createBlocklist(fresh);
  }
  return updated;
}

export function isPhishingHost(host: string): boolean {
  return list.isBlockedDomain(host);
}

/** A link host on the malware list or the phishing list. */
export function isBadLinkHost(host: string): boolean {
  return isBlockedDomain(host) || isPhishingHost(host);
}

/** For tests: the list as if this copy had been fetched. */
export function usePhishingHostsForTest(hosts: readonly string[]): void {
  list = createBlocklist(hosts);
}
