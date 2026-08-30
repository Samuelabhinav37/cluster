# Cluster — live test checklist

Everything below is verified only in a real browser against a real inbox. The
unit + contract tests can't cover DOM wiring, OAuth, or the Gmail/Graph calls.

## Load

1. `npm run build` (not `npm run dev` — crxjs dev server gives an unstable
   unpacked load).
2. `chrome://extensions` → Developer mode on → **Load unpacked** → pick the
   **`dist/`** folder (never the repo root — its manifest points at `src/*.ts`).
3. Extension loads with **no error**. If it fails with "Could not load manifest
   — expected value at line 1 column 1", check `public/managed_schema.json` is
   valid JSON.
4. The toolbar icon is the Cluster mark (hexagon + envelope), no dark tile.
5. Click it → the dashboard opens in a new tab. Header shows the inline SVG
   logo next to "Cluster", themed to light/dark.

## Clean up tab

- [ ] **Sort my inbox** section is pinned at the top. "Sort my inbox…" button +
      a count ("N messages → M labels") + a "Which buckets…" `<details>`.
- [ ] Expand the config: one row per bucket present in the scan, each with an
      include checkbox (all checked on first run) and a "keep in inbox"
      checkbox (checked for Shopping/Finance/Travel/…, unchecked for
      OTP/shipping/receipts/newsletters/social).
- [ ] Untick a bucket → the count drops. Tick "keep sorting new mail" and
      "auto-trash one-time codes older than 2 days".
- [ ] Click "Sort my inbox…" → one confirm → Confirm. In Gmail: the
      `Cluster/<Category>` labels now exist and matching mail carries them;
      filed-out buckets left the inbox, "keep in inbox" buckets did not.
- [ ] Rules tab now lists an `Auto-sort: <bucket>` rule per chosen bucket (+
      `Auto-sort: expire one-time codes`).
- [ ] Rules → **Current dry run** updates when a rule is enabled, disabled, added, or deleted. Expand
      each rule and verify sender counts, provider action support, overlap/stop-processing notes, and
      protected/exception exclusions. Viewing the preview must not change any mail.
- [ ] The Apply confirmation uses predicted rule applications and unique eligible messages from the
      same dry run; execution results appear in Recently done afterward.
- [ ] Recently done shows one entry per bucket with a working **Undo** (label
      removed, filed-out mail back in the inbox).
- [ ] Existing sections still work: category groups, "Ready to clean up",
      Smart Views, Trim-to-newest-N, **Personalized cleanup suggestions**, **Suggested spam**
      (shows "Matched against N known domains", per-row checkboxes + select-all,
      Trash selected → confirm → Undo).
- [ ] Personalized suggestions show a fit score, confidence, and concrete unread-pattern reasons;
      no sender with starred/flagged mail appears. Reloading an unchanged scan does not increase
      the changed-snapshot count.
- [ ] Click **Not useful** → that row disappears. Confirm a suggestion-backed Trash action, then
      use Recently done → **Undo**; restored mail does not immediately reappear as a suggestion.

## Security tab

- [ ] "Auto-quarantine high-risk senders in the background" toggle — **off** on
      first load. Toggling persists across a reload.
- [ ] "Possible impersonation" list: each flagged sender shows a HIGH/ELEVATED/
      LOW prefix, the signal descriptions, an `[SPF ✓ · DKIM — · DMARC —]`
      chip, and "· first email from this sender" where applicable.
- [ ] New signal types render sensibly if present: reply-to-mismatch,
      punycode-domain, lure-language.
- [ ] "Label as suspicious" and "Deep scan" still work per sender.
- [ ] Turn auto-quarantine **on**, then trigger the background alarm (or wait 6h
      / reload a few times): HIGH-tier Gmail senders get `Cluster/Possible
      Phishing` and leave the inbox; Recently done shows an "Auto-quarantined …"
      entry with a working Undo.

## Sender table

- [ ] "· new sender" appears next to first-contact senders. On a second scan the
      same senders are no longer marked new (ledger persisted).

## Subscriptions tab

- [ ] Send a verified one-click request. Its outcome becomes **Pending** and survives reload.
- [ ] Outcome filters show only the selected state. A request older than 14 days with a later
      scanned arrival appears first as **Still sending** with **Retry unsubscribe**.
- [ ] A tracked sender absent from the current unsubscribe list remains visible in tracked request
      history. **Quiet in current scan** includes the scan-limit caveat and never claims certainty.

## Outlook (if connected)

- [ ] "Connect Outlook" completes; Outlook senders appear tagged `outlook`.
- [ ] A rule with a label/archive/mark-read/trash action **acts on Outlook
      mail** (previously no-op): check the Outlook web client for the
      `Cluster/<Category>` category / Archive move / read state.
- [ ] "Sort my inbox" applies categories to Outlook mail and moves filed-out
      buckets to Archive.
- [ ] Keep-sorted / Mute / Snooze / Screener rows still say "Not supported for
      this provider" for Outlook.

## Open questions to answer while testing

- Does `dmarc=fail` ever actually appear on delivered Promotions/Updates mail,
  or only the broadened `spf=fail && dkim=fail` case? (If neither fires,
  loosen further.)
- Does Gmail `format=metadata` expose attachment part filenames? (If yes, the
  deferred `suspicious-attachment` signal becomes cheap.)
