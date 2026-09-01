import { mapWithConcurrency } from "../concurrency";
import { fetchWithRetry } from "../httpRetry";
import { parseListUnsubscribe } from "../unsubscribe";
import { selectTrustedAuthenticationResults } from "../emailAuth";
import type { EmailProvider, NormalizedMessageMetadata } from "./emailProvider";
import { getOutlookToken, isOutlookConnected } from "./msalAuth";

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
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Prefer")) headers.set("Prefer", 'IdType="ImmutableId"');
  const res = await fetchWithRetry(url, {
    ...init,
    headers,
  });
  if (!res.ok) {
    throw new GraphApiError(res.status, `Graph API ${path} failed: ${res.status} ${await res.text()}`);
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
  categories?: string[];
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
    `/me/messages/${id}?$select=sender,subject,flag,internetMessageHeaders,receivedDateTime,isRead,size`,
    token,
  );
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
    sizeBytes: Number(data.size ?? 0),
    unsubscribe: parseListUnsubscribe(find("List-Unsubscribe"), find("List-Unsubscribe-Post"), {
      provider: "outlook",
      fromAddress,
      authenticationResults: authenticationResultsHeaders,
      dkimSignatures: findAll("DKIM-Signature"),
    }),
    receivedAt: data.receivedDateTime ? new Date(data.receivedDateTime).getTime() : 0,
    authenticationResults,
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
};
