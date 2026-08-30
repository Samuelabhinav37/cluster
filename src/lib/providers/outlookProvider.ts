import { mapWithConcurrency } from "../concurrency";
import { fetchWithRetry } from "../httpRetry";
import { parseListUnsubscribe } from "../unsubscribe";
import type { EmailProvider, NormalizedMessageMetadata } from "./emailProvider";
import { getOutlookToken, isOutlookConnected } from "./msalAuth";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
// Graph's JSON batch endpoint caps a single request at 20 sub-requests.
const BATCH_SIZE = 20;

// Thin JSON wrapper. Callers pass the response shape they read as `T`; Graph's
// schema is the source of truth, so this only models the fields each call site
// touches.
async function graphFetch<T = unknown>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  const res = await fetchWithRetry(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Graph API ${path} failed: ${res.status} ${await res.text()}`);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
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

async function getMessageMetadata(token: string, id: string): Promise<NormalizedMessageMetadata> {
  const data = await graphFetch<GraphMessage>(
    `/me/messages/${id}?$select=sender,subject,flag,internetMessageHeaders,receivedDateTime,isRead,size`,
    token,
  );
  const headers: { name: string; value: string }[] = data.internetMessageHeaders ?? [];
  const find = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

  return {
    id,
    provider: "outlook",
    fromAddress: (data.sender?.emailAddress?.address ?? "").toLowerCase(),
    fromDisplayName: data.sender?.emailAddress?.name ?? "",
    replyToAddress: (find("Reply-To")?.match(/<([^>]+)>/)?.[1] ?? find("Reply-To") ?? "").trim().toLowerCase(),
    subject: data.subject ?? "",
    isProtected: data.flag?.flagStatus === "flagged",
    unread: data.isRead === false,
    sizeBytes: Number(data.size ?? 0),
    unsubscribe: parseListUnsubscribe(find("List-Unsubscribe"), find("List-Unsubscribe-Post")),
    receivedAt: data.receivedDateTime ? new Date(data.receivedDateTime).getTime() : 0,
    authenticationResults: find("Authentication-Results"),
  };
}

interface GraphBatchRequest {
  method: "POST" | "PATCH" | "GET" | "DELETE";
  url: string;
  body?: unknown;
}

// Run one Graph action per id, 20 to a $batch request, 4 batches at a time.
async function batchPerId(token: string, ids: string[], build: (id: string) => GraphBatchRequest): Promise<void> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) chunks.push(ids.slice(i, i + BATCH_SIZE));

  await mapWithConcurrency(chunks, 4, async (chunk) => {
    const requests = chunk.map((id, index) => {
      const req = build(id);
      return {
        id: String(index),
        method: req.method,
        url: req.url,
        ...(req.body !== undefined
          ? { headers: { "Content-Type": "application/json" }, body: req.body }
          : {}),
      };
    });
    await graphFetch("/$batch", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    });
  });
}

const move = (dest: string) => (token: string, ids: string[]) =>
  batchPerId(token, ids, (id) => ({ method: "POST", url: `/me/messages/${id}/move`, body: { destinationId: dest } }));

const trashMessages = move("deleteditems");
const untrashMessages = move("inbox");
const archiveMessages = move("archive");
const unarchiveMessages = move("inbox");

async function markReadMessages(token: string, ids: string[]): Promise<void> {
  await batchPerId(token, ids, (id) => ({ method: "PATCH", url: `/me/messages/${id}`, body: { isRead: true } }));
}

// Ensure the Outlook "master category" exists so the colour shows in the UI.
// 409s if it's already there -- treat that as success.
async function ensureCategory(token: string, name: string): Promise<void> {
  const existing = await graphFetch<{ value?: { displayName: string }[] }>("/me/outlook/masterCategories", token);
  if (existing.value?.some((c) => c.displayName === name)) return;
  try {
    await graphFetch("/me/outlook/masterCategories", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name, color: "preset0" }),
    });
  } catch {
    /* concurrent create / already exists */
  }
}

// Graph has no nested labels; the whole "Cluster/Shopping" string becomes one
// flat category. PATCHing `categories` replaces the array, so a message's
// other categories are not preserved -- acceptable for the sort use case,
// where each message gets exactly one Cluster bucket.
async function labelMessages(token: string, ids: string[], labelName: string, keepInInbox = false): Promise<void> {
  await ensureCategory(token, labelName);
  await batchPerId(token, ids, (id) => ({
    method: "PATCH",
    url: `/me/messages/${id}`,
    body: { categories: [labelName] },
  }));
  if (!keepInInbox) await archiveMessages(token, ids);
}

async function unlabelMessages(
  token: string,
  ids: string[],
  _labelName: string,
  wasFiledOut: boolean,
): Promise<void> {
  await batchPerId(token, ids, (id) => ({ method: "PATCH", url: `/me/messages/${id}`, body: { categories: [] } }));
  if (wasFiledOut) await unarchiveMessages(token, ids);
}

export const outlookProvider: EmailProvider = {
  id: "outlook",
  isConnected: isOutlookConnected,
  getAuthToken: getOutlookToken,
  listCandidateMessages,
  getMessageMetadata,
  trashMessages,
  untrashMessages,
  archiveMessages,
  unarchiveMessages,
  markReadMessages,
  labelMessages,
  unlabelMessages,
};
