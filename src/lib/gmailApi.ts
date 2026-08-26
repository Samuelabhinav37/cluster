import { fetchWithRetry } from "./httpRetry";

const API_BASE = "https://gmail.googleapis.com/gmail/v1";

export async function getAuthToken(interactive = true): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError ?? new Error("No auth token returned"));
        return;
      }
      resolve(token);
    });
  });
}

async function gmailFetch(path: string, token: string, init: RequestInit = {}): Promise<any> {
  const res = await fetchWithRetry(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Gmail API ${path} failed: ${res.status} ${await res.text()}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export interface GmailMessageStub {
  id: string;
  threadId: string;
}

export async function listMessageIds(
  token: string,
  query: string,
  maxResults = 500,
): Promise<GmailMessageStub[]> {
  const results: GmailMessageStub[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(500, maxResults - results.length)),
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await gmailFetch(`/users/me/messages?${params}`, token);
    results.push(...(data.messages ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken && results.length < maxResults);
  return results;
}

export interface RawMessageMetadata {
  headers: Record<string, string>;
  labelIds: string[];
  /** Epoch ms; Gmail returns this on every message resource, metadata format included. */
  internalDate: number;
}

export async function getMessageMetadata(token: string, id: string): Promise<RawMessageMetadata> {
  const params = new URLSearchParams({ format: "metadata" });
  for (const header of ["From", "List-Unsubscribe", "List-Unsubscribe-Post", "Subject"]) {
    params.append("metadataHeaders", header);
  }
  const data = await gmailFetch(`/users/me/messages/${id}?${params}`, token);
  const headers: Record<string, string> = {};
  for (const h of data.payload?.headers ?? []) {
    headers[h.name] = h.value;
  }
  return { headers, labelIds: data.labelIds ?? [], internalDate: Number(data.internalDate ?? 0) };
}

export async function trashMessage(token: string, id: string): Promise<void> {
  await gmailFetch(`/users/me/messages/${id}/trash`, token, { method: "POST" });
}

export async function untrashMessage(token: string, id: string): Promise<void> {
  await gmailFetch(`/users/me/messages/${id}/untrash`, token, { method: "POST" });
}

// https://mail.google.com/ is a Google-classified *restricted* scope — not in
// this extension's default manifest scopes. Only requested interactively when
// a user opts into "Fast permanent delete" (see settingsStore), and would
// trigger a CASA security review if this extension is ever published beyond
// OAuth "Testing" status.
const ELEVATED_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://mail.google.com/",
];

export async function getElevatedAuthToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive, scopes: ELEVATED_SCOPES }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError ?? new Error("No auth token returned"));
        return;
      }
      resolve(token);
    });
  });
}

const BATCH_DELETE_CHUNK_SIZE = 1000;

// Permanent — no Trash recovery, unlike trashMessage. Requires a token
// obtained via getElevatedAuthToken.
export async function batchDeleteMessages(token: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += BATCH_DELETE_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BATCH_DELETE_CHUNK_SIZE);
    await gmailFetch("/users/me/messages/batchDelete", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: chunk }),
    });
  }
}

export async function createLabel(token: string, name: string): Promise<string> {
  const data = await gmailFetch("/users/me/labels", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  });
  return data.id;
}

export async function createSenderFilter(
  token: string,
  fromAddress: string,
  labelId: string,
): Promise<void> {
  await gmailFetch("/users/me/settings/filters", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      criteria: { from: fromAddress },
      action: { addLabelIds: [labelId], removeLabelIds: ["INBOX"] },
    }),
  });
}

export async function batchModify(
  token: string,
  ids: string[],
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await gmailFetch("/users/me/messages/batchModify", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, addLabelIds, removeLabelIds }),
  });
}
