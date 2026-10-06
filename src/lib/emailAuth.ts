// Parsing of the Authentication-Results header (RFC 8601). The header mixes
// provider verdicts with text the sender controls: Gmail's comments and
// smtp.mailfrom repeat the envelope sender, which can be any string, even
// "dkim=pass" or a quoted local part holding a semicolon. So this is a small
// tokeniser, not a regex search: comments are removed, quoted strings are
// respected, results split only on real semicolons, and a verdict is read
// only from the leading "method=result" of each result. Pure, synchronous,
// no provider/network dependency -- same style as messageKind.ts.
export type AuthVerdict = "pass" | "fail" | "softfail" | "neutral" | "none" | "unknown";

export interface AuthenticationVerdicts {
  spf: AuthVerdict;
  dkim: AuthVerdict;
  dmarc: AuthVerdict;
}

export type AuthenticationProvider = "gmail" | "outlook";

const KNOWN_VERDICTS = new Set<AuthVerdict>(["pass", "fail", "softfail", "neutral", "none"]);

function authenticationServiceId(headerValue: string): string {
  return headerValue.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

/**
 * Authentication-Results is only trustworthy when the consumer trusts the
 * service that inserted it (RFC 8601). Messages can contain forged copies of
 * this header, so provider adapters must select a provider-owned result before
 * threat scoring or RFC 8058 verification uses it.
 */
export function isTrustedAuthenticationResults(
  provider: AuthenticationProvider,
  headerValue: string,
): boolean {
  const serviceId = authenticationServiceId(headerValue);
  if (provider === "gmail") return serviceId === "mx.google.com";
  return (
    serviceId === "outlook.com" ||
    serviceId.endsWith(".outlook.com") ||
    serviceId === "protection.outlook.com" ||
    serviceId.endsWith(".protection.outlook.com")
  );
}

export function selectTrustedAuthenticationResults(
  provider: AuthenticationProvider,
  headerValues: string[],
): string | undefined {
  return headerValues.find((value) => isTrustedAuthenticationResults(provider, value));
}

/** One result ("resinfo") from the header, e.g. `dkim=pass header.d=example.com`. */
export interface AuthResultEntry {
  /** Lowercased method name without its version: "spf", "dkim", "dmarc", ... */
  method: string;
  /** Lowercased result token: "pass", "fail", ... */
  result: string;
  /** `ptype.property` → value, comments removed, quotes kept as written. */
  properties: Record<string, string>;
}

/** Replaces each RFC 5322 comment (nested, with backslash escapes) by a space
 * and splits the rest on semicolons that sit outside quoted strings. */
function splitResults(headerValue: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < headerValue.length; i++) {
    const ch = headerValue[i];
    if (depth > 0) {
      if (ch === "\\") i++;
      else if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (depth === 0) current += " ";
      continue;
    }
    if (inQuote) {
      current += ch;
      if (ch === "\\" && i + 1 < headerValue.length) current += headerValue[++i];
      else if (ch === '"') inQuote = false;
      continue;
    }
    if (ch === '"') {
      inQuote = true;
      current += ch;
    } else if (ch === "(") {
      depth = 1;
    } else if (ch === ";") {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/** Splits one result on whitespace outside quotes, then joins `a = b` into `a=b`. */
function resultTokens(text: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      current += ch;
      if (ch === "\\" && i + 1 < text.length) current += text[++i];
      else if (ch === '"') inQuote = false;
    } else if (ch === '"') {
      inQuote = true;
      current += ch;
    } else if (/\s/.test(ch)) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  const joined: string[] = [];
  for (const token of tokens) {
    const last = joined[joined.length - 1];
    if (last !== undefined && (token.startsWith("=") || last.endsWith("="))) {
      joined[joined.length - 1] = last + token;
    } else {
      joined.push(token);
    }
  }
  return joined;
}

const METHOD_RESULT = /^([a-z0-9-]+)(?:\/[0-9]+)?=([a-z]+)$/i;

/** Every result in an Authentication-Results header, in order. The first
 * segment (the authserv-id) is skipped, and so is the "none" no-result form. */
export function parseAuthResultEntries(headerValue: string | undefined): AuthResultEntry[] {
  if (!headerValue) return [];
  const entries: AuthResultEntry[] = [];
  for (const part of splitResults(headerValue).slice(1)) {
    const [head, ...rest] = resultTokens(part);
    const match = head ? METHOD_RESULT.exec(head) : null;
    if (!match) continue;
    const properties: Record<string, string> = {};
    for (const token of rest) {
      const eq = token.indexOf("=");
      if (eq <= 0) continue;
      const key = token.slice(0, eq).toLowerCase();
      // Only ptype.property pairs describe the message. "reason" is free text.
      if (!key.includes(".")) continue;
      properties[key] = token.slice(eq + 1);
    }
    entries.push({ method: match[1].toLowerCase(), result: match[2].toLowerCase(), properties });
  }
  return entries;
}

/** The verdict for one method. Several results for one method happen with
 * multiple DKIM signatures, and DKIM passes when any signature verifies
 * (RFC 6376 §6.1), so any "pass" wins. Otherwise the first result counts. */
function verdictFor(entries: AuthResultEntry[], mechanism: "spf" | "dkim" | "dmarc"): AuthVerdict {
  const results = entries
    .filter((entry) => entry.method === mechanism)
    .map((entry) => entry.result)
    .filter((result): result is AuthVerdict => KNOWN_VERDICTS.has(result as AuthVerdict));
  if (results.length === 0) return "unknown";
  return results.includes("pass") ? "pass" : results[0];
}

/** Domains of the DKIM signatures this header says passed, from `header.d`,
 * or the domain part of `header.i` when `header.d` is missing. */
export function passingDkimDomains(headerValue: string | undefined): string[] {
  const domains: string[] = [];
  for (const entry of parseAuthResultEntries(headerValue)) {
    if (entry.method !== "dkim" || entry.result !== "pass") continue;
    const identity = entry.properties["header.i"];
    const value = entry.properties["header.d"] ?? identity?.slice(identity.lastIndexOf("@") + 1);
    const domain = value?.trim().toLowerCase().replace(/\.$/, "");
    if (domain) domains.push(domain);
  }
  return domains;
}

/** `headerValue` is the raw Authentication-Results header text, or undefined
 * if the message had none (some providers/relays don't add it, or it was
 * stripped) -- "unknown" is returned for every mechanism in that case,
 * deliberately distinct from "none" (a mechanism the header explicitly says
 * wasn't evaluated) or "fail" (evaluated and failed). Callers should only
 * treat "fail" as a positive signal -- "unknown"/"none" mean "we can't tell
 * from this header," not "this failed." */
export function parseAuthenticationResults(headerValue: string | undefined): AuthenticationVerdicts {
  const entries = parseAuthResultEntries(headerValue);
  return {
    spf: verdictFor(entries, "spf"),
    dkim: verdictFor(entries, "dkim"),
    dmarc: verdictFor(entries, "dmarc"),
  };
}
