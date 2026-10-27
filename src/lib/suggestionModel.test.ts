import { describe, expect, it } from "vitest";
import { acceptChance, emptySuggestionModel, learn, normalizeSuggestionModel } from "./suggestionModel";

const NOW = Date.UTC(2026, 9, 27);
const DAY = 24 * 60 * 60 * 1000;
const unsub = ["tab:promotions", "open:none", "act:unsubscribe"];
const mute = ["tab:promotions", "open:none", "act:mute"];

describe("suggestion model", () => {
  it("has no opinion before any answers", () => {
    expect(acceptChance(emptySuggestionModel(NOW), unsub, NOW)).toBeCloseTo(0.5);
  });

  it("learns which kind of suggestion you take", () => {
    let model = emptySuggestionModel(NOW);
    for (let i = 0; i < 4; i++) {
      model = learn(model, unsub, "accept", NOW);
      model = learn(model, mute, "dismiss", NOW);
    }
    expect(acceptChance(model, unsub, NOW)).toBeGreaterThan(0.7);
    expect(acceptChance(model, mute, NOW)).toBeLessThan(0.3);
  });

  it("an undo outweighs an accept", () => {
    const model = learn(learn(emptySuggestionModel(NOW), unsub, "accept", NOW), unsub, "undo", NOW);
    expect(acceptChance(model, unsub, NOW)).toBeLessThan(0.5);
  });

  it("old answers fade with a 90-day half-life", () => {
    const model = learn(emptySuggestionModel(NOW), unsub, "accept", NOW);
    const later = learn(model, mute, "dismiss", NOW + 90 * DAY);
    expect(later.accepted).toBeCloseTo(0.5);
    expect(later.acceptedBy["act:unsubscribe"]).toBeCloseTo(0.5);
    expect(acceptChance(model, unsub, NOW + 900 * DAY)).toBeCloseTo(0.5, 2);
  });

  it("loads a stored model, and falls back to empty on anything odd", () => {
    const model = learn(emptySuggestionModel(NOW), unsub, "accept", NOW);
    expect(normalizeSuggestionModel(JSON.parse(JSON.stringify(model)), NOW)).toEqual(model);
    expect(normalizeSuggestionModel({ ...model, accepted: -1 }, NOW)).toEqual(emptySuggestionModel(NOW));
    expect(normalizeSuggestionModel({ ...model, acceptedBy: { x: "1", ok: 2 } }, NOW).acceptedBy).toEqual({ ok: 2 });
    expect(normalizeSuggestionModel("junk", NOW).accepted).toBe(0);
  });
});
