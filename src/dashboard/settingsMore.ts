// Settings groups added 2026-10-28: Accounts, Notifications,
// Show Kai, Privacy (export, erase) and Keyboard. The background worker sends
// the notifications (background.ts); this file only stores the choices.
import { deleteFiltersInto, getAuthToken, listLabels, revokeGoogleAccess } from "../lib/gmailApi";
import { forgetGmailSignIn, gmailRefreshToken } from "../lib/gmailWebAuth";
import { log } from "../lib/log";
import { clusterLabelIdSet } from "../lib/seedFromExisting";
import { clashes, GO_SCREENS, keysOf, SHORTCUTS, usableKey } from "../lib/keymap";
import { getSettings, updateSettings } from "../lib/settingsStore";
import { kindModel, resetKindModel } from "./kindLearning";
import { ctx } from "./state";
import { renderConfirmStep } from "./ui";

const MAIL_INDEX_DB = "cluster-mail-index";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

function applyShowKai(show: boolean) {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(".kai-guide, .ask-kai-face"))) el.hidden = !show;
}

/** Turning a notification on asks Chrome for the permission first; a refusal leaves it off. */
async function notificationsAllowed(): Promise<boolean> {
  if (!chrome.permissions?.request) return false;
  return chrome.permissions.request({ permissions: ["notifications"] });
}

function wireNotifySwitch(id: string, key: "notifyScamHeld" | "notifyWeekly") {
  const toggle = $<HTMLInputElement>(id);
  if (!toggle) return;
  toggle.checked = ctx.settings[key];
  toggle.onchange = async () => {
    if (toggle.checked && !(await notificationsAllowed())) toggle.checked = false;
    ctx.settings = await updateSettings({ [key]: toggle.checked });
  };
}

function exportSettings() {
  const blob = new Blob([JSON.stringify(ctx.settings, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `cluster-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Everything Cluster keeps lives in these three places; mail itself stays in Gmail. */
export async function eraseEverything(): Promise<void> {
  await chrome.storage.local.clear();
  await chrome.storage.session?.clear();
  try {
    localStorage.clear();
  } catch {
    // Storage blocked: nothing was kept there either.
  }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(MAIL_INDEX_DB);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

/** "What Cluster learned": your corrections, each kind with a count and Reset. */
export function renderLearned(): void {
  const host = $("settings-learned");
  if (!host) return;
  const rows: [label: string, count: number, reset: () => Promise<unknown>][] = [
    [
      "Sort choices",
      Object.keys(ctx.settings.sortOverrides).length,
      () => updateSettings({ sortOverrides: {} }),
    ],
    [
      "Person calls",
      Object.keys(ctx.settings.personOverrides).length,
      () => updateSettings({ personOverrides: {} }),
    ],
    ["Receipt senders", Object.keys(kindModel().answers).length, resetKindModel],
  ];
  host.replaceChildren(
    ...rows.map(([label, count, reset]) => {
      const row = Object.assign(document.createElement("div"), { className: "set-row plain" });
      const name = Object.assign(document.createElement("span"), { className: "grow", textContent: label });
      const value = Object.assign(document.createElement("span"), {
        className: "ios-value",
        textContent: count > 0 ? String(count) : "None",
      });
      const slot = document.createElement("span");
      const trail = Object.assign(document.createElement("span"), { className: "row-actions" });
      trail.append(value, slot);
      const btn = Object.assign(document.createElement("button"), {
        type: "button",
        className: "btn",
        textContent: "Reset",
      });
      const back = () => slot.replaceChildren(btn);
      btn.onclick = () =>
        renderConfirmStep(
          slot,
          back,
          `Forget ${count} ${count === 1 ? "choice" : "choices"}?`,
          false,
          async () => {
            await reset();
            ctx.settings = await getSettings();
            renderLearned();
            return "Forgotten";
          },
        );
      if (count > 0) back();
      row.append(name, trail);
      return row;
    }),
  );
}

export const SIGNED_OUT_KEY = "cluster.signedOut";

/** Revoke Google access, optionally removing the filters that file into Cluster's labels. Labels stay. */
async function signOut(removeFilters: boolean): Promise<void> {
  const token = await getAuthToken(false);
  if (removeFilters) {
    const labels = await listLabels(token);
    await deleteFiltersInto(token, clusterLabelIdSet(labels, ctx.settings.clusterOwnedLabels));
  }
  // Revoking the refresh token revokes every access token it issued.
  if (!(await revokeGoogleAccess((await gmailRefreshToken()) ?? token))) {
    log.error("Sign out: Google didn't confirm the revoke");
  }
  await forgetGmailSignIn();
  try {
    sessionStorage.setItem(SIGNED_OUT_KEY, "1");
  } catch {
    // Storage blocked: the gate just says the sign-in expired.
  }
  location.reload();
}

function wireSignOut() {
  const slot = $("settings-signout-slot");
  const btn = $<HTMLButtonElement>("settings-signout");
  if (!slot || !btn) return;
  const reset = () => slot.replaceChildren(btn);
  const choice = (label: string, cls: string, run: () => void) =>
    Object.assign(document.createElement("button"), {
      type: "button",
      className: cls,
      textContent: label,
      onclick: run,
    });
  btn.onclick = () => {
    const go = (remove: boolean) => () => {
      slot.replaceChildren("Signing out…");
      signOut(remove).catch((err) => {
        log.error(err);
        slot.replaceChildren(
          "Sign out failed. ",
          choice("Try again", "btn", () => btn.click()),
        );
      });
    };
    slot.replaceChildren(
      "Cluster's Gmail filters: ",
      choice("Keep them", "btn", go(false)),
      choice("Remove them", "btn", go(true)),
      choice("Cancel", "btn btn-ghost", reset),
    );
  };
}

// Mercury-style groups for the sidebar while Settings is open.
const SETTINGS_GROUPS: Array<[group: string, sections: string[]]> = [
  ["Account", ["Account", "Notifications", "Privacy & data", "Danger zone"]],
  ["Mail", ["Mail", "What Cluster learned", "Advanced"]],
  ["App", ["General", "Kai"]],
];

/** Settings, Mercury-style: the sidebar turns into "‹ Settings" and the
 * section list, and the page shows one section at a time under its name. */
function wireSettingsNav(showScreen: (name: string) => void): (inside: Element | null) => void {
  const secs = Array.from(document.querySelectorAll<HTMLElement>(".settings-list > .set-sec"));
  const sidebar = document.getElementById("sidebar");
  const title = document.querySelector<HTMLElement>('[data-screen="settings"] .page-title');
  if (!sidebar || secs.length === 0) return () => {};
  const nameOf = (sec: HTMLElement) => sec.querySelector("h2")?.textContent?.trim() ?? "";
  const nav = document.createElement("div");
  nav.className = "settings-nav";
  nav.setAttribute("role", "navigation");
  nav.setAttribute("aria-label", "Settings sections");
  const back = Object.assign(document.createElement("button"), { type: "button", className: "sn-back", textContent: "Settings" });
  back.setAttribute("aria-label", "Leave Settings");
  back.onclick = () => showScreen("overview");
  nav.append(back);
  const buttons = new Map<HTMLElement, HTMLButtonElement>();
  const show = (sec: HTMLElement) => {
    for (const s of secs) s.hidden = s !== sec;
    for (const [s, b] of buttons) b.setAttribute("aria-current", String(s === sec));
    if (title) title.textContent = nameOf(sec);
    window.scrollTo?.({ top: 0 });
  };
  const listed = new Set<HTMLElement>();
  for (const [group, names] of SETTINGS_GROUPS) {
    const items = names.map((n) => secs.find((s) => nameOf(s) === n)).filter((s): s is HTMLElement => !!s);
    if (items.length === 0) continue;
    nav.append(Object.assign(document.createElement("h3"), { textContent: group }));
    for (const sec of items) {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "sn-item", textContent: nameOf(sec) });
      b.onclick = () => show(sec);
      buttons.set(sec, b);
      listed.add(sec);
      nav.append(b);
    }
  }
  // A section not in the groups still gets a place, at the end.
  for (const sec of secs.filter((s) => !listed.has(s))) {
    const b = Object.assign(document.createElement("button"), { type: "button", className: "sn-item", textContent: nameOf(sec) });
    b.onclick = () => show(sec);
    buttons.set(sec, b);
    nav.append(b);
  }
  sidebar.querySelector(".nav-area")?.before(nav);
  show(buttons.keys().next().value!);
  return (inside) => {
    const sec = inside?.closest<HTMLElement>(".settings-list > .set-sec");
    if (sec) show(sec);
  };
}

const keyLabel = (key: string) => (key.length === 1 ? key.toUpperCase() : key);

/** Settings > Keyboard: click a key, press a new one. Esc cancels. */
function renderKeys(): void {
  const root = $("settings-keys");
  if (!root) return;
  const keys = keysOf(ctx.settings.keymap);
  const clash = clashes(keys);
  root.replaceChildren(
    ...SHORTCUTS.map((s) => {
      const row = document.createElement("div");
      row.className = "set-row";
      const name = Object.assign(document.createElement("span"), { className: "grow", textContent: s.label });
      if (clash.has(s.id))
        name.append(Object.assign(document.createElement("span"), { className: "sub warn", textContent: "Same key as another shortcut" }));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn key-btn";
      btn.setAttribute("aria-label", `${s.label}: ${keyLabel(keys[s.id])}. Change`);
      btn.textContent = `${s.afterG ? "G then " : ""}${keyLabel(keys[s.id])}`;
      btn.onclick = () => {
        btn.textContent = "Press a key";
        const take = async (e: KeyboardEvent) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          document.removeEventListener("keydown", take, true);
          if (e.key !== "Escape" && usableKey(e.key))
            ctx.settings = await updateSettings({ keymap: { ...ctx.settings.keymap, [s.id]: e.key.toLowerCase() } });
          renderKeys();
        };
        document.addEventListener("keydown", take, true);
      };
      row.append(name, btn);
      return row;
    }),
  );
}

/** The ? sheet: every shortcut and its key. */
function showKeysSheet(): void {
  let sheet = $<HTMLDialogElement>("keys-sheet");
  if (!sheet) {
    sheet = Object.assign(document.createElement("dialog"), { id: "keys-sheet", className: "unsub-sheet" });
    sheet.setAttribute("aria-label", "Keyboard shortcuts");
    document.body.append(sheet);
  }
  const keys = keysOf(ctx.settings.keymap);
  const title = Object.assign(document.createElement("h2"), { className: "unsub-title", textContent: "Keyboard shortcuts" });
  const list = document.createElement("div");
  list.className = "set-rows";
  const line = (label: string, key: string) => {
    const row = document.createElement("div");
    row.className = "set-row plain";
    row.append(Object.assign(document.createElement("span"), { className: "grow", textContent: label }));
    const k = document.createElement("span");
    k.append(...key.split(" ").map((part) => Object.assign(document.createElement("kbd"), { textContent: part })));
    row.append(k);
    return row;
  };
  list.append(
    ...SHORTCUTS.map((s) => line(s.label, `${s.afterG ? "G " : ""}${keyLabel(keys[s.id])}`)),
    line("Kai", "Ctrl K"),
    line("Close", "Esc"),
  );
  const close = Object.assign(document.createElement("button"), { type: "button", className: "btn", textContent: "Done" });
  close.onclick = () => sheet!.close?.();
  sheet.replaceChildren(title, list, close);
  if (!sheet.open) sheet.showModal?.();
}

/** Settings > Kai: what Kai couldn't answer, kept on this computer. */
export function renderKaiMissed(): void {
  const root = $("settings-kai-missed");
  if (!root) return;
  const missed = ctx.settings.kaiMissed ?? [];
  const rows = missed.map((m) => {
    const row = document.createElement("div");
    row.className = "set-row plain";
    row.append(
      Object.assign(document.createElement("span"), { className: "grow", textContent: m.q }),
      Object.assign(document.createElement("span"), { className: "hint", textContent: new Date(m.at).toLocaleDateString() }),
    );
    return row;
  });
  const clear = document.createElement("div");
  clear.className = "set-row";
  clear.append(Object.assign(document.createElement("span"), { className: "grow", textContent: "Forget what Kai learned" }));
  const btn = Object.assign(document.createElement("button"), { type: "button", className: "btn", textContent: "Clear" });
  btn.onclick = async () => {
    ctx.settings = await updateSettings({ kaiMissed: [], kaiLearned: {} });
    renderKaiMissed();
  };
  clear.append(btn);
  if (rows.length === 0)
    rows.push(Object.assign(document.createElement("div"), { className: "set-row plain", textContent: "Kai has answered everything so far." }));
  root.replaceChildren(...rows, clear);
}

export interface KeyActions {
  search(): void;
  kai(): void;
}

export function wireSettingsMore(showScreen: (name: string) => void, act?: KeyActions): void {
  const openPaneOf = wireSettingsNav(showScreen);
  renderKeys();
  renderKaiMissed();
  const single = $<HTMLInputElement>("single-keys-toggle");
  if (single) {
    single.checked = ctx.settings.singleKeys !== false;
    single.onchange = async () => {
      ctx.settings = await updateSettings({ singleKeys: single.checked });
    };
  }
  const reset = $<HTMLButtonElement>("keys-reset");
  if (reset)
    reset.onclick = async () => {
      ctx.settings = await updateSettings({ keymap: {} });
      renderKeys();
    };
  // The account menu's Sign out opens the same choice in Settings.
  const menuSignOut = $<HTMLButtonElement>("menu-signout");
  if (menuSignOut)
    menuSignOut.onclick = () => {
      showScreen("settings");
      const btn = $<HTMLButtonElement>("settings-signout");
      openPaneOf(btn);
      btn?.click();
      $("settings-signout-slot")?.scrollIntoView({ block: "center" });
    };
  // Mirror the header's email, which fills in after sign-in.
  const account = $("settings-account");
  const email = $("account-email");
  const sync = () => {
    const text = email?.textContent?.trim();
    if (account && text && text !== "Account") account.textContent = text;
  };
  sync();
  const watch = new MutationObserver(sync);
  if (email) watch.observe(email, { childList: true, characterData: true, subtree: true });

  wireSignOut();
  wireNotifySwitch("notify-scam-toggle", "notifyScamHeld");
  wireNotifySwitch("notify-weekly-toggle", "notifyWeekly");
  // An email into the user's own inbox needs no Chrome permission.
  const todayEmail = $<HTMLInputElement>("today-email-toggle");
  if (todayEmail) {
    todayEmail.checked = ctx.settings.todayEmail;
    todayEmail.onchange = async () => {
      ctx.settings = await updateSettings({ todayEmail: todayEmail.checked });
    };
  }

  const kai = $<HTMLInputElement>("show-kai-toggle");
  applyShowKai(ctx.settings.showKai);
  if (kai) {
    kai.checked = ctx.settings.showKai;
    kai.onchange = async () => {
      applyShowKai(kai.checked);
      ctx.settings = await updateSettings({ showKai: kai.checked });
    };
  }

  const exportBtn = $<HTMLButtonElement>("settings-export");
  if (exportBtn) exportBtn.onclick = exportSettings;

  const slot = $("settings-erase-slot");
  const eraseBtn = $<HTMLButtonElement>("settings-erase");
  if (slot && eraseBtn) {
    const reset = () => slot.replaceChildren(eraseBtn);
    eraseBtn.onclick = () =>
      renderConfirmStep(
        slot,
        reset,
        "Erase all of Cluster's data on this computer? Your mail isn't touched.",
        true,
        async () => {
          await eraseEverything();
          location.reload();
          return "Erased";
        },
      );
  }

  let goPending = 0;
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      act?.kai();
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    if (e.ctrlKey || e.metaKey || e.altKey || ctx.settings.singleKeys === false) return;
    if (active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return;
    if (document.querySelector("dialog[open], .ask:not([hidden])")) return;
    const key = e.key.toLowerCase();
    const keys = keysOf(ctx.settings.keymap);
    const hit = (afterG: boolean) => SHORTCUTS.find((s) => !!s.afterG === afterG && keys[s.id] === key);
    const jump = Date.now() - goPending < 1500 ? hit(true) : undefined;
    goPending = 0;
    if (jump) {
      e.preventDefault();
      showScreen(GO_SCREENS[jump.id]);
      return;
    }
    const plain = hit(false);
    if (plain?.id === "search") act?.search();
    else if (plain?.id === "help") showKeysSheet();
    else if (key === "g") goPending = Date.now();
    if (plain) e.preventDefault();
  });
}
