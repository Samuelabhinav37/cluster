# Accounts: connecting, disconnecting and handling more than one email

Date: 2026-10-10. Question from the owner: before building anything, research onboarding, how
Cluster connects different email accounts, how it disconnects them, and how it handles more
than one, including what other companies do and what the best way is.

Labels: **(Source)** external, with link; **(Code)** verified in this repo; **(Inference)** my
recommendation; **(Unverified)** needs a live test.

## TL;DR

- Today Cluster can hold **one Gmail account (whichever Chrome picks) plus one Outlook
  account**, and has **no way to disconnect either** (Code).
- Chrome's built-in Google sign-in (`getAuthToken`) cannot reliably choose an account, so
  **multiple Gmail accounts require moving Gmail to the same kind of sign-in Outlook already
  uses** (`launchWebAuthFlow` with PKCE and refresh tokens) (Source + Code).
- Every product studied treats accounts the same way: **add from a menu, see them in a list,
  switch from the avatar, remove from Settings, and say clearly what removal deletes**. The
  careful ones (SaneBox, Clean Email) ask whether to keep or undo what they changed in the
  mailbox and delete their own data immediately (Source).
- Recommended path: (1) a 1-hour **spike** to confirm Google accepts the PKCE exchange without
  a secret; (2) **sign out** first, because it is small and needed regardless; (3) the
  **multi-account model** (per-account data, switcher, reconnect states); (4) the new
  **onboarding** built on top.

## 1. What Cluster does today (Code)

| Area | Today | Where |
|---|---|---|
| Gmail sign-in | `chrome.identity.getAuthToken({ interactive })`, client id and scopes from the manifest (`gmail.modify`, `gmail.settings.basic`) | `src/lib/gmailApi.ts:56`, `manifest.json` `oauth2` |
| Outlook sign-in | `launchWebAuthFlow` with PKCE; refresh token in `chrome.storage.local`, access token in `chrome.storage.session` | `src/lib/providers/msalAuth.ts` |
| Account model | `ProviderId = "gmail" \| "outlook"`, one provider object each; `activeProviders` array | `src/lib/providers/emailProvider.ts:3`, `src/dashboard/state.ts` |
| Mailbox data | Muted senders, quarantine, screener allowlist, engagement, Gmail filter ids, action log, health history all live in **one global settings object** | `src/lib/settingsStore.ts` |
| Disconnect / sign out | **None.** No revoke, no wipe, no UI | grep for disconnect/signOut/revoke |
| Extension ID | No `key` in the manifest, so the unpacked ID depends on the folder (seen today when the wrong folder was loaded) | `dist/manifest.json` |

Consequence: even before adding accounts, the per-mailbox data (Gmail filter ids especially)
is not tied to a mailbox. Connecting a second Gmail would mix their data.

## 2. What the platforms allow

### Google via Chrome's built-in sign-in: `getAuthToken` (Source)

From the Chrome identity reference
([developer.chrome.com](https://developer.chrome.com/docs/extensions/reference/api/identity)):

- With no `account`, "the function will use an account from the Chrome profile: the Sync
  account if there is one, or otherwise the first Google web account." So Cluster gets **Chrome's
  choice**, not the user's.
- `getAccounts()`, which would list accounts to choose from, "is only supported on dev channel."
- `clearAllCachedAuthTokens()` "Removes all OAuth2 access tokens from the token cache, Removes
  user's account preferences, De-authorizes the user from all auth flows."
- The OAuth client must be of type **Chrome Extension**; Google's verification of such a client
  requires "a registered item in the Chrome Web Store Developer Dashboard with the same item ID"
  ([Google, native apps](https://developers.google.com/identity/protocols/oauth2/native-app)).

**Verdict:** fine for one account, no way to add or switch. Sign out is possible.

### Google via a normal web sign-in: `launchWebAuthFlow` (Source)

- `launchWebAuthFlow` opens Google's real sign-in page and returns to
  `https://<app-id>.chromiumapp.org/*` (`getRedirectURL()`), same Chrome reference.
- Google's authorization parameters: `prompt=select_account` "Prompt the user to select an
  account"; `prompt=none` "Don't display any authentication or consent screens";
  `login_hint` lets Google prefill the email "or select the appropriate multi-login session"
  ([Google, client-side apps](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow)).
- **Implicit flow** returns `access_token` with `expires_in=3600` and no refresh token (same page).
  Google says the code flow with PKCE "is strongly recommended" over it.
- **Code flow with PKCE**: the token exchange accepts `code_verifier`; on the web-server page
  `client_secret` is listed as **Optional** as of 2026-10-10
  ([Google, web server apps](https://developers.google.com/identity/protocols/oauth2/web-server)).
  Refresh tokens "are valid until the user revokes access or the refresh token expires", and
  only arrive with `access_type=offline`.
- **(Unverified)** Whether Google issues tokens to a *Web application* client with a
  `chromiumapp.org` redirect and **no secret** must be tested. If it requires the secret, the
  fallback is the implicit flow with silent renew (`prompt=none` + `login_hint`), which breaks
  whenever the person is signed out of Google in Chrome.
- Google's policy: OAuth must not run in "an embedded user-agent under the developer's control"
  ([Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies)).
  `launchWebAuthFlow` opens a real browser window, which is how Cluster already handles Outlook.

### Revoking and disconnecting (Source)

- Google: POST `https://oauth2.googleapis.com/revoke?token={token}`. "If the token is an access
  token and it has a corresponding refresh token, the refresh token will also be revoked." The
  endpoint "does not support Cross-origin Resource Sharing (CORS)" (same client-side page), so
  Cluster calls it from the extension with a host permission for `oauth2.googleapis.com`, not
  from a web page.
- Google Account, Third-party connections: "If you remove access, the app can't access your
  Google Account" ([Google Account Help](https://support.google.com/accounts/answer/13533235?hl=en)).
  This is the person's own off switch; Cluster should link to it after disconnecting.
- Google best practice: tokens "must be stored securely… revoke and delete them when no longer
  needed"; request scopes "only when needed" (incremental authorization)
  ([Google, best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)).

### Microsoft (Source)

- Single-page-app refresh tokens last "24 hours for single page apps and 90 days for all other
  scenarios"; after that the app must "rerun the authorization code flow… every 24 hours"
  ([Microsoft, refresh tokens](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens)).
  **(Unverified)** which registration type Cluster's Outlook app uses; if SPA, Outlook users are
  asked to reconnect daily.

### Brand rules for the buttons (Source)

Google recommends "Sign in with Google", "Sign up with Google" or "Continue with Google" and
requires its button guidelines to be followed "to complete the app verification process"; the
button "should be displayed at least as prominently as other third-party sign-in options"
([Google branding guidelines](https://developers.google.com/identity/branding-guidelines)).

## 3. How other products do it

| Product | Connect | Several accounts | Switch | Disconnect | What removal deletes |
|---|---|---|---|---|---|
| **Clean Email** | Type your email, **Continue**; Gmail/Yahoo/Microsoft/AOL use sign-in, "you don't enter a password"; iCloud uses an app password. Then indexing, "you can close the app" | Yes, per address | Account picker | Preferences → Data Removal → "Delete Account and Data" per address | "all data related to the selected email address is immediately and permanently removed"; index also deleted after 45 days of inactivity |
| **SaneBox** | "Add Email" in the dashboard, OAuth for Gmail, Microsoft, Yahoo, AOL; advises logging out of other accounts first | Up to 4 addresses per account | Dashboard account switcher | Settings → remove address; cancel asks **keep or remove Sane folders** | Removing folders returns mail to the inbox; keeping them, SaneBox "will securely delete any account details" |
| **Superhuman** | Cmd+K → Add Account → "Sign in with Google" or "Sign in with Microsoft" | Yes | Cmd+K → Switch Account; tap the account icon on mobile | Settings | Not documented in the sources found |
| **Spark** | Add account from Settings | "as many email accounts as you need" | Per-account inbox in the sidebar, or unified | Settings → Accounts → Remove Account → confirm | "doesn't delete your messages, since they stay on the email server" |
| **Gmail web** | "Add another account" in the avatar menu | Yes (`/u/0`, `/u/1`…) | Avatar menu | "Sign out of all accounts" | Session only |
| **Checker Plus for Gmail** (extension) | Uses the Gmail accounts already signed in to Chrome, plus "Add accounts and stay signed in" | Unlimited | Popup | Options | Not documented |

Sources: [Clean Email, connecting](https://clean.email/help/basics/connecting-your-email-account),
[Clean Email, deleting data](https://clean.email/help/accounts/delete-email-account-data-from-clean-email),
[SaneBox, adding an address](https://www.sanebox.com/help/200-how-do-i-add-another-email-address-to-my-sanebox-account-or-merge-2-accounts),
[SaneBox, cancelling](https://www.sanebox.com/help/233-how-do-i-cancel-sanebox),
[Superhuman, accounts and calendars](https://help.superhuman.com/article/508-accounts-and-calendars),
[Spark, removing an account](https://sparkmailapp.com/help/add-manage-accounts/remove-an-email-account-from-spark),
[Make Tech Easier, Gmail multiple accounts](https://maketecheasier.com/manage-multiple-gmail-accounts-in-one-place),
[Appuals, Checker Plus](https://appuals.com/use-gmail-same-time/) (third party).

**Patterns that repeat (Inference from the table):**
1. One **"Add account"** entry point, then a provider choice (Google / Microsoft / other).
2. Accounts live in **one list** with avatar and address; the **avatar menu switches**.
3. **Removal is in Settings, behind a confirmation** that says what happens to data.
4. Tools that change the mailbox (SaneBox) **ask whether to undo their changes**; read-only
   clients (Spark) say "your messages stay on the server".
5. **Deletion of the tool's own data is immediate** and stated in plain words.
6. No product found offers a combined "unified" view for *cleanup*; Superhuman explicitly has
   no unified inbox and uses switching. Spark's unified view is for reading mail.

## 4. Recommended design (Inference)

### 4.1 Sign-in architecture

**One sign-in path for every account**, the way Outlook already works:
`launchWebAuthFlow` → Google or Microsoft page with `prompt=select_account` → code + PKCE →
refresh token per account in `chrome.storage.local`, access token in `chrome.storage.session`.
`login_hint=<email>` for silent and repair sign-ins.

- Step 0, a spike of about an hour (Unverified items): create a Google *Web application* client
  with redirect `https://<id>.chromiumapp.org/`, run the code + PKCE exchange without a secret,
  confirm a refresh token comes back with `access_type=offline&prompt=consent`.
  - Works → use it.
  - Needs a secret → implicit flow + silent renew, and keep `getAuthToken` as the fast path for
    the Chrome profile's own account.
- Add a fixed `key` to the manifest so the unpacked ID never changes, and register both the
  development and Chrome Web Store redirect URLs on the OAuth clients.
- Ask for `gmail.settings.basic` (filters) only when the person turns on sorting or muting
  (incremental authorization), so the first consent screen asks for less.

### 4.2 Data model

```
accounts: [{ id, provider: "gmail" | "outlook", email, name, avatarColor,
             addedAt, status: "ok" | "needs-sign-in" | "revoked" }]
activeAccountId
perAccount[id]: { mutedSenders, quarantinedSenders, screenerAllowlist, senderEngagement,
                  autoSort.filterIdsByBucket, actionLog, healthHistory, scan cache, … }
app-wide: theme, simpleMode, persona, setupDone, help/tour state
```

Migration: today's single Gmail data becomes the first account's `perAccount` entry, so
nothing is lost for existing users. Background sweeps loop over accounts, each with its own
token; one failing account never blocks the others.

### 4.3 Screens

**First run (connect)**
1. Welcome: one sentence, three small pictures (Clean up, Sort, Protect).
2. **Continue with Google** and **Continue with Microsoft** buttons (official branding), with one
   line above: "Cluster reads senders, subjects and dates on your computer. It never sends your
   mail anywhere." A "What Cluster can do" link opens the full permissions list.
3. Google's own account chooser opens (`select_account`). After consent: "Connected
   ✓ name@gmail.com", scan progress with a live count, and then Home.
4. On Home, only after the first scan, a small tip: "Have another email? Add it from your
   account menu." (HIG: postpone non-essential setup.)

**Account menu (header avatar)**
```
 ● Sam Abhinav            ✓      ← active, Google icon
   sam@gmail.com
 ○ Work                           ← Microsoft icon
   sam@company.com   Needs sign-in
 ─────────────────────
 + Add account
   Manage accounts
   Rescan this account
```
Switching changes every screen to that account. Home may show a one-line total for all
accounts ("2 accounts · 5 senders look suspicious") with links into each.

**Settings → Accounts**
One row per account: avatar, address, provider, status, last checked, and a **Remove** button.
"Needs sign-in" rows show **Reconnect**.

**Remove an account (confirmation sheet)**
```
Remove sam@gmail.com from Cluster?
Cluster will stop reading this mailbox and delete what it saved on this computer.
Your email stays in Gmail.

[✓] Also remove Cluster's filters from Gmail (4 filters)
    Labels and mail already sorted stay where they are.

[ Remove account ]   Cancel
```
After removal: "Removed. You can also check Google's list of apps with access." with a link to
`myaccount.google.com/connections`. Steps run in this order: stop sweeps for the account,
delete its filters if ticked, revoke the token at Google or Microsoft, delete `perAccount[id]`,
remove it from `accounts`, switch to the next account or show the connect screen.

**Sign out of everything** (Settings → Accounts, bottom): the same steps for every account,
then the welcome screen.

**Reconnect states:** a token that fails silently marks only that account `needs-sign-in`; the
account menu shows a dot, Home shows one recommendation row "Reconnect sam@company.com", and
the other accounts keep working.

### 4.4 Build order

| Step | What | Size |
|---|---|---|
| 0 | Spike: Google web client + PKCE without a secret; manifest `key`; check Outlook app type (SPA 24 h?) | ~1 h |
| 1 | **Sign out / Remove account** for today's single Gmail + Outlook (revoke, wipe, confirmation sheet, connections link) | small |
| 2 | Per-account data model + migration + sweeps per account | medium, most test impact |
| 3 | Gmail on `launchWebAuthFlow`; Add account; account menu with switching; Settings → Accounts | medium |
| 4 | New onboarding screens on top of steps 1–3 | small |

## 5. Open questions for the owner

1. **Combined view or switching?** Recommendation: switching, plus a one-line all-accounts
   total on Home. Cleanup decisions are per mailbox.
2. **Account limit?** None technically. Google's Testing mode caps the whole app at 100 test
   users, and Testing-mode tokens expire after 7 days (project memory), so a reconnect every week
   is expected until verification.
3. **Default for "remove Cluster's filters" on disconnect?** Recommendation: ticked, because
   leftover filters keep moving mail after Cluster is gone.

## Sources

- [Chrome identity API reference](https://developer.chrome.com/docs/extensions/reference/api/identity) (fetched 2026-10-10)
- [Google: OAuth for client-side web apps](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow)
- [Google: OAuth for web server apps](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google: OAuth for native apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Google: OAuth best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- [Google: OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies)
- [Google: Sign in with Google branding](https://developers.google.com/identity/branding-guidelines)
- [Google Account Help: third-party connections](https://support.google.com/accounts/answer/13533235?hl=en)
- [Microsoft: refresh tokens](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens)
- [Microsoft: MSAL.js token lifetimes](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/token-lifetimes)
- [Clean Email: connecting](https://clean.email/help/basics/connecting-your-email-account), [deleting data](https://clean.email/help/accounts/delete-email-account-data-from-clean-email)
- [SaneBox: add address](https://www.sanebox.com/help/200-how-do-i-add-another-email-address-to-my-sanebox-account-or-merge-2-accounts), [cancel](https://www.sanebox.com/help/233-how-do-i-cancel-sanebox)
- [Superhuman: accounts](https://help.superhuman.com/article/508-accounts-and-calendars), [unified inbox](https://help.superhuman.com/article/453-unified-inbox)
- [Spark: remove account](https://sparkmailapp.com/help/add-manage-accounts/remove-an-email-account-from-spark)
- [Make Tech Easier: Gmail multiple accounts](https://maketecheasier.com/manage-multiple-gmail-accounts-in-one-place)
- [Appuals: Checker Plus](https://appuals.com/use-gmail-same-time/)
