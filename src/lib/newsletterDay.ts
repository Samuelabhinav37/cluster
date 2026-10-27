// "Newsletters on Saturday" (Shortwave's delivery schedule, HEY's Feed): while
// on, newsletters leave the inbox within minutes through the normal time-limit
// sweep, and each Saturday at 8 am the week's batch comes back to the inbox,
// pinned so the sweep leaves it there. Gmail only; nothing is deleted.
import { categoryLabelName } from "./categoryFilters";
import { batchModify, findLabelIds, listMessageIds } from "./gmailApi";
import { pinInInbox } from "./inboxTimeLimits";
import { gmailProvider } from "./providers/gmailProvider";
import { getSettings, mutateSettings, type ClusterSettings } from "./settingsStore";

/** The newsletter time limit this mode uses: out of the inbox in 10 minutes. */
export const HOLD_HOURS = 1 / 6;
const DELIVERY_DAY = 6; // Saturday
const DELIVERY_HOUR = 8;

/** The latest Saturday 8 am (local time) at or before `now`. */
export function lastDeliveryMoment(now: number): number {
  const d = new Date(now);
  d.setHours(DELIVERY_HOUR, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - DELIVERY_DAY + 7) % 7));
  if (d.getTime() > now) d.setDate(d.getDate() - 7);
  return d.getTime();
}

export function newsletterDayOn(settings: ClusterSettings): boolean {
  return (
    settings.newsletterDay.enabled &&
    settings.autoSort.timeLimitsEnabled &&
    settings.autoSort.inboxHoursByBucket.newsletter === HOLD_HOURS
  );
}

/** Puts held newsletters from the last 8 days back in the inbox when a
 * Saturday has passed since the last delivery, or at once with `force`. */
export async function deliverNewsletters(now = Date.now(), force = false): Promise<number> {
  const settings = await getSettings();
  if (!force && !newsletterDayOn(settings)) return 0;
  if (!force && lastDeliveryMoment(now) <= settings.newsletterDay.lastDelivered) return 0;
  const token = await gmailProvider.getAuthToken(false);
  const labelId = (await findLabelIds(token, categoryLabelName("newsletter", settings.labelChoices)))[0];
  const ids = labelId ? (await listMessageIds(token, "-in:inbox newer_than:8d", 500, [labelId])).map((m) => m.id) : [];
  if (ids.length > 0) await batchModify(token, ids, ["INBOX"], []);
  await mutateSettings((current) => ({
    ...current,
    newsletterDay: { ...current.newsletterDay, lastDelivered: now },
    autoSort: { ...current.autoSort, keptInInboxIds: pinInInbox(current.autoSort.keptInInboxIds, ids) },
  }));
  return ids.length;
}
