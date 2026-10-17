// The confirmation sheet for unsubscribe emails. Cluster never sends mail in
// the user's name unseen: the sheet lists every email it would send, with
// From, To, Subject and Body, and nothing goes until the user presses Send.
// The Chrome Web Store requires this, and RFC 6068 asks the same of any
// client that sends from a mailto link. Senders the safety gate refuses are
// listed under "Needs you" with the reason and a way to finish by hand.
import { listSendAs, type SendAsIdentity } from "../lib/gmailApi";
import { isFreeMailDomain } from "../lib/freeMail";
import { log } from "../lib/log";
import { checkMailtoUnsubscribe, MAILTO_REFUSAL_TEXT } from "../lib/mailtoGate";
import { gmailProvider } from "../lib/providers/gmailProvider";
import type { SenderSummary } from "../lib/senderModel";
import { gmailQueueDeps } from "../lib/unsubscribeGmail";
import { IDENTITY_QUESTION, pickUnsubscribeIdentity } from "../lib/unsubscribeIdentity";
import { unsubscribeMailFor, type UnsubscribeMail } from "../lib/unsubscribeMail";
import { enqueueUnsubscribeMails, runUnsubscribeQueue, type QueueItem } from "../lib/unsubscribeQueue";
import { logAction } from "./state";
import { recordUnsubscribeRequests } from "./unsubscribeRecord";

interface ReadyRow {
  sender: SenderSummary;
  mail: UnsubscribeMail;
  question?: string;
}

interface NeedsYouRow {
  sender: SenderSummary;
  why: string;
  link?: { href: string; text: string };
}

function newestMessageId(sender: SenderSummary): string | undefined {
  let best = sender.messages[0];
  for (const m of sender.messages) if (m.receivedAt > (best?.receivedAt ?? 0)) best = m;
  return best?.id;
}

function senderName(sender: SenderSummary): string {
  return sender.displayName || sender.address;
}

/** A Gmail compose window prefilled with the email, for the user to send. */
export function gmailComposeUrl(mail: UnsubscribeMail): string {
  const params = new URLSearchParams({ view: "cm", fs: "1", to: mail.to, su: mail.subject, body: mail.body });
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(mail.from)}&${params}`;
}

async function prepare(senders: SenderSummary[]): Promise<{ ready: ReadyRow[]; needsYou: NeedsYouRow[] }> {
  const ready: ReadyRow[] = [];
  const needsYou: NeedsYouRow[] = [];
  const gmail = senders.filter((s) => s.provider === "gmail");
  for (const sender of senders.filter((s) => s.provider !== "gmail")) {
    needsYou.push({
      sender,
      why: "Cluster can't send email from this account yet.",
      link: sender.unsubscribe.mailto ? { href: sender.unsubscribe.mailto, text: "Write the email" } : undefined,
    });
  }
  if (gmail.length === 0) return { ready, needsYou };

  const token = await gmailProvider.getAuthToken(false);
  const identities: SendAsIdentity[] = await listSendAs(token);
  const own = identities.map((i) => i.address);
  for (const sender of gmail) {
    const page = sender.unsubscribe.httpUrl ? { href: sender.unsubscribe.httpUrl, text: "Open their page" } : undefined;
    const id = newestMessageId(sender);
    try {
      if (!id) throw new Error("no message");
      const details = await gmailProvider.getUnsubscribeDetails!(token, id);
      const gate = checkMailtoUnsubscribe("gmail", details, own, isFreeMailDomain);
      if (!gate.ok) {
        needsYou.push({ sender, why: MAILTO_REFUSAL_TEXT[gate.reason], link: page });
        continue;
      }
      const identity = pickUnsubscribeIdentity(details.deliveredTo, identities);
      const mail = identity && unsubscribeMailFor(identity.from, gate.parts);
      if (!identity || !mail) {
        needsYou.push({ sender, why: "Their unsubscribe email is longer than Cluster will send.", link: page });
        continue;
      }
      ready.push({ sender, mail, question: identity.sure ? undefined : IDENTITY_QUESTION[identity.why] });
    } catch (err) {
      log.error("Could not prepare an unsubscribe email", err);
      needsYou.push({ sender, why: "Cluster couldn't read their latest email.", link: page });
    }
  }
  return { ready, needsYou };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function field(label: string, value: string): HTMLElement {
  const row = el("div", "unsub-field");
  row.append(el("span", "unsub-field-label", label), el("span", "unsub-field-value", value || "(empty)"));
  return row;
}

function linkTo(href: string, text: string): HTMLAnchorElement {
  const a = el("a", "btn btn-sm", text);
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

function renderNeedsYou(list: HTMLElement, rows: NeedsYouRow[]) {
  if (rows.length === 0) return;
  list.append(el("h3", "unsub-section", "Needs you"));
  for (const row of rows) {
    const item = el("div", "unsub-item");
    const text = el("div", "unsub-item-text");
    text.append(el("div", "unsub-item-name", senderName(row.sender)), el("div", "row-sub", row.why));
    item.appendChild(text);
    if (row.link) item.appendChild(linkTo(row.link.href, row.link.text));
    list.appendChild(item);
  }
}

/** Sends what was ticked and returns the summary line for the sheet. */
async function send(rows: ReadyRow[]): Promise<{ summary: string; fallback: QueueItem[] }> {
  await enqueueUnsubscribeMails(rows.map((r) => ({ ...r.mail, provider: "gmail", senderKey: r.sender.key })));
  const run = await runUnsubscribeQueue(gmailQueueDeps());
  const byKey = new Map(rows.map((r) => [r.sender.key, r.sender]));
  const sentSenders = run.sent.map((i) => byKey.get(i.senderKey)).filter((s): s is SenderSummary => Boolean(s));
  await recordUnsubscribeRequests(
    sentSenders,
    "mailto",
    Object.fromEntries(run.sent.map((i) => [i.senderKey, { from: i.from, sentMessageId: i.sentMessageId }])),
  );
  if (run.sent.length > 0) {
    await logAction(
      "unsubscribe",
      `Sent ${run.sent.length} unsubscribe email${run.sent.length === 1 ? "" : "s"}`,
    );
  }
  const parts = [`Sent ${run.sent.length}. They're in your Sent folder.`];
  if (run.sent.length > 0) parts.push("Most senders stop within 2 days. The law allows up to 10 business days.");
  if (run.failed.length > 0) parts.push(`${run.failed.length} didn't send.`);
  if (run.stopped === "limit") parts.push("Gmail paused sending for now. Cluster will finish the rest later.");
  if (run.stopped === "busy") parts.push("Another send is still running. Cluster will finish these after it.");
  const queuedLeft = rows.length - run.sent.length - run.failed.length - run.fallback.length;
  if (run.stopped === undefined && queuedLeft > 0) parts.push(`${queuedLeft} more will go out shortly.`);
  return { summary: parts.join(" "), fallback: run.fallback };
}

/**
 * Opens the sheet for senders whose unsubscribe is by email. `onDone` runs
 * after the sheet closes, so the caller can refresh its screen.
 */
export async function openUnsubscribeSheet(senders: SenderSummary[], onDone?: () => void): Promise<void> {
  const dialog = el("dialog", "unsub-sheet");
  dialog.setAttribute("aria-labelledby", "unsub-sheet-title");
  const title = el("h2", "unsub-title", "Unsubscribe by email");
  title.id = "unsub-sheet-title";
  const lead = el("p", "lead", "Checking each sender…");
  const list = el("div", "unsub-list");
  const footer = el("div", "unsub-footer");
  const cancel = el("button", "btn", "Cancel");
  cancel.type = "button";
  footer.appendChild(cancel);
  dialog.append(title, lead, list, footer);
  document.body.appendChild(dialog);
  const close = () => {
    if (dialog.open) dialog.close?.();
    dialog.remove();
    onDone?.();
  };
  cancel.onclick = close;
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");

  let prepared: Awaited<ReturnType<typeof prepare>>;
  try {
    prepared = await prepare(senders);
  } catch (err) {
    log.error("Could not prepare unsubscribe emails", err);
    lead.textContent = "Cluster couldn't check these senders. Try again in a moment.";
    return;
  }
  const { ready, needsYou } = prepared;
  lead.textContent =
    ready.length > 0
      ? "Cluster will send these from your account. They will show in Sent."
      : "Cluster can't send any of these for you.";

  const ticked = new Set(ready.map((_, i) => i));
  const sendBtn = el("button", "btn-accent-solid");
  sendBtn.type = "button";
  const updateSend = () => {
    sendBtn.textContent = `Send ${ticked.size} email${ticked.size === 1 ? "" : "s"}`;
    sendBtn.disabled = ticked.size === 0;
  };

  ready.forEach((row, i) => {
    const item = el("label", "unsub-item unsub-mail");
    const box = el("input");
    box.type = "checkbox";
    box.checked = true;
    box.onchange = () => {
      if (box.checked) ticked.add(i);
      else ticked.delete(i);
      updateSend();
    };
    const body = el("div", "unsub-item-text");
    body.append(
      el("div", "unsub-item-name", senderName(row.sender)),
      field("From", row.mail.from),
      field("To", row.mail.to),
      field("Subject", row.mail.subject),
      field("Body", row.mail.body),
    );
    if (row.question) body.appendChild(el("div", "row-sub unsub-question", row.question));
    item.append(box, body);
    list.appendChild(item);
  });
  renderNeedsYou(list, needsYou);

  if (ready.length === 0) return;
  updateSend();
  footer.appendChild(sendBtn);
  sendBtn.onclick = async () => {
    const chosen = ready.filter((_, i) => ticked.has(i));
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending…";
    list.querySelectorAll("input").forEach((box) => (box.disabled = true));
    try {
      const { summary, fallback } = await send(chosen);
      lead.textContent = summary;
      list.innerHTML = "";
      if (fallback.length > 0) {
        list.append(el("h3", "unsub-section", "Send these yourself"));
        list.append(el("p", "row-sub", "Your account doesn't let apps send mail. Each opens ready to send."));
        for (const item of fallback) {
          const row = el("div", "unsub-item");
          row.append(el("div", "unsub-item-name", item.to), linkTo(gmailComposeUrl(item), "Open in Gmail"));
          list.appendChild(row);
        }
      }
    } catch (err) {
      log.error("Sending unsubscribe emails failed", err);
      lead.textContent = "Sending failed. Nothing was lost, and you can try again.";
    }
    sendBtn.remove();
    cancel.textContent = "Done";
  };
}
