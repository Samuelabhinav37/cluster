import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailProvider } from "./providers/emailProvider";

// snoozeResurface only touches settings.snoozedMessages, so a tiny in-memory
// settingsStore stand-in is enough and keeps the test off chrome.storage.
const state: { snoozedMessages: Record<string, { resurfaceAt: number; provider: "gmail" }> } = {
  snoozedMessages: {},
};

vi.mock("./settingsStore", () => ({
  getSettings: async () => ({ ...state, snoozedMessages: { ...state.snoozedMessages } }),
  updateSettings: async (patch: Partial<typeof state>) => {
    Object.assign(state, patch);
    return { ...state };
  },
}));

import { resurfaceDueSnoozed } from "./snoozeResurface";

function gmail(over: Partial<EmailProvider> = {}): EmailProvider {
  return {
    id: "gmail",
    isConnected: vi.fn(async () => true),
    getAuthToken: vi.fn(async () => "token"),
    listCandidateMessages: vi.fn(async () => []),
    getMessageMetadata: vi.fn(),
    trashMessages: vi.fn(),
    resurfaceMessages: vi.fn(async () => {}),
    ...over,
  } as EmailProvider;
}

beforeEach(() => {
  state.snoozedMessages = {};
  vi.clearAllMocks();
});

describe("resurfaceDueSnoozed", () => {
  it("returns 0 and does nothing when the provider cannot resurface", async () => {
    const provider = gmail({ resurfaceMessages: undefined });
    expect(await resurfaceDueSnoozed(provider)).toBe(0);
    expect(provider.getAuthToken).not.toHaveBeenCalled();
  });

  it("returns 0 when no snooze is due yet", async () => {
    state.snoozedMessages = { m1: { resurfaceAt: Date.now() + 60_000, provider: "gmail" } };
    const provider = gmail();
    expect(await resurfaceDueSnoozed(provider)).toBe(0);
    expect(provider.resurfaceMessages).not.toHaveBeenCalled();
    expect(state.snoozedMessages.m1).toBeDefined();
  });

  it("resurfaces only the due ids and prunes just those from settings", async () => {
    const now = Date.now();
    state.snoozedMessages = {
      due1: { resurfaceAt: now - 1000, provider: "gmail" },
      due2: { resurfaceAt: now - 1, provider: "gmail" },
      later: { resurfaceAt: now + 60_000, provider: "gmail" },
    };
    const provider = gmail();

    const count = await resurfaceDueSnoozed(provider);

    expect(count).toBe(2);
    expect(provider.resurfaceMessages).toHaveBeenCalledTimes(1);
    const [, ids] = (provider.resurfaceMessages as ReturnType<typeof vi.fn>).mock.calls[0];
    expect([...ids].sort()).toEqual(["due1", "due2"]);
    expect(Object.keys(state.snoozedMessages)).toEqual(["later"]);
  });

  it("treats resurfaceAt exactly equal to now as due", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    state.snoozedMessages = { edge: { resurfaceAt: now, provider: "gmail" } };

    expect(await resurfaceDueSnoozed(gmail())).toBe(1);
    expect(state.snoozedMessages.edge).toBeUndefined();
  });
});
