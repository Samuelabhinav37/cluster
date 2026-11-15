// Your answers to "Receipts? Keep them" in Clear out, fed to the kind model
// (kindModel.ts). A yes protects that sender's mail at once.
import { emptyKindModel, loadKindModel, saveKindModel, type KindModel } from "../lib/kindModel";
import { log } from "../lib/log";

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

/** Forgets every "Receipts? Keep them" answer. Mail already marked stays
 * marked until the next scan. */
export async function resetKindModel(): Promise<void> {
  model = emptyKindModel();
  await saveKindModel(model);
}
