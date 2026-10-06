// Punycode decoding (RFC 3492) for internationalised domain names. Mail
// headers carry them in ASCII form ("xn--pypl-53dc.com"), which hides the
// lookalike letters inside. threatSignals.ts decodes them back to Unicode
// ("pаypаl.com", with Cyrillic a's) so its confusables table can see them.
// Browsers have no public decoder for this, and the logic is short.

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  let d = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > ((BASE - T_MIN) * T_MAX) >> 1) {
    d = Math.floor(d / (BASE - T_MIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - T_MIN + 1) * d) / (d + SKEW));
}

function digitValue(code: number): number {
  if (code >= 48 && code <= 57) return code - 22; // 0-9 -> 26-35
  if (code >= 65 && code <= 90) return code - 65; // A-Z
  if (code >= 97 && code <= 122) return code - 97; // a-z
  return BASE;
}

/** Decodes one punycode label body (without "xn--"). Null if malformed. */
export function decodePunycodeLabel(input: string): string | null {
  const output: number[] = [];
  const lastDash = input.lastIndexOf("-");
  const basicEnd = lastDash > 0 ? lastDash : 0;
  for (let j = 0; j < basicEnd; j++) {
    const code = input.charCodeAt(j);
    if (code >= 0x80) return null;
    output.push(code);
  }
  let n = INITIAL_N;
  let bias = INITIAL_BIAS;
  let i = 0;
  for (let index = basicEnd > 0 ? basicEnd + 1 : 0; index < input.length; ) {
    const oldi = i;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (index >= input.length) return null;
      const digit = digitValue(input.charCodeAt(index++));
      if (digit >= BASE) return null;
      i += digit * w;
      const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
      if (digit < t) break;
      w *= BASE - t;
      if (!Number.isSafeInteger(i) || !Number.isSafeInteger(w)) return null;
    }
    bias = adapt(i - oldi, output.length + 1, oldi === 0);
    n += Math.floor(i / (output.length + 1));
    i %= output.length + 1;
    if (n > 0x10ffff) return null;
    output.splice(i, 0, n);
    i++;
  }
  return String.fromCodePoint(...output);
}

/** Decodes every "xn--" label of a domain. Labels that fail to decode are
 * kept as they are, so this never throws and never loses information. */
export function domainToUnicode(domain: string): string {
  return domain
    .split(".")
    .map((label) => {
      if (!label.toLowerCase().startsWith("xn--")) return label;
      return decodePunycodeLabel(label.slice(4)) ?? label;
    })
    .join(".");
}
