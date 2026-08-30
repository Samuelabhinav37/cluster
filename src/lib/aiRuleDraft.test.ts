import { describe, expect, it, vi } from "vitest";
import { draftRuleFromNaturalLanguage } from "./aiRuleDraft";

describe("natural-language rule drafting", () => {
  it("uses a deterministic fallback without exposing mailbox data", async () => {
    const result = await draftRuleFromNaturalLanguage(
      "Archive unread newsletters older than 14 days",
      undefined,
    );
    expect(result.source).toBe("deterministic");
    expect(result.rule.conditions).toEqual({
      fromDomain: undefined,
      fromAddress: undefined,
      olderThanDays: 14,
      hasUnsubscribe: undefined,
      kind: "newsletter",
      unread: true,
    });
    expect(result.rule.action).toBe("archive");
    expect(result.rule.enabled).toBe(false);
  });

  it("passes a schema constraint and validates the model output", async () => {
    const destroy = vi.fn();
    const prompt = vi.fn(async (_input: string, _options?: unknown) =>
      JSON.stringify({
        name: "News cleanup",
        conditions: { kind: "newsletter", olderThanDays: 30 },
        action: "trash",
        priority: 5,
      }),
    );
    const api = {
      availability: vi.fn(async () => "available"),
      create: vi.fn(async () => ({ prompt, destroy })),
    };
    const result = await draftRuleFromNaturalLanguage("Trash old newsletters", api);
    expect(result.source).toBe("on-device-ai");
    expect(prompt.mock.calls[0][1]).toHaveProperty("responseConstraint");
    expect(result.rule.priority).toBe(5);
    expect(destroy).toHaveBeenCalled();
  });

  it("rejects an unsupported autonomous action even if a model returns it", async () => {
    const api = {
      availability: vi.fn(async () => "available"),
      create: vi.fn(async () => ({
        prompt: vi.fn(async () =>
          JSON.stringify({ name: "Bad", conditions: { kind: "other" }, action: "send" }),
        ),
        destroy: vi.fn(),
      })),
    };
    await expect(draftRuleFromNaturalLanguage("Send replies", api)).rejects.toThrow("unsupported action");
  });
});
