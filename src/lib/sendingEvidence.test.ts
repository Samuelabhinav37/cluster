import { describe, expect, it } from "vitest";
import { sendingEvidence } from "./sendingEvidence";

describe("sendingEvidence", () => {
  it("a sending service shows in Return-Path, Message-ID or Feedback-ID", () => {
    expect(sendingEvidence({ fromAddress: "hello@shop.example", returnPathDomain: "bounces.sendgrid.net" })).toBe("service");
    expect(sendingEvidence({ fromAddress: "hello@shop.example", returnPathDomain: "bounce.shop.example", messageIdHeader: "<abc@email.amazonses.com>" })).toBe("service");
    expect(sendingEvidence({ fromAddress: "hello@shop.example", feedbackId: "1:shop" })).toBe("service");
  });

  it("a person's mail app with their own Return-Path is a person", () => {
    expect(sendingEvidence({ fromAddress: "maya.lee@gmail.com", returnPathDomain: "gmail.com", messageIdHeader: "<CA+x1@mail.gmail.com>" })).toBe("person-app");
    expect(sendingEvidence({ fromAddress: "jo@newco.example", messageIdHeader: "<a@PH0PR12MB7082.namprd12.prod.outlook.com>" })).toBe("person-app");
  });

  it("says nothing when the headers don't tell", () => {
    expect(sendingEvidence({ fromAddress: "mcinfo@ups.com", returnPathDomain: "ups.com", messageIdHeader: "<1@ups.com>" })).toBe(undefined);
    expect(sendingEvidence({ fromAddress: "maya@gmail.com" })).toBe(undefined);
  });
});
