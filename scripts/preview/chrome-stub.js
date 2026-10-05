/* UI preview harness (see docs/testing.md, `npm run preview:ui`).
 *
 * Injected ahead of the built dashboard by scripts/preview/serve.mjs. Stubs
 * chrome.* and answers the Gmail REST endpoints from a deterministic fake
 * mailbox, so the real bundle runs on localhost with no OAuth and no real
 * mail. Browser automation can't open chrome-extension:// pages; this can.
 * State persists in localStorage between reloads. Query flags:
 *   ?reset     wipe all fake state: a fresh install, Gmail not connected
 *   ?consent   show a simulated Google consent overlay on Connect
 *   ?deny      the interactive sign-in fails as if the user cancelled it
 *   ?offline   every Gmail call fails with a network error
 *   ?pinned    report the toolbar icon as pinned (hides the pin tip)
 * Not a test of Gmail itself: real quota, real headers and the real consent
 * screen still need the reload-unpacked checklist.
 */
(function () {
  const qs = new URLSearchParams(location.search);
  if (qs.has("reset")) { localStorage.clear(); }
  const LS_KEY = "__preview_storage_";

  // ── storage ──────────────────────────────────────────────────────────
  function area(name, persistent) {
    const mem = {};
    const load = () => persistent ? JSON.parse(localStorage.getItem(LS_KEY + name) || "{}") : mem;
    const save = (o) => { if (persistent) localStorage.setItem(LS_KEY + name, JSON.stringify(o)); else Object.assign(mem, o); };
    const listeners = [];
    function get(keys, cb) {
      const all = load(); let out = {};
      if (keys == null) out = { ...all };
      else if (typeof keys === "string") { if (keys in all) out[keys] = all[keys]; }
      else if (Array.isArray(keys)) { for (const k of keys) if (k in all) out[k] = all[k]; }
      else { for (const [k, d] of Object.entries(keys)) out[k] = k in all ? all[k] : d; }
      out = JSON.parse(JSON.stringify(out));
      if (cb) { setTimeout(() => cb(out)); return; }
      return Promise.resolve(out);
    }
    function set(items, cb) {
      const all = load(); const changes = {};
      for (const [k, v] of Object.entries(items)) { changes[k] = { oldValue: all[k], newValue: v }; all[k] = JSON.parse(JSON.stringify(v)); }
      save(all);
      listeners.forEach((l) => l(changes, name));
      if (cb) { setTimeout(cb); return; }
      return Promise.resolve();
    }
    function remove(keys, cb) {
      const all = load(); for (const k of [].concat(keys)) delete all[k];
      if (persistent) localStorage.setItem(LS_KEY + name, JSON.stringify(all)); else { for (const k of [].concat(keys)) delete mem[k]; }
      if (cb) { setTimeout(cb); return; }
      return Promise.resolve();
    }
    function clear(cb) { if (persistent) localStorage.removeItem(LS_KEY + name); if (cb) setTimeout(cb); return Promise.resolve(); }
    return { get, set, remove, clear, getBytesInUse: () => Promise.resolve(0), onChanged: { addListener: (f) => listeners.push(f), removeListener() {} } };
  }

  let authGranted = localStorage.getItem("__preview_auth") === "1";
  const runtime = {
    lastError: undefined,
    id: "previewpreviewpreviewpreviewprev",
    getURL: (p) => location.origin + "/" + p.replace(/^\//, ""),
    sendMessage: () => Promise.resolve(),
    onMessage: { addListener() {} },
    getManifest: () => ({ version: "0.1.0", oauth2: { scopes: [] } }),
  };

  function consentOverlay() {
    return new Promise((resolve) => {
      const o = document.createElement("div");
      o.id = "__consent";
      o.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font:14px system-ui";
      o.innerHTML = `<div style="background:#fff;color:#202124;width:420px;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.4);padding:24px">
        <div style="font-size:11px;letter-spacing:.08em;color:#c5221f;font-weight:700">SIMULATED SIGN-IN (preview harness)</div>
        <h2 style="margin:10px 0 6px;font-size:20px;font-weight:500">Allow Cluster to access Gmail?</h2>
        <p style="margin:0 0 10px;color:#5f6368">Scopes requested: gmail.modify, gmail.settings.basic</p>
        <p style="margin:0 0 16px;color:#5f6368;font-size:12px">(Real flow: account picker → "Google hasn't verified this app" warning while in Testing → scope consent.)</p>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button id="__deny">Cancel</button><button id="__allow" style="background:#1a73e8;color:#fff;border:0;padding:8px 16px;border-radius:4px">Allow</button></div></div>`;
      document.body.appendChild(o);
      o.querySelector("#__allow").onclick = () => { o.remove(); resolve(true); };
      o.querySelector("#__deny").onclick = () => { o.remove(); resolve(false); };
    });
  }

  function getAuthToken(opts, cb) {
    const done = (tok, err) => {
      if (cb) { runtime.lastError = err; cb(tok); runtime.lastError = undefined; return; }
    };
    (async () => {
      if (qs.has("deny") && opts && opts.interactive) return done(undefined, { message: "The user did not approve access." });
      if (!authGranted) {
        if (!opts || !opts.interactive) return done(undefined, { message: "OAuth2 not granted or revoked." });
        if (qs.has("consent")) {
          await new Promise((r) => setTimeout(r, 600));
          const ok = await consentOverlay();
          if (!ok) return done(undefined, { message: "The user did not approve access." });
        }
        authGranted = true; localStorage.setItem("__preview_auth", "1");
      }
      done("fake-token", undefined);
    })();
  }

  window.chrome = {
    runtime,
    storage: { local: area("local", true), session: area("session", false), sync: area("sync", true), managed: area("managed", false), onChanged: { addListener() {}, removeListener() {} } },
    identity: {
      getAuthToken,
      removeCachedAuthToken: (_o, cb) => { if (cb) cb(); return Promise.resolve(); },
      getRedirectURL: () => "https://preview.chromiumapp.org/",
      launchWebAuthFlow: (_o, cb) => { runtime.lastError = { message: "Outlook not available in preview" }; if (cb) cb(undefined); runtime.lastError = undefined; },
    },
    permissions: { contains: () => Promise.resolve(false), request: () => Promise.resolve(false) },
    action: {
      setBadgeText: () => Promise.resolve(),
      setBadgeBackgroundColor: () => Promise.resolve(),
      getUserSettings: () => Promise.resolve({ isOnToolbar: qs.has("pinned") }),
    },
    tabs: { create: (o) => { window.open(o.url, "_blank"); return Promise.resolve({}); }, query: () => Promise.resolve([]), update: () => Promise.resolve({}) },
    alarms: { create() {}, onAlarm: { addListener() {} } },
  };

  // ── fake mailbox ─────────────────────────────────────────────────────
  let seed = 1337;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const DAY = 86400000; const NOW = Date.now();
  const AUTH = (d, ok = true) => ok
    ? `mx.google.com; dkim=pass header.i=@${d} header.s=s1; spf=pass (google.com: domain of bounce@${d} designates 1.2.3.4 as permitted sender) smtp.mailfrom=bounce@${d}; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=${d}`
    : `mx.google.com; dkim=fail header.i=@${d}; spf=softfail (google.com: domain of transitioning ${d} does not designate 45.9.1.2 as permitted sender) smtp.mailfrom=${d}; dmarc=fail (p=NONE sp=NONE dis=NONE) header.from=${d}`;

  // [name, address, cat, count, readRate, unsub, subjects, opts]
  const S = [
    ["Amazon.com", "store-news@amazon.com", "P", 16, 0.15, true, ["Deals picked for you", "Lightning deals end tonight", "Your Prime Day early access"]],
    ["Amazon.com", "shipment-tracking@amazon.com", "U", 9, 0.9, false, ["Your package was delivered", "Shipped: Anker USB-C charger", "Out for delivery today"]],
    ["Nike", "nike@official.nike.com", "P", 11, 0.05, true, ["Just dropped: Air Max Dn", "Members get 25% off", "Your size is back"]],
    ["UNIQLO", "info@mail.uniqlo.com", "P", 8, 0, true, ["New arrivals: HEATTECH", "Limited offer this weekend"]],
    ["Target", "target@em.target.com", "P", 9, 0.1, true, ["Circle Week starts now", "Fall home refresh"]],
    ["Old Navy", "oldnavy@email.oldnavy.com", "P", 12, 0, true, ["50% off EVERYTHING", "Last chance: jeans event", "Hey, we miss you"]],
    ["Groupon", "noreply@r.groupon.com", "P", 14, 0, true, ["Up to 70% off spas near you", "Your weekly deals", "Things to do this weekend"]],
    ["Wayfair", "shop@e.wayfair.com", "P", 9, 0, true, ["Way Day is here", "Sofas from $299"]],
    ["Sephora", "beauty@beauty.sephora.com", "P", 6, 0.3, true, ["Your Beauty Insider points", "New from Rare Beauty"]],
    ["Medium Daily Digest", "noreply@medium.com", "U", 20, 0, true, ["Stories you might like", "The 10x engineer myth, revisited", "Why I left FAANG"]],
    ["Lenny's Newsletter", "lenny@substack.com", "U", 8, 0.9, true, ["How the best PMs prioritize", "Growth loops, explained"]],
    ["Morning Brew", "crew@morningbrew.com", "U", 18, 0.35, true, ["☕ Rate cut fallout", "☕ The chip war heats up"]],
    ["The Verge", "newsletter@theverge.com", "U", 9, 0.4, true, ["Verge Deals", "Installer: the best new apps"]],
    ["LinkedIn", "notifications-noreply@linkedin.com", "S", 22, 0.1, true, ["You appeared in 14 searches this week", "Priya Sharma viewed your profile", "New jobs for you"]],
    ["Facebook", "notification@facebookmail.com", "S", 10, 0.05, true, ["You have 3 new notifications", "Memories from 5 years ago"]],
    ["Quora Digest", "digest-noreply@quora.com", "S", 15, 0, true, ["What is the best programming language to learn?", "Why do cats knead?"]],
    ["Reddit", "noreply@redditmail.com", "S", 9, 0.2, true, ["Trending on r/programming", "u/someone replied to your comment"]],
    ["Chase", "no.reply.alerts@chase.com", "U", 6, 1, false, ["Your statement is ready", "You made a payment of $412.50"]],
    ["PayPal", "service@paypal.com", "U", 5, 0.8, false, ["You sent a payment to Alex", "Receipt for your payment"]],
    ["Venmo", "venmo@venmo.com", "U", 4, 0.75, false, ["Jordan paid you $24.00", "You paid Sam $18.00"]],
    ["Google", "no-reply@accounts.google.com", "U", 6, 1, false, ["Security alert", "Your Google verification code is 482913"]],
    ["GitHub", "noreply@github.com", "U", 7, 0.9, false, ["[GitHub] Please verify your device", "[GitHub] A new SSH key was added"]],
    ["Microsoft account team", "account-security-noreply@accountprotection.microsoft.com", "U", 3, 1, false, ["Your single-use code"]],
    ["UPS", "mcinfo@ups.com", "U", 5, 0.6, true, ["UPS Update: Package Scheduled for Delivery Tomorrow"]],
    ["FedEx", "TrackingUpdates@fedex.com", "U", 4, 0.5, false, ["Your package is on its way"]],
    ["Uber Receipts", "noreply@uber.com", "U", 8, 0.25, false, ["Your Thursday evening trip with Uber", "Your Sunday morning trip with Uber"]],
    ["DoorDash", "no-reply@doordash.com", "U", 7, 0.2, true, ["Your order from Chipotle", "Order confirmed"]],
    ["Apple", "no_reply@email.apple.com", "U", 4, 0.5, false, ["Your receipt from Apple.", "Your subscription is renewing soon"]],
    ["Delta Air Lines", "DeltaAirLines@t.delta.com", "U", 4, 0.75, true, ["Your trip to Denver: check in now", "Your SkyMiles statement"]],
    ["Airbnb", "automated@airbnb.com", "U", 3, 0.66, true, ["Reservation confirmed in Lisbon"]],
    ["Notion", "team@makenotion.com", "U", 5, 0.2, true, ["What's new in Notion: Mail", "Your weekly workspace digest"]],
    ["Slack", "feedback@slack.com", "U", 6, 0.1, true, ["You have unread messages in Acme", "Slack digest"]],
    ["Netflix", "info@account.netflix.com", "U", 3, 0.66, true, ["Your membership will renew on Oct 12", "New on Netflix this week"]],
    ["Spotify", "no-reply@spotify.com", "U", 3, 0.33, true, ["Your free trial ends in 3 days", "Your Release Radar is ready"]],
    ["Adobe", "mail@mail.adobe.com", "P", 6, 0.1, true, ["Your Creative Cloud plan renews soon", "Try Firefly free"]],
    // personal / work (primary inbox, no category)
    ["Mom", "mom@family.example", "I", 6, 1, false, ["Dinner on Sunday?", "Photos from the trip", "Call me when free"]],
    ["Alex Chen", "alex.chen@acme-corp.example", "I", 7, 1, false, ["Re: Q4 roadmap review", "Notes from today's sync", "Can you review the doc?"]],
    ["Jordan Lee", "jordan@friends.example", "I", 3, 1, false, ["Hiking this weekend?", "Re: rent split"]],
    // first-contact unknowns (Screener)
    ["Taylor @ Brightloop", "taylor@brightloop.io", "I", 2, 0, false, ["Quick question about your hiring plans", "Following up"], { firstContact: true }],
    ["Dana from GrowthStack", "dana@growthstack-mail.com", "I", 3, 0, false, ["15 minutes next week?", "Bumping this to the top of your inbox"], { firstContact: true }],
    // phishing / lookalikes
    ["PayPal Security", "service@paypa1-secure.com", "I", 2, 0, false, ["Your account has been limited", "Action required: verify your identity"], { phish: true }],
    ["Netflix", "billing@netflix-account-update.xyz", "I", 1, 0, false, ["Payment declined - update your billing details"], { phish: true }],
    ["Apple Support", "support@apple-id-verify.co", "I", 1, 0, false, ["Your Apple ID was used to sign in on a new device"], { phish: true }],
  ];

  const MSGS = {}; const ORDER = [];
  let idc = 1000;
  for (const [name, addr, cat, count, read, unsub, subjects, opts = {}] of S) {
    const domain = addr.split("@")[1];
    for (let i = 0; i < count; i++) {
      const id = (idc++).toString(16) + "a" + Math.floor(rnd() * 1e6).toString(16);
      const age = opts.firstContact || opts.phish ? rnd() * 6 : Math.pow(rnd(), 1.4) * 88;
      const labels = ["INBOX"];
      if (cat === "P") labels.push("CATEGORY_PROMOTIONS");
      if (cat === "U") labels.push("CATEGORY_UPDATES");
      if (cat === "S") labels.push("CATEGORY_SOCIAL");
      if (cat === "I") labels.push("CATEGORY_PERSONAL");
      if (rnd() >= read) labels.push("UNREAD");
      if (cat === "I" && !opts.firstContact && !opts.phish && rnd() < 0.3) labels.push("STARRED");
      if (cat === "U" && /chase|paypal/.test(domain) && i === 0) labels.push("STARRED");
      const headers = [
        { name: "From", value: `"${name}" <${addr}>` },
        { name: "Subject", value: pick(subjects) },
        { name: "Authentication-Results", value: AUTH(domain, !opts.phish) },
      ];
      if (!opts.phish) headers.push({ name: "DKIM-Signature", value: `v=1; a=rsa-sha256; d=${domain}; s=s1; b=abc` });
      if (unsub) {
        headers.push({ name: "List-Unsubscribe", value: `<https://${domain}/unsubscribe?u=${id}>, <mailto:unsubscribe@${domain}?subject=unsubscribe>` });
        if (rnd() < 0.8) headers.push({ name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" });
        headers.push({ name: "Precedence", value: "bulk" });
      }
      if (opts.phish) headers.push({ name: "Reply-To", value: `recovery-team@${domain.replace(/\..*/, "")}-help.top` });
      MSGS[id] = { id, threadId: id, labelIds: labels, internalDate: String(Math.floor(NOW - age * DAY)), sizeEstimate: Math.floor(8000 + rnd() * (cat === "P" ? 120000 : 40000)) * (rnd() < 0.04 ? 60 : 1), payload: { headers } };
      ORDER.push(id);
    }
  }
  // Sent mail (implicit screener allowlist)
  for (const to of ["mom@family.example", "alex.chen@acme-corp.example", "jordan@friends.example"]) {
    for (let i = 0; i < 3; i++) {
      const id = "s" + (idc++).toString(16);
      MSGS[id] = { id, threadId: id, labelIds: ["SENT"], internalDate: String(NOW - rnd() * 60 * DAY), sizeEstimate: 4000, payload: { headers: [{ name: "To", value: to }] } };
      ORDER.push(id);
    }
  }
  ORDER.sort((a, b) => Number(MSGS[b].internalDate) - Number(MSGS[a].internalDate));
  // Restore mutations from previous sessions
  const saved = JSON.parse(localStorage.getItem("__preview_mbox") || "{}");
  for (const [id, labels] of Object.entries(saved)) { if (labels === null) { delete MSGS[id]; } else if (MSGS[id]) MSGS[id].labelIds = labels; }
  const persistLabels = (id) => { const s = JSON.parse(localStorage.getItem("__preview_mbox") || "{}"); s[id] = MSGS[id] ? MSGS[id].labelIds : null; localStorage.setItem("__preview_mbox", JSON.stringify(s)); };
  const LABELS = JSON.parse(localStorage.getItem("__preview_labels") || "null") || [
    { id: "INBOX", name: "INBOX", type: "system" }, { id: "STARRED", name: "STARRED", type: "system" }, { id: "Label_1", name: "Receipts", type: "user" }, { id: "Label_2", name: "Travel", type: "user" },
  ];
  const FILTERS = JSON.parse(localStorage.getItem("__preview_filters") || "[]");
  const saveMeta = () => { localStorage.setItem("__preview_labels", JSON.stringify(LABELS)); localStorage.setItem("__preview_filters", JSON.stringify(FILTERS)); };
  window.__previewLog = [];

  function matches(m, q) {
    const L = m.labelIds; const from = (m.payload.headers.find((h) => h.name === "From") || {}).value || "";
    const subj = (m.payload.headers.find((h) => h.name === "Subject") || {}).value || "";
    const term = (t) => {
      t = t.trim(); if (!t) return true;
      let neg = false; if (t.startsWith("-")) { neg = true; t = t.slice(1); }
      let r;
      const nt = t.match(/^newer_than:(\d+)([dmy])$/); const ot = t.match(/^older_than:(\d+)([dmy])$/);
      const mult = { d: 1, m: 30, y: 365 };
      if (nt) r = Number(m.internalDate) > NOW - Number(nt[1]) * mult[nt[2]] * DAY;
      else if (ot) r = Number(m.internalDate) < NOW - Number(ot[1]) * mult[ot[2]] * DAY;
      else if (t === "in:inbox") r = L.includes("INBOX");
      else if (t === "in:sent") r = L.includes("SENT");
      else if (t === "in:trash") r = L.includes("TRASH");
      else if (t === "in:spam") r = L.includes("SPAM");
      else if (t === "is:starred") r = L.includes("STARRED");
      else if (t === "is:unread") r = L.includes("UNREAD");
      else if (t === "is:important") r = false;
      else if (t.startsWith("category:")) r = L.includes("CATEGORY_" + t.slice(9).toUpperCase());
      else if (t.startsWith("filename:") || t.startsWith("has:attachment")) r = false;
      else if (t.startsWith("from:")) r = from.toLowerCase().includes(t.slice(5).replace(/[()"]/g, "").toLowerCase());
      else if (t.startsWith("label:")) r = L.some((id) => { const l = LABELS.find((x) => x.id === id); return l && l.name.toLowerCase() === t.slice(6).toLowerCase(); });
      else if (t.startsWith("subject:")) r = subj.toLowerCase().includes(t.slice(8).replace(/"/g, "").toLowerCase());
      else r = true;
      return neg ? !r : r;
    };
    // split top-level: parenthesized groups are OR-lists
    const groups = []; let rest = q.replace(/\(([^()]*)\)/g, (_s, inner) => { groups.push(inner); return " "; });
    for (const g of groups) { if (!g.split(/\s+OR\s+|\s*\{|\}/).some((t) => t.trim().split(/\s+/).every(term))) return false; }
    if (/\sOR\s/.test(rest)) return rest.split(/\s+OR\s+/).some((p) => p.trim().split(/\s+/).every(term));
    if (!L.includes("SENT") && !q.includes("in:sent") && L.includes("SENT")) return false;
    if (q.indexOf("in:sent") === -1 && L.includes("SENT")) return false;
    if (q.indexOf("in:trash") === -1 && L.includes("TRASH")) return false;
    return rest.trim().split(/\s+/).every(term);
  }

  const json = (o, status = 200) => new Response(o == null ? null : JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init = {}) {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    const method = (init.method || "GET").toUpperCase();
    if (url.host === "gmail.googleapis.com") {
      if (qs.has("offline")) throw new TypeError("Failed to fetch");
      await new Promise((r) => setTimeout(r, 8 + rnd() * 20));
      const p = url.pathname.replace("/gmail/v1/users/me", "");
      window.__previewLog.push(method + " " + p + (url.search.length < 200 ? url.search : ""));
      if (p === "/profile") return json({ emailAddress: "you@example.com", historyId: "9001", messagesTotal: ORDER.length });
      if (p === "/history") return json({ historyId: "9001", history: [] });
      if (p === "/messages" && method === "GET") {
        const q = url.searchParams.get("q") || ""; const max = Number(url.searchParams.get("maxResults") || 100);
        const start = Number(url.searchParams.get("pageToken") || 0);
        const hits = ORDER.filter((id) => MSGS[id] && matches(MSGS[id], q));
        const page = hits.slice(start, start + max);
        return json({ messages: page.map((id) => ({ id, threadId: id })), nextPageToken: start + max < hits.length ? String(start + max) : undefined, resultSizeEstimate: hits.length });
      }
      let m;
      if ((m = p.match(/^\/messages\/([^/]+)$/)) && method === "GET") {
        const msg = MSGS[m[1]]; if (!msg) return json({ error: { code: 404 } }, 404);
        const want = url.searchParams.getAll("metadataHeaders");
        const headers = want.length ? msg.payload.headers.filter((h) => want.includes(h.name)) : msg.payload.headers;
        return json({ ...msg, payload: { headers, mimeType: "text/html", body: { size: 0 } } });
      }
      if ((m = p.match(/^\/messages\/([^/]+)\/(trash|untrash|modify)$/))) {
        const msg = MSGS[m[1]]; const body = init.body ? JSON.parse(init.body) : {};
        if (m[2] === "trash") { msg.labelIds = msg.labelIds.filter((l) => l !== "INBOX").concat("TRASH"); }
        if (m[2] === "untrash") { msg.labelIds = msg.labelIds.filter((l) => l !== "TRASH").concat("INBOX"); }
        if (m[2] === "modify") { msg.labelIds = msg.labelIds.filter((l) => !(body.removeLabelIds || []).includes(l)).concat(body.addLabelIds || []); }
        persistLabels(msg.id); return json(msg);
      }
      if (p === "/messages/batchModify") {
        const body = JSON.parse(init.body);
        for (const id of body.ids) { const msg = MSGS[id]; if (!msg) continue; msg.labelIds = [...new Set(msg.labelIds.filter((l) => !(body.removeLabelIds || []).includes(l)).concat(body.addLabelIds || []))]; persistLabels(id); }
        return new Response(null, { status: 204 });
      }
      if (p === "/messages/batchDelete") { const body = JSON.parse(init.body); for (const id of body.ids) { delete MSGS[id]; persistLabels(id); } return new Response(null, { status: 204 }); }
      if (p === "/labels" && method === "GET") return json({ labels: LABELS });
      if (p === "/labels" && method === "POST") { const b = JSON.parse(init.body); const l = { id: "Label_" + (LABELS.length + 10), name: b.name, type: "user" }; LABELS.push(l); saveMeta(); return json(l); }
      if (p === "/settings/filters" && method === "GET") return json({ filter: FILTERS });
      if (p === "/settings/filters" && method === "POST") { const b = JSON.parse(init.body); const f = { id: "F" + (FILTERS.length + 1), ...b }; FILTERS.push(f); saveMeta(); return json(f); }
      if ((m = p.match(/^\/settings\/filters\/(.+)$/)) && method === "DELETE") { const i = FILTERS.findIndex((f) => f.id === m[1]); if (i >= 0) FILTERS.splice(i, 1); saveMeta(); return new Response(null, { status: 204 }); }
      return json({ error: { code: 404, message: "preview: unhandled " + p } }, 404);
    }
    if (url.origin !== location.origin) {
      window.__previewLog.push("EXTERNAL " + method + " " + url.href);
      if (method === "POST") return new Response("", { status: 200 });
      return new Response("", { status: 404 });
    }
    return realFetch(input, init);
  };
})();
