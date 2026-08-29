import { mapWithConcurrency } from "../concurrency";
import { fetchWithRetry } from "../httpRetry";
import { parseListUnsubscribe } from "../unsubscribe";
import type { EmailProvider, NormalizedMessageMetadata } from "./emailProvider";
import { getOutlookToken, isOutlookConnected } from "./msalAuth";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const TRASH_BATCH_SIZE = 20;

async function graphFetch(path: string, token: string, init: RequestInit = {}): Promise<any> {
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
  if (res.status === 204) return null;
  return res.json();
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function listCandidateMessages(token: string, maxResults: number, windowDays: number) {
  const ids: string[] = [];
  const filter = encodeURIComponent(`receivedDateTime ge ${isoDaysAgo(windowDays)}`);
  let url = `/me/mailFolders/inbox/messages?$select=id&$filter=${filter}&$top=${Math.min(999, maxResults)}&$orderby=receivedDateTime desc`;

  while (url && ids.length < maxResults) {
    const data = await graphFetch(url, token);
    for (const m of data.value ?? []) ids.push(m.id);
    url = data["@odata.nextLink"] ?? "";
  }

  return ids.slice(0, maxResults).map((id) => ({ id, provider: "outlook" as const }));
}

async function getMessageMetadata(token: string, id: string): Promise<NormalizedMessageMetadata> {
  const data = await graphFetch(
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
    subject: data.subject ?? "",
    isProtected: data.flag?.flagStatus === "flagged",
    unread: data.isRead === false,
    sizeBytes: Number(data.size ?? 0),
    unsubscribe: parseListUnsubscribe(find("List-Unsubscribe"), find("List-Unsubscribe-Post")),
    receivedAt: data.receivedDateTime ? new Date(data.receivedDateTime).getTime() : 0,
    authenticationResults: find("Authentication-Results"),
  };
}

async function trashMessages(token: string, ids: string[]): Promise<void> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += TRASH_BATCH_SIZE) {
    chunks.push(ids.slice(i, i + TRASH_BATCH_SIZE));
  }

  await mapWithConcurrency(chunks, 4, async (chunk) => {
    const body = {
      requests: chunk.map((id, index) => ({
        id: String(index),
        method: "POST",
        url: `/me/messages/${id}/move`,
        headers: { "Content-Type": "application/json" },
        body: { destinationId: "deleteditems" },
      })),
    };
    await graphFetch("/$batch", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  });
}

export const outlookProvider: EmailProvider = {
  id: "outlook",
  isConnected: isOutlookConnected,
  getAuthToken: getOutlookToken,
  listCandidateMessages,
  getMessageMetadata,
  trashMessages,
};
