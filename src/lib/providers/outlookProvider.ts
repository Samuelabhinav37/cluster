import { mapWithConcurrency } from "../concurrency";
import { fetchWithRetry } from "../httpRetry";
import { parseListUnsubscribe } from "../unsubscribe";
import { selectTrustedAuthenticationResults } from "../emailAuth";
import { isRiskyAttachmentFilename } from "../riskyAttachments";
import type { EmailProvider, NormalizedMessageMetadata } from "./emailProvider";
import { forceRefreshOutlookToken, getOutlookToken, isOutlookConnected } from "./msalAuth";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
// Graph's JSON batch endpoint caps a single request at 20 sub-requests.
const BATCH_SIZE = 20;
const BATCH_MAX_RETRIES = 3;

class GraphApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class GraphBatchError extends Error {
  constructor(readonly failures: Array<{ messageId: string; status: number; body?: unknown }>) {
    super(
      `Graph batch failed for ${failures.length} message${failures.length === 1 ? "" : "s"}: ` +
        failures.map((failure) => `${failure.messageId} (${failure.status})`).join(", "),
    );
  }
}

// Thin JSON wrapper. Callers pass the response shape they read as `T`; Graph's
// schema is the source of truth, so this only models the fields each call site
// touches.
async function graphFetch<T = unknown>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  let bearer = token;
  for (let attempt = 0; ; attempt++) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${bearer}`);
    if (!headers.has("Prefer")) headers.set("Prefer", 'IdType="ImmutableId"');
    const res = await fetchWithRetry(url, {
      ...init,
      headers,
    });
    // The stored access token can still be inside its stated lifetime yet
    // already rejected by Microsoft (revoked grant, password change, skew).
    // Force one refresh past the expiry check and retry; a second 401 means
    // the refresh token is dead too and forceRefreshOutlookToken throws
    // OutlookReauthRequired.
    if (res.status === 401 && attempt === 0) {
      bearer = await forceRefreshOutlookToken();
      continue;
    }
    if (!res.ok) {
      throw new GraphApiError(res.status, `Graph API ${path} failed: ${res.status} ${await res.text()}`);
    }
    if (res.status === 204) return null as T;
    return (await res.json()) as T;
  }
}

interface GraphMessage {
  id: string;
  sender?: { emailAddress?: { address?: string; name?: string } };
  subject?: string;
  flag?: { flagStatus?: string };
  internetMessageHeaders?: { name: string; value: string }[];
  isRead?: boolean;
  size?: number;
  receivedDateTime?: string;
  categories?: string[];
  hasAttachments?: boolean;
  attachments?: { name?: string }[];
  inferenceClassification?: string;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function listCandidateMessages(token: string, maxResults: number, windowDays: number) {
  const ids: string[] = [];
  const filter = encodeURIComponent(`receivedDateTime ge ${isoDaysAgo(windowDays)}`);
  let url = `/me/mailFolders/inbox/messages?$select=id&$filter=${filter}&$top=${Math.min(999, maxResults)}&$orderby=receivedDateTime desc`;

  while (url && ids.length < maxResults) {
    const data = await graphFetch<{ value?: { id: string }[]; "@odata.nextLink"?: string }>(url, token);
    for (const m of data.value ?? []) ids.push(m.id);
    url = data["@odata.nextLink"] ?? "";
  }

  return ids.slice(0, maxResults).map((id) => ({ id, provider: "outlook" as const }));
}

async function listIncrementalMessages(
  token: string,
  cursor: string | undefined,
  maxResults: number,
  windowDays: number,
) {
  const messages = new Map<string, { id: string; provider: "outlook" }>();
  const initial = !cursor;
  const filter = encodeURIComponent(`receivedDateTime ge ${isoDaysAgo(windowDays)}`);
  let url =
    cursor ??
    `/me/mailFolders/inbox/messages/delta?$select=id&$filter=${filter}&$top=${Math.min(100, maxResults)}`;
  let deltaLink = "";

  try {
    while (url) {
      const data = await graphFetch<{
        value?: Array<{ id?: string; "@removed"?: unknown }>;
        "@odata.nextLink"?: string;
        "@odata.deltaLink"?: string;
      }>(url, token);
      for (const message of data.value ?? []) {
        if (message.id && !message["@removed"]) {
          messages.set(message.id, { id: message.id, provider: "outlook" });
        }
      }
      if (data["@odata.deltaLink"]) deltaLink = data["@odata.deltaLink"];
      url = data["@odata.nextLink"] ?? "";
    }
  } catch (error) {
    if (cursor && error instanceof GraphApiError && error.status === 410) {
      return listIncrementalMessages(token, undefined, maxResults, windowDays);
    }
    throw error;
  }

  if (!deltaLink) throw new Error("Outlook delta response did not include a deltaLink");
  return { messages: [...messages.values()], cursor: deltaLink, reset: initial };
}

async function getMessageMetadata(token: string, id: string): Promise<NormalizedMessageMetadata> {
  const data = await graphFetch<GraphMessage>(
    `/me/messages/${id}?$select=sender,subject,flag,internetMessageHeaders,receivedDateTime,isRead,size,hasAttachments,inferenceClassification&$expand=attachments($select=name)`,
    token,
  );
  // No extra round trip -- $expand rides along on the same GET. Filenames
  // only, never $select=contentBytes, so this stays metadata-only the same
  // way the rest of this fetch is (see riskyAttachments.ts).
  const hasRiskyAttachment =
    data.hasAttachments === true &&
    (data.attachments ?? []).some((a) => a.name && isRiskyAttachmentFilename(a.name));
  const headers: { name: string; value: string }[] = data.internetMessageHeaders ?? [];
  const find = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
  const findAll = (name: string) =>
    headers.filter((h) => h.name.toLowerCase() === name.toLowerCase()).map((h) => h.value);
  const fromAddress = (data.sender?.emailAddress?.address ?? "").toLowerCase();
  const authenticationResultsHeaders = findAll("Authentication-Results");
  const authenticationResults = selectTrustedAuthenticationResults("outlook", authenticationResultsHeaders);

  return {
    id,
    provider: "outlook",
    fromAddress,
    fromDisplayName: data.sender?.emailAddress?.name ?? "",
    replyToAddress: (find("Reply-To")?.match(/<([^>]+)>/)?.[1] ?? find("Reply-To") ?? "")
      .trim()
      .toLowerCase(),
    subject: data.subject ?? "",
    isProtected: data.flag?.flagStatus === "flagged",
    unread: data.isRead === false,
    // Outlook has no Promotions/Updates split — the whole inbox scan feeds
    // both lanes; the security slice is post-capped by the dashboard.
    lanes: ["cleanup", "security"],
    sizeBytes: Number(data.size ?? 0),
    unsubscribe: parseListUnsubscribe(find("List-Unsubscribe"), find("List-Unsubscribe-Post"), {
      provider: "outlook",
      fromAddress,
      authenticationResults: authenticationResultsHeaders,
      dkimSignatures: findAll("DKIM-Signature"),
    }),
    receivedAt: data.receivedDateTime ? new Date(data.receivedDateTime).getTime() : 0,
    authenticationResults,
    hasRiskyAttachment,
    providerMarkedPersonal: data.inferenceClassification === "focused",
    precedence: find("Precedence"),
    autoSubmitted: find("Auto-Submitted"),
  };
}

interface GraphBatchRequest {
  method: "POST" | "PATCH" | "GET" | "DELETE";
  url: string;
  body?: unknown;
}

interface GraphBatchResponse {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

function responseHeader(headers: Record<string, string> | undefined, name: string): string | undefined {
  const entry = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

function retryAfterMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Run one Graph action per id, 20 to a $batch request, 4 batches at a time.
export async function batchPerId(
  token: string,
  ids: string[],
  build: (id: string) => GraphBatchRequest,
): Promise<Map<string, unknown>> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) chunks.push(ids.slice(i, i + BATCH_SIZE));

  const results = await mapWithConcurrency(chunks, 4, async (chunk) => {
    let pending = chunk.map((id, index) => {
      const req = build(id);
      return {
        messageId: id,
        request: {
          id: String(index),
          method: req.method,
          url: req.url,
          headers: {
            Prefer: 'IdType="ImmutableId"',
            ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          ...(req.body !== undefined ? { body: req.body } : {}),
        },
      };
    });
    const values = new Map<string, unknown>();
    const terminalFailures: Array<{ messageId: string; status: number; body?: unknown }> = [];

    for (let attempt = 0; pending.length > 0; attempt += 1) {
      const data = await graphFetch<{ responses?: GraphBatchResponse[] }>("/$batch", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: pending.map((item) => item.request) }),
      });
      const responseById = new Map((data.responses ?? []).map((response) => [response.id, response]));
      const retry: typeof pending = [];
      let waitMs = 0;

      for (const item of pending) {
        const response = responseById.get(item.request.id);
        const status = response?.status ?? 502;
        if (status >= 200 && status < 300) {
          values.set(item.messageId, response?.body);
          continue;
        }
        if ((status === 429 || status >= 500) && attempt < BATCH_MAX_RETRIES) {
          retry.push(item);
          waitMs = Math.max(
            waitMs,
            retryAfterMs(responseHeader(response?.headers, "Retry-After")) ??
              1_000 * 2 ** attempt * (0.5 + Math.random()),
          );
          continue;
        }
        terminalFailures.push({ messageId: item.messageId, status, body: response?.body });
      }

      pending = retry;
      if (pending.length > 0) await delay(waitMs);
    }

    if (terminalFailures.length > 0) throw new GraphBatchError(terminalFailures);
    return values;
  });

  const combined = new Map<string, unknown>();
  for (const result of results) {
    for (const [id, value] of result) combined.set(id, value);
  }
  return combined;
}

const move =
  (dest: string) =>
  async (token: string, ids: string[]): Promise<void> => {
    await batchPerId(token, ids, (id) => ({
      method: "POST",
      url: `/me/messages/${id}/move`,
      body: { destinationId: dest },
    }));
  };

const trashMessages = move("deleteditems");
const untrashMessages = move("inbox");
const archiveMessages = move("archive");
const unarchiveMessages = move("inbox");

async function markReadMessages(token: string, ids: string[]): Promise<void> {
  await batchPerId(token, ids, (id) => ({
    method: "PATCH",
    url: `/me/messages/${id}`,
    body: { isRead: true },
  }));
}

// Ensure the Outlook "master category" exists so the colour shows in the UI.
// 409s if it's already there -- treat that as success. Unlike the Gmail side
// (labelResolver.ts), this doesn't distinguish a category the user already had
// from one Cluster made -- reusing an existing same-named category is harmless
// for Outlook (categories are just tags; applying one doesn't move mail), so
// the flat-label collision guard isn't mirrored here.
async function ensureCategory(token: string, name: string): Promise<void> {
  const existing = await graphFetch<{ value?: { displayName: string }[] }>(
    "/me/outlook/masterCategories",
    token,
  );
  if (existing.value?.some((c) => c.displayName === name)) return;
  try {
    await graphFetch("/me/outlook/masterCategories", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name, color: "preset0" }),
    });
  } catch (error) {
    if (!(error instanceof GraphApiError) || error.status !== 409) throw error;
  }
}

async function categoriesByMessage(token: string, ids: string[]): Promise<Map<string, string[]>> {
  const responses = await batchPerId(token, ids, (id) => ({
    method: "GET",
    url: `/me/messages/${id}?$select=categories`,
  }));
  return new Map(
    ids.map((id) => [id, (responses.get(id) as { categories?: string[] } | undefined)?.categories ?? []]),
  );
}

// The label name ("Shopping", "Newsletters", …) becomes an Outlook category
// verbatim. Graph replaces the categories array, so read and merge first
// to preserve the user's existing organization.
async function labelMessages(
  token: string,
  ids: string[],
  labelName: string,
  keepInInbox = false,
): Promise<void> {
  await ensureCategory(token, labelName);
  const existing = await categoriesByMessage(token, ids);
  await batchPerId(token, ids, (id) => ({
    method: "PATCH",
    url: `/me/messages/${id}`,
    body: { categories: [...new Set([...(existing.get(id) ?? []), labelName])] },
  }));
  if (!keepInInbox) await archiveMessages(token, ids);
}

async function unlabelMessages(
  token: string,
  ids: string[],
  labelName: string,
  wasFiledOut: boolean,
): Promise<void> {
  const existing = await categoriesByMessage(token, ids);
  await batchPerId(token, ids, (id) => ({
    method: "PATCH",
    url: `/me/messages/${id}`,
    body: { categories: (existing.get(id) ?? []).filter((category) => category !== labelName) },
  }));
  if (wasFiledOut) await unarchiveMessages(token, ids);
}

// ── Inbox message rules — the Outlook equivalent of Gmail filters, used by
// server-side "keep sorting" (see serverSort.ts / dashboard applySortPlan).
// NOTE: unexercised against a real mailbox yet — flagged in the live-test
// checklist. The dashboard keeps a client ClusterRule fallback so keep-sorting
// still works if rule creation fails.

/** The user's Archive folder id, or null if Graph won't resolve it. */
export async function getArchiveFolderId(token: string): Promise<string | null> {
  try {
    const data = await graphFetch<{ id?: string }>("/me/mailFolders/archive?$select=id", token);
    return data.id ?? null;
  } catch (error) {
    if (error instanceof GraphApiError) return null;
    throw error;
  }
}

export async function listInboxRules(token: string): Promise<{ id: string; displayName: string }[]> {
  const data = await graphFetch<{ value?: { id: string; displayName: string }[] }>(
    "/me/mailFolders/inbox/messageRules",
    token,
  );
  return data.value ?? [];
}

export async function createInboxRule(token: string, body: unknown): Promise<string> {
  await ensureCategoryFromRuleBody(token, body);
  const data = await graphFetch<{ id: string }>("/me/mailFolders/inbox/messageRules", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return data.id;
}

export async function deleteInboxRule(token: string, id: string): Promise<void> {
  await graphFetch(`/me/mailFolders/inbox/messageRules/${id}`, token, { method: "DELETE" });
}

// The category a rule assigns has to exist as a master category first (same as
// labelMessages does before a PATCH).
async function ensureCategoryFromRuleBody(token: string, body: unknown): Promise<void> {
  const cats = (body as { actions?: { assignCategories?: unknown } })?.actions?.assignCategories;
  if (Array.isArray(cats)) {
    for (const c of cats) if (typeof c === "string") await ensureCategory(token, c);
  }
}

// ── Screener / mute / keep-sorted / auto-quarantine parity (all via
// messageRules + folders/categories) ───────────────────────────────────────
// Rules are identified by a deterministic displayName (`Cluster <feature>:
// <address>`) rather than a tracked id in settings -- same approach Gmail's
// own mute/screen take (deleteSenderFilters finds-by-criteria), so undo needs
// no new settings schema. keepSorted/mute/screener all stay Gmail-parity:
// reversible, never delete, only file mail out of the inbox.

const MUTED_NAME = "Muted";
const SCREENER_NAME = "Screener";
const SUSPICIOUS_CATEGORY_NAME = "Possible Phishing";

interface SenderRuleBody {
  displayName: string;
  sequence: number;
  isEnabled: true;
  conditions: { senderContains: string[] };
  actions: { assignCategories?: string[]; moveToFolder?: string; stopProcessingRules: true };
}

/** Top-level mail folder by display name, created if missing (same
 * check-then-create idiom as ensureCategory above). */
async function ensureMailFolder(token: string, displayName: string): Promise<string> {
  let url = "/me/mailFolders?$select=id,displayName&$top=100";
  while (url) {
    const data = await graphFetch<{ value?: { id: string; displayName: string }[]; "@odata.nextLink"?: string }>(
      url,
      token,
    );
    const found = data.value?.find((f) => f.displayName === displayName);
    if (found) return found.id;
    url = data["@odata.nextLink"] ?? "";
  }
  const created = await graphFetch<{ id: string }>("/me/mailFolders", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  return created.id;
}

async function findRuleIdByName(token: string, displayName: string): Promise<string | null> {
  const rules = await listInboxRules(token);
  return rules.find((r) => r.displayName === displayName)?.id ?? null;
}

async function replaceSenderRule(token: string, displayName: string, body: SenderRuleBody): Promise<void> {
  const existingId = await findRuleIdByName(token, displayName);
  if (existingId) await deleteInboxRule(token, existingId).catch(() => {});
  await createInboxRule(token, body);
}

async function deleteSenderRuleByName(token: string, displayName: string): Promise<void> {
  const existingId = await findRuleIdByName(token, displayName);
  if (existingId) await deleteInboxRule(token, existingId);
}

async function keepSorted(token: string, fromAddress: string, label: string, existingIds: string[]): Promise<void> {
  const displayName = `Cluster keep-sorted: ${fromAddress}`;
  await ensureCategory(token, label);
  const archiveFolderId = await getArchiveFolderId(token);
  await replaceSenderRule(token, displayName, {
    displayName,
    sequence: 60,
    isEnabled: true,
    conditions: { senderContains: [fromAddress] },
    actions: {
      assignCategories: [label],
      ...(archiveFolderId ? { moveToFolder: archiveFolderId } : {}),
      stopProcessingRules: true,
    },
  });
  if (existingIds.length > 0) await labelMessages(token, existingIds, label, false);
}

async function muteSender(token: string, fromAddress: string, existingIds: string[]): Promise<void> {
  const displayName = `Cluster mute: ${fromAddress}`;
  const [folderId] = await Promise.all([ensureMailFolder(token, MUTED_NAME), ensureCategory(token, MUTED_NAME)]);
  await replaceSenderRule(token, displayName, {
    displayName,
    sequence: 70,
    isEnabled: true,
    conditions: { senderContains: [fromAddress] },
    actions: { assignCategories: [MUTED_NAME], moveToFolder: folderId, stopProcessingRules: true },
  });
  if (existingIds.length > 0) {
    await batchPerId(token, existingIds, (id) => ({
      method: "POST",
      url: `/me/messages/${id}/move`,
      body: { destinationId: folderId },
    }));
  }
}

async function unmuteSender(token: string, fromAddress: string, mutedIds: string[]): Promise<void> {
  await deleteSenderRuleByName(token, `Cluster mute: ${fromAddress}`);
  if (mutedIds.length > 0) await move("inbox")(token, mutedIds);
}

async function screenSender(token: string, fromAddress: string, existingIds: string[]): Promise<void> {
  const displayName = `Cluster screener: ${fromAddress}`;
  const [folderId] = await Promise.all([
    ensureMailFolder(token, SCREENER_NAME),
    ensureCategory(token, SCREENER_NAME),
  ]);
  await replaceSenderRule(token, displayName, {
    displayName,
    sequence: 80,
    isEnabled: true,
    conditions: { senderContains: [fromAddress] },
    actions: { assignCategories: [SCREENER_NAME], moveToFolder: folderId, stopProcessingRules: true },
  });
  if (existingIds.length > 0) {
    await batchPerId(token, existingIds, (id) => ({
      method: "POST",
      url: `/me/messages/${id}/move`,
      body: { destinationId: folderId },
    }));
  }
}

async function allowSenderThrough(token: string, fromAddress: string, screenedIds: string[]): Promise<void> {
  await deleteSenderRuleByName(token, `Cluster screener: ${fromAddress}`);
  if (screenedIds.length > 0) await move("inbox")(token, screenedIds);
}

interface GraphRecipient {
  emailAddress?: { address?: string };
}
interface GraphSentMessage {
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
}

// Mirrors gmailApi.ts's listSentCorrespondents (2y window, 1000-address cap)
// -- Graph returns recipients inline on the sent-items list, so unlike Gmail
// this needs no per-message follow-up fetch.
async function listSentCorrespondents(token: string, maxMessages = 150): Promise<string[]> {
  const addresses = new Set<string>();
  const filter = encodeURIComponent(`sentDateTime ge ${isoDaysAgo(730)}`);
  let url = `/me/mailFolders/sentitems/messages?$select=toRecipients,ccRecipients&$filter=${filter}&$top=${Math.min(999, maxMessages)}&$orderby=sentDateTime desc`;
  let fetched = 0;
  while (url && fetched < maxMessages) {
    const data = await graphFetch<{ value?: GraphSentMessage[]; "@odata.nextLink"?: string }>(url, token);
    for (const m of data.value ?? []) {
      for (const r of [...(m.toRecipients ?? []), ...(m.ccRecipients ?? [])]) {
        const addr = r.emailAddress?.address;
        if (addr) addresses.add(addr.toLowerCase());
      }
      fetched++;
    }
    url = data["@odata.nextLink"] ?? "";
  }
  return [...addresses].slice(0, 1000);
}

// Reuses labelMessages/unlabelMessages verbatim (category + archive, merge-
// not-replace) -- auto-quarantine needs no new mechanism on the Outlook side.
async function labelSuspicious(token: string, ids: string[]): Promise<void> {
  await labelMessages(token, ids, SUSPICIOUS_CATEGORY_NAME, false);
}

async function unlabelSuspicious(token: string, ids: string[]): Promise<void> {
  await unlabelMessages(token, ids, SUSPICIOUS_CATEGORY_NAME, true);
}

export const outlookProvider: EmailProvider = {
  id: "outlook",
  isConnected: isOutlookConnected,
  getAuthToken: getOutlookToken,
  listCandidateMessages,
  listIncrementalMessages,
  getMessageMetadata,
  trashMessages,
  untrashMessages,
  archiveMessages,
  unarchiveMessages,
  markReadMessages,
  labelMessages,
  unlabelMessages,
  keepSorted,
  muteSender,
  unmuteSender,
  screenSender,
  allowSenderThrough,
  listSentCorrespondents,
  labelSuspicious,
  unlabelSuspicious,
};
