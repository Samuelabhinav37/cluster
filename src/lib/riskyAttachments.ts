// Attachment-shape signal, metadata-only. Gmail's format=metadata response
// (see gmailApi.ts's getMessageMetadata) deliberately excludes payload.parts,
// so attachment filenames aren't among the headers already fetched there --
// unlike Outlook, which can $expand=attachments($select=name) on the same
// per-message GET at no extra cost (see outlookProvider.ts). Gmail instead
// uses its own filename: search operator (see listRiskyAttachmentMessageIds
// in gmailApi.ts) to ask "which of these message ids have a risky-named
// attachment" without ever fetching a part body -- the search runs
// server-side against an index, same category of technique the sort/keep-
// sorting features already use (from:(...) queries), not a new body fetch.
//
// Extensions chosen for genuine phishing/malware delivery shapes: raw
// executable-adjacent types (.html/.htm as a fake login page, .iso/.img as a
// Windows-Defender-evading container, macro-enabled Office), plus the
// double-extension trick (invoice.pdf.exe) that hides the real, dangerous
// extension behind a trusted-looking one.
const RISKY_EXTENSIONS = ["html", "htm", "iso", "img", "docm", "xlsm", "pptm"];

const DOUBLE_EXTENSION_RE = /\.[a-z0-9]{2,5}\.(exe|scr|bat|cmd|com|pif|vbs|js|jar)$/i;

export function isRiskyAttachmentFilename(name: string): boolean {
  const lower = name.trim().toLowerCase();
  if (!lower) return false;
  if (DOUBLE_EXTENSION_RE.test(lower)) return true;
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return false;
  return RISKY_EXTENSIONS.includes(lower.slice(dot + 1));
}

/** Gmail search-query fragment for `filename:` operators covering the same
 * risky extensions -- the double-extension case can't be expressed as a
 * filename: term (Gmail's operator matches a trailing extension, not a
 * regex), so it's only caught by isRiskyAttachmentFilename, which Outlook's
 * inline attachment-name path also uses. */
export function riskyAttachmentGmailQuery(): string {
  return `(${RISKY_EXTENSIONS.map((ext) => `filename:${ext}`).join(" OR ")})`;
}
