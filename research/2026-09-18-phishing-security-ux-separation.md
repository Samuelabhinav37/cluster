# Keeping security findings from getting buried or crying wolf — separation patterns in mixed cleanup/security tools

_2026-09-18. Scoped research doc, not an implementation plan. Fills a gap in the
2026-09-09 decision-fatigue doc (`research/2026-09-09-competitor-ux-decision-fatigue-patterns.md`),
which studied bulk-inbox-cleanup UX (SaneBox, Clean Email, Unroll.me, Gmail, Superhuman) but has
zero coverage of security/phishing UX. The question here is narrower and different in kind: when
a single tool shows both routine, reversible cleanup actions (delete/archive/unsubscribe) and
high-stakes security findings (a flagged sender, a warning that needs evidence before a verdict),
how do real products keep the two from bleeding into each other — so the security finding isn't
lost in the cleanup noise, and isn't so loud/frequent that it trains the user to ignore it?_

Primary sources cited inline. Where a fetch only returned a partial or secondary account, it's
marked **[secondary]** or **[partial]**.

---

## 1. Gmail's own phishing UX — always an interrupt, never a category

Gmail runs two distinct warning mechanisms, and both are structurally separate from its routine
categorization system rather than blended into it.

**Sender-identity warnings** show as a banner on the opened message and as an icon substitution
in place of the sender's photo. Google's own help page states plainly that when a message fails
authentication, "if you see a question mark next to the sender's name, the message isn't
authenticated" — the question-mark icon replaces the normal avatar rather than adding a label
next to it ([Check if your Gmail message is authenticated](https://support.google.com/mail/answer/180707)).
The 2016 feature announcement describes the same mechanic launching alongside a second, separate
warning for dangerous links: a full-page interstitial shown "if you receive a message with a link
to a dangerous site known for phishing, malware, and unwanted software" — a blocking page, not an
inline note ([Google Workspace Updates: Making email safer with new security warnings in Gmail](https://workspaceupdates.googleblog.com/2016/08/making-email-safer-with-new-security-warnings-in-gmail.html)).
Gmail's own phishing help page confirms the mechanism is opt-out of the normal flow, not a
category within it: "When we identify that an email may be phishing or suspicious, we might show
a warning or move the email to Spam" — a warning banner or full removal from the inbox, never a
tag inside it ([Avoid and report phishing emails](https://support.google.com/mail/answer/8253)).
The same page centers the interaction on a binary verdict action — **Report phishing** / **Report
not phishing** from the message's overflow menu — not a multi-option cleanup toolbar.

Google gives admins an explicit on/off switch for the warning banners themselves (for running
internal phishing-training campaigns without cross-wiring real alerts,
[Google Workspace Updates: Control the visibility of warning banners in Gmail](https://workspaceupdates.googleblog.com/2023/02/admin-setting-for-gmail-warning-banners.html))
— itself a tell that the banner is treated as a distinct, switchable subsystem, not a rendering
detail of the inbox list.

Critically, **Gmail's category tabs never absorb security findings.** The official article on
Primary/Social/Promotions/Updates/Forums tabs describes only routine categorization — deals,
social notifications, automated confirmations — with no mention of suspicious or phishing mail
being sorted into any of them
([Organize your emails into categories](https://support.google.com/mail/answer/3094499)).
Suspicious mail either gets a banner interrupt on top of wherever it lands, or is removed to Spam
entirely; it is never a peer of "Promotions" inside the same list.

---

## 2. Microsoft Defender for Office 365 / Outlook — one-click report, separate warning surface for links

Outlook's **Report** button is deliberately built as the single, prominent, always-available path
for flagging a message as phishing — Microsoft's own migration guidance for the feature stresses
it is "front and center across Outlook clients" and available "from Inbox," "from preview panel,"
and "from reading window," replacing older opt-in add-ins specifically because they weren't
discoverable enough
([Transition from Report Message or the Report Phishing add-ins](https://learn.microsoft.com/en-us/defender-office-365/submissions-users-report-message-add-in-configure)).
Clicking the button is a single split-action: "Clicking on the button without using the dropdown
list reports the message as phishing. Use the dropdown list to report messages as junk or not
junk" — a one-decision verdict action, not a form.

Reports don't stay in the mail list either — flagged messages "surface in the Security Dashboard
and other reports," a destination entirely separate from the inbox and from routine junk/archive
handling.

Safe Links applies the same separation at the point of highest risk — the moment a link is
clicked — rather than as a static label in the message list. It is a **time-of-click interstitial**,
scanning URLs and, when a link is bad, opening a dedicated warning page instead of the destination.
Microsoft's documentation shows the warning pages are explicitly tiered by confidence rather than
uniform: a **"Scan in progress"** notice, a milder **"Suspicious message warning"** ("similar to
other suspicious messages... double-check the email message before proceeding"), a stronger
**"Phishing attempt warning"** ("identified as a phishing attack... all URLs in the email message
are blocked"), and a **"Malicious website warning"** for a confirmed-bad destination
([Complete Safe Links overview](https://learn.microsoft.com/en-us/defender-office-365/safe-links-about)).
Org policy can allow or forbid click-through past the warning, and Microsoft's own recommended
default is to disable click-through on the strongest tier. The mail list itself never carries this
information — a link only gets flagged at the moment the user is about to act on it.

---

## 3. Password-manager-style security dashboards — tiered alerts, capped frequency, dashboard vs. notification split

**1Password Watchtower** is the closest existing analogue to "routine housekeeping tool that also
surfaces security findings," because it lives inside a tool people open for mundane
password-lookup tasks. It structurally separates the two by splitting where findings live from
how often they interrupt:

- Findings are sorted into named categories (compromised websites, vulnerable passwords, reused
  passwords, weak passwords, unsecured websites, two-factor authentication available, and more),
  and "any Watchtower category that has items in it" surfaces on the dashboard, with "an alert
  banner throughout 1Password" for as long as it's unresolved
  ([Use Watchtower to find account details you need to change](https://support.1password.com/watchtower/)).
- Push notifications are capped and filtered rather than sent per-finding: "It won't send you more
  than one notification per day, and you'll only receive notifications when 1Password is
  unlocked," and only for saved sites, "so you can be sure notifications will be relevant"
  ([Watchtower notifications: Timely security alerts for the websites you use](https://1password.com/blog/announcing-watchtower-notifications)).
  The same post frames the low baseline explicitly: "Website security breaches don't happen often,
  so you shouldn't see Watchtower notifications very much" — the design goal is stated as scarcity,
  not coverage.

The practical split is: a persistent, always-visible **dashboard summary** for anything unresolved
(browse at your own pace, no interruption), plus a **rate-limited push interrupt** reserved for
genuinely new, actionable findings — not one push per category, and never a push for
lower-stakes items like "a site offers 2FA you haven't turned on."

**Chrome's Safety Check** follows the same shape from the browser side: it "runs automatically to
help you find and fix privacy and security problems," checking passwords (breached/reused/weak),
Safe Browsing status, pending updates, and site permissions in the background, and only surfaces
to the user via a notification on the New Tab page "if there are issues that need your attention"
([Manage Chrome safety and security](https://support.google.com/chrome/answer/10468685)) — silent
when clean, a single consolidated surface (not per-category popups) when not.

---

## 4. General UX guidance — evidence before verdict, severity-matched intrusiveness, selective prominence

Nielsen Norman Group's guidance converges on three points directly applicable here.

**Match intrusiveness to severity, don't apply one style everywhere.** Their framework for
choosing between indicators, validations, and notifications is explicit that high-stakes and
routine information should get different interaction weight: "Action-required notifications are
often urgent and should be intrusive; for instance, they could be implemented as modal popups,"
while "passive notifications are typically not urgent and should be less intrusive," and — the
inverse failure mode — "a toast... would be a bad way to implement an error message" for something
that actually matters
([Indicators, Validations, and Notifications: Pick the Correct Communication Option](https://www.nngroup.com/articles/indicators-validations-notifications/)).
Error-message guidance reinforces the same point from the messages side: "design your error
messages to indicate the problem's severity," using lighter treatments (banners, labels, toasts)
for low-impact issues and reserving stronger interventions (modal dialogs) for the severe ones
([Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/)).

**Avoid alarm fatigue through selective prominence, not uniform urgency.** NN/g's direct framing:
"Dashboards that monitor vast masses of data should guide users' attention to critical values...
but not by flashing endless alerts without prioritization"
([Alert Fatigue in User Interfaces](https://www.nngroup.com/videos/alert-fatigue-user-interfaces/)).
Their complex-application guidance gives the mechanism: "Help users find and act upon important
information by making critical elements visually salient... making them stand out from
surrounding elements," and notes that removing nonessential surrounding elements is often more
effective at achieving that salience than adding more emphasis to the important one
([8 Design Guidelines for Complex Applications](https://www.nngroup.com/articles/complex-application-design/)).
Applied to a mixed tool, the lesson is: prominence is a scarce resource — spend it only on the
thing that's actually urgent right now, not on every security-adjacent UI element by default.

No NN/g source retrieved in this pass gives an "evidence-first vs. verdict-first" framing by that
name specifically for security warnings — the closest primary support is the error-message
severity guidance above plus the Safe Links tiered-warning structure in §2, which functions as
evidence-first in practice (state what was detected and why, then offer the decision), not stated
as an explicit named principle **[caveat — inference from combined sources, not a direct NN/g
quote]**.

---

## Synthesis — how Cluster's Phishing category should be visually and structurally distinguished

Cluster's four top-level categories (Delete, Organize, Subscriptions, Phishing) put one high-stakes
security surface alongside three routine, reversible cleanup surfaces. Every source above treats
that exact pairing — a tool that does both — and every one of them keeps the two apart by
structure, not just styling.

**Phishing should never share a screen or list with routine cleanup items.** None of the four
researched products puts a security finding inside a routine list. Gmail never sorts suspicious
mail into a category tab (§1); Outlook's phishing reports land in a separate Security Dashboard,
not the inbox (§2); Watchtower's flagged items live in their own categorized dashboard, not mixed
into ordinary vault browsing (§3); Chrome's Safety Check issues are a distinct panel, not folded
into general settings. Cluster's existing `data-screen="impersonation"` is already a separate
top-level nav entry from Suggested/All senders/Subscriptions — that separation is correct and
should be preserved as the Phishing category is built out, not softened by e.g. letting a
low-severity impersonation finding appear as a row inside the Delete or Organize lists. A threat
card belongs only in the Phishing screen.

**Nav-entry prominence should track whether there are findings, not be constant.** Watchtower's
"alert banner throughout the app" only appears when a category has items in it (§3); Chrome's
Safety Check is silent when clean and surfaces only "issues that need your attention" (§3); NN/g's
alert-fatigue guidance argues directly against constant flashing regardless of state (§4).
Concretely for Cluster: when the Phishing category has zero open findings, its nav entry should
read as a normal, quiet nav item — no badge, no accent color, same visual weight as Organize or
Subscriptions. When it has HIGH-tier findings, it should use the strongest available visual
distinction (the existing `nav-count alert` badge is the right primitive) — reserving that
strongest treatment for HIGH is what keeps it meaningful when it does fire, per NN/g's
severity-matched-intrusiveness point (§4) and Watchtower's own split between urgent/rate-limited
push alerts and passive dashboard-only findings (§3). An ELEVATED or LOW-tier-only queue is closer
to Watchtower's "reused password" or Chrome's "unused permission" category: worth a visible count,
not the loudest visual treatment on the page.

**A single flagged sender should be evidence-first, not verdict-first.** Safe Links' tiered warning
pages state what was detected and why ("similar to other suspicious messages," "identified as a
phishing attack") before asking the user to decide whether to proceed (§2); Gmail's authentication
banner explains the specific mechanism that failed (SPF/DKIM) rather than issuing a bare "this is
dangerous" (§1); NN/g's guidance to design messages around severity and communicate clearly before
acting supports the same order (§4). Cluster's existing threat-card layout — risk tier, then the
claims-to-be-X-vs-sent-from-Y compare grid with SPF/DKIM/DMARC results, then an evidence list,
*then* the action row (Block sender / Deep scan / "This is genuinely them") — already matches this
pattern and should be kept as the template: evidence and mechanism first, decision buttons last,
never a "Suspicious — click to confirm" verdict presented before the reasoning. The three-way
action set (block / investigate further / stand down) also mirrors the tiered-not-binary decision
shape Safe Links and Watchtower both use — a plain "yes/no" would be the wrong reduction for a
decision this consequential.

---

## Sources

- [Google: Check if your Gmail message is authenticated](https://support.google.com/mail/answer/180707)
- [Google Workspace Updates: Making email safer with new security warnings in Gmail (Aug 2016)](https://workspaceupdates.googleblog.com/2016/08/making-email-safer-with-new-security-warnings-in-gmail.html)
- [Google: Avoid and report phishing emails](https://support.google.com/mail/answer/8253)
- [Google Workspace Updates: Control the visibility of warning banners in Gmail (Feb 2023)](https://workspaceupdates.googleblog.com/2023/02/admin-setting-for-gmail-warning-banners.html)
- [Google: Organize your emails into categories](https://support.google.com/mail/answer/3094499)
- [Microsoft Learn: Transition from Report Message or the Report Phishing add-ins](https://learn.microsoft.com/en-us/defender-office-365/submissions-users-report-message-add-in-configure)
- [Microsoft Learn: Complete Safe Links overview for Microsoft Defender for Office 365](https://learn.microsoft.com/en-us/defender-office-365/safe-links-about)
- [1Password Support: Use Watchtower to find account details you need to change](https://support.1password.com/watchtower/)
- [1Password Blog: Watchtower notifications — Timely security alerts for the websites you use](https://1password.com/blog/announcing-watchtower-notifications)
- [Google: Manage Chrome safety and security](https://support.google.com/chrome/answer/10468685)
- [NN/g: Indicators, Validations, and Notifications — Pick the Correct Communication Option](https://www.nngroup.com/articles/indicators-validations-notifications/)
- [NN/g: Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/)
- [NN/g: Alert Fatigue in User Interfaces](https://www.nngroup.com/videos/alert-fatigue-user-interfaces/)
- [NN/g: 8 Design Guidelines for Complex Applications](https://www.nngroup.com/articles/complex-application-design/)

Cross-referenced against `src/dashboard/index.html` (`data-screen="impersonation"` nav entry and
screen markup) and `src/dashboard/securityTab.ts` (risk-tier badges, compare grid, evidence list,
action row) for Cluster's current structure only — not audited or modified here.
