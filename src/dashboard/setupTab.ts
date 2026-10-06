// Settings page, simple mode and first-run setup (UI v4, stage 4).
//
// - Settings is a page now (data-screen="settings"); the controls that used
//   to live in the header's gear menu keep their ids and wiring in
//   dashboard.ts. This module adds "Your setup" and the Simple mode switch.
// - Simple mode: bigger text, and the nav shows only Home, Scams and
//   Settings. Home (data-screen="simple") says whether you're protected,
//   how much was held, and one safety tip.
// - Setup: "What describes you?" with four answers. A persona never changes
//   Gmail by itself. Choices that create Gmail filters (time limits) are
//   filled in on the Sorting page for the user to save; only local settings
//   (scam holding, simple mode) switch on directly.
import type { ClusterSettings } from "../lib/settingsStore";
import { updateSettings } from "../lib/settingsStore";
import type { SenderSummary } from "../lib/senderModel";
import type { SortBucket } from "../lib/sortTaxonomy";
import { ctx } from "./state";
import { proposeTimeLimits } from "./timeLimitsTab";

export type Persona = Exclude<ClusterSettings["persona"], "">;

interface PersonaPlan {
  title: string;
  /** What it will do, shown before the user confirms. Must match `apply`. */
  changes: string[];
  hours?: Partial<Record<SortBucket, number | null>>;
  holdScams?: boolean;
  simpleMode?: boolean;
}

const DAY = 24;

export const PERSONAS: Record<Persona, PersonaPlan> = {
  calm: {
    title: "I get too many promotions",
    changes: [
      "Promotions and one-time codes leave your inbox after 1 day",
      "Newsletters and shopping after 3 days, social after 2",
      "School, work, bank and travel mail stay in your inbox",
      "You press Save on the Sorting page before Gmail changes",
    ],
    hours: { promotions: DAY, otp: DAY, newsletter: 3 * DAY, shopping: 3 * DAY, social: 2 * DAY, receipt: 7 * DAY, shipping: 7 * DAY, travel: null, finance: null, productivity: null, education: null },
  },
  business: {
    title: "I run a business",
    changes: [
      "Emails that look like scams are held, including a familiar supplier suddenly asking to be paid somewhere new",
      "Receipts and bank mail stay in your inbox",
      "Promotions and newsletters leave after 3 days",
      "You press Save on the Sorting page before Gmail changes",
    ],
    hours: { receipt: null, finance: null, promotions: 3 * DAY, newsletter: 3 * DAY },
    holdScams: true,
  },
  safe: {
    title: "Keep me safe",
    changes: [
      "Emails that look like scams are held, out of your inbox",
      "Simple mode: bigger text and three screens",
      "Every held email says why, in plain words",
      "Nothing is ever deleted",
    ],
    holdScams: true,
    simpleMode: true,
  },
  busy: {
    title: "Lots of people email me",
    changes: [
      "Promotions and social updates leave your inbox after 1 day",
      "Newsletters after 3 days",
      "New senders still reach your inbox, so you don't miss a first email",
      "You press Save on the Sorting page before Gmail changes",
    ],
    hours: { promotions: DAY, social: DAY, newsletter: 3 * DAY },
  },
};

const SIMPLE_SCREENS = new Set(["simple", "impersonation", "settings"]);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

/** Applies simple mode to the page: body class and which nav items show.
 * Hidden nav items get the `hidden` attribute so arrow keys skip them. */
export function applySimpleMode(on: boolean): void {
  document.body.classList.toggle("simple", on);
  for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>("#sidebar button[data-screen]"))) {
    const screen = btn.dataset.screen!;
    btn.hidden = on ? !SIMPLE_SCREENS.has(screen) : screen === "simple";
  }
  const sw = $<HTMLInputElement>("simple-mode-toggle");
  if (sw) sw.checked = on;
}

/** Overview and Home stand in for each other depending on the mode. */
export function screenForMode(target: string): string {
  const simple = document.body.classList.contains("simple");
  if (simple && target === "overview") return "simple";
  if (!simple && target === "simple") return "overview";
  return target;
}

function personaLabel(persona: ClusterSettings["persona"]): string {
  return persona ? PERSONAS[persona].title : "Not set up yet";
}

export function renderSettingsSetup(): void {
  const label = $("settings-persona");
  if (label) label.textContent = personaLabel(ctx.settings.persona);
  const banner = $("setup-banner");
  if (banner) banner.hidden = ctx.settings.setupDone;
}

/** Simple-mode home: protection status, what was held, one safety tip. */
export function renderSimpleHome(securitySenders: SenderSummary[]): void {
  const status = $("simple-status");
  const statusSub = $("simple-status-sub");
  const held = Object.values(ctx.settings.quarantinedSenders).reduce((n, r) => n + r.messageIds.length, 0);
  const warned = securitySenders.filter((s) => s.threatSignals.length > 0).length;
  if (status && statusSub) {
    const on = ctx.settings.autoQuarantineHighRisk;
    status.textContent = on ? "You're protected" : "Scam protection is off";
    statusSub.textContent = on
      ? "Cluster checks your email for scams and moves them away from your inbox."
      : "Turn it on in Scams, or ask the person who set this up for you.";
  }
  const heldSub = $("simple-held-sub");
  if (heldSub) {
    heldSub.textContent =
      held > 0
        ? "You don't need to do anything. Look only if you were expecting something."
        : warned > 0
          ? "Look before you reply, click a link or pay anyone."
          : "Cluster keeps checking. You don't need to do anything.";
  }
  const see = $("simple-see-scams");
  if (see) see.hidden = held === 0 && warned === 0;
  const heldText = $("simple-held");
  if (heldText) {
    heldText.textContent =
      held > 0
        ? `${held} email${held === 1 ? "" : "s"} looked like scams. Cluster moved ${held === 1 ? "it" : "them"} away from your inbox.`
        : warned > 0
          ? `${warned} sender${warned === 1 ? "" : "s"} might not be who they say. Have a look before you reply or pay.`
          : "Nothing looks like a scam right now.";
  }
}

function showSetupPreview(persona: Persona): void {
  const list = $("setup-list");
  const preview = $("setup-preview");
  if (!list || !preview) return;
  list.replaceChildren(
    ...PERSONAS[persona].changes.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    }),
  );
  preview.hidden = false;
}

async function applyPersona(persona: Persona, select: (screen: string) => Promise<void>): Promise<void> {
  const plan = PERSONAS[persona];
  const patch: Partial<ClusterSettings> = { persona, setupDone: true };
  if (plan.holdScams) patch.autoQuarantineHighRisk = true;
  if (plan.simpleMode) patch.simpleMode = true;
  ctx.settings = await updateSettings(patch);
  const quarantine = $<HTMLInputElement>("auto-quarantine-toggle");
  if (quarantine && plan.holdScams) quarantine.checked = true;
  if (plan.simpleMode) applySimpleMode(true);
  renderSettingsSetup();
  if (plan.hours) {
    await select("organize");
    proposeTimeLimits(plan.hours, `Suggested by your setup ("${plan.title}"). Press Save to apply it to Gmail.`);
    document.getElementById("time-limits-section")?.scrollIntoView({ block: "start" });
  } else {
    await select(plan.simpleMode ? "simple" : "overview");
  }
}

export function wireSetup(select: (screen: string) => Promise<void>): void {
  let chosen: Persona | null = null;
  for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-persona]"))) {
    btn.onclick = () => {
      chosen = btn.dataset.persona as Persona;
      for (const other of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-persona]"))) {
        other.setAttribute("aria-pressed", String(other === btn));
      }
      showSetupPreview(chosen);
    };
  }
  const go = $<HTMLButtonElement>("setup-go");
  if (go) {
    go.onclick = async () => {
      if (!chosen) return;
      go.disabled = true;
      try {
        await applyPersona(chosen, select);
      } finally {
        go.disabled = false;
      }
    };
  }
  const skip = async () => {
    ctx.settings = await updateSettings({ setupDone: true });
    renderSettingsSetup();
  };
  const notNow = $<HTMLButtonElement>("setup-not-now");
  if (notNow) notNow.onclick = async () => {
    await skip();
    await select("overview");
  };
  const bannerStart = $<HTMLButtonElement>("setup-banner-start");
  if (bannerStart) bannerStart.onclick = () => void select("setup");
  const bannerDismiss = $<HTMLButtonElement>("setup-banner-dismiss");
  if (bannerDismiss) bannerDismiss.onclick = () => void skip();
  const change = $<HTMLButtonElement>("settings-change-setup");
  if (change) change.onclick = () => void select("setup");

  const simpleToggle = $<HTMLInputElement>("simple-mode-toggle");
  if (simpleToggle) {
    simpleToggle.onchange = async () => {
      ctx.settings = await updateSettings({ simpleMode: simpleToggle.checked });
      applySimpleMode(simpleToggle.checked);
    };
  }
  const simpleOff = $<HTMLButtonElement>("simple-off");
  if (simpleOff) {
    simpleOff.onclick = async () => {
      ctx.settings = await updateSettings({ simpleMode: false });
      applySimpleMode(false);
      await select("overview");
    };
  }
  const seeHeld = $<HTMLButtonElement>("simple-see-scams");
  if (seeHeld) seeHeld.onclick = () => void select("impersonation");
}
