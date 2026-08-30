import { log } from "./log";
import { mapWithConcurrency } from "./concurrency";
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

// Thin JSON wrapper. Callers pass the response shape they read as `T`; the
// Gmail API's own schema is the source of truth, so this doesn't try to model
// it exhaustively — just the handful of fields each call site touches.
async function gmailFetch<T = unknown>(path: string, token: string, init: RequestInit = {}): Promise<T> {
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
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailMessageResource {
  id?: string;
  labelIds?: string[];
  internalDate?: string;
  sizeEstimate?: number;
  payload?: GmailMessagePart & { headers?: GmailHeader[] };
}
interface GmailFilterResource {
  id: string;
  criteria?: { from?: string };
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
    const data = await gmailFetch<{ messages?: GmailMessageStub[]; nextPageToken?: string }>(`/users/me/messages?${params}`, token);
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
  for (const header of ["From", "Reply-To", "List-Unsubscribe", "List-Unsubscribe-Post", "Subject", "Authentication-Results"]) {
    params.append("metadataHeaders", header);
  }
  const data = await gmailFetch<GmailMessageResource>(`/users/me/messages/${id}?${params}`, token);
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

// Archive / unarchive / mark-read are all just INBOX / UNREAD label mutations.
export async function archiveMessages(token: string, ids: string[]): Promise<void> {
  await batchModify(token, ids, [], ["INBOX"]);
}

export async function unarchiveMessages(token: string, ids: string[]): Promise<void> {
  await batchModify(token, ids, ["INBOX"], []);
}

export async function markReadMessages(token: string, ids: string[]): Promise<void> {
  await batchModify(token, ids, [], ["UNREAD"]);
}

// Apply a (nested) label. By default also files the mail out of the inbox --
// same "tag + skip inbox" shape as keepSorted, minus the standing filter,
// since a rule re-runs on every scan anyway. "Sort my inbox" passes
// keepInInbox for buckets the user wants labelled but left visible.
export async function labelMessages(
  token: string,
  ids: string[],
  labelName: string,
  keepInInbox = false,
): Promise<void> {
  const labelId = await getOrCreateLabel(token, labelName);
  await batchModify(token, ids, [labelId], keepInInbox ? [] : ["INBOX"]);
}

// Reverses labelMessages for the "Sort my inbox" undo: drop the label and, if
// it was filed out, put the messages back in the inbox.
export async function unlabelMessages(
  token: string,
  ids: string[],
  labelName: string,
  wasFiledOut: boolean,
): Promise<void> {
  const labelId = await getOrCreateLabel(token, labelName);
  await batchModify(token, ids, wasFiledOut ? ["INBOX"] : [], [labelId]);
}

const SCREENER_LABEL_NAME = "Cluster/Screener";

// Screener: hold a sender's mail under Cluster/Screener and out of the inbox
// via a standing from: filter — same mechanism as muteSender, different label,
// and always reversible with allowSenderThrough.
export async function screenSender(token: string, fromAddress: string, existingIds: string[]): Promise<void> {
  const labelId = await getOrCreateLabel(token, SCREENER_LABEL_NAME);
  await createSenderFilter(token, fromAddress, labelId);
  if (existingIds.length > 0) await batchModify(token, existingIds, [labelId], ["INBOX"]);
}

export async function allowSenderThrough(token: string, fromAddress: string, screenedIds: string[]): Promise<void> {
  await deleteSenderFilters(token, fromAddress);
  if (screenedIds.length > 0) {
    const labelId = await getOrCreateLabel(token, SCREENER_LABEL_NAME);
    await batchModify(token, screenedIds, ["INBOX"], [labelId]);
  }
}

function parseAddressList(value: string): string[] {
  return value
    .split(",")
    .map((part) => {
      const m = part.match(/<([^>]+)>/);
      return (m ? m[1] : part).trim().toLowerCase();
    })
    .filter((a) => a.includes("@") && !/\s/.test(a));
}

// Everyone the user has emailed recently — the implicit Screener allowlist.
// Metadata-only (To/Cc headers of Sent mail); capped so a big Sent folder
// doesn't turn this into a huge scan.
export async function listSentCorrespondents(token: string, maxMessages = 300): Promise<string[]> {
  const stubs = await listMessageIds(token, "in:sent newer_than:2y", maxMessages);
  const addresses = new Set<string>();
  await mapWithConcurrency(stubs, 10, async (stub) => {
    try {
      const params = new URLSearchParams({ format: "metadata" });
      params.append("metadataHeaders", "To");
      params.append("metadataHeaders", "Cc");
      const data = await gmailFetch<GmailMessageResource>(`/users/me/messages/${stub.id}?${params}`, token);
      for (const h of data.payload?.headers ?? []) {
        for (const addr of parseAddressList(h.value ?? "")) addresses.add(addr);
      }
    } catch (err) {
      log.error("listSentCorrespondents: skipping a message", err);
    }
  });
  return [...addresses].slice(0, 1000);
}

const MUTED_LABEL_NAME = "Cluster/Muted";

// Local "BlackHole": a standing from:<address> filter that files future mail
// under Cluster/Muted and out of the inbox, plus the same move for mail
// already in the inbox. Independent of whether the sender honours unsubscribe.
export async function muteSender(token: string, fromAddress: string, existingIds: string[]): Promise<void> {
  const labelId = await getOrCreateLabel(token, MUTED_LABEL_NAME);
  await createSenderFilter(token, fromAddress, labelId);
  if (existingIds.length > 0) await batchModify(token, existingIds, [labelId], ["INBOX"]);
}

export async function unmuteSender(token: string, fromAddress: string, mutedIds: string[]): Promise<void> {
  await deleteSenderFilters(token, fromAddress);
  if (mutedIds.length > 0) {
    const labelId = await getOrCreateLabel(token, MUTED_LABEL_NAME);
    await batchModify(token, mutedIds, ["INBOX"], [labelId]);
  }
}

// Deletes every filter whose `from` criterion is exactly this address — used to
// reverse a mute and (Phase 6) to let a sender back through the Screener.
export async function deleteSenderFilters(token: string, fromAddress: string): Promise<void> {
  const data = await gmailFetch<{ filter?: GmailFilterResource[] }>("/users/me/settings/filters", token);
  const target = fromAddress.toLowerCase();
  const matches = (data.filter ?? []).filter((f) => (f.criteria?.from ?? "").toLowerCase() === target);
  for (const f of matches) {
    await gmailFetch(`/users/me/settings/filters/${f.id}`, token, { method: "DELETE" });
  }
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

async function createLabel(token: string, name: string): Promise<string> {
  const data = await gmailFetch<{ id: string }>("/users/me/labels", token, {
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
  const data = await gmailFetch<{ labels?: { id: string; name: string }[] }>("/users/me/labels", token);
  const existing = (data.labels ?? []).find((l) => l.name === name);
  if (existing) return existing.id;
  return createLabel(token, name);
}

const SNOOZE_LABEL_NAME = "Cluster/Snoozed";

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
  const data = await gmailFetch<GmailMessageResource>(`/users/me/messages/${id}?format=full`, token);
  const htmlData = data.payload ? findHtmlPartData(data.payload) : null;
  if (!htmlData) return [];
  return extractLinksFromHtml(decodeBase64Url(htmlData));
}
