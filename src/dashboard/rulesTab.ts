// Rules tab (Auto Clean): the standing-rule list, the natural-language draft
// box, the add-rule form, the manual dry run, and "Apply enabled rules now".
import { log } from "../lib/log";
import { getSettings, updateSettings } from "../lib/settingsStore";
import {
  describeRule,
  DEFAULT_RULE_MAX_MESSAGES_PER_RUN,
  findRuleConflicts,
  MAX_RULE_MAX_MESSAGES_PER_RUN,
  ruleGuardWarning,
  ruleHasConditions,
  ruleRunLimit,
  type ClusterRule,
  type RuleAction,
  type RuleConditions,
} from "../lib/rules";
import { applyRules, previewRuleMatches } from "../lib/ruleRunner";
import { buildRuleDryRunReport, describeActionSupport } from "../lib/ruleDryRun";
import { recordRuleCompletions } from "../lib/ruleCompletionLedger";
import { draftRuleFromNaturalLanguage } from "../lib/aiRuleDraft";
import type { MessageKind } from "../lib/messageKind";
import { renderConfirmStep } from "./ui";
import { ctx, providerById, rescan } from "./state";
import { renderRecentTab } from "./recentTab";

const rulesListEl = document.getElementById("rules-list") as HTMLDivElement;
const rulePreviewEl = document.getElementById("rule-preview") as HTMLDivElement;
const ruleForm = document.getElementById("rule-form") as HTMLFormElement;
const ruleNameInput = document.getElementById("rule-name") as HTMLInputElement;
const ruleFromDomainInput = document.getElementById("rule-from-domain") as HTMLInputElement;
const ruleFromAddressInput = document.getElementById("rule-from-address") as HTMLInputElement;
const ruleExceptDomainInput = document.getElementById("rule-except-domain") as HTMLInputElement;
const ruleExceptAddressInput = document.getElementById("rule-except-address") as HTMLInputElement;
const ruleOlderDaysInput = document.getElementById("rule-older-days") as HTMLInputElement;
const ruleKindSel = document.getElementById("rule-kind") as HTMLSelectElement;
const ruleUnsubSel = document.getElementById("rule-unsub") as HTMLSelectElement;
const ruleUnreadSel = document.getElementById("rule-unread") as HTMLSelectElement;
const ruleActionSel = document.getElementById("rule-action") as HTMLSelectElement;
const ruleLabelInput = document.getElementById("rule-label") as HTMLInputElement;
const rulePriorityInput = document.getElementById("rule-priority") as HTMLInputElement;
const ruleLimitInput = document.getElementById("rule-limit") as HTMLInputElement;
const ruleStopProcessingInput = document.getElementById("rule-stop-processing") as HTMLInputElement;
const ruleFormError = document.getElementById("rule-form-error") as HTMLSpanElement;
const ruleApplySlot = document.getElementById("rule-apply-slot") as HTMLDivElement;
const ruleApplyBtn = document.getElementById("rule-apply-btn") as HTMLButtonElement;
const ruleNaturalLanguageInput = document.getElementById("rule-natural-language") as HTMLInputElement;
const ruleDraftBtn = document.getElementById("rule-draft-btn") as HTMLButtonElement;
const ruleSaveDraftBtn = document.getElementById("rule-save-draft-btn") as HTMLButtonElement;
const ruleDraftStatus = document.getElementById("rule-draft-status") as HTMLSpanElement;
let pendingRuleDraft: ClusterRule | undefined;

export function renderRulesTab() {
  rulesListEl.innerHTML = "";
  renderRuleDryRun();
  if (ctx.settings.rules.length === 0) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "No rules yet — add one below.";
    rulesListEl.appendChild(p);
    return;
  }
  const list = document.createElement("div");
  list.className = "grouped-list";
  ctx.settings.rules.forEach((rule, i) => {
    if (i > 0) {
      const sep = document.createElement("div");
      sep.className = "row-sep";
      sep.style.marginLeft = "18px";
      list.appendChild(sep);
    }

    const row = document.createElement("div");
    row.className = "list-row";
    row.style.gridTemplateColumns = "minmax(0,1fr) max-content";

    const text = document.createElement("div");
    text.className = "row-title-wrap";
    const name = document.createElement("div");
    name.className = "row-title";
    name.style.whiteSpace = "normal";
    name.textContent = rule.name;
    const desc = document.createElement("div");
    desc.className = "row-sub wrap";
    desc.textContent = describeRule(rule);
    const stat = document.createElement("div");
    stat.className = "recent-detail";
    stat.textContent = `priority ${rule.priority ?? 0} · limit ${ruleRunLimit(rule)}/run${
      rule.stopProcessing ? " · stops later rules" : ""
    }`;
    text.append(name, desc, stat);

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-sm";
    editBtn.textContent = "Edit";
    editBtn.onclick = () => {
      document.getElementById("rule-form-details")?.setAttribute("open", "");
      ruleNameInput.value = rule.name;
      ruleFromDomainInput.value = rule.conditions.fromDomain ?? "";
      ruleFromAddressInput.value = rule.conditions.fromAddress ?? "";
      ruleOlderDaysInput.value = rule.conditions.olderThanDays ? String(rule.conditions.olderThanDays) : "";
      ruleActionSel.value = rule.action;
      ruleLabelInput.hidden = rule.action !== "label";
      ruleLabelInput.value = rule.labelName ?? "";
      document.getElementById("rule-form-details")?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const del = document.createElement("button");
    del.className = "btn btn-sm danger";
    del.textContent = "Delete";
    del.onclick = async () => {
      ctx.settings = await updateSettings({
        rules: ctx.settings.rules.filter((r) => r.id !== rule.id),
      });
      renderRulesTab();
    };

    const sw = document.createElement("button");
    sw.className = "switch";
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-checked", String(rule.enabled));
    sw.setAttribute("aria-label", `${rule.enabled ? "Disable" : "Enable"} ${rule.name}`);
    sw.innerHTML = "<span></span>";
    sw.onclick = async () => {
      const next = sw.getAttribute("aria-checked") !== "true";
      sw.setAttribute("aria-checked", String(next));
      ctx.settings = await updateSettings({
        rules: ctx.settings.rules.map((r) => (r.id === rule.id ? { ...r, enabled: next } : r)),
      });
      renderRulesTab();
    };

    actions.append(editBtn, del, sw);
    row.append(text, actions);
    list.appendChild(row);
  });
  rulesListEl.appendChild(list);
}

function renderRuleDryRun() {
  rulePreviewEl.innerHTML = "";
  const enabledRules = ctx.settings.rules.filter((rule) => rule.enabled);
  if (enabledRules.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Enable a rule to see its dry run.";
    rulePreviewEl.appendChild(empty);
    return;
  }
  if (ctx.senders.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "The dry run will appear after the current metadata scan finishes.";
    rulePreviewEl.appendChild(empty);
    return;
  }

  const report = buildRuleDryRunReport(ctx.settings.rules, ctx.senders, providerById);
  const heading = document.createElement("h3");
  heading.textContent = "Current manual dry run";
  const summary = document.createElement("p");
  summary.className = "hint";
  summary.textContent = `${report.predictedRuleApplicationCount} predicted rule application${report.predictedRuleApplicationCount === 1 ? "" : "s"} touching ${report.uniqueMatchedMessageCount} unique message${report.uniqueMatchedMessageCount === 1 ? "" : "s"}; ${report.deferredByLimitCount} deferred by per-rule limits, ${report.overlapMessageCount} overlap${report.overlapMessageCount === 1 ? "" : "s"}, ${report.protectedExclusionCount} protected exclusion${report.protectedExclusionCount === 1 ? "" : "s"}, ${report.exceptionExclusionCount} rule-exception exclusion${report.exceptionExclusionCount === 1 ? "" : "s"}. Assumes supported provider calls succeed; no API call is made. This previews the confirmed manual override, so background completion receipts do not reduce these counts.`;
  rulePreviewEl.append(heading, summary);

  for (const impact of report.impacts) {
    const details = document.createElement("details");
    details.className = "rule-preview-row";
    const title = document.createElement("summary");
    title.textContent = `${impact.rule.name} — ${impact.actionableMessageCount} predicted action${impact.actionableMessageCount === 1 ? "" : "s"} across ${impact.senders.length} sender${impact.senders.length === 1 ? "" : "s"}`;
    details.appendChild(title);

    const explanation = document.createElement("p");
    explanation.className = "hint";
    const notes: string[] = [];
    if (impact.overlapCount > 0) notes.push(`${impact.overlapCount} also match an earlier-priority rule`);
    if (impact.stoppedByEarlierRuleCount > 0) {
      notes.push(`${impact.stoppedByEarlierRuleCount} stopped by an earlier rule`);
    }
    if (impact.blockedByEarlierLimitCount > 0) {
      notes.push(`${impact.blockedByEarlierLimitCount} blocked by an earlier safety limit`);
    }
    if (impact.deferredByLimitCount > 0) {
      notes.push(
        `${impact.deferredByLimitCount} deferred at the ${ruleRunLimit(impact.rule)}-message safety limit`,
      );
    }
    if (impact.protectedExcludedCount > 0) {
      notes.push(`${impact.protectedExcludedCount} starred/flagged excluded`);
    }
    if (impact.exceptionExcludedCount > 0) notes.push(`${impact.exceptionExcludedCount} exception excluded`);
    explanation.textContent = notes.length > 0 ? notes.join(" · ") : "No overlaps or safety exclusions.";
    details.appendChild(explanation);

    const providerList = document.createElement("ul");
    for (const provider of impact.providers) {
      const item = document.createElement("li");
      const support = provider.actions.map(describeActionSupport).join(" → ");
      item.textContent = `${provider.provider}: ${provider.eligibleMessageCount} eligible · ${support} · ${provider.completion}`;
      providerList.appendChild(item);
    }
    if (impact.providers.length === 0) {
      const item = document.createElement("li");
      item.textContent = "No effective matches after priority and stop-processing.";
      providerList.appendChild(item);
    }
    details.appendChild(providerList);

    const senderList = document.createElement("p");
    senderList.className = "hint";
    const shown = impact.senders.slice(0, 10).map((sender) => {
      const name = sender.displayName ? `${sender.displayName} <${sender.address}>` : sender.address;
      return `${name} (${sender.eligibleMessageCount})`;
    });
    senderList.textContent = shown.length
      ? `Senders: ${shown.join(", ")}${impact.senders.length > shown.length ? `, +${impact.senders.length - shown.length} more` : ""}`
      : "No sender remains eligible for this rule.";
    details.appendChild(senderList);
    rulePreviewEl.appendChild(details);
  }
}

function collectRuleConditions(): RuleConditions {
  const c: RuleConditions = {};
  if (ruleFromDomainInput.value.trim()) c.fromDomain = ruleFromDomainInput.value.trim().toLowerCase();
  if (ruleFromAddressInput.value.trim()) c.fromAddress = ruleFromAddressInput.value.trim().toLowerCase();
  if (ruleOlderDaysInput.value) c.olderThanDays = Math.max(1, Number(ruleOlderDaysInput.value));
  if (ruleKindSel.value) c.kind = ruleKindSel.value as MessageKind;
  if (ruleUnsubSel.value) c.hasUnsubscribe = ruleUnsubSel.value === "yes";
  if (ruleUnreadSel.value) c.unread = ruleUnreadSel.value === "yes";
  return c;
}

function collectRuleExceptions(): RuleConditions | undefined {
  const exceptions: RuleConditions = {};
  if (ruleExceptDomainInput.value.trim()) {
    exceptions.fromDomain = ruleExceptDomainInput.value.trim().toLowerCase();
  }
  if (ruleExceptAddressInput.value.trim()) {
    exceptions.fromAddress = ruleExceptAddressInput.value.trim().toLowerCase();
  }
  return ruleHasConditions(exceptions) ? exceptions : undefined;
}

function resetRuleApplySlot() {
  ruleApplySlot.innerHTML = "";
  ruleApplySlot.appendChild(ruleApplyBtn);
}

const RULE_EXAMPLES = [
  "Mute anything I haven't opened in a year",
  "Archive unread newsletters older than 14 days",
  "Trash one-time codes after 2 days",
];

export function wireRulesTab() {
  const chipHost = document.getElementById("rule-example-chips");
  if (chipHost && chipHost.childElementCount === 0) {
    for (const example of RULE_EXAMPLES) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = example;
      chip.onclick = () => {
        ruleNaturalLanguageInput.value = example;
        ruleNaturalLanguageInput.focus();
      };
      chipHost.appendChild(chip);
    }
  }

  ruleActionSel.onchange = () => {
    ruleLabelInput.hidden = ruleActionSel.value !== "label";
  };

  ruleForm.onsubmit = async (e) => {
    e.preventDefault();
    ruleFormError.textContent = "";
    const conditions = collectRuleConditions();
    if (!ruleHasConditions(conditions)) {
      ruleFormError.textContent = "Add at least one condition.";
      return;
    }
    const action = ruleActionSel.value as RuleAction;
    const labelName = action === "label" ? ruleLabelInput.value.trim() : undefined;
    if (action === "label" && !labelName) {
      ruleFormError.textContent = "A label action needs a label name.";
      return;
    }
    const rule: ClusterRule = {
      id: crypto.randomUUID(),
      name: ruleNameInput.value.trim() || "Untitled rule",
      enabled: true,
      conditions,
      exceptions: collectRuleExceptions(),
      priority: Math.max(-100, Math.min(100, Number(rulePriorityInput.value) || 0)),
      maxMessagesPerRun: Math.max(
        1,
        Math.min(
          MAX_RULE_MAX_MESSAGES_PER_RUN,
          Number(ruleLimitInput.value) || DEFAULT_RULE_MAX_MESSAGES_PER_RUN,
        ),
      ),
      stopProcessing: ruleStopProcessingInput.checked,
      action,
      labelName,
    };
    const broad = ruleGuardWarning(rule);
    if (broad) {
      ruleFormError.textContent = broad;
      return;
    }
    ctx.settings = await updateSettings({ rules: [...ctx.settings.rules, rule] });
    ruleForm.reset();
    rulePriorityInput.value = "0";
    ruleLimitInput.value = String(DEFAULT_RULE_MAX_MESSAGES_PER_RUN);
    ruleLabelInput.hidden = true;
    renderRulesTab();
  };

  ruleDraftBtn.onclick = async () => {
    ruleDraftBtn.disabled = true;
    ruleSaveDraftBtn.disabled = true;
    ruleDraftStatus.textContent = "Drafting locally…";
    pendingRuleDraft = undefined;
    try {
      const draft = await draftRuleFromNaturalLanguage(ruleNaturalLanguageInput.value);
      pendingRuleDraft = draft.rule;
      const reviewRule = { ...draft.rule, enabled: true };
      const matches = previewRuleMatches([reviewRule], ctx.senders);
      const conflicts = findRuleConflicts([...ctx.settings.rules, reviewRule], ctx.senders).filter(
        (conflict) => conflict.ruleIds.includes(reviewRule.id),
      ).length;
      ruleDraftStatus.textContent = `${draft.source === "on-device-ai" ? "On-device AI" : "Deterministic fallback"}: ${describeRule(reviewRule)}. Current preview: ${matches} match${matches === 1 ? "" : "es"}${conflicts > 0 ? `, ${conflicts} overlap${conflicts === 1 ? "" : "s"}` : ""}.`;
      ruleSaveDraftBtn.disabled = false;
    } catch (error) {
      ruleDraftStatus.textContent = error instanceof Error ? error.message : "Could not draft that rule";
    } finally {
      ruleDraftBtn.disabled = false;
    }
  };

  ruleSaveDraftBtn.onclick = async () => {
    if (!pendingRuleDraft) return;
    const broad = ruleGuardWarning({ ...pendingRuleDraft, enabled: true });
    if (broad) {
      ruleDraftStatus.textContent = broad;
      return;
    }
    ctx.settings = await updateSettings({
      rules: [...ctx.settings.rules, { ...pendingRuleDraft, enabled: true }],
    });
    pendingRuleDraft = undefined;
    ruleSaveDraftBtn.disabled = true;
    ruleNaturalLanguageInput.value = "";
    ruleDraftStatus.textContent =
      "Reviewed draft saved and enabled. It can run when you apply rules or during the background sweep.";
    renderRulesTab();
  };

  ruleApplyBtn.onclick = () => {
    const enabled = ctx.settings.rules.filter((r) => r.enabled);
    if (enabled.length === 0) {
      ruleFormError.textContent = "No enabled rules to apply.";
      return;
    }
    const dryRun = buildRuleDryRunReport(ctx.settings.rules, ctx.senders, providerById);
    renderConfirmStep(
      ruleApplySlot,
      resetRuleApplySlot,
      `Apply ${enabled.length} rule${enabled.length === 1 ? "" : "s"} for ${dryRun.predictedRuleApplicationCount} predicted rule application${dryRun.predictedRuleApplicationCount === 1 ? "" : "s"} touching ${dryRun.uniqueMatchedMessageCount} unique message${dryRun.uniqueMatchedMessageCount === 1 ? "" : "s"}?${dryRun.overlapMessageCount > 0 ? ` ${dryRun.overlapMessageCount} message${dryRun.overlapMessageCount === 1 ? " matches" : "s match"} multiple rules; priority and stop-processing decide the order.` : ""}`,
      false,
      async () => {
        const results = await applyRules(ctx.settings.rules, ctx.senders, providerById);
        await recordRuleCompletions(
          results.map((result) => ({
            rule: result.rule,
            idsByProvider: result.completedIdsByProvider,
          })),
        ).catch((error) => log.error("Could not record manual rule completions", error));
        ctx.settings = await getSettings();
        renderRecentTab();
        const moved = results.reduce(
          (sum, r) => sum + [...r.movedByProvider.values()].reduce((a, b) => a + b, 0),
          0,
        );
        const deferred = results.reduce((sum, result) => sum + result.deferredByLimitCount, 0);
        await rescan();
        return `Applied — ${moved} message${moved === 1 ? "" : "s"} actioned${deferred > 0 ? `, ${deferred} deferred by safety limits` : ""}`;
      },
    );
  };
}
