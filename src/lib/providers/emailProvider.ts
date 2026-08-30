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
  /** Lowercased Reply-To address if the message set one, else "". Used only
   * for the reply-to-mismatch threat signal (see threatSignals.ts). */
  replyToAddress: string;
  subject: string;
  isProtected: boolean;
  /** Still unread — Gmail UNREAD label / Graph isRead === false. Powers the
   * "you never open these" surface and the `unread` rule condition. */
  unread: boolean;
  /** Provider's size estimate in bytes (Gmail sizeEstimate / Graph size).
   * Used only by Smart Views' "Large mail" filter. */
  sizeBytes: number;
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
  /** Undo for trashMessages. Gmail removes the TRASH label; Outlook moves the
   * message from Deleted Items back to the inbox. */
  untrashMessages?(token: string, ids: string[]): Promise<void>;
  /**
   * Rule-engine actions (see ruleRunner.ts). Implemented for both providers:
   * Gmail toggles INBOX / UNREAD labels; Outlook moves folders (Archive) and
   * PATCHes isRead / categories via Graph. `keepInInbox` labels in place.
   */
  archiveMessages?(token: string, ids: string[]): Promise<void>;
  unarchiveMessages?(token: string, ids: string[]): Promise<void>;
  markReadMessages?(token: string, ids: string[]): Promise<void>;
  /** Apply a label. `keepInInbox` (default false) leaves the mail in the
   * inbox instead of filing it out -- used by "Sort my inbox" per bucket. */
  labelMessages?(token: string, ids: string[], labelName: string, keepInInbox?: boolean): Promise<void>;
  /** Reverses labelMessages for the "Sort my inbox" undo. */
  unlabelMessages?(token: string, ids: string[], labelName: string, wasFiledOut: boolean): Promise<void>;
  /**
   * Local BlackHole — a standing filter hiding all mail from an address, now
   * and future (see gmailApi.muteSender). Gmail-only: needs the filters API.
   */
  muteSender?(token: string, fromAddress: string, existingIds: string[]): Promise<void>;
  unmuteSender?(token: string, fromAddress: string, mutedIds: string[]): Promise<void>;
  /**
   * Screener (Phase 6) — Gmail-only. screenSender holds a sender's mail under
   * Cluster/Screener; allowSenderThrough reverses it; listSentCorrespondents
   * returns everyone the user has emailed (the implicit allowlist).
   */
  screenSender?(token: string, fromAddress: string, existingIds: string[]): Promise<void>;
  allowSenderThrough?(token: string, fromAddress: string, screenedIds: string[]): Promise<void>;
  listSentCorrespondents?(token: string): Promise<string[]>;
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
  /** Reverses labelSuspicious: drops the Cluster/Possible Phishing label and
   * files the messages back into the inbox. Gmail-only, used by the
   * Recently-done Undo for auto-quarantine. */
  unlabelSuspicious?(token: string, ids: string[]): Promise<void>;
  /**
   * Fetches one message's full HTML body and returns its links -- Gmail
   * only, deliberately manual (see the dashboard's "Deep scan" button, the
   * only caller) rather than part of the normal metadata-only scan. A
   * materially bigger fetch (format=full vs. the metadata format every
   * other method here uses) for a narrow, opt-in purpose: link-target-
   * mismatch detection (see linkMismatch.ts).
   */
  getMessageLinks?(token: string, id: string): Promise<{ text: string; href: string }[]>;
}
