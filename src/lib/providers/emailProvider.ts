import type { UnsubscribeInfo } from "../unsubscribe";

export type ProviderId = "gmail" | "outlook";

export type { UnsubscribeInfo };

export interface NormalizedMessageStub {
  id: string;
  provider: ProviderId;
}

export interface NormalizedMessageMetadata {
  id: string;
  provider: ProviderId;
  fromAddress: string;
  fromDisplayName: string;
  subject: string;
  isProtected: boolean;
  unsubscribe: UnsubscribeInfo;
  /** Epoch ms the message was received — never a claimed in-body date. */
  receivedAt: number;
  /** Raw Authentication-Results header text, if the provider/relay added one
   * -- see emailAuth.ts for parsing. Undefined (not empty string) when the
   * message had no such header at all, distinct from a header that's
   * present but doesn't mention a given mechanism. */
  authenticationResults?: string;
}

export interface EmailProvider {
  id: ProviderId;
  isConnected(): Promise<boolean>;
  getAuthToken(interactive: boolean): Promise<string>;
  listCandidateMessages(
    token: string,
    maxResults: number,
    windowDays: number,
  ): Promise<NormalizedMessageStub[]>;
  getMessageMetadata(token: string, id: string): Promise<NormalizedMessageMetadata>;
  trashMessages(token: string, ids: string[]): Promise<void>;
  keepSorted?(
    token: string,
    fromAddress: string,
    label: string,
    existingIds: string[],
  ): Promise<void>;
  /**
   * Permanent delete — no Trash recovery, unlike trashMessages. Gmail-only,
   * opt-in; requires a token obtained with an elevated scope (see
   * gmailApi.getElevatedAuthToken / settingsStore.fastPermanentDeleteEnabled).
   */
  permanentlyDeleteMessages?(token: string, ids: string[]): Promise<void>;
  /**
   * Undo for trashMessages — Gmail-only. Outlook's equivalent (moving back
   * out of Deleted Items) isn't implemented, so undo only ever covers the
   * Gmail portion of a mixed-provider delete.
   */
  untrashMessages?(token: string, ids: string[]): Promise<void>;
  /**
   * Snooze — Gmail-only, via label + resurface-timestamp bookkeeping (see
   * settingsStore.snoozedMessages / snoozeResurface.ts). Outlook has no
   * native snooze primitive, and a folder-move approximation would silently
   * go stale if the user reorganizes mail elsewhere.
   */
  snoozeMessages?(token: string, ids: string[]): Promise<void>;
  resurfaceMessages?(token: string, ids: string[]): Promise<void>;
  /**
   * Labels the given message ids as possible phishing and archives them out
   * of the inbox — Gmail-only, deliberately manual and per-occurrence
   * rather than a standing filter (see threatSignals.ts): a signal that
   * fires today (a lookalike domain, a DMARC fail) isn't guaranteed to
   * still apply to whatever this sender does next, so this never creates a
   * rule that would silently keep acting on future mail unreviewed. Never
   * deletes — same "label/quarantine, never delete" rule as keepSorted.
   */
  labelSuspicious?(token: string, ids: string[]): Promise<void>;
}
