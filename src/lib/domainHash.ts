// A fast, synchronous 53-bit string hash (cyrb53, public domain), used to
// ship large domain lists as a compact sorted set of numbers instead of
// strings. scripts/refresh-phishing-domains.mjs carries the same function;
// domainHash.test.ts pins both to the same test vectors.
//
// At 53 bits, a list of 300,000 domains gives roughly one chance in thirty
// billion that an unrelated domain collides with an entry.
export function cyrb53(text: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** A sorted set of hashes, decoded from the published base64 Float64Array. */
export class HashedDomainSet {
  private readonly hashes: Float64Array;

  constructor(hashes: Float64Array) {
    this.hashes = hashes;
  }

  static fromBase64(data: string): HashedDomainSet {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length - (binary.length % 8));
    for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
    return new HashedDomainSet(new Float64Array(bytes.buffer));
  }

  get size(): number {
    return this.hashes.length;
  }

  has(domain: string): boolean {
    const target = cyrb53(domain);
    let lo = 0;
    let hi = this.hashes.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const value = this.hashes[mid];
      if (value === target) return true;
      if (value < target) lo = mid + 1;
      else hi = mid - 1;
    }
    return false;
  }
}
