import {
  batchDeleteMessages,
  batchModify,
  createSenderFilter,
  getAuthToken as gmailGetAuthToken,
  getMessageLinks as fetchGmailMessageLinks,
  getMessageMetadata as fetchGmailMessageMetadata,
  getOrCreateLabel,
  listMessageIds,
  resurfaceMessages as apiResurfaceMessages,
  snoozeMessages as apiSnoozeMessages,
  trashMessages as apiTrashMessages,
  untrashMessages as apiUntrashMessages,
} from "../gmailApi";
import { parseListUnsubscribe } from "../unsubscribe";
import type { EmailProvider, NormalizedMessageMetadata } from "./emailProvider";

// Same "Declutter/X" nesting convention as gmailApi.ts's own
// SNOOZE_LABEL_NAME, so both show up under one parent label in Gmail's
// sidebar rather than as unrelated top-level labels.
const SUSPICIOUS_LABEL_NAME = "Declutter/Possible Phishing";

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
      authenticationResults: headers["Authentication-Results"],
    };
  },

  async trashMessages(token, ids) {
    await apiTrashMessages(token, ids);
  },

  async untrashMessages(token, ids) {
    await apiUntrashMessages(token, ids);
  },

  async permanentlyDeleteMessages(token, ids) {
    await batchDeleteMessages(token, ids);
  },

  async keepSorted(token, fromAddress, label, existingIds) {
    const labelId = await getOrCreateLabel(token, label);
    await createSenderFilter(token, fromAddress, labelId);
    await batchModify(token, existingIds, [labelId], ["INBOX"]);
  },

  async snoozeMessages(token, ids) {
    await apiSnoozeMessages(token, ids);
  },

  async resurfaceMessages(token, ids) {
    await apiResurfaceMessages(token, ids);
  },

  async labelSuspicious(token, ids) {
    const labelId = await getOrCreateLabel(token, SUSPICIOUS_LABEL_NAME);
    await batchModify(token, ids, [labelId], ["INBOX"]);
  },

  async getMessageLinks(token, id) {
    return fetchGmailMessageLinks(token, id);
  },
};
