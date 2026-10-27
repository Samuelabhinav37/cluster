// Relationship headers: who a message was sent to, which thread it belongs
// to, and which mailing list or sending service it came through. Cluster used
// to request only From and the auth headers and throw the rest away; these
// fields are what "who matters to you" and thread checks are built from.
// Shared by the Gmail and Outlook providers so both produce the same shape.

export interface ParsedAddress {
  address: string;
  name: string;
}

/**
 * Parses an RFC 5322 address list ("A <a@x>, "Smith, Jane" <j@y>, b@z").
 * Commas inside quotes or angle brackets don't split, so a quoted name with a
 * comma stays one address. Group syntax ("team: a@x, b@y;") is flattened.
 * Returns lowercased addresses; entries without an "@" are dropped.
 */
export function parseAddressList(value: string): ParsedAddress[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  let angle = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\" && inQuotes && i + 1 < value.length) {
      current += ch + value[++i];
      continue;
    }
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === "<") angle++;
    else if (!inQuotes && ch === ">") angle = Math.max(0, angle - 1);
    if (!inQuotes && angle === 0 && (ch === "," || ch === ";")) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);

  const out: ParsedAddress[] = [];
  for (const raw of parts) {
    // Drop a group label ("team: a@x") before the first address.
    const part = raw.replace(/^[^"<@]*:\s*/, "").trim();
    if (!part) continue;
    const angled = part.match(/^(.*)<([^>]*)>\s*$/);
    const address = (angled ? angled[2] : part).trim().toLowerCase();
    if (!address.includes("@") || /\s/.test(address)) continue;
    const name = angled
      ? angled[1]
          .trim()
          .replace(/^"(.*)"$/, "$1")
          .replace(/\\(.)/g, "$1")
          .trim()
      : "";
    out.push({ address, name });
  }
  return out;
}

/** The address inside a single-address header (Return-Path, Sender). */
function firstAddress(value: string | undefined): string {
  if (!value) return "";
  return parseAddressList(value)[0]?.address ?? "";
}

function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at >= 0 ? address.slice(at + 1) : "";
}

/** Message-ID style tokens ("<abc@x>") in a References / In-Reply-To value. */
function messageIdTokens(value: string | undefined): string[] {
  return value ? (value.match(/<[^<>\s]+>/g) ?? []) : [];
}

/** Header names the providers must request so these fields can be filled. */
export const RELATIONSHIP_HEADERS = [
  "To",
  "Cc",
  "Message-ID",
  "In-Reply-To",
  "References",
  "List-Id",
  "Return-Path",
  "Feedback-ID",
  "Sender",
] as const;

export interface RelationshipFields {
  toAddresses: string[];
  ccAddresses: string[];
  recipientCount: number;
  messageIdHeader?: string;
  inReplyTo?: string;
  referencesCount: number;
  listId?: string;
  returnPathDomain?: string;
  feedbackId?: string;
  senderHeaderAddress?: string;
}

/** Fills the relationship fields from a case-insensitive header lookup. */
export function relationshipFields(header: (name: string) => string | undefined): RelationshipFields {
  const to = parseAddressList(header("To") ?? "").map((a) => a.address);
  const cc = parseAddressList(header("Cc") ?? "").map((a) => a.address);
  const listId = header("List-Id")?.match(/<([^>]+)>/)?.[1] ?? header("List-Id")?.trim();
  const returnPath = firstAddress(header("Return-Path"));
  return {
    toAddresses: to,
    ccAddresses: cc,
    recipientCount: new Set([...to, ...cc]).size,
    messageIdHeader: messageIdTokens(header("Message-ID"))[0],
    inReplyTo: messageIdTokens(header("In-Reply-To"))[0],
    referencesCount: messageIdTokens(header("References")).length,
    listId: listId ? listId.toLowerCase() : undefined,
    returnPathDomain: returnPath ? domainOf(returnPath) : undefined,
    feedbackId: header("Feedback-ID")?.trim() || undefined,
    senderHeaderAddress: firstAddress(header("Sender")) || undefined,
  };
}

/**
 * The addresses a message was delivered to, most specific first:
 * Delivered-To and X-Original-To (set by the receiving server), then To and
 * Cc. The unsubscribe identity picker matches these against the account's
 * send-as addresses, since list servers expect the request from the address
 * that is on the list.
 */
export function deliveredToAddresses(header: (name: string) => string | undefined): string[] {
  const out: string[] = [];
  for (const name of ["Delivered-To", "X-Original-To", "To", "Cc"]) {
    for (const { address } of parseAddressList(header(name) ?? "")) {
      if (!out.includes(address)) out.push(address);
    }
  }
  return out;
}

/** Shape headers: free facts for the per-user model. All sender-written, so
 * they may only ever add caution or protection, never lower a gate. */
export const SHAPE_HEADERS = ["Content-Type", "List-Post", "X-Auto-Response-Suppress", "Date"] as const;

export interface ShapeFields {
  /** Top-level MIME type, e.g. "multipart/report" (a bounce). */
  contentType?: string;
  /** RFC 2369: "no" = announcement list, "mailto" = discussion list. */
  listPost?: "no" | "mailto" | "other";
  /** Exchange's X-Auto-Response-Suppress, lowercased ("all", "oof, autoreply"). */
  autoResponseSuppress?: string;
  /** The sender's claimed Date, epoch ms. Never used as the received time. */
  claimedSentAt?: number;
}

export function shapeFields(header: (name: string) => string | undefined): ShapeFields {
  const contentType = header("Content-Type")?.split(";")[0].trim().toLowerCase();
  const post = header("List-Post")?.trim().toLowerCase();
  const listPost = !post ? undefined : post === "no" ? "no" : post.includes("mailto:") ? "mailto" : "other";
  const date = Date.parse(header("Date") ?? "");
  return {
    contentType: contentType || undefined,
    listPost,
    autoResponseSuppress: header("X-Auto-Response-Suppress")?.trim().toLowerCase() || undefined,
    claimedSentAt: Number.isFinite(date) ? date : undefined,
  };
}

export interface OutlookVerdict {
  /** Highest Bulk Complaint Level seen (0-9). */
  bulkComplaintLevel?: number;
  /** Any copy says phishing, spoofing, impersonation or spam. */
  flagged: boolean;
}

const OUTLOOK_THREAT_CAT = new Set(["phsh", "hphsh", "spoof", "uimp", "dimp", "gimp", "osph", "hspm"]);

/**
 * Microsoft's own verdicts from X-Microsoft-Antispam (BCL) and
 * X-Forefront-Antispam-Report (CAT, SFV). Unverified whether Exchange strips
 * a sender's forged copy, so every copy is read and only the direction a
 * forger can't profit from is kept: any flag wins, and BCL takes the max.
 */
export function outlookVerdict(all: (name: string) => string[]): OutlookVerdict {
  let bcl: number | undefined;
  let flagged = false;
  for (const value of all("X-Microsoft-Antispam")) {
    const n = Number(/(?:^|;)\s*BCL:(\d)/i.exec(value)?.[1]);
    if (Number.isFinite(n)) bcl = Math.max(bcl ?? 0, n);
  }
  for (const value of all("X-Forefront-Antispam-Report")) {
    const cat = /(?:^|;)\s*CAT:([A-Z]+)/i.exec(value)?.[1]?.toLowerCase();
    const sfv = /(?:^|;)\s*SFV:([A-Z]+)/i.exec(value)?.[1]?.toLowerCase();
    if ((cat && OUTLOOK_THREAT_CAT.has(cat)) || sfv === "spm") flagged = true;
  }
  return { bulkComplaintLevel: bcl, flagged };
}
