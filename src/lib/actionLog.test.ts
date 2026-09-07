import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionLogEntry } from "./actionLog";

// appendActionLog goes through mutateSettings (settings storage lock). Stub it
// with an in-memory settings object that applies the updater, same contract.
const settings: { actionLog: ActionLogEntry[] } = { actionLog: [] };

vi.mock("./settingsStore", () => ({
  mutateSettings: async (fn: (s: typeof settings) => typeof settings) => {
    Object.assign(settings, fn({ ...settings, actionLog: [...settings.actionLog] }));
    return settings;
  },
}));

import { appendActionLog, makeLogId, MAX_LOG_ENTRIES } from "./actionLog";

function entry(id: string): ActionLogEntry {
  return { id, at: 1, kind: "trash", summary: `entry ${id}` };
}

beforeEach(() => {
  settings.actionLog = [];
});

describe("appendActionLog", () => {
  it("appends entries in order", async () => {
    await appendActionLog([entry("a"), entry("b")]);
    await appendActionLog([entry("c")]);
    expect(settings.actionLog.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op for an empty batch (does not touch settings)", async () => {
    const mod = await import("./settingsStore");
    const spy = vi.spyOn(mod, "mutateSettings");
    await appendActionLog([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("keeps only the newest MAX_LOG_ENTRIES", async () => {
    settings.actionLog = Array.from({ length: MAX_LOG_ENTRIES }, (_, i) => entry(`old-${i}`));
    await appendActionLog([entry("new-1"), entry("new-2")]);

    expect(settings.actionLog).toHaveLength(MAX_LOG_ENTRIES);
    expect(settings.actionLog.at(-1)?.id).toBe("new-2");
    expect(settings.actionLog.at(-2)?.id).toBe("new-1");
    expect(settings.actionLog[0].id).toBe("old-2"); // old-0, old-1 dropped
  });
});

describe("makeLogId", () => {
  it("embeds the kind and is unique across calls", () => {
    const a = makeLogId("mute");
    const b = makeLogId("mute");
    expect(a).toMatch(/^mute-\d+-[a-z0-9]{1,6}$/);
    expect(a).not.toBe(b);
  });
});
