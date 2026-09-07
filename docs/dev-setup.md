# Dev setup — which clone Chrome loads, and the extension-ID footgun

## The canonical clone

**`~/cluster-inspect` is the working copy.** Chrome loads `~/cluster-inspect/dist`
(Extensions → Developer mode → *Load unpacked*). Build there:

```
npm ci
npm run build      # writes dist/
```

`~/gmail-declutter` is an **abandoned earlier clone** of the same repo
(`github.com/Samuelabhinav37/cluster`). It is strictly behind `cluster-inspect`
and every branch it has is already on `origin`. Do not edit or build in it — the
first live test lost ~2 hours to fixes landing in `gmail-declutter` while Chrome
was loading `cluster-inspect`. Delete it once nothing has it open:

```
rm -rf ~/gmail-declutter
```

## Why you can't just point Chrome at the other folder

`manifest.json` has **no `key` field**, so the extension ID is derived from the
absolute install path. `~/cluster-inspect/dist` and `~/gmail-declutter/dist`
therefore load with **different IDs**, and the Gmail OAuth client
(`995931931748-…apps.googleusercontent.com`, a *Chrome Extension* client) is
bound in Google Cloud Console to the ID that `~/cluster-inspect/dist` currently
produces. Load the other folder and `chrome.identity.getAuthToken` fails with a
bad-client-id error. Outlook is the same story via
`chrome.identity.getRedirectURL()` → `https://<id>.chromiumapp.org/`, which is
registered on the Azure app.

## The real fix (a deliberate cutover, not a quick edit)

Add a fixed `key` to `manifest.json` so any checkout loads with one stable ID.
This **changes the ID** (a path-derived ID has no keypair to reuse), so it is a
coordinated cutover, not a one-liner:

1. Generate a keypair; derive the new extension ID from the public key.
2. Add the base64 public key as `"key"` in `manifest.json`; confirm the build
   copies it into `dist/manifest.json`.
3. Google Cloud Console → Credentials → the OAuth client → set its Application
   (Item) ID to the new extension ID. If the console won't let you edit it,
   create a new Chrome-Extension client and update `oauth2.client_id`.
4. Azure app registration → add the new `https://<newid>.chromiumapp.org/`
   redirect URI (keep the old one until migration is done).
5. Re-consent both providers; the old token cache is dead.

Because this briefly breaks auth, don't do it in the middle of a live-test
session. It also interacts with the OAuth-verification decision in
`research/2026-09-06-research-lead-read-and-direction.md` (§ "Confront the OAuth
verification wall") — sequence the two together.
