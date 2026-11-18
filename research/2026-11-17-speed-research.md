# Making Cluster faster: what other email apps do (2026-11-17)

## What sets our speed

Gmail's current quota (changed 1 May 2026) is 6,000 units per user per minute.
Source: [Gmail usage limits](https://developers.google.com/workspace/gmail/api/reference/quota).

| Call | Units | Emails per call |
|---|---|---|
| messages.get (metadata) | 20 | 1 |
| messages.get (full/raw) | 60 | 1 |
| threads.get | 40 | 1 thread |
| messages.list (search) | 5 | up to 500 ids |
| threads.list | 10 | up to 500 |
| history.list | 2 | all changes |
| batchModify | 50 | up to 1,000 |
| labels.get / list | 1 | |

Reading one email costs 20 units; finding 500 by search costs 5. That is about
2,000 times cheaper per email. Every big speed gain is a way to replace reads
with searches.

Projects that used the API between November 2025 and April 2026 keep the old
prices (messages.get was 5). Cluster's repo starts 30 August 2026, so it is
almost certainly on the new prices. Check the Gmail API quota page in Google
Cloud Console to be sure. Google also says going over quota will be billed
later in 2026, with 90 days' notice.

## What the fast apps do

- **Superhuman.** It keeps the last 30 days on the device and aims for 100 ms
  per action. Ask AI runs two steps side by side: one picks the tool, the other
  pulls out dates and names. It answers in under 2 s and runs embeddings over 5
  years of mail on its servers.
  Sources: [ZenML on the LangChain case study](https://www.zenml.io/llmops-database/ai-powered-email-search-assistant-with-advanced-cognitive-architecture),
  [Latent Space](https://latent.space/reading/superhuman-email-agents/).
- **Shortwave.** It splits a question into parts, runs many fast AI calls side
  by side (dates, names, keywords), combines keyword and vector search, then
  re-ranks with cheap rules.
  Sources: [Shortwave deep dive](https://shortwave.com/blog/deep-dive-into-worlds-smartest-email-ai),
  [ZenML summary](https://www.zenml.io/llmops-database/building-a-production-grade-email-ai-assistant-using-rag-and-multi-stage-retrieval).
- **Inbox Zero** (open source). It sorts by sender, not by email: "once a
  sender is categorized, all their emails" follow. New senders go to a queue.
  Sources: [docs](https://docs.getinboxzero.com/essentials/smart-categories),
  [repo](https://github.com/elie222/inbox-zero).
- **Skiff.** Its search ran on the device: MiniSearch in a Web Worker, with the
  index stored on the device.
  Source: [skiff-front-search](https://www.mintlify.com/skiff-org/skiff-apps/libraries/skiff-front-search).

## Already done in Cluster

- Labelling by Gmail search, with no reads.
- Searches run 6 at a time; a read is reused for 60 s (6baffd3). Labelling went
  from 53 s to 3 s.
- Only changes are read after the first pass (history.list, 2 units).
- Sorting by sender, with Gmail's own categories used through search.

## What we're missing, best first

1. **Read by sender, not by email (biggest).** Read the newest email we don't
   know yet (20 units). Then search `from:that-sender` (5 units, 500 ids). Every
   email that comes back is now known without being read. Mail comes from a few
   senders: a 3,000-email inbox usually has a few hundred. About 400 senders ×
   25 units is about 10,000 units, roughly 2 minutes. Reading every email is
   about 60,000 units, roughly 18 minutes.
   Trade-off: those emails get no subject or date. Daily counts for charts can
   come from date searches (`after:`/`before:`, 5 units per day). The full
   per-email read can carry on quietly afterwards.
   Security still reads every email from a new sender.
2. **One search for many senders.** The "hold" step (now 44 s) runs one search
   per sender. `from:(a OR b OR c ...)` answers "did none of these write
   before?" in one call. Split the list in half only when something comes back.
3. **Instant search on the device.** The mail index already holds sender,
   subject and date. Search it as you type, with MiniSearch or FlexSearch in a
   Web Worker. No Gmail call and no quota cost.
4. **Pull dates and names out of a search** before searching, as Superhuman
   and Shortwave do. "amazon last week" becomes `from:amazon after:...`.
   Plain rules handle most of it. Chrome's built-in model (Prompt API, stable
   for extensions since Chrome 148) can handle the rest on the device.
   Sources: [Chrome built-in AI](https://developer.chrome.com/docs/ai/built-in),
   [status](https://noqta.tn/en/tutorials/chrome-built-in-ai-prompt-api-gemini-nano-2026).
   Note that Chrome downloads the model, about 4 GB.
5. **Newest 30 days first.** Finish the last month quickly so the Dashboard
   fills in early, as Superhuman does on install.

## Checked, small or no gain

- **HTTP batch** (up to 100 calls, 50 recommended): fewer round trips, but each
  call still costs the same quota, and quota is our limit.
  Source: [batching](https://developers.google.cn/workspace/gmail/api/guides/batch).
- **`fields` partial responses:** smaller replies, same quota.
  Source: [performance tips](https://developers.google.com/workspace/gmail/api/guides/performance).
- **threads.get:** costs 40, double a message read. Only reading the newest
  message per thread helps, and only for long threads.
- **Gmail push (watch and Pub/Sub):** needs a server. history.list at 2 units
  already does the job.
- **Reading Gmail's web page instead of the API:** no quota, but fragile and
  against the API's terms. Not recommended.

## What we can't do

- A server copy of mail or server embeddings. That breaks the
  sender-and-subject-only, on-device promise, and needs Google's security
  review for stored Gmail data.
- Reading more than about 300 emails a minute. That is Gmail's limit, for every
  app.
