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

const KNOWN_VERDICTS = new Set<AuthVerdict>(["pass", "fail", "softfail", "neutral", "none"]);

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
