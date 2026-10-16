import {
  archiveMessages as apiArchiveMessages,
  batchDeleteMessages,
  batchModify,
  createSenderFilter,
  getAuthToken as gmailGetAuthToken,
  getMessageLinks as fetchGmailMessageLinks,
  getMessageMetadata as fetchGmailMessageMetadata,
  getCurrentHistoryId,
  getProfileEmail,
  getSentRecord as apiGetSentRecord,
  listSentMessageIds as apiListSentMessageIds,
  listMailboxChangesSince,
  findLabelIds,
  getOrCreateLabel,
  labelMessages as apiLabelMessages,
  unlabelMessages as apiUnlabelMessages,
  allowSenderThrough as apiAllowSenderThrough,
  listMessageIds,
  listRiskyAttachmentMessageIds as apiListRiskyAttachmentMessageIds,
  listStarredMessageIds as apiListStarredMessageIds,
  listInboxMessageIdsSince,
  listSentCorrespondents as apiListSentCorrespondents,
  markReadMessages as apiMarkReadMessages,
  muteSender as apiMuteSender,
  screenSender as apiScreenSender,
  resurfaceMessages as apiResurfaceMessages,
  snoozeMessages as apiSnoozeMessages,
  trashMessages as apiTrashMessages,
  unarchiveMessages as apiUnarchiveMessages,
  unmuteSender as apiUnmuteSender,
  untrashMessages as apiUntrashMessages,
} from "../gmailApi";
import { parseListUnsubscribe } from "../unsubscribe";
import { relationshipFields } from "../headerFields";
import { MAIL_ROW_VERSION } from "../mailIndex";
import { clusterLabelName } from "../clusterLabels";
import { selectTrustedAuthenticationResults } from "../emailAuth";
import type {
  CandidateScope,
  EmailProvider,
  NormalizedMessageMetadata,
  ScanPurpose,
} from "./emailProvider";

const SUSPICIOUS_LABEL_NAME = clusterLabelName("suspicious");

export function gmailQueryForPurpose(purpose: CandidateScope, windowDays: number): string {
  const age = `newer_than:${windowDays}d`;
  if (purpose === "security") return `in:inbox ${age}`;
  if (purpose === "combined")
    return `(category:promotions OR category:updates OR in:inbox) ${age}`;
  return `(category:promotions OR category:updates) ${age}`;
}

/** Which scan lane(s) a message belongs to, from its Gmail labels. */
export function lanesFromLabelIds(labelIds: readonly string[]): ScanPurpose[] {
  const lanes: ScanPurpose[] = [];
  if (labelIds.includes("INBOX")) lanes.push("security");
  if (labelIds.includes("CATEGORY_PROMOTIONS") || labelIds.includes("CATEGORY_UPDATES")) {
    lanes.push("cleanup");
  }
  // A message returned by the combined query that matched neither bucket (an
  // archived promo Gmail no longer tags, say) still belongs in cleanup.
  return lanes.length > 0 ? lanes : ["cleanup"];
}

/** Labels that take a message out of the mail index entirely. */
const OUT_OF_SCOPE_LABELS = ["TRASH", "SPAM", "DRAFT"];

/** Whether a message with these labels belongs in the mail index: the same
 * population the combined scan lists (inbox, promotions, updates). */
export function inIndexScope(labelIds: readonly string[]): boolean {
  if (OUT_OF_SCOPE_LABELS.some((label) => labelIds.includes(label))) return false;
  return (
    labelIds.includes("INBOX") ||
    labelIds.includes("CATEGORY_PROMOTIONS") ||
    labelIds.includes("CATEGORY_UPDATES")
  );
}

/** The fields of a normalized message that come from its Gmail labels. One
 * place, so a fetched message and a history label change agree. */
export function gmailLabelFields(labelIds: readonly string[]) {
  return {
    isProtected: labelIds.includes("STARRED"),
    unread: labelIds.includes("UNREAD"),
    lanes: lanesFromLabelIds(labelIds),
    gmailPromotion: labelIds.includes("CATEGORY_PROMOTIONS"),
    providerMarkedPersonal: labelIds.includes("IMPORTANT") || labelIds.includes("CATEGORY_PERSONAL"),
    labelIds: [...labelIds],
  };
}

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

  async listCandidateMessages(token, maxResults, windowDays, purpose = "cleanup") {
    const query = gmailQueryForPurpose(purpose, windowDays);
    const stubs = await listMessageIds(token, query, maxResults);
    return stubs.map((s) => ({ id: s.id, provider: "gmail" as const }));
  },

  async listIncrementalMessages(token, cursor, maxResults, windowDays, purpose) {
    // Cleanup/rule scans still need the full purpose-specific population;
    // incremental history is currently used for the recent-Inbox security lane.
    if (purpose !== "security") {
      const messages = await this.listCandidateMessages(token, maxResults, windowDays, purpose);
      return { messages, cursor: cursor ?? "", reset: false };
    }

    if (!cursor) {
      // Capture the checkpoint before the baseline so mail arriving during the
      // scan is replayed next time (duplicates are safe; missed mail is not).
      const historyId = await getCurrentHistoryId(token);
      const messages = await this.listCandidateMessages(token, maxResults, windowDays, "security");
      return { messages, cursor: historyId, reset: true };
    }

    const changes = await listInboxMessageIdsSince(token, cursor);
    if (changes.expired) {
      const historyId = await getCurrentHistoryId(token);
      const messages = await this.listCandidateMessages(token, maxResults, windowDays, "security");
      return { messages, cursor: historyId, reset: true };
    }
    return {
      messages: changes.messageIds.map((id) => ({ id, provider: "gmail" as const })),
      cursor: changes.historyId,
      reset: false,
    };
  },

  async getMessageMetadata(token, id): Promise<NormalizedMessageMetadata> {
    const {
      headers,
      authenticationResultsHeaders,
      dkimSignatures,
      labelIds,
      internalDate,
      sizeEstimate,
      threadId,
      header,
    } = await fetchGmailMessageMetadata(token, id);
    const { address, displayName } = parseFrom(headers.From ?? "");
    const authenticationResults = selectTrustedAuthenticationResults("gmail", authenticationResultsHeaders);
    return {
      id,
      provider: "gmail",
      fromAddress: address,
      fromDisplayName: displayName,
      replyToAddress: headers["Reply-To"] ? parseFrom(headers["Reply-To"]).address : "",
      subject: headers.Subject ?? "",
      ...gmailLabelFields(labelIds),
      sizeBytes: sizeEstimate,
      unsubscribe: parseListUnsubscribe(headers["List-Unsubscribe"], headers["List-Unsubscribe-Post"], {
        provider: "gmail",
        fromAddress: address,
        authenticationResults: authenticationResultsHeaders,
        dkimSignatures,
      }),
      receivedAt: internalDate,
      authenticationResults,
      precedence: headers.Precedence,
      autoSubmitted: headers["Auto-Submitted"],
      ...relationshipFields(header),
      threadId,
      v: MAIL_ROW_VERSION,
    };
  },

  listSentMessageIds(token, maxResults) {
    return apiListSentMessageIds(token, maxResults);
  },

  getSentRecord(token, id) {
    return apiGetSentRecord(token, id);
  },

  isSentLabels(labelIds) {
    return labelIds.includes("SENT") && !labelIds.includes("DRAFT");
  },

  async listMessageIdsFrom(token, address, maxResults, windowDays) {
    const stubs = await listMessageIds(token, `from:(${address}) newer_than:${windowDays}d`, maxResults);
    return stubs.map((stub) => stub.id);
  },

  async listLabelledIds(token, label, maxResults, windowDays) {
    const term = label === "unread" ? "is:unread" : "is:starred";
    const stubs = await listMessageIds(token, `${term} newer_than:${windowDays}d`, maxResults);
    return new Set(stubs.map((stub) => stub.id));
  },

  async getAccountId(token) {
    return (await getProfileEmail(token)).toLowerCase();
  },

  getChangeCursor(token) {
    return getCurrentHistoryId(token);
  },

  async listChangesSince(token, cursor) {
    const changes = await listMailboxChangesSince(token, cursor);
    return {
      added: changes.added,
      removed: changes.removed,
      labelUpdates: changes.labelUpdates,
      cursor: changes.historyId,
      expired: changes.expired,
    };
  },

  applyLabelIds(meta, labelIds) {
    if (!inIndexScope(labelIds)) return null;
    return { ...meta, ...gmailLabelFields(labelIds) };
  },

  async listRiskyAttachmentMessageIds(token, windowDays) {
    return await apiListRiskyAttachmentMessageIds(token, windowDays);
  },

  async trashMessages(token, ids) {
    await apiTrashMessages(token, ids);
  },

  async listProtectedMessageIds(token) {
    return await apiListStarredMessageIds(token);
  },

  async untrashMessages(token, ids) {
    await apiUntrashMessages(token, ids);
  },

  async archiveMessages(token, ids) {
    await apiArchiveMessages(token, ids);
  },

  async unarchiveMessages(token, ids) {
    await apiUnarchiveMessages(token, ids);
  },

  async markReadMessages(token, ids) {
    await apiMarkReadMessages(token, ids);
  },

  async labelMessages(token, ids, labelName, keepInInbox) {
    await apiLabelMessages(token, ids, labelName, keepInInbox);
  },

  async unlabelMessages(token, ids, labelName, wasFiledOut) {
    await apiUnlabelMessages(token, ids, labelName, wasFiledOut);
  },

  async muteSender(token, fromAddress, existingIds) {
    await apiMuteSender(token, fromAddress, existingIds);
  },

  async unmuteSender(token, fromAddress, mutedIds) {
    await apiUnmuteSender(token, fromAddress, mutedIds);
  },

  async screenSender(token, fromAddress, existingIds) {
    await apiScreenSender(token, fromAddress, existingIds);
  },

  async allowSenderThrough(token, fromAddress, screenedIds) {
    await apiAllowSenderThrough(token, fromAddress, screenedIds);
  },

  async listSentCorrespondents(token) {
    return apiListSentCorrespondents(token);
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

  async unlabelSuspicious(token, ids) {
    const labelIds = await findLabelIds(token, SUSPICIOUS_LABEL_NAME);
    await batchModify(token, ids, ["INBOX"], labelIds);
  },

  async getMessageLinks(token, id) {
    return fetchGmailMessageLinks(token, id);
  },
};
