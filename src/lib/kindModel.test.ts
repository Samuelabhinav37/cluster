import { describe, expect, it } from "vitest";
import { many, senders } from "../test/mailFixtures";
import {
  answer,
  emptyKindModel,
  markLearnedTransactional,
  normalizeKindModel,
  receiptChance,
  sendersToAsk,
  subjectWords,
} from "./kindModel";
import { protectionDecision } from "./protectionPolicy";

const SALT = "00112233aabbccdd";
// Store mail that the fixed rules miss ("confirmed", no "order"/"receipt").
const storeMail = (n: number) => many(4, { fromAddress: `hello@store${n}.example`, subject: `Booking ref #${n}12 confirmed for you` });
const promoMail = (n: number) =>
  many(4, { fromAddress: `deals@promo${n}.example`, subject: `Flash sale ${n}0% off everything`, gmailPromotion: true });

describe("kind model", () => {
  it("reads subject words as skeletons, numbers folded, look-alikes mapped", () => {
    expect(subjectWords("Rеf #4411 confirmed — Ref 12")).toEqual(["ref", "##", "conflrrned"]);
  });

  it("has no opinion before any answers and flags nothing", async () => {
    const list = await senders(storeMail(1));
    const model = emptyKindModel(SALT);
    expect(receiptChance(model, list[0].messages[0], list[0].address)).toBeCloseTo(0.5);
    markLearnedTransactional(list, model);
    expect(list[0].messages.some((m) => m.learnedTransactional)).toBe(false);
  });

  it("a yes keeps that sender's mail; a no never removes protection", async () => {
    const list = await senders([...storeMail(1), ...promoMail(1)]);
    const [store, promo] = [list.find((s) => s.address.includes("store"))!, list.find((s) => s.address.includes("promo"))!];
    let model = answer(emptyKindModel(SALT), store, "yes");
    model = answer(model, promo, "no");
    markLearnedTransactional(list, model);
    expect(store.messages.every((m) => m.learnedTransactional === "you")).toBe(true);
    expect(promo.messages.some((m) => m.learnedTransactional)).toBe(false);
    expect(protectionDecision(store.messages[0], store.address)).toEqual({ protected: true, reason: "learned-transactional" });
  });

  it("once trained, protects a new store's mail it is sure about, not promos", async () => {
    const trainedOn = await senders([1, 2, 3].flatMap((n) => [...storeMail(n), ...promoMail(n)]));
    let model = emptyKindModel(SALT);
    for (const s of trainedOn) model = answer(model, s, s.address.includes("store") ? "yes" : "no");
    const fresh = await senders([...storeMail(9), ...promoMail(9)]);
    markLearnedTransactional(fresh, model);
    const store = fresh.find((s) => s.address.includes("store"))!;
    const promo = fresh.find((s) => s.address.includes("promo"))!;
    expect(store.messages.every((m) => m.learnedTransactional === "model")).toBe(true);
    expect(promo.messages.some((m) => m.learnedTransactional)).toBe(false);
    // A guess from subject words never shields mail from the spam check.
    expect(protectionDecision(store.messages[0], store.address, undefined, { contentHeuristics: false }).protected).toBe(
      false,
    );
  });

  it("asks about at most three unanswered, unflagged senders, never mostly-promotions ones", async () => {
    const list = await senders([1, 2, 3].flatMap((n) => [...promoMail(n), ...storeMail(n)]));
    const model = { ...emptyKindModel(SALT), answers: { "gmail:hello@store1.example": "no" as const } };
    const asked = sendersToAsk(model, list);
    expect(asked.map((s) => s.address)).toEqual(["hello@store2.example", "hello@store3.example"]);
  });

  it("loads a stored model, and starts fresh on anything odd", () => {
    const model = { ...emptyKindModel(SALT), yes: 1, answers: { "gmail:a@x": "yes" as const }, yesBy: { "w:1": 1 } };
    expect(normalizeKindModel(JSON.parse(JSON.stringify(model)))).toEqual(model);
    expect(normalizeKindModel({ ...model, salt: "short" }).yes).toBe(0);
    expect(normalizeKindModel({ ...model, answers: { a: "maybe" } }).answers).toEqual({});
  });
});
