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
}
