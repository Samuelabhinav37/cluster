// Clean-up suggestions from sender profiles. At most one per sender, each with
// the reasons and the real numbers behind it. Works from the first open,
// because the history is already in the mail index. People you write to,
// starred senders and brand-new senders are never suggested, and only
// messages that pass the protection rules are ever offered for action.
import type { SenderEngagementMap } from "./engagementModel";
import { emptyProtectionContext, protectionDecision, type ProtectionContext } from "./protectionPolicy";
import type { SenderSummary } from "./senderModel";
import type { SenderProfile } from "./senderProfile";

export type SuggestionAction = "unsubscribe" | "mute" | "clearOld" | "keepSorted";

export interface Suggestion {
  sender: SenderSummary;
  profile: SenderProfile;
  action: SuggestionAction;
  reasons: string[];
  /** Read messages that pass every protection check. Census-only mail is
   * never here, so an action can't touch mail Cluster hasn't checked. */
  safeMessageIds: string[];
}

export const SUGGESTION_ACTION_LABELS: Record<SuggestionAction, string> = {
  unsubscribe: "Unsubscribe",
  mute: "Mute",
  clearOld: "Clear out old mail",
  keepSorted: "Keep sorted",
};

const KEEP_SORTED_PER_MONTH = 4;
const KEEP_SORTED_IN_INBOX = 5;

function hasUnsubscribe(sender: SenderSummary): boolean {
  const u = sender.unsubscribe;
  return Boolean(u.postUrl || u.httpUrl || u.mailto);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function monthYear(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function openedLine(p: SenderProfile): string {
  const opened = Math.round((p.openRate ?? 0) * p.judged);
  return opened === 0
    ? `You haven't opened any of their last ${p.judged.toLocaleString()}.`
    : `You opened ${opened} of their last ${p.judged.toLocaleString()}.`;
}

function cadenceLine(p: SenderProfile): string {
  return p.perMonth >= 1 ? `They send about ${Math.round(p.perMonth)} a month.` : "They send now and then.";
}

function pick(p: SenderProfile, sender: SenderSummary): { action: SuggestionAction; reasons: string[] } | null {
  if (p.tier === "ignored") {
    if (!p.stillSending) {
      return {
        action: "clearOld",
        reasons: [`They stopped sending in ${monthYear(p.lastSeenAt)}.`, openedLine(p)],
      };
    }
    if (hasUnsubscribe(sender)) return { action: "unsubscribe", reasons: [openedLine(p), cadenceLine(p)] };
    return {
      action: "mute",
      reasons: [
        "They don't offer a way to unsubscribe.",
        p.lastOpenedAt ? `You last opened one in ${monthYear(p.lastOpenedAt)}.` : openedLine(p),
      ],
    };
  }
  if (
    p.tier === "regular" &&
    p.machine &&
    p.perMonth >= KEEP_SORTED_PER_MONTH &&
    p.inInbox >= KEEP_SORTED_IN_INBOX
  ) {
    return {
      action: "keepSorted",
      reasons: ["You read these, but they fill your inbox.", `${plural(p.inInbox, "message")} there now.`],
    };
  }
  return null;
}

/**
 * Suggestions for the given senders, biggest clean-up first. A sender with
 * any protected message is left out whole, as every other bulk path does.
 * Dismissed senders stay hidden for 30 days, and an undo outweighs every
 * accepted action before it.
 */
export function buildSuggestions(
  senders: readonly SenderSummary[],
  profiles: ReadonlyMap<string, SenderProfile>,
  feedback: SenderEngagementMap = {},
  ctx: ProtectionContext = emptyProtectionContext(),
  now = Date.now(),
): Suggestion[] {
  const out: Suggestion[] = [];
  for (const sender of senders) {
    const profile = profiles.get(sender.key);
    if (!profile) continue;
    const record = feedback[sender.key];
    if (record?.snoozedUntil && record.snoozedUntil > now) continue;
    if (record && record.undoneActions > 0 && record.undoneActions >= record.acceptedActions) continue;
    const decisions = sender.messages.map((m) => protectionDecision(m, sender.address, ctx));
    if (decisions.some((d) => d.protected)) continue;
    const choice = pick(profile, sender);
    if (!choice) continue;
    out.push({ sender, profile, ...choice, safeMessageIds: sender.messages.map((m) => m.id) });
  }
  return out.sort((a, b) => b.safeMessageIds.length - a.safeMessageIds.length);
}

/** The suggestions about mail you don't open (everything but Keep sorted). */
export function unopenedSuggestions(suggestions: readonly Suggestion[]): Suggestion[] {
  return suggestions.filter((s) => s.action !== "keepSorted");
}
