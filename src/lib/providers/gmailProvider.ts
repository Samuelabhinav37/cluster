import {
  batchDeleteMessages,
  batchModify,
  createLabel,
  createSenderFilter,
  getAuthToken as gmailGetAuthToken,
  getMessageMetadata as fetchGmailMessageMetadata,
  listMessageIds,
  trashMessage,
  untrashMessage,
} from "../gmailApi";
import { mapWithConcurrency } from "../concurrency";
import { parseListUnsubscribe } from "../unsubscribe";
import type { EmailProvider, NormalizedMessageMetadata } from "./emailProvider";

function parseFrom(from: string): { address: string; displayName: string } {
  const match = from.match(/^(.*?)<(.+)>$/);
  if (match) {
    return {
      displayName: match[1].trim().replace(/^"|"$/g, ""),
      address: match[2].trim().toLowerCase(),
    };
  }
  return { displayName: from, address: from.trim().toLowerCase() };
}

export const gmailProvider: EmailProvider = {
  id: "gmail",

  async isConnected() {
    try {
      await gmailGetAuthToken(false);
      return true;
    } catch {
      return false;
    }
  },

  getAuthToken(interactive: boolean) {
    return gmailGetAuthToken(interactive);
  },

  async listCandidateMessages(token, maxResults, windowDays) {
    const query = `category:promotions OR category:updates newer_than:${windowDays}d`;
    const stubs = await listMessageIds(token, query, maxResults);
    return stubs.map((s) => ({ id: s.id, provider: "gmail" as const }));
  },

  async getMessageMetadata(token, id): Promise<NormalizedMessageMetadata> {
    const { headers, labelIds, internalDate } = await fetchGmailMessageMetadata(token, id);
    const { address, displayName } = parseFrom(headers.From ?? "");
    return {
      id,
      provider: "gmail",
      fromAddress: address,
      fromDisplayName: displayName,
      subject: headers.Subject ?? "",
      isProtected: labelIds.includes("STARRED"),
      unsubscribe: parseListUnsubscribe(headers["List-Unsubscribe"], headers["List-Unsubscribe-Post"]),
      receivedAt: internalDate,
    };
  },

  async trashMessages(token, ids) {
    await mapWithConcurrency(ids, 10, (id) => trashMessage(token, id));
  },

  async untrashMessages(token, ids) {
    await mapWithConcurrency(ids, 10, (id) => untrashMessage(token, id));
  },

  async permanentlyDeleteMessages(token, ids) {
    await batchDeleteMessages(token, ids);
  },

  async keepSorted(token, fromAddress, label, existingIds) {
    const labelId = await createLabel(token, label);
    await createSenderFilter(token, fromAddress, labelId);
    await batchModify(token, existingIds, [labelId], ["INBOX"]);
  },
};
