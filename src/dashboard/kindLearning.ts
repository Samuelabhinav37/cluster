// Your answers to "Receipts? Keep them" in Clear out, fed to the kind model
// (kindModel.ts). A yes protects that sender's mail at once.
import {
  answer,
  emptyKindModel,
  loadKindModel,
  markLearnedTransactional,
  saveKindModel,
  type KindAnswer,
  type KindModel,
} from "../lib/kindModel";
import { log } from "../lib/log";
import type { SenderSummary } from "../lib/senderModel";
import { ctx } from "./state";

let model: KindModel = emptyKindModel();

export async function initKindModel(): Promise<void> {
  model = await loadKindModel().catch((err) => {
    log.error("Could not load the kind model", err);
    return model;
  });
}

export function kindModel(): KindModel {
  return model;
}

/** Saves the answer and re-marks the current scan. */
export async function answerKind(sender: SenderSummary, value: KindAnswer): Promise<void> {
  const next = answer(model, sender, value);
  if (next === model) return;
  model = next;
  markLearnedTransactional(ctx.senders, model);
  await saveKindModel(model);
}
