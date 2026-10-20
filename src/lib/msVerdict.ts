// Microsoft's own spam and phishing verdict, read from the headers Exchange
// Online Protection stamps on every message it delivers. Outlook already
// returns them with internetMessageHeaders (outlookProvider.ts), so this is
// free: no new call, no new scope. Microsoft runs detection Cluster can't
// (sender reputation, mailbox intelligence, link detonation); its verdict
// is stronger evidence than anything re-derived from the same headers.
//
// Only the topmost copy counts, the one the user's own tenant wrote: a
// sender can paste a clean-looking copy below it. Never read on Gmail,
// where any such header came from the sender.
//
// X-Forefront-Antispam-Report: "CIP:1.2.3.4;CTRY:US;LANG:en;SCL:5;SRV:;
//   IPV:NLI;SFV:SPM;H:...;PTR:...;CAT:PHSH;SFS:(...);DIR:INB;SFTY:9.25"
// X-Microsoft-Antispam: "BCL:7;ARA:..."
// Authentication-Results: "...; compauth=fail reason=000"
// Field meanings: learn.microsoft.com/defender-office-365/message-headers-eop-mdo

export interface MicrosoftVerdict {
  /** Spam confidence level, -1 (skipped) to 9. 5-6 spam, 8-9 high confidence. */
  scl?: number;
  /** Spam filtering verdict: SPM spam, NSPM not spam, SKA/SKN allowed, ... */
  sfv?: string;
  /** Highest-priority protection category: PHSH, HPHSH, SPOOF, UIMP, ... */
  cat?: string;
  /** Safety tip marker. 9.25 is Microsoft's first-contact tip. */
  sfty?: string;
  /** Bulk complaint level 0-9 (X-Microsoft-Antispam). */
  bcl?: number;
  /** Composite authentication verdict and its reason code. */
  compauth?: string;
  compauthReason?: string;
}

/** Categories Microsoft only assigns when it judged the message an attack. */
const ATTACK_CATEGORIES: Record<string, "phishing" | "spoofing" | "impersonation"> = {
  PHSH: "phishing",
  HPHSH: "phishing",
  SPOOF: "spoofing",
  UIMP: "impersonation",
  DIMP: "impersonation",
  GIMP: "impersonation",
  BIMP: "impersonation",
};

const FIRST_CONTACT_SAFETY_TIP = "9.25";

function fields(value: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (value ?? "").slice(0, 4_000).split(";")) {
    const colon = part.indexOf(":");
    if (colon <= 0) continue;
    const key = part.slice(0, colon).trim().toUpperCase();
    if (!out.has(key)) out.set(key, part.slice(colon + 1).trim());
  }
  return out;
}

function int(value: string | undefined): number | undefined {
  if (value === undefined || !/^-?\d+$/.test(value)) return undefined;
  return Number(value);
}

/**
 * Parses the topmost copies of the three headers. `find` returns a header's
 * first (topmost) value, as outlookProvider's lookup does. Undefined when
 * the message carries none of them.
 */
export function parseMicrosoftVerdict(
  find: (name: string) => string | undefined,
  trustedAuthenticationResults: string | undefined,
): MicrosoftVerdict | undefined {
  const report = fields(find("X-Forefront-Antispam-Report"));
  const antispam = fields(find("X-Microsoft-Antispam"));
  const compauth = /\bcompauth=([a-z]+)(?:\s+reason=(\d{3}))?/i.exec(trustedAuthenticationResults ?? "");
  const verdict: MicrosoftVerdict = {
    scl: int(report.get("SCL")),
    sfv: report.get("SFV")?.toUpperCase() || undefined,
    cat: report.get("CAT")?.toUpperCase() || undefined,
    sfty: report.get("SFTY") || undefined,
    bcl: int(antispam.get("BCL")),
    compauth: compauth?.[1].toLowerCase(),
    compauthReason: compauth?.[2],
  };
  const any = Object.values(verdict).some((v) => v !== undefined);
  return any ? verdict : undefined;
}

/** "phishing" / "spoofing" / "impersonation" when Microsoft judged it an attack. */
export function microsoftAttackCategory(verdict: MicrosoftVerdict | undefined): string | undefined {
  return verdict?.cat ? ATTACK_CATEGORIES[verdict.cat] : undefined;
}

/** Composite authentication failed outright (reason 000: the domain's own
 * DMARC policy failed). Other failure reasons are Microsoft's weaker
 * implicit-authentication judgements. */
export function microsoftAuthFailed(verdict: MicrosoftVerdict | undefined): "strong" | "weak" | undefined {
  if (verdict?.compauth !== "fail") return undefined;
  return verdict.compauthReason === "000" ? "strong" : "weak";
}

/** Microsoft called it spam: SFV:SPM, or a spam confidence level of 5+. */
export function microsoftSaysSpam(verdict: MicrosoftVerdict | undefined): boolean {
  return verdict?.sfv === "SPM" || (verdict?.scl ?? -1) >= 5;
}

/** Microsoft showed its "you don't often get email from" first-contact tip. */
export function microsoftFirstContact(verdict: MicrosoftVerdict | undefined): boolean {
  return verdict?.sfty === FIRST_CONTACT_SAFETY_TIP;
}
