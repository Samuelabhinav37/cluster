// Lightweight parsing of the Authentication-Results header (RFC 8601) --
// pragmatic regex extraction of the three verdict tokens rather than a full
// ABNF parser, which is what every consumer of this header in practice
// relies on (the header's own free-form comment fields are not
// machine-critical for a pass/fail/none decision). Pure, synchronous, no
// provider/network dependency -- same style as messageKind.ts.
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

function extractVerdict(headerValue: string, mechanism: "spf" | "dkim" | "dmarc"): AuthVerdict {
  const match = new RegExp(`\\b${mechanism}=([a-z]+)`, "i").exec(headerValue);
  const token = match?.[1]?.toLowerCase();
  return token && KNOWN_VERDICTS.has(token as AuthVerdict) ? (token as AuthVerdict) : "unknown";
}

/** `headerValue` is the raw Authentication-Results header text, or undefined
 * if the message had none (some providers/relays don't add it, or it was
 * stripped) -- "unknown" is returned for every mechanism in that case,
 * deliberately distinct from "none" (a mechanism the header explicitly says
 * wasn't evaluated) or "fail" (evaluated and failed). Callers should only
 * treat "fail" as a positive signal -- "unknown"/"none" mean "we can't tell
 * from this header," not "this failed." */
export function parseAuthenticationResults(headerValue: string | undefined): AuthenticationVerdicts {
  if (!headerValue) return { spf: "unknown", dkim: "unknown", dmarc: "unknown" };
  return {
    spf: extractVerdict(headerValue, "spf"),
    dkim: extractVerdict(headerValue, "dkim"),
    dmarc: extractVerdict(headerValue, "dmarc"),
  };
}
