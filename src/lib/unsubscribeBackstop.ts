// After an unsubscribe, list mail that still arrives from that sender goes to
// the "Unsubscribed" label instead of the inbox. Senders may take days to
// process a request, so this is what makes the result visible at once. The
// filter matches the exact address and its mailing list (Gmail's `list:`
// search reads the List-Id header), never the whole domain, so receipts and
// password resets from the same company still arrive. A sender with no
// List-Id gets no filter; the background sweep moves only its list mail.
import { clusterLabelName } from "./clusterLabels";
import { createFilter, deleteFilter, getOrCreateLabel, type GmailFilterCriteria } from "./gmailApi";

/** The filter criteria, or undefined when the sender has no List-Id. */
export function backstopCriteria(address: string, listId: string | undefined): GmailFilterCriteria | undefined {
  if (!listId || /[()"\s]/.test(listId)) return undefined;
  return { from: address, query: `list:(${listId})` };
}

/** Creates the filter and returns its id, or undefined when none applies. */
export async function addGmailBackstop(
  token: string,
  address: string,
  listId: string | undefined,
): Promise<string | undefined> {
  const criteria = backstopCriteria(address, listId);
  if (!criteria) return undefined;
  const labelId = await getOrCreateLabel(token, clusterLabelName("unsubscribed"));
  return createFilter(token, criteria, { addLabelIds: [labelId], removeLabelIds: ["INBOX"] });
}

export async function removeGmailBackstop(token: string, filterId: string): Promise<void> {
  await deleteFilter(token, filterId);
}
