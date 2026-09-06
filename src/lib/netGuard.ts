// Shared "is this URL safe to send an outbound request to" guard. Used by the
// one-click unsubscribe path (where the user approves an otherwise-arbitrary
// origin) and by the managed-policy Athena endpoints. It rejects the URL
// shapes that turn an outbound request into SSRF against something on the
// local network, or leak a token in cleartext:
//
//   - anything that isn't HTTPS
//   - embedded credentials (https://user:pass@host)
//   - loopback / localhost
//   - link-local, unique-local, and RFC 1918 / CGNAT IPv4 literals
//   - the IPv6 equivalents (::1, fc00::/7, fe80::/10, ::ffff:0:0/96)
//
// It deliberately does NOT block internal DNS names (athena.corp.internal):
// an enterprise pointing a managed endpoint at its own hostname is expected;
// pointing it at 169.254.169.254 is not.

export interface PublicHttpsUrlOptions {
  /** Permit a port other than 443 — e.g. an enterprise Athena on :8443. The
   * unsubscribe path leaves this false: those endpoints are always public
   * :443 web servers. */
  allowNonStandardPort?: boolean;
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

export function isPublicHttpsUrl(value: string, options: PublicHttpsUrlOptions = {}): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (!options.allowNonStandardPort && url.port && url.port !== "443") return false;
    const hostname = url.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "");
    if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) return false;
    if (isPrivateIpv4(hostname)) return false;
    if (
      hostname === "::" ||
      hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      /^fe[89ab]/.test(hostname) ||
      hostname.startsWith("::ffff:")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
