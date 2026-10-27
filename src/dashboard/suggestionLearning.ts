// Feeds your answers to clean-up suggestions into the learned ranking
// (suggestionModel.ts). Features are taken from the current scan at the
// moment you answer, so no message ids or text are kept.
import { log } from "../lib/log";
import { pick } from "../lib/suggestions";
import {
  emptySuggestionModel,
  learn,
  loadSuggestionModel,
  saveSuggestionModel,
  suggestionFeatures,
  type ModelFeedback,
  type SuggestionModel,
} from "../lib/suggestionModel";
import { ctx } from "./state";

let model: SuggestionModel = emptySuggestionModel();
// Answers are applied one after another so two quick clicks can't overwrite
// each other. shortcut: two open dashboards can still race; fine while the
// model only reorders suggestions.
let queue: Promise<void> = Promise.resolve();

export async function initSuggestionModel(): Promise<void> {
  model = await loadSuggestionModel().catch((err) => {
    log.error("Could not load the suggestion model", err);
    return model;
  });
}

export function suggestionModel(): SuggestionModel {
  return model;
}

export function learnFromFeedback(senderKeys: readonly string[], feedback: ModelFeedback): Promise<void> {
  queue = queue
    .then(async () => {
      const byKey = new Map(ctx.senders.map((s) => [s.key, s] as const));
      let next = model;
      for (const key of new Set(senderKeys)) {
        const sender = byKey.get(key);
        const profile = ctx.profiles.get(key);
        if (!sender || !profile) continue;
        next = learn(next, suggestionFeatures(sender, profile, pick(profile, sender)?.action), feedback);
      }
      if (next === model) return;
      model = next;
      await saveSuggestionModel(model);
    })
    .catch((err) => log.error("Could not update the suggestion model", err));
  return queue;
}
