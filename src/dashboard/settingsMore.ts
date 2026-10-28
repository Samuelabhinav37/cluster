// Settings groups added 2026-10-28: Accounts, Notifications, Safety net,
// Show Kai, Privacy (export, erase) and Keyboard. The background worker sends
// the notifications (background.ts); this file only stores the choices.
import { deleteFiltersInto, getAuthToken, listLabels, revokeGoogleAccess } from "../lib/gmailApi";
import { log } from "../lib/log";
import { clusterLabelIdSet } from "../lib/seedFromExisting";
import { updateSettings } from "../lib/settingsStore";
import { ctx } from "./state";
import { renderConfirmStep } from "./ui";

const MAIL_INDEX_DB = "cluster-mail-index";
// Gmail-style "G then a letter" jumps to a place.
const GO_KEYS: Record<string, string> = { h: "overview", s: "senders", c: "delete", o: "organize", p: "impersonation" };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

function applyShowKai(show: boolean) {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(".kai-guide"))) el.hidden = !show;
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

export const SIGNED_OUT_KEY = "cluster.signedOut";

/** Revoke Google access, optionally removing the filters that file into Cluster's labels. Labels stay. */
async function signOut(removeFilters: boolean): Promise<void> {
  const token = await getAuthToken(false);
  if (removeFilters) {
    const labels = await listLabels(token);
    await deleteFiltersInto(token, clusterLabelIdSet(labels, ctx.settings.clusterOwnedLabels));
  }
  if (!(await revokeGoogleAccess(token))) log.error("Sign out: Google didn't confirm the revoke");
  await chrome.identity.clearAllCachedAuthTokens();
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
    Object.assign(document.createElement("button"), { type: "button", className: cls, textContent: label, onclick: run });
  btn.onclick = () => {
    const go = (remove: boolean) => () => {
      slot.replaceChildren("Signing out…");
      signOut(remove).catch((err) => {
        log.error(err);
        slot.replaceChildren("Sign out failed. ", choice("Try again", "btn", () => btn.click()));
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

export function wireSettingsMore(showScreen: (name: string) => void): void {
  // Mirror the header: its email and its Connect Outlook item fill in after sign-in.
  const account = $("settings-account");
  const email = $("account-email");
  const outlook = $<HTMLButtonElement>("connect-outlook");
  const addOutlook = $<HTMLButtonElement>("settings-add-outlook");
  const sync = () => {
    const text = email?.textContent?.trim();
    if (account && text && text !== "Account") account.textContent = text;
    if (addOutlook) addOutlook.hidden = !outlook || outlook.hidden;
  };
  sync();
  const watch = new MutationObserver(sync);
  if (email) watch.observe(email, { childList: true, characterData: true, subtree: true });
  if (outlook) watch.observe(outlook, { attributes: true, attributeFilter: ["hidden"] });
  if (addOutlook) addOutlook.onclick = () => outlook?.click();

  wireSignOut();
  wireNotifySwitch("notify-scam-toggle", "notifyScamHeld");
  wireNotifySwitch("notify-weekly-toggle", "notifyWeekly");

  const activity = $<HTMLButtonElement>("settings-open-activity");
  if (activity) activity.onclick = () => showScreen("recent");

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
      renderConfirmStep(slot, reset, "Erase all of Cluster's data on this computer? Your mail isn't touched.", true, async () => {
        await eraseEverything();
        location.reload();
        return "Erased";
      });
  }

  let goPending = 0;
  document.addEventListener("keydown", (e) => {
    const active = document.activeElement as HTMLElement | null;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return;
    const key = e.key.toLowerCase();
    if (Date.now() - goPending < 1500 && GO_KEYS[key]) {
      goPending = 0;
      e.preventDefault();
      showScreen(GO_KEYS[key]);
    } else goPending = key === "g" ? Date.now() : 0;
  });
}
