# Code audit, 2026-11-15

Scope: 34,000 lines of app code in `src/` (20,000 more in tests). The scan
was a local script: repeated blocks of 6+ lines, exports nothing uses, and
files nothing imports.

## Done

- Deleted 9 unused exports and `aiDigest.ts` (the app never called it).
- Three Clean up cards (Delivered orders, Newest 3 per sender, Get to zero)
  repeated one archive, log and rescan body. It is now `archiveAndLog`.
- The unsubscribe button label was written twice. It is now `unsubscribeButtonText`.
- `senderVerdict` searched each signal's id list once per message (m² for a
  sender with m emails). It uses Sets now.

## Speed and memory, measured

Sorting held-out mailbox D, scaled up:

| Emails | Time | Extra heap |
|---|---|---|
| 3,000 | 0.25 s | 20 MB |
| 12,000 | 0.76 s | 12 MB |
| 48,000 | 2.6 s | under 35 MB |

Time grows in a straight line (O(n)), including single senders with 2,400 emails each.

## Left for a decision: code only tests call

The app never calls these, but each has tests. Deleting one removes its
tests too, so this is a feature-by-feature call:

- `src/dashboard/testHarness.ts` `confirmStep`
- `src/lib/bulkActions.ts` `safeSenderKeys`
- `src/lib/bulkActions.ts` `safeDomainGroupKeys`
- `src/lib/bulkActions.ts` `partitionForUnsubscribe`
- `src/lib/bulkActions.ts` `partitionForKeepSorted`
- `src/lib/bulkActions.ts` `executeBulkKeepSorted`
- `src/lib/bulkActions.ts` `partitionForSnooze`
- `src/lib/bulkActions.ts` `executeBulkSnooze`
- `src/lib/bulkActions.ts` `mergeDeletableIdsByProvider`
- `src/lib/bulkActions.ts` `totalDeletableAcrossGroups`
- `src/lib/categoryQueries.ts` `categoryQuery`
- `src/lib/census.ts` `cadenceLabel`
- `src/lib/domainGrouping.ts` `buildDomainGroups`
- `src/lib/durableJobs.ts` `listDurableJobs`
- `src/lib/durableJobs.ts` `requestJobCancellation`
- `src/lib/durableJobs.ts` `retryFailedJob`
- `src/lib/gmailQuotaLedger.ts` `gmailQuotaUsedWithin`
- `src/lib/gmailQuotaLedger.ts` `clearGmailQuotaLedger`
- `src/lib/gmailQuotaLedger.ts` `_internals`
- `src/lib/keepNewest.ts` `keepNewestExcessCount`
- `src/lib/kindModel.ts` `sendersToAsk`
- `src/lib/publicSuffix.ts` `isPublicSuffixListLoaded`
- `src/lib/seedFromExisting.ts` `findLabelReuseCandidates`
- `src/lib/seedFromExisting.ts` `filteredFromTargets`
- `src/lib/seedFromExisting.ts` `skipOverridesFor`
- `src/lib/senderListView.ts` `mainTemplate`
- `src/lib/senderModel.ts` `buildCombinedSenderSummaries`
- `src/lib/serverSort.ts` `buildBucketFilter`
- `src/lib/smartViews.ts` `evaluateSmartViewForTrash`
- `src/lib/subscriptionSignals.ts` `buildSubscriptionCandidates`


Kept on purpose: two `securityTab.ts` cards share DOM scaffolding but hold
different content, and `buildCombinedSenderSummaries` repeats
`buildSenderSummaries`. That one goes if the list above is cleared.
