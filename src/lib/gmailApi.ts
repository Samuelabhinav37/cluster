import { fetchWithRetry } from "./httpRetry";
import { extractLinksFromHtml, type ExtractedLink } from "./linkMismatch";

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
  /** Approx RFC822 size in bytes; Gmail returns this on the metadata format too. */
  sizeEstimate: number;
}

export async function getMessageMetadata(token: string, id: string): Promise<RawMessageMetadata> {
  const params = new URLSearchParams({ format: "metadata" });
  for (const header of ["From", "List-Unsubscribe", "List-Unsubscribe-Post", "Subject", "Authentication-Results"]) {
    params.append("metadataHeaders", header);
  }
  const data = await gmailFetch(`/users/me/messages/${id}?${params}`, token);
  const headers: Record<string, string> = {};
  for (const h of data.payload?.headers ?? []) {
    headers[h.name] = h.value;
  }
  return {
    headers,
    labelIds: data.labelIds ?? [],
    internalDate: Number(data.internalDate ?? 0),
    sizeEstimate: Number(data.sizeEstimate ?? 0),
  };
}

// Batched via batchModify below rather than one call per message — trash and
// untrash are just label mutations under the hood (add/remove TRASH), and
// batchModify's flat per-call quota cost (vs. per-message for /trash) matters
// once a bulk flow (delete-domain, expiry cleanup) spans hundreds of ids.
export async function trashMessages(token: string, ids: string[]): Promise<void> {
  await batchModify(token, ids, ["TRASH"], ["INBOX"]);
}

export async function untrashMessages(token: string, ids: string[]): Promise<void> {
  await batchModify(token, ids, ["INBOX"], ["TRASH"]);
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

// Permanent — no Trash recovery, unlike trashMessages. Requires a token
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

// Gmail's labels.create 409s if the name already exists — every caller that
// might run more than once per label name (across sessions, not just one
// button click) should use this instead of createLabel directly.
export async function getOrCreateLabel(token: string, name: string): Promise<string> {
  const data = await gmailFetch("/users/me/labels", token);
  const existing = (data.labels ?? []).find((l: { id: string; name: string }) => l.name === name);
  if (existing) return existing.id;
  return createLabel(token, name);
}

const SNOOZE_LABEL_NAME = "Declutter/Snoozed";

// Snooze is entirely our own bookkeeping — Gmail has no snooze primitive.
// This just moves mail out of the inbox under a dedicated label; the
// resurface timestamp lives in settingsStore.snoozedMessages, checked by
// the background triage alarm (and on dashboard load).
export async function snoozeMessages(token: string, ids: string[]): Promise<void> {
  const labelId = await getOrCreateLabel(token, SNOOZE_LABEL_NAME);
  await batchModify(token, ids, [labelId], ["INBOX"]);
}

export async function resurfaceMessages(token: string, ids: string[]): Promise<void> {
  const labelId = await getOrCreateLabel(token, SNOOZE_LABEL_NAME);
  await batchModify(token, ids, ["INBOX"], [labelId]);
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

const BATCH_MODIFY_CHUNK_SIZE = 1000;

export async function batchModify(
  token: string,
  ids: string[],
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<void> {
  for (let i = 0; i < ids.length; i += BATCH_MODIFY_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BATCH_MODIFY_CHUNK_SIZE);
    await gmailFetch("/users/me/messages/batchModify", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: chunk, addLabelIds, removeLabelIds }),
    });
  }
}

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
}

function findHtmlPartData(part: GmailMessagePart): string | null {
  if (part.mimeType === "text/html" && part.body?.data) return part.body.data;
  for (const child of part.parts ?? []) {
    const found = findHtmlPartData(child);
    if (found) return found;
  }
  return null;
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Fetches the HTML body specifically (format=full -- a materially bigger,
 * more sensitive request than the metadata-only fetch every other feature
 * in this file uses) and extracts its links. Deliberately not called by
 * the background triage's normal scan -- see linkMismatch.ts's own header
 * and the dashboard's "Deep scan" action, which is the only caller. */
export async function getMessageLinks(token: string, id: string): Promise<ExtractedLink[]> {
  const data = await gmailFetch(`/users/me/messages/${id}?format=full`, token);
  const htmlData = data.payload ? findHtmlPartData(data.payload) : null;
  if (!htmlData) return [];
  return extractLinksFromHtml(decodeBase64Url(htmlData));
}
