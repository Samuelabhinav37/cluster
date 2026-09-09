import { describe, expect, it, vi } from "vitest";
import { checkMessageKindAiAvailability, classifyOtherSubjects } from "./aiMessageKind";

function fakeApi(overrides: {
  availability?: string;
  prompt?: (input: string, options?: { responseConstraint?: unknown }) => Promise<string>;
}) {
  const destroy = vi.fn();
  const prompt = vi.fn(overrides.prompt ?? (async () => JSON.stringify({ classifications: [] })));
  return {
    availability: vi.fn(async () => overrides.availability ?? "available"),
    create: vi.fn(async () => ({ prompt, destroy })),
    _destroy: destroy,
    _prompt: prompt,
  };
}

describe("checkMessageKindAiAvailability", () => {
  it("reports unavailable when there is no Prompt API at all", async () => {
    expect(await checkMessageKindAiAvailability(undefined)).toBe("unavailable");
  });

  it("passes through a valid availability value", async () => {
    const api = fakeApi({ availability: "downloadable" });
    expect(await checkMessageKindAiAvailability(api)).toBe("downloadable");
  });

  it("falls back to unavailable if availability() throws", async () => {
    const api = { availability: vi.fn(async () => { throw new Error("boom"); }), create: vi.fn() };
    expect(await checkMessageKindAiAvailability(api)).toBe("unavailable");
  });
});

describe("classifyOtherSubjects", () => {
  it("no-ops when the Prompt API is unavailable", async () => {
    const result = await classifyOtherSubjects(["Bienvenue à votre essai"], undefined);
    expect(result.size).toBe(0);
  });

  it("no-ops when availability() reports unavailable", async () => {
    const api = fakeApi({ availability: "unavailable" });
    const result = await classifyOtherSubjects(["some subject"], api);
    expect(result.size).toBe(0);
    expect(api.create).not.toHaveBeenCalled();
  });

  it("classifies an ambiguous subject and destroys the session", async () => {
    const api = fakeApi({
      prompt: async () => JSON.stringify({ classifications: ["shipping"] }),
    });
    const result = await classifyOtherSubjects(["Votre colis est en route"], api);
    expect(result.get("Votre colis est en route")).toBe("shipping");
    expect(api._destroy).toHaveBeenCalled();
  });

  it("passes an exact-length responseConstraint schema", async () => {
    const api = fakeApi({
      prompt: async () => JSON.stringify({ classifications: ["other", "social"] }),
    });
    await classifyOtherSubjects(["subject one", "subject two"], api);
    const options = api._prompt.mock.calls[0][1] as {
      responseConstraint: { properties: { classifications: { minItems: number; maxItems: number } } };
    };
    expect(options.responseConstraint.properties.classifications.minItems).toBe(2);
    expect(options.responseConstraint.properties.classifications.maxItems).toBe(2);
  });

  it("discards a batch whose output length doesn't match the input (defense in depth)", async () => {
    const api = fakeApi({
      prompt: async () => JSON.stringify({ classifications: ["shipping"] }), // only 1, for 2 subjects
    });
    const result = await classifyOtherSubjects(["mismatch subject A", "mismatch subject B"], api);
    expect(result.size).toBe(0);
  });

  it("falls back to 'other' for any value outside the enum, even under a constrained schema", async () => {
    const api = fakeApi({
      prompt: async () => JSON.stringify({ classifications: ["not-a-real-kind"] }),
    });
    const result = await classifyOtherSubjects(["weird subject"], api);
    expect(result.get("weird subject")).toBe("other");
  });

  it("discards a batch on malformed JSON rather than throwing", async () => {
    const api = fakeApi({ prompt: async () => "not json" });
    const result = await classifyOtherSubjects(["subject"], api);
    expect(result.size).toBe(0);
  });

  it("never calls the model for subjects already served from cache", async () => {
    const api = fakeApi({
      prompt: async () => JSON.stringify({ classifications: ["otp"] }),
    });
    await classifyOtherSubjects(["repeat me"], api);
    const second = await classifyOtherSubjects(["repeat me"], api);
    expect(second.get("repeat me")).toBe("otp");
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it("dedupes identical subjects within a single call into one classification slot", async () => {
    const api = fakeApi({
      prompt: async (input: string) => {
        // one classification per numbered line in the prompt
        const lines = input.split("\n").slice(1);
        return JSON.stringify({ classifications: lines.map(() => "social") });
      },
    });
    const result = await classifyOtherSubjects(["dup subject", "dup subject", "dup subject"], api);
    expect(result.get("dup subject")).toBe("social");
    const [promptText] = api._prompt.mock.calls[0];
    expect(promptText.split("\n").length).toBe(2); // header + 1 unique subject line
  });
});
