# Google verification pack (plan step 0)

Draft, 2026-11-19. What to paste into the Google Cloud console's OAuth consent
screen and verification form, and what still has to be made first.

Cluster is free and open source, never charges, and keeps your mail on your
computer. Say that plainly in every answer below.

## Before you submit

| Needed | State |
|---|---|
| Privacy policy at a public URL on Cluster's own domain | **Missing.** Only `docs/privacy.md` exists. Publish it as `site/cluster/privacy.html` and link it from the site footer |
| Homepage that says what Cluster does and links the privacy page | `site/cluster/index.html` exists; add the privacy link |
| The privacy page and README match the app | **Mismatch.** README says "Settings → Privacy shows what's stored", but that section is hidden in Settings now. Show it again or change the README |
| Authorised domains in the console | The site's domain, and the sign-in helper's domain |
| Demo video (unlisted YouTube) | Script below |
| Security assessment (CASA) | Needed for `gmail.modify`, a restricted scope. Get a quote from an App Defense Alliance lab |

## Scopes and why each one

**`https://www.googleapis.com/auth/gmail.modify`** (restricted)

> Cluster sorts the user's mail into labels, moves mail out of the inbox,
> moves mail the user picks to Trash, and holds suspected phishing. Each of
> these changes labels on messages, which needs gmail.modify. Cluster reads
> message headers (sender, subject, date, authentication results) to decide
> where mail goes. It never reads message bodies in the background. Nothing is
> stored on any server: the mail index lives in the browser on the user's
> computer. Cluster never permanently deletes mail; Trash keeps it 30 days and
> every action has Undo.

Why a narrower scope doesn't work: `gmail.metadata` can read headers but not
change labels, and `gmail.labels` can create labels but not put mail in them.

**`https://www.googleapis.com/auth/gmail.settings.basic`**

> Cluster creates Gmail filters so new mail is sorted by Gmail itself, even
> when the user's computer is off, and removes those filters when the user
> turns a label off or uninstalls. Only filters Cluster made are changed.

Check the console for whether it lists this scope as sensitive or restricted.

## Data use answers

- **What data:** message headers and labels, and the user's own Gmail filters and labels.
- **Where it goes:** stays in the browser (IndexedDB and extension storage). Gmail
  API calls go straight from the browser to Google.
- **The sign-in helper:** Google needs a client secret to finish sign-in, and an
  extension can't keep one. A small helper adds it. It sees the sign-in tokens
  on their way through, never mail, and stores nothing.
- **Sharing:** none. No ads, no sale, no analytics on mail. Limited Use: yes.
- **People:** no human reads user data.
- **Deletion:** Settings > Danger zone removes Cluster's labels and filters, and
  removing the extension deletes everything it stored.

## Demo video script (3 to 4 minutes, unlisted)

1. Show the Chrome Web Store listing or `chrome://extensions` with Cluster installed, and the OAuth client ID on screen.
2. Click the Cluster icon. The welcome asks a name, then **Continue with Google**.
3. Google's consent screen: pause on it so both scopes are readable.
4. The first read. Say: headers only, kept on this computer.
5. **Labels:** mail sorted under labels in Gmail (switch to the Gmail tab and show them). This is `gmail.modify`.
6. **Gmail Settings > Filters:** Cluster's filters. This is `gmail.settings.basic`.
7. **Cleanup:** pick a sender, Trash, then Undo from Activity. Mail comes back.
8. **Security:** a held phishing email, and **Let in**.
9. **Settings > Danger zone > Remove from Gmail:** labels and filters gone.

## Order

1. Publish the privacy page and fix the README line.
2. Fill the consent screen (app name, logo, homepage, privacy URL, domains, scopes).
3. Record and upload the video.
4. Submit for verification, then start CASA when Google asks.
