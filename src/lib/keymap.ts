// Keyboard shortcuts the user can change (Settings › Keyboard). Single keys
// only, so they can all be switched off at once (WCAG 2.1.4); "G then a
// letter" jumps keep G fixed and let the letter change.

export interface Shortcut {
  id: string;
  label: string;
  key: string;
  /** Pressed after G. */
  afterG?: boolean;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { id: "search", label: "Search", key: "/" },
  { id: "help", label: "Show all shortcuts", key: "?" },
  { id: "go-home", label: "Go to Home", key: "h", afterG: true },
  { id: "go-contacts", label: "Go to Contacts", key: "s", afterG: true },
  { id: "go-cleanup", label: "Go to Clean up", key: "c", afterG: true },
  { id: "go-organize", label: "Go to Organize", key: "o", afterG: true },
  { id: "go-protect", label: "Go to Protect", key: "p", afterG: true },
];

/** The screen each "go" shortcut opens. */
export const GO_SCREENS: Record<string, string> = {
  "go-home": "overview",
  "go-contacts": "senders",
  "go-cleanup": "delete",
  "go-organize": "organize",
  "go-protect": "impersonation",
};

/** Each shortcut's key, the user's choice over the default. */
export function keysOf(overrides: Readonly<Record<string, string>> = {}): Record<string, string> {
  return Object.fromEntries(SHORTCUTS.map((s) => [s.id, (overrides[s.id] ?? s.key).toLowerCase()]));
}

/** Ids of shortcuts sharing a key with another of the same kind (plain or after G). */
export function clashes(keys: Readonly<Record<string, string>>): Set<string> {
  const seen = new Map<string, string[]>();
  for (const s of SHORTCUTS) {
    const slot = `${s.afterG ? "g" : ""}:${keys[s.id]}`;
    seen.set(slot, [...(seen.get(slot) ?? []), s.id]);
  }
  // A plain shortcut on "g" would swallow every jump.
  const out = new Set([...seen.values()].filter((ids) => ids.length > 1).flat());
  for (const s of SHORTCUTS) if (!s.afterG && keys[s.id] === "g") out.add(s.id);
  return out;
}

/** A key a shortcut can use: one printable character, not a space. */
export function usableKey(key: string): boolean {
  return key.length === 1 && key !== " ";
}
