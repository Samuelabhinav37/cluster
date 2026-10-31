# Sections research, 2026-10-31

Research for the section-by-section redesign (plan: `docs/sections-plan-2026-10-31.md`).
Each topic lists what real products do, what Cluster does today and what it means for us.
Gaps are listed where a source could not be reached or did not say.

---

## 1. Senders: name and grouping

**Products**
- **Rocket Money** finds subscriptions from bank charges. Its "Recurring" tab splits them into Subscriptions and Bills, and the user can move a charge between the two. Lesson: one list, two or three plain buckets, and the user can correct a bucket.
- **Gmail "Manage subscriptions"** (July 2025) lists bulk and mailing-list senders, sorted by how much they send, with one-click Unsubscribe. Google does not publish its criteria. The Workspace blog post could not be fetched from here.
- **Apple Mail** (iOS 18.2) sorts into Primary, Transactions, Updates and Promotions. Primary gets saved contacts and time-sensitive mail. Users can move a sender to another category, and it sticks for that sender. Apple publishes no rules, and reviews report misfiled mail. Sources: [MacRumors](https://macrumors.com/2024/12/13/ios-18-2-mail-categories), [heise](https://heise.de/-10227127), [iPhoneLife](https://iphonelife.com/content/how-to-use-categories-mail-app).
- **Clean Email** has Top Senders, an Unsubscriber grouped by unsubscribe link, and Smart Folders. AgainstData splits mail into Personal, Promotions and Notifications.

**Cluster today**
- `senderGroup()` in `src/lib/senderListView.ts` returns one of three groups:
  - people: `isPerson`
  - subs: has an unsubscribe link and isn't a receipt, shipping or code
  - companies: everything else

**What it means**
- Keep three groups, and name them the way people already say them: **People, Companies, Subscriptions**.
- For the screen name, "Contacts" is the most familiar. Apple and Google both use it, and the Contacts-style Lists column already ships.
- Every row keeps "Move to People / Companies / Subscriptions", like Rocket Money and Apple Mail. The override already exists (`personOverride`).

## 2. Person vs company

**Sources**
- Lead-scoring tools check the domain against a list of free-mail providers. [laravel-sift](https://packagist.org/packages/mischasigtermans/laravel-sift) ships 100+ providers. [PopSQL](https://popsql.com/sql-templates/sales/tagging-sign-up-emails-as-work-vs-personal) uses a short list and says it is simplified.
- Several sources warn that the domain is one signal, not a verdict. [Suped](https://www.suped.com/knowledge/email-deliverability/technical/why-do-b2b-data-capture-forms-reject-records-when-website-and-email-domains-dont-match) recommends scoring. [CMSWire](https://www.cmswire.com/cms/customer-experience/tested-personal-vs-business-email-contacts-on-b2b-websites-infographic-022231.php) found 22% of customers used free mail.
- Public lists:
  - [tahul/freemail](https://github.com/tahul/freemail) splits free, disposable and blacklist domains.
  - identibyte/free-email-providers is another.
  - Licenses are unclear, so we hand-pick from them instead of copying a file.
- No source gave a standard rule for role addresses (info@, support@). We write our own small list.

**Cluster today**
- `isPerson` requires all of:
  - tier close or known
  - not a machine sender
  - kind person
  - a domain in `FREE_MAIL_DOMAINS` (16 domains) or one ending in `.edu`

**What it means**
1. Grow the free-mail list to about 60 domains, covering:
   - regional Yahoo, Outlook and Hotmail domains
   - rediffmail, zoho, yandex, mail.ru, qq, 163/126, naver
   - web.de, gmx.de, fastmail, hey.com, tuta, pm.me
2. School domains: `.edu`, `.edu.*`, `.ac.*`.
3. Role addresses never count as a person: no-reply, noreply, support, info, hello, team, billing, notifications, alerts, news and similar.
4. A person writing from a company domain stays under that company. This matches the user's free-mail rule and keeps recruiters with their company. Their row inside the company shows their name.

## 3. Clean up: faster, more accurate, cards with detail pages

**Products**
- [Google One Storage manager](https://www.webnots.com/how-to-clean-up-gmail-with-google-one-storage-manager/) shows a few big categories: large attachments, Trash, Spam. Each opens a review list.
- No Google-native "Clean up suggestions" or "emails you don't open" category was found. Only Clean Email has "Cleaning Suggestions".
- Pattern: a few summary cards, each opening a full list, and a bulk action that is visible on the card.

**Cluster today**
- Never opened and Past its date come from the local index.
- Stop mail is a sub-page.
- The presets moved to the bottom of Clean up in R11.

**What it means**
- Three cards, one job each. Each card holds:
  - a number
  - a small top-5 bar
  - one action
- Clicking a card opens its page.
- Clicking a company opens its emails in Details.
- Speed and accuracy:
  - Count from the local index, the way it works now.
  - Right before acting, re-check the exact IDs: skip starred, important and replied mail. `filterOutProtected` does this today; keep it.
  - Show the real count on the confirm step.

## 4. Subscription card style

Reuse the Stop mail paid-subscription card on Senders › Subscriptions. Each card has:
- a logo
- a name
- how often they send ("Weekly")
- how much of it you open
- one Unsubscribe button

Same CSS classes, no new component.

## 5. Organize: custom rules and the label list

**Products**
- **Gmail filters** are one search-style form (From, To, Subject, Has the words, with a minus sign for "not"), then a list of actions, plus "also apply to matching conversations". There is no rule order and no exceptions step. Source: [Ablebits](https://www.ablebits.com/office-addins-blog/filter-email-gmail/).
- **Outlook's Rules Wizard** goes condition, then action, then exception. Each condition is a sentence with an underlined value you click to fill in. Rules run in order. Source: [IONOS](https://www.ionos.com/digitalguide/e-mail/technical-matters/create-outlook-rules.md).

**What it means**
- Write custom rules as one sentence with clickable values (Outlook's best idea), for example: "When mail is from **amazon.in** and the subject has **order**, label it **Shopping**."
- Save each rule as a Gmail filter (Gmail's model). It then runs in Gmail even when the browser is closed. Cluster already syncs filters (`syncCategoryFilters`).
- No order and no exceptions, because Gmail filters don't support them. A "not" value covers most exceptions.
- Labels list:
  - The count sits right-aligned in muted text, like Apple Mail's mailbox counts.
  - The status lines below the list become one line.
  - Sort my inbox becomes one button in the page header, with progress shown inline.

## 6. Protect: the security pipeline and drill-downs

**Products**
- **Gmail's "Be careful with this message"** appears when SPF, DKIM or DMARC don't verify, for suspected spoofing, for risky links and for "many people reported similar messages". It offers Report phishing and Looks safe. Sources: [Blueshift](https://blueshift.com/blog/gmail-be-careful-with-this-message-warning/), [Gridinsoft](https://blog.gridinsoft.com/this-message-seems-dangerous/).
- **Brown University's banner** warns when an outside sender's display name exactly matches someone you know. Source: [Brown](https://it.brown.edu/phish-bowl-alerts/be-careful-message-gmail-anti-spoofing-warning-message).
- No user-facing source was found for Microsoft Defender's first-contact tip.

**Cluster today**
- 14 signal kinds in `threatSignals.ts`, with hand-set weights.
- `verdict.ts` turns them into hold, warn or none, with plain reasons (top three).
- Rule 1 already skips brand checks for people you write to, following Microsoft's mailbox intelligence.

**What it means**
- Missing signals compared with Gmail and Brown:
  1. **Contact name spoof:** the display name matches a known correspondent, but the address is new.
  2. **First contact:** a corroborating signal only, never decisive alone.
- Drill-downs:
  - **Scams per week** opens a page with an 8-week bar chart. Below it are the held emails, each showing its top three reasons and Release / Trash.
  - **Warning signs** opens a page grouped by sign (failed sender check, lookalike domain, replies go elsewhere and so on), each with a count and its emails.
- Weights stay hand-set until we have a labelled set. The user's Release and Confirm choices already adjust the score (`quarantineScoreAdjustment`).

## 7. Settings on one page and editable shortcuts

**Products**
- **iOS Settings:** one scrolling list of groups, each row with a colored square icon and a value on the right, plus search at the top. Moat's options page already has "Search settings" (`moat/src/options/options.html`).
- **Superhuman** says remapping shortcuts "isn't currently possible". Its shortcuts are listed through Cmd+K. Source: [Superhuman help](https://help.superhuman.com/article/478-superhuman-command).
- **Linear:** no official remapping found, only a searchable shortcut help ([changelog](https://linear.app/changelog/2021-03-25-keyboard-shortcuts-help)).
- **Accessibility:** single-character shortcuts must be possible to turn off or remap (WCAG 2.1.4). Source: [Harvard](https://accessibility.huit.harvard.edu/technique-character-key-shortcuts.md).

**What it means**
- One Settings page with these groups: Account, Mail, Organize, Protect, Kai, Keyboard, Privacy, About. Search sits on top.
- Keyboard group:
  - Each row has the action name, its key and a Change button.
  - Change waits for one key press and warns on a clash.
  - Reset to defaults, plus one switch that turns single-key shortcuts off (the WCAG rule).
- Defaults copy Gmail: `/` search, `g` then a letter to go somewhere, `?` shows all shortcuts.

## 8. Home: inbox health

**Products**
- No product found uses a standard "inbox health" score.
- SaneBox reports concrete numbers: lowest inbox count, emails it trained, hours saved, emails sent. Sources: [SaneBox digest](https://www.sanebox.com/help/170-daily-digest-how-to-guide), [SaneData](https://blog.sanebox.com/tag/teams/).

**What it means**
- Don't invent a score. Show three tiles of real numbers:
  - **Inbox:** unread in the inbox and the change this week, with an 8-week bar.
  - **Clean up:** emails you can clear and the top card's action.
  - **Security:** scams held this week and warnings to look at.

## 9. Kai at the bottom corner

**Products**
- Intercom-style helpers sit in a bottom-corner launcher. Apps can also open them from their own buttons. Source: [HelpCenter.io](https://self.helpcenter.io/content/integrate-the-helpcenter-io-widget-with-the-intercom-messenger/export/pdf).
- No public documentation was found on routing a user to a settings page. We design that part ourselves.

**Cluster today**
- `kaiGuide.ts` (514 lines) holds keyword answers.
- `askKai.ts` is the `/` and Ctrl+K palette.

**What it means**
- Kai sits in the bottom-right corner. Clicking it opens a small panel with one input.
- Answers come from the same `kaiGuide` intents, each with a "Take me there" button that opens the screen and highlights the row.
- **Learning, on this computer only:**
  - Store each question's words and the answer the user picked, in `chrome.storage.local`.
  - Next time, answers picked for similar words rank first.
  - Questions with no answer are kept in a local list the user can see and clear.
  - No cloud model.
- `/` and Ctrl+K open the same Kai panel, so there is one Kai.

## 10. Details pane and top search

**What it means**
- A search bar centered at the top of every screen, like Moat's:
  - It searches the local index by sender, company or subject while you type.
  - Enter opens the results in Details.
- Details becomes "see before you act": any card or company opens the exact emails an action would touch, with the same Trash, Archive and Mute buttons.
- It keeps its current smart chips and its minimize-to-strip behaviour.
