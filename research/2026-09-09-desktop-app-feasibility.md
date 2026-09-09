# Cluster — is a standalone desktop app feasible, and is it worth it?

**Date:** 2026-09-09
**Method:** primary-source read of Google/Microsoft OAuth docs, Electron/Tauri
own docs, Microsoft/Apple signing docs, and real precedent (Mailspring,
Thunderbird, rclone), cross-checked against this repo's actual code
(`src/lib/providers/`, `src/lib/settingsStore.ts`, `src/background.ts`,
`manifest.json`). Anything secondary or inferred is marked **[secondary]** /
**[inferred]**.

**Verdict up front: yes, feasible — and technically a downgrade in difficulty,
not an upgrade.** Cluster's OAuth is metadata-only, no-server, and already
runs both providers through standard "public client" flows (Chrome-extension
loopback-flavored for Gmail, hand-rolled PKCE for Outlook). Nothing about the
port requires new backend infrastructure, new server trust, or unproven
technique — every piece is a documented, common desktop-app pattern (§5).
**Recommended stack: Tauri v2, not Electron.** The disadvantages are almost
entirely distribution/ops cost (code signing, two more OAuth client
registrations, an update channel, a second CI matrix), not engineering risk.
Scope is **larger than the 6-phase/14-commit audit-remediation branch, but
not by an order of magnitude** — see §7.

---

## 1. Google OAuth for a "Desktop app" client — what's disallowed, what carries over

- **Embedded webview is disallowed, unconditionally.** Google's own policy:
  *"A developer must not direct a Google OAuth 2.0 authorization request to
  an embedded user-agent under the developer's control."*
  ([OAuth 2.0 Policies](https://developers.google.com/identity/protocols/oauth2/policies)).
  Any `WKWebView`/`WebView2`-in-app login screen is explicitly out; Google's
  own error for this is `disallowed_useragent`
  ([OAuth 2.0 for iOS & Desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app)).
  This is not new — it just means a desktop port must open the OS's real
  browser for the consent screen, not draw its own.
- **System browser + loopback redirect is the sanctioned pattern, and it is
  desktop-specific.** The same doc: loopback (`http://127.0.0.1:<port>`) is
  *"the recommended mechanism for obtaining the authorization code"* on
  desktop, and — per Google's own migration guide — the loopback flow **is
  being deprecated for native Android/iOS/Chrome-app clients but continues to
  be supported for Desktop app clients**
  ([Loopback IP address flow migration guide](https://developers.google.com/identity/protocols/oauth2/resources/loopback-migration)).
  In other words, Desktop is the one client type Google is *not* pushing off
  this pattern.
- **Client secret handling changes but isn't a blocker.** Desktop clients get
  an `client_secret` in the console, but Google's own docs concede *"installed
  apps cannot keep secrets"* and Desktop-type flows are designed around that —
  the secret is not meaningfully confidential for this client type
  ([OAuth 2.0 for iOS & Desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app)).
- **A new client type needs a new client ID, but verification is a
  project-level artifact, not a per-client one.** Google Cloud's own docs on
  the consent screen describe two tracked statuses — *"Branding status … Data
  access status"* — both configured once per project via the "OAuth consent
  screen"/branding + Verification Center, and note *"you must have a
  published branding status before you can request verification for data
  access (scopes)"*
  ([Verify your app / OAuth consent screen, Google Cloud support](https://support.google.com/cloud/answer/10311615)).
  Nothing in Google's docs describes a separate verification track per OAuth
  client ID — the consent screen (and any completed CASA security assessment
  for restricted scopes) belongs to the project, and any client ID under that
  project (Web, Chrome Extension, Desktop) presents the same verified
  branding/scopes. **[best-effort synthesis — Google does not publish an
  explicit "does verification carry across client types" FAQ; this is the
  correct reading of the primary docs but should be spot-checked against the
  live Cloud Console before shipping]**. Practical implication: adding a
  Desktop client to Cluster's existing verified Google Cloud project should
  **not** require re-running CASA from zero, *provided the scopes requested
  by the new client are the same or a subset of what's already verified*
  (`gmail.modify`, `gmail.settings.basic` — unchanged from today's manifest).
  Certain consent-screen edits do trigger re-review per Google's own
  verification-help docs
  ([OAuth App Verification, Google Cloud support](https://support.google.com/cloud/answer/13463073)),
  so this should be confirmed, not assumed, before the port ships.

## 2. Microsoft identity platform — desktop (public client) vs the current SPA registration

- Cluster's current Outlook app registration is an **SPA client type**
  (implied by using `chrome.identity.launchWebAuthFlow` + PKCE against
  `login.microsoftonline.com/common/oauth2/v2.0`, see §6). Desktop apps are
  registered differently: Microsoft's own guide says to add a platform under
  **"Mobile and desktop applications"** and, *"for apps using system
  browsers, use the exact value: `http://localhost`"* as the redirect URI
  ([Configure desktop apps that call web APIs, Microsoft Learn](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-registration)).
  This is a **new app-registration platform entry**, not a code-only change —
  a fresh redirect URI (`http://localhost` or a fixed loopback port) has to be
  added in Entra, and Microsoft's guidance explicitly separates this from the
  SPA platform.
- **Public client flow must be turned on.** Same doc: *"Under Advanced
  settings, for Allow public client flows, select Yes."* SPA registrations in
  Entra are also technically public clients (no secret), but they're
  restricted to browser-context flows (CORS-scoped); the desktop/native
  platform entry is the one Microsoft documents for loopback-listening apps.
- **PKCE is required either way** (Cluster's `msalAuth.ts` already does
  S256 PKCE by hand for the SPA flow — see §6) — this doesn't change moving
  to Desktop, it's a property of any public client, confirmed by Microsoft's
  own desktop-app libraries all being `PublicClientApplication`-based
  ([Configure desktop apps that call web APIs](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-registration)).
- **Electron has an official Microsoft answer.** MSAL Node explicitly lists
  Electron as a supported desktop target with its own suggested redirect URI
  convention (`msal{client-id}://auth`) alongside the generic `http://localhost`
  system-browser option
  ([Configure desktop apps that call web APIs](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-registration)).
  A Tauri app would use the plain `http://localhost` loopback path (no
  Electron-specific redirect scheme needed) since Cluster already hand-rolls
  the PKCE flow rather than depending on MSAL's Electron integration.
- **Net effect:** one new Entra app-registration platform entry (or a second
  app registration entirely, which is simpler to reason about and matches
  how Cluster already treats Gmail/Outlook as separate credentials), a
  redirect URI change from `chrome.identity.getRedirectURL()` (an
  `https://<extension-id>.chromiumapp.org/*` URL) to `http://localhost:<port>`,
  and swapping `chrome.identity.launchWebAuthFlow` for "open system browser,
  listen on loopback" (§6). The PKCE math (`generateCodeVerifier`,
  `generateCodeChallenge`) is unchanged and portable as-is.

## 3. Electron vs Tauri v2 for this codebase

| Dimension | Electron | Tauri v2 | Primary source |
|---|---|---|---|
| Installer size | Bundles Chromium + Node; real-world installers commonly land **120–200 MB [secondary]** | Uses the OS's existing WebView, no bundled browser engine; Tauri's own docs claim *"a minimal Tauri app can be less than 600KB"* before your own UI assets | [Tauri: App Size](https://v2.tauri.app/concept/size/) |
| RAM footprint | Each window is a Chromium renderer process; **~150–170 MB idle for a single window is typical [secondary]** | Backend is Rust; renders through the native WebView (WebView2/WebKit/WebKitGTK) — **substantially lower idle RSS per the same class of comparisons [secondary]**; no first-party Tauri number found | [secondary roundups only](https://rustify.rs/articles/rust-tauri-vs-electron-2026), [PkgPulse](https://www.pkgpulse.com/guides/electron-vs-tauri-2026) — **treat exact multipliers as directional, not verified** |
| Reusing `src/dashboard/*.ts` (vanilla TS/DOM) | Runs unmodified inside a `BrowserWindow` — it's just a webpage. Chromium is the same engine Cluster already targets, so zero UI-compat risk. | Also runs largely unmodified — Tauri explicitly supports *"virtually any frontend framework"* since the UI is just HTML/CSS/JS in the OS webview ([Tauri: Quick Start](https://tauri.app/start/)) — but the webview is WebView2 (Windows, Chromium-based) / WebKit (macOS) / WebKitGTK (Linux), so Safari/WebKit-only CSS or JS quirks are a real (if small) compat surface Electron doesn't have, since Electron is Chromium everywhere. |
| OS keychain / secure-credential storage | **`safeStorage` API**, built in: macOS Keychain, Windows **DPAPI**, Linux via `kwallet`/`gnome-libsecret`/Secret Service (falls back to **unencrypted** if no secret store is present — must check `getSelectedStorageBackend()`); macOS requires the app be code-signed for stable behavior | No single first-party "OS keychain" plugin found in Tauri's own plugin docs — Tauri ships **Stronghold**, a bundled encrypted-vault secret manager (IOTA Stronghold engine), not an OS-keychain wrapper; reaching the *actual* OS keychain on Tauri means a community crate (e.g. `keyring-rs`) via a custom Rust command, not an official plugin | [Electron: safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage), [Tauri: Stronghold plugin](https://v2.tauri.app/plugin/stronghold/) |
| System tray | Native `Tray` class, well documented | Documented as supported (Tauri window/tray APIs); not independently re-verified this pass | [Electron: Tray](https://www.electronjs.org/docs/latest/tutorial/tray) |
| Autostart | Community pattern (`app.setLoginItemSettings` — Electron built-in, not separately verified this pass) | Official first-party plugin, **Windows + macOS + Linux**, `enable`/`disable`/`isEnabled`, arbitrary launch args | [Tauri: autostart plugin](https://v2.tauri.app/plugin/autostart/) |
| Auto-update | `electron-builder`'s `autoUpdater` — GitHub Releases / S3 / generic HTTP provider; wiring is mature and widely used **[secondary — electron-builder docs pages 404'd on fetch this pass, not independently re-confirmed]** | Official **updater plugin**; *mandatory* Ed25519-style signing ("Tauri's updater needs a signature to verify that the update is from a trusted source. This cannot be disabled"), either a static JSON manifest (works from GitHub Releases, no server needed) or a dynamic endpoint | [Tauri: Updater plugin](https://v2.tauri.app/plugin/updater/) |

**Read:** Tauri wins on size/RAM by a wide, if not perfectly first-party-
sourced, margin, and its update story is *more* secure by default (signing
isn't optional). Electron's actual edge for this specific project is the
**keychain story** — `safeStorage` is a one-line, first-party, all-three-OS
answer to the exact problem statement in the brief ("fixing the
unencrypted-token tradeoff is a natural motivation for the port"), whereas
Tauri's official answer (Stronghold) is a second encrypted store bolted on
top of the OS, not the OS's own credential manager, and the real OS-keychain
route runs through a third-party crate. Given the whole reason to leave
`chrome.storage.local` (already flagged in this repo's own docs as
unencrypted-at-rest) is to land on real OS-backed secret storage, this
narrows the gap — but Tauri's RAM/size advantage plus "OS's own webview"
alignment with a metadata-only, no-telemetry positioning still tips it.
**Recommendation: Tauri v2**, using a community keychain crate
(`keyring-rs`-style, wrapping Windows Credential Manager / macOS Keychain /
Linux Secret Service — the same three backends Electron's `safeStorage`
targets) behind one small Rust command, rather than Stronghold. This is a
few hours of Rust, not new architecture — refresh tokens are the only things
that need to move.

## 4. Code signing and notarization

- **Windows: Microsoft's own guidance now steers away from EV.** Per
  Microsoft's Learn docs (updated **2026-08-29**, current as of this
  research):
  - Publishing an **MSIX through the Microsoft Store** is signed for free —
    Microsoft re-signs the package, no SmartScreen prompt, no cert to buy or
    renew.
  - For **direct distribution** (the ".exe" the brief asks for), Microsoft's
    recommended path is now **Azure Artifact Signing** (formerly "Trusted
    Signing"), **~$9.99/month**, no hardware token, CI/CD-native — but
    *"does not provide instant SmartScreen trust"*; reputation still has to
    build release over release. It's US/Canada/EU/UK-only for individuals
    (US/Canada) and orgs (all four).
  - **OV certificates** (DigiCert, Sectigo, etc.) are $150–300/year,
    functionally equivalent to Azure Artifact Signing for SmartScreen
    purposes, and the fallback for anyone outside that geography.
  - **EV certificates ($400+/year) no longer bypass SmartScreen** — Microsoft
    changed this in 2024; EV now goes through the same reputation-building
    process as OV. Microsoft's own line: *"Paying the EV premium … solely to
    avoid SmartScreen warnings is no longer justified."*
  - **Open-source projects can get free OV-level signing** via **SignPath
    Foundation**, which Microsoft's own doc names directly.
  ([Code signing options for Windows app developers, Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options))
  — this is the single most load-bearing citation in this section and is
  current (dated this month).
- **macOS: notarization requires the paid Apple Developer Program.** Apple's
  own membership comparison table lists *"Mac software notarization"* as
  available only to **Apple Developer Program** members (not the free
  registered-developer tier)
  ([Compare Membership Options, Apple Developer](https://developer.apple.com/support/compare-memberships/)),
  and the program costs **$99/year**
  ([Apple Developer Program](https://developer.apple.com/programs/)). The
  process itself (not independently re-fetched this pass — Apple's
  notarization doc page returned no body to automated fetch) is standard and
  well documented elsewhere: sign with a **Developer ID** certificate, submit
  the built app/dmg via `notarytool`, staple the ticket to the artifact.
  **[secondary for the step sequence; primary for cost/eligibility]**
- **Bottom line on cost:** ~$120–500/year in recurring signing cost
  (Azure Artifact Signing or SignPath free tier for Windows, $99/year Apple
  Developer Program for macOS) is the real, ongoing tax of shipping outside
  either app store — small in absolute terms, but it's a cost this project
  has never carried before (Chrome Web Store review is free), and Windows
  SmartScreen warnings on early releases are now unavoidable regardless of
  certificate type or spend.

## 5. Precedent — this is solved, not novel

- **Mailspring** is an open-source Electron mail client (TypeScript UI, Mac/
  Windows/Linux) that does exactly the Gmail/Microsoft-365 OAuth-in-browser
  pattern this port would need: *"Gmail and Microsoft 365 pass through OAuth
  authorization in the browser, which avoids entering your password in the
  application"* ([Foundry376/Mailspring, GitHub search summary](https://github.com/Foundry376/Mailspring)) —
  direct architectural precedent for an Electron-or-Tauri mail tool doing
  system-browser OAuth against both providers Cluster already supports.
- **Thunderbird** ships first-party OAuth2 for Gmail and Outlook/Office365 in
  a desktop client, with known, documented edge cases (e.g. a local process
  already listening on 443/80 can intercept a loopback callback) that
  confirm this is a mature, previously-solved integration surface rather
  than uncharted territory (Mozilla support search results;
  [Thunderbird OAuth2 KB, support.mozilla.org](https://support.mozilla.org/en-US/kb/tb-oauth)
  — page itself didn't render to automated fetch this pass, **[secondary via
  search snippet]**; the underlying loopback-collision bug is filed at
  [Bugzilla 1748416](https://bugzilla.mozilla.org/show_bug.cgi?id=1748416)).
- **rclone** is the cleanest primary-source proof this is boilerplate: its
  own docs say to *"choose an application type of 'Desktop app'"* in the
  Google API console, then *"rclone runs a webserver on your local machine to
  collect the token … on `http://127.0.0.1:53682/`"*
  ([rclone: Google Drive](https://rclone.org/drive/)) — this is the identical
  loopback-listener pattern §1 describes, shipped in a widely-used CLI tool
  for years.
- **Net:** every piece of the OAuth port — Desktop-type Google client,
  system-browser + loopback for both providers, PKCE for Microsoft — has at
  least one shipped, maintained precedent. There is no research risk here,
  only implementation labor.

## 6. Concrete porting scope, grounded in the actual repo

Read directly from `C:\Users\samue\cluster-inspect`:

- **`manifest.json`** — `background.service_worker`, the `oauth2.client_id` /
  `oauth2.scopes` block (Chrome-extension-bound Gmail client), `permissions:
  ["identity","storage","unlimitedStorage","tabs","alarms"]`, and
  `host_permissions` all have no meaning outside a `chrome://` runtime and
  are dropped entirely — replaced by whatever manifest/config format the
  chosen framework uses (`tauri.conf.json` capabilities, or an Electron
  `package.json` + explicit `session`/CSP setup for the equivalent CSP the
  manifest currently declares: `script-src 'self'; object-src 'self';
  base-uri 'none'`).
- **`src/lib/gmailApi.ts`** — `getAuthToken()` (line 53) wraps
  `chrome.identity.getAuthToken({interactive}, cb)`, and a second call site
  at line ~466 requests `ELEVATED_SCOPES` the same way. Both become "launch
  system browser to Google's `/o/oauth2/v2/auth` with a Desktop-type
  `client_id`, listen on a local loopback port, exchange the code" — the same
  shape Cluster's own `msalAuth.ts` already implements for Outlook (PKCE,
  `crypto.subtle.digest`, `URLSearchParams` token POST). `removeCachedAuthToken`
  (line 69, wraps `chrome.identity.removeCachedAuthToken`) has no desktop
  equivalent — Chrome's token cache goes away; the desktop app needs to
  either keep its own tiny cache or always re-request against the loopback
  flow (a stored refresh token, once Gmail's flow issues one — the current
  Chrome-extension client type does **not** get a Google refresh token, that
  changes with the Desktop client type and needs a corresponding storage
  change mirroring `msalAuth.ts`'s existing `saveTokens`/`loadTokens` pair).
- **`src/lib/providers/msalAuth.ts`** — nearly the whole file **ports as-is**.
  `generateCodeVerifier`/`generateCodeChallenge` (lines 40-49) are pure
  `crypto` calls. `launchWebAuthFlow` (line 86) is the one function that must
  change: `chrome.identity.launchWebAuthFlow({url, interactive}, cb)` becomes
  "open `url` in the OS default browser + local HTTP listener on
  `http://localhost:<port>`, resolve on the incoming request." `chrome.identity.getRedirectURL()`
  (line 139) is replaced by a fixed `http://localhost:<port>` matching the
  new Entra "Mobile and desktop applications" platform redirect URI (§2). The
  `OutlookReauthRequired` error class, `requestTokens`, `refreshTokens`, and
  the untrusted-response validation are all framework-agnostic and unchanged.
- **`src/lib/providers/outlookConfig.ts`** — `OUTLOOK_CLIENT_ID` needs a
  second value (or the existing one, if Microsoft's SPA-vs-native distinction
  turns out not to require a new registration — confirm in the Entra portal
  before assuming a new ID is needed). `OUTLOOK_TENANT = "common"` is
  unchanged.
- **`chrome.storage.local` / `chrome.storage.session`** — used across 17
  files (`settingsStore.ts`, `background.ts`, `msalAuth.ts`,
  `metadataCache.ts`, `gmailQuotaLedger.ts`, `actionLog.ts`,
  `durableJobs.ts`, `storageLock.ts`, etc., per a repo-wide grep). This is
  the single largest mechanical-but-not-hard change: every `chrome.storage.local.get/set/remove`
  call needs a drop-in replacement with the same async `get(keys)`/`set(obj)`
  shape — a thin local adapter (SQLite via `tauri-plugin-sql` / Electron's
  `electron-store`, or even a JSON file for the non-secret settings blob)
  behind the same function signatures `settingsStore.ts` already exposes
  (`chrome.storage.local.get(STORAGE_KEY)` at line 250,
  `chrome.storage.local.set({[STORAGE_KEY]: …})` at lines 265/277). Because
  `settingsStore.ts` already centralizes reads/writes behind a schema-
  versioned module (`CURRENT_SETTINGS_SCHEMA_VERSION`, `migrateSettings`),
  most call sites never touch `chrome.storage` directly — this containment is
  exactly why the brief's premise ("browser-specific glue is isolated")
  holds up under inspection. Only `msalAuth.ts`'s two storage areas (session
  vs local, for access vs refresh token) need to become "OS keychain" +
  "local encrypted-at-rest file" respectively per §3's plan — this is also
  where the unencrypted-at-rest tradeoff actually gets fixed, not just moved.
- **`src/background.ts`** — `chrome.alarms.create` (3 alarms: `TRIAGE_ALARM`
  6 h, `ATHENA_ALARM` 5 min, `JOBS_ALARM` 5 min, lines 49-57) and the
  `chrome.alarms.onAlarm` listener (line 60) become a plain `setInterval`/
  `node-cron`-equivalent running in the app's always-on main/background
  process — this is a **net simplification**, not added complexity, and it's
  also where the desktop port's actual behavioral win lives: triage stops
  being gated on "Chrome is open and the service worker hasn't been evicted."
  `chrome.tabs.query`/`chrome.tabs.create`/`chrome.tabs.update` (lines 26-30,
  used to focus-or-open the dashboard) become "focus or create the app's
  main window" in whichever framework's window API.
- **`chrome.permissions.contains`/`.request`** — two call sites
  (`src/dashboard/dashboard.ts:236/242`, `src/lib/unsubscribe.ts:133-134`)
  implement the **optional host permission** prompt for Deep-scan URL
  fetches. Desktop apps have no such runtime-permission system — a fetch
  from a Node/Rust backend simply isn't sandboxed by an origin allowlist the
  way `optional_host_permissions` is. This is a **real, if narrow, security
  regression to design around**: the existing `isAllowedOneClickUrl` /
  private-IP-reject guard in `unsubscribe.ts` (already doing non-HTTPS/
  credentials/private-IP rejection) becomes the *only* boundary protecting a
  Deep-scan fetch, where today Chrome's permission system is a second layer
  in front of it. Not a blocker, but worth calling out as new surface area
  rather than a pure like-for-like swap.
- **What needs zero changes:** everything under `src/lib/*` the brief
  already scopes out — `rules.ts`, `threatSignals.ts`, `sortTaxonomy.ts`,
  `engagementModel.ts`, `protectionPolicy.ts`, `unsubscribe.ts`'s URL-safety
  guard, `httpRetry.ts`, `incrementalSync.ts`, `durableJobs.ts` — plus the
  bulk of `src/dashboard/*.ts` (vanilla TS/DOM, no `chrome.*` calls beyond
  the permission-prompt lines above). This is the majority of the codebase
  by line count (per the 2026-09-06 architecture doc, `dashboard.ts` alone
  is 3,185 LOC) and it ports untouched.

## 7. Advantages

Concrete to this project, not generic "desktop apps are nice":

1. **Fixes the always-on triage gap the brief names as a real limitation.**
   Today's 6-hour alarm only fires while Chrome is open and the service
   worker survives eviction. A desktop app's background process is the app —
   no host-browser lifecycle to be evicted from. This is the single most
   concrete functional upgrade, not just a packaging change.
2. **Turns the project's documented at-rest-encryption gap into an actual
   fix, not just a relocation.** `chrome.storage.local` is unencrypted at
   rest (already flagged in this project's own history per MEMORY). Moving
   refresh tokens into Windows Credential Manager / macOS Keychain / Linux
   Secret Service (via Electron's `safeStorage` or a Tauri keychain crate) is
   a real security upgrade the extension form factor cannot offer — Chrome
   extensions have no API for OS-keychain-backed storage at all.
3. **Removes the extension-ID footgun** the repo's own git log flags
   (`f9c3f5e Document the canonical clone and the extension-ID footgun`) —
   `chrome.identity.getRedirectURL()` and the Chrome-extension-bound Gmail
   OAuth client are both keyed to a specific unpacked-extension ID that
   shifts with how the extension is loaded. A Desktop OAuth client has a
   fixed redirect URI independent of any browser-assigned identifier.
4. **No Chrome Web Store review/policy surface at all.** Distribution,
   update cadence, and permission-prompt UX are entirely the developer's to
   control — relevant given this project's own research repeatedly flags
   Chrome Web Store distribution/trust as unsolved (2026-09-01 doc, §
   "Distribution / trust").
5. **The privacy/no-server story gets strictly stronger, not just portable.**
   Cluster's core differentiator is "everything runs on your own OAuth
   token, no proxy server" (vs SaneBox/Clean Email). A desktop app makes that
   claim *more* legible to a security-conscious user than a browser
   extension does — no host-browser sandbox to trust, no other extensions
   sharing the browser process, and OS-level code signing gives users an
   independently-verifiable publisher identity that a Chrome Web Store
   listing doesn't.

## 8. Disadvantages / costs

Concrete, not generic:

1. **Two more OAuth surfaces to register, own, and keep verified** — a new
   Google Desktop-type client and (likely) a new or reconfigured Entra app
   registration, on top of the two that already exist for the extension.
   Both need to be kept in sync with scope changes going forward (§1, §2).
2. **Recurring signing cost the project has never carried: ~$120-500+/year**
   (Azure Artifact Signing ~$120/yr or free via SignPath Foundation for
   Windows, $99/yr Apple Developer Program for macOS) plus **unavoidable
   early SmartScreen warnings** regardless of certificate choice, since EV's
   instant-bypass behavior was removed in 2024 (§4). This is a real, ongoing
   line item vs. Chrome Web Store's free listing.
3. **A second full CI/build/release matrix** — Windows/macOS(/Linux) builds,
   installers, and a signed auto-update channel, replacing the Chrome Web
   Store's single-artifact upload. Tauri's updater plugin requires generating
   and permanently safeguarding an Ed25519-class signing key — losing it
   breaks updates for every existing install (§3).
4. **Loses Chrome's permission-prompt sandboxing for optional network
   access.** `chrome.permissions.contains`/`.request` currently gate Deep-scan
   fetches behind a user-visible, OS-enforced origin allowlist
   (`unsubscribe.ts:133-134`, `dashboard.ts:236/242`). A desktop app's
   network layer has no equivalent — the existing `isAllowedOneClickUrl`
   application-level guard becomes the sole boundary (§6). Not a blocker,
   but a real narrowing of defense-in-depth that should be called out
   explicitly in any port's security review, not silently dropped.
5. **Loses Gmail's Chrome-extension-bound client type's implicit trust
   signal.** Google's Chrome Web Store item-ID-linked verification for
   extensions is a distinct (and arguably lower-friction) trust path than a
   Desktop client's project-level verification (§1) — moving client types
   is a one-time migration risk best validated against a live Cloud Console
   before the old client is retired, not assumed safe from docs alone.
6. **WebView fragmentation risk on Tauri specifically.** Tauri renders
   through three different engines (WebView2/WebKit/WebKitGTK) rather than
   Cluster's current single target (whatever Chromium version ships in the
   user's Chrome) — a small but real new cross-engine compatibility surface
   for `src/dashboard/*.ts`, absent if Electron (all-Chromium) were chosen
   instead. This is Tauri's one real trade against the size/RAM win in §3.
7. **Users lose the zero-install, "already in your browser" distribution
   model** that makes trying Cluster low-friction today — a desktop app is a
   deliberate download-and-install decision, a real adoption-funnel cost for
   a project that has (per the 2026-09-01 doc) already struggled to get
   visible distribution as an extension.

## 9. Scope estimate, calibrated against this repo's own history

This repo has two clear precedent bursts to calibrate against:

- **`hardening/audit-remediation`** (merged as PR #1): **6 phases, ~14
  commits** — extracted 5 dashboard tabs into separate modules, added a
  jsdom boot smoke test, an accessibility pass, request-shape lock-in tests,
  a theme toggle, and a security-fix (auth-verdict merge / broad-Trash-rule
  guard). This is this project's calibrated "medium-large, self-contained
  hardening effort" reference point.
- **The dashboard test-coverage push** (`Phase 1` jsdom harness through
  `Phase 3+5` error-path tests, visible in git log as `e24c4e7` through
  `a652dd1`): **5 phases**, comparable granularity, narrower scope (tests
  only).

**The desktop port is larger than the audit-remediation branch, and roughly
comparable in kind to it plus the Outlook-parity work described in the
2026-09-01 doc (§ "Outlook parity") combined** — for three concrete reasons:

1. **It touches two independent OAuth integrations** (§1, §2, §6) rather
   than one subsystem — Gmail's flow and Outlook's flow both need new
   loopback-listener code, new client registrations, and new token-storage
   wiring, each independently testable but each carrying its own external
   dependency (a live Google Cloud Console change, a live Entra change) that
   audit-remediation's all-local phases didn't have.
2. **It requires an entirely new operational surface the project has never
   had**: code signing (two platforms, two different vendor relationships),
   an auto-update channel with a permanent signing key, and a second CI
   release matrix. None of audit-remediation's 6 phases required standing up
   new external infrastructure — this port does, on both Windows and macOS.
3. **The actual code delta is smaller than it sounds**, per §6 — most of
   `src/lib/*` and `src/dashboard/*.ts` (the majority of the codebase by
   LOC) ports untouched, because the browser-specific glue really is as
   contained as the brief states. The `chrome.storage` swap, while touching
   17 files, is mechanical (uniform `get`/`set` shape) rather than a redesign.

**Rough call: 2-3x the audit-remediation branch in elapsed effort** — not
because the code is harder, but because two of its three cost centers
(external OAuth app registrations, code-signing/notarization/update
infrastructure) are one-time setup tasks with real external-service latency
(CASA-adjacent Google review turnaround, Apple/CA identity verification,
several-business-day waits) that don't compress the way in-repo refactoring
phases do. If done in phases mirroring the existing pattern: **(1) Tauri
shell + vanilla dashboard reuse smoke test, (2) Gmail loopback OAuth + token
storage, (3) Outlook loopback OAuth + token storage, (4) `chrome.storage`
adapter swap across the 17 call sites, (5) alarms → background scheduler +
window/tray wiring, (6) signing + auto-update + release pipeline** — six
phases again, but each phase individually larger than an audit-remediation
phase because of the external-dependency latency in phases 2, 3, and 6.

---

## 10. Open questions / couldn't verify

1. **Whether Google verification genuinely carries over per-client-type
   within one project**, or whether adding a Desktop client triggers a
   re-review regardless of unchanged scopes (§1) — the primary docs support
   the project-level reading but don't state it as an explicit FAQ answer.
   Verify live in the Cloud Console before retiring the Chrome-extension
   client.
2. **Whether the existing Outlook Entra app registration can add a "Mobile
   and desktop applications" platform in place, or needs a second
   registration** (§2, §6) — Microsoft's docs describe adding a platform to
   an existing registration, which would be simpler than provisioning a
   second `OUTLOOK_CLIENT_ID`, but this wasn't tested against the live
   Entra app.
3. **electron-builder's `autoUpdater` mechanics** — the electron.build docs
   pages 404'd on fetch this pass; the Electron-side auto-update comparison
   in §3 leans on general knowledge/secondary sources more than the other
   rows in that table.
4. **Exact RAM/size multipliers between Electron and Tauri** — Tauri's own
   docs give a hard bundle-size number (<600 KB core); the RAM comparison
   and the 120–200 MB Electron installer figure are from third-party 2026
   comparison roundups, not either project's own docs. Directionally
   reliable, not verified first-party.
5. **Apple notarization's exact step sequence** (`notarytool` submission,
   stapling) — cost and eligibility are primary-sourced (§4); the mechanical
   steps are from general knowledge, since Apple's own notarization doc page
   didn't return body content to automated fetch this pass.
6. **Whether Gmail's Desktop-type client actually issues a persisted refresh
   token** (unlike the current Chrome-extension-bound client via
   `chrome.identity.getAuthToken`, which is Chrome-cache-backed, not a
   classic OAuth refresh token) — assumed yes based on how every other
   Desktop-client Google integration in §5 works, but not independently
   confirmed against Google's token-endpoint response for this exact
   scope/client-type combination.
