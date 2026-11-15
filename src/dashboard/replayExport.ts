// Saves this browser's Gmail index as a file for src/lib/replayMailbox.test.ts,
// so the sorting rules can be measured on real mail. Run
// `clusterExportReplay()` in the dashboard's DevTools console. The file holds
// headers and subjects only (the index never stores message bodies), stays on
// this computer, and its folder (replay/) is git-ignored.
import { openMailIndex } from "../lib/mailIndex";
import { knownSenderSet } from "../lib/screener";
import { getSettings } from "../lib/settingsStore";

export async function exportReplay(): Promise<number> {
  const index = await openMailIndex();
  const settings = await getSettings();
  const metas = await index.all("gmail");
  const data = {
    exportedAt: Date.now(),
    metas,
    sent: await index.allSent("gmail"),
    contacts: [...knownSenderSet(settings)],
    overrides: settings.sortOverrides,
    moveVotes: settings.autoSort.moveVotes,
  };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  a.download = "cluster-replay.json";
  a.click();
  URL.revokeObjectURL(a.href);
  return metas.length;
}
