// CSV and file-download helpers, on their own so the Cleanup table and the
// report can both use them without importing each other.

/** RFC 4180: quoted only when it holds a comma, quote or line break. A leading
 * = + - @ gets a ' so a spreadsheet shows a stranger's subject instead of running it. */
export function csvField(v: string): string {
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\r\n]|^\s|\s$/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function downloadBytes(name: string, data: BlobPart, type: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
