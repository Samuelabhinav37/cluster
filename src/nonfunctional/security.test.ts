// Non-functional: security invariants that live in configuration and markup
// rather than in any one module — the things a code review can miss because
// no test fails when they drift. Network egress is covered separately by
// src/lib/networkEgress.test.ts.
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import manifest from "../../manifest.json";
import dashboardHtml from "../dashboard/index.html?raw";

// Shipping sources as raw text via vite (no node fs types), same approach as
// networkEgress.test.ts. Keys look like "../lib/gmailApi.ts".
const allSources: Record<string, string> = import.meta.glob("../**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});
const shippingSources = Object.entries(allSources).filter(
  ([path]) => !path.endsWith(".test.ts") && !path.endsWith("testHarness.ts") && !path.startsWith("../test/"),
);

describe("manifest: permission surface", () => {
  // Any addition here is a store-review and user-trust event. Change this
  // list deliberately, in the same commit as the reason.
  it("requests exactly the expected API permissions", () => {
    expect([...manifest.permissions].sort()).toEqual(["alarms", "identity", "storage", "tabs", "unlimitedStorage"]);
  });

  it("requests exactly the expected install-time host permissions", () => {
    expect([...manifest.host_permissions].sort()).toEqual([
      "https://gmail.googleapis.com/*",
      "https://graph.microsoft.com/*",
      "https://login.microsoftonline.com/*",
      "https://samuelabhinav37.github.io/*",
    ]);
  });

  it("keeps broad https access optional (granted per origin for one-click unsubscribe), never install-time", () => {
    expect(manifest.optional_host_permissions).toEqual(["https://*/*"]);
    const all = JSON.stringify([manifest.permissions, manifest.host_permissions]);
    expect(all).not.toMatch(/<all_urls>|\*:\/\/\*|https:\/\/\*\/\*/);
  });

  it("injects nothing into web pages and exposes no extension resources to them", () => {
    const m = manifest as Record<string, unknown>;
    expect(m.content_scripts).toBeUndefined();
    expect(m.web_accessible_resources).toBeUndefined();
    expect(m.externally_connectable).toBeUndefined();
  });

  it("asks Google only for gmail.modify + gmail.settings.basic at install (full mail scope stays opt-in)", () => {
    expect([...manifest.oauth2.scopes].sort()).toEqual([
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.settings.basic",
    ]);
    expect(manifest.oauth2.scopes).not.toContain("https://mail.google.com/");
  });

  it("is MV3 with a module service worker", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background.type).toBe("module");
  });
});

describe("content security policy", () => {
  const csp: string = manifest.content_security_policy.extension_pages;
  const directive = (name: string) =>
    csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${name} `)) ?? "";

  it("allows scripts only from the extension itself", () => {
    expect(directive("script-src")).toBe("script-src 'self'");
  });

  it("forbids eval, inline script and remote code", () => {
    expect(csp).not.toMatch(/unsafe-eval|unsafe-inline|wasm-unsafe-eval|https?:|data:|blob:/);
  });

  it("pins object-src and base-uri", () => {
    expect(directive("object-src")).toBe("object-src 'self'");
    expect(directive("base-uri")).toBe("base-uri 'none'");
  });
});

describe("dashboard markup", () => {
  it("has no inline <script> bodies and no inline event handlers", () => {
    const inlineScripts = [...dashboardHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].filter(
      (m) => m[1].trim() !== "",
    );
    expect(inlineScripts).toEqual([]);
    expect(dashboardHtml).not.toMatch(/\son[a-z]+\s*=\s*["']/i);
  });

  it("loads no script or stylesheet from another origin", () => {
    expect(dashboardHtml).not.toMatch(/<script[^>]+src=["']https?:/i);
    expect(dashboardHtml).not.toMatch(/<link[^>]+href=["']https?:/i);
  });
});

describe("DOM injection", () => {
  // Sender names, subjects and addresses are attacker-controlled. They must
  // reach the page via textContent / createElement, never innerHTML. Every
  // innerHTML assignment in shipping code may only interpolate values from
  // this allowlist (static icons and numbers); a new interpolation fails here
  // until someone confirms it can't carry sender data.
  const SAFE_INTERPOLATIONS = new Set([
    "delta > 0 ? ICON_UP : ICON_DOWN",
    "Math.abs(delta)",
    "points.length",
    "available.length", // subscriptionsTab: a count
    "n", // subscriptionsTab cadence cell: a count
    "cap", // subscriptionsTab cadence cell: "daily" | "weekly" | "monthly or less"
    "authChip(sender.authVerdicts)", // securityTab: fixed ✓/✗/— marks only
  ]);

  // KNOWN BUG (securityTab.ts): the Phishing screen interpolates the sender's
  // display name and address into innerHTML. Listed so the guard below stays
  // green for everything else; the DOM-level proof is the it.fails pair in
  // phishing.actions.dom.test.ts. Remove these two entries with the fix.
  const KNOWN_UNSAFE = new Set([
    'claimedBrand ?? (sender.displayName || "someone you know")',
    "sender.address",
  ]);

  const assignments = shippingSources.flatMap(([file, text]) =>
    [...text.matchAll(/\.(?:innerHTML|outerHTML)\s*=\s*([\s\S]*?);\s*\n/g)].map((m) => ({
      file: file.replace(/^\.\.\//, "src/"),
      rhs: m[1].trim(),
    })),
  );

  it.fails("KNOWN BUG: the Phishing screen interpolates sender-controlled text into innerHTML", () => {
    const unsafe = assignments.filter(({ rhs }) => interpolations(rhs).some((e) => KNOWN_UNSAFE.has(e)));
    expect(unsafe).toEqual([]);
  });

  it("finds the sources and the innerHTML assignments it is meant to police", () => {
    expect(shippingSources.length).toBeGreaterThan(50);
    expect(assignments.length).toBeGreaterThan(5);
  });

  // Code allowed *between* literals: concatenation, parentheses, and a
  // ternary on a boolean that can't carry sender text.
  const SAFE_GLUE = /^(?:[\s+()?:]|sender\.firstContact)*$/;
  const LITERALS = /`(?:\\.|\$\{[^}]*\}|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
  const interpolations = (rhs: string) =>
    [...rhs.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1].replace(/\s+/g, " ").trim());

  it("only assigns literals, ICON_* / *_SVG constants, or allowlisted interpolations", () => {
    const offenders = assignments.filter(({ rhs }) => {
      if (/^[A-Z][A-Z0-9_]*$/.test(rhs)) return false; // ICON_WARNING, ENVELOPE_SVG
      if (!SAFE_GLUE.test(rhs.replace(LITERALS, ""))) return true; // non-literal code
      return interpolations(rhs).some((e) => !SAFE_INTERPOLATIONS.has(e) && !KNOWN_UNSAFE.has(e));
    });
    expect(offenders).toEqual([]);
  });

  it("never uses insertAdjacentHTML or document.write", () => {
    for (const [file, text] of shippingSources) {
      expect(text, file).not.toMatch(/insertAdjacentHTML|document\.write\(/);
    }
  });
});
