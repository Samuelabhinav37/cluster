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
- [ ] Click "Sort my inbox…" → a **preview tree** appears below the config:
      bucket → sender → message, every message ticked. Expand a bucket, expand a
      sender. The Apply button shows the live included count.
- [ ] Untick a message → the Apply count drops. Apply → in Gmail that message
      stays in the inbox / unlabelled; the rest are filed. Flat labels
      (`Shopping`, `Newsletters`, …) exist at top level (no `Cluster/` parent);
      filed-out buckets left the inbox, "keep in inbox" buckets did not.
- [ ] In the preview, a sensitive-looking subject in a filed-out bucket shows a
      "· sensitive?" hint on its row.
- [ ] Use a sender's "wrong bucket?" menu → "move to Finance": the preview
      re-renders with that sender under Finance. Pick "never sort this sender":
      the sender disappears from the preview and stays gone on the next scan
      (persisted in `settings.sortOverrides`).
- [ ] Pre-create a Gmail label matching a bucket (e.g. `Shopping`), then sort:
      Cluster asks "Use my Shopping / Keep separate as Shopping (Cluster)". The
      choice sticks on a re-run. Picking "Use my" files into your own label;
      picking "Keep separate" creates `Shopping (Cluster)` and leaves yours alone.
- [ ] Tick "keep sorting new mail" before Apply. Afterwards:
      - **Gmail Settings → Filters** has one filter per domain-category bucket
        (Shopping/Finance/Travel/Social/Newsletters/Productivity/Education) with
        `from:(domain OR domain …)` → apply label, skip inbox when filed out.
      - The config `<details>` shows "N Gmail filters keep these buckets sorted…".
      - Rules tab lists an `Auto-sort: <bucket>` rule only for the **subject-kind**
        buckets (One-time codes / shipping / receipts / newsletters / social) and
        for any domain-category bucket that also had **Outlook** mail — not for a
        Gmail-only domain-category bucket.
      - `Auto-sort: expire one-time codes` rule present if that box was ticked.
- [ ] Send yourself (or self-label) new mail from a domain in a kept bucket's
      list, with the dashboard **closed** → Gmail files it under the label /
      out of the inbox on its own.
- [ ] Re-run "Sort my inbox…" with "keep sorting" **unticked** → the bucket
      filters are deleted from Gmail Settings and the "N Gmail filters" note
      disappears. Confirm the `from:(a OR b …)` query length was accepted by
      Gmail (note if a long list is rejected).
- [ ] Rules → **Current manual dry run** updates when a rule is enabled, disabled, added, or deleted. Expand
      each rule and verify sender counts, provider action support, overlap/stop-processing notes, and
      protected/exception exclusions. Viewing the preview must not change any mail.
- [ ] The Apply confirmation uses predicted rule applications and unique eligible messages from the
      same dry run; execution results appear in Recently done afterward.
- [ ] Create a rule with **max per run = 1** that matches at least two messages. The dry run reports
      one predicted application and the remainder deferred. Apply it and verify only one message changes;
      Recently done and the completion text both report the deferred count. Add a lower-priority overlapping
      rule and verify it cannot act on the message blocked by the earlier rule's safety limit.
- [ ] Trigger two background sweeps over an idempotent label/archive rule. The second sweep reports the
      first message as already completed instead of calling the provider again, and a capped rule advances
      to the next uncompleted message. A deliberately confirmed manual Apply can still run it again.
- [ ] For a multi-action rule, force the later action to fail. No full-completion receipt is written; the
      next background sweep retries that message. Undo a completed Gmail archive rule and verify the next
      background sweep respects the correction rather than immediately archiving it again.
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
      / reload a few times): HIGH-tier Gmail senders get a `Possible Phishing`
      label and leave the inbox; Recently done shows an "Auto-quarantined …"
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
      category (`Shopping`, `Newsletters`, …) / Archive move / read state.
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
