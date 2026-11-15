import { describe, expect, it } from "vitest";
import { markCampaigns, nameInAddress, subjectTemplate } from "./campaigns";
import type { SenderSummary } from "./senderModel";

const sender = (address: string, displayName: string, subject: string): SenderSummary =>
  ({ address, displayName, threatSignals: [], messages: [{ id: `${address}:1`, subject, kind: "other" }] }) as unknown as SenderSummary;

describe("markCampaigns", () => {
  it("marks one long subject from three strangers on free mail", () => {
    const run = ["omar520@gmail.com", "lena263@outlook.com", "wei8@gmail.com"].map((a) => sender(a, "Anonymous", "Your device was compromised. Read this message carefully"));
    expect(markCampaigns(run, new Set())).toBe(3);
    expect(run[0].threatSignals[0]).toMatchObject({ kind: "campaign", messageIds: ["omar520@gmail.com:1"] });
  });

  it("leaves friends whose names are in their address, short subjects, replies, contacts and companies", () => {
    const friends = ["lena.khan@gmail.com", "maya.lee@gmail.com", "wei.patel@gmail.com"].map((a) => sender(a, a.split(".")[0], "ski trip plan for this weekend ok"));
    const short = ["a1@gmail.com", "b2@gmail.com", "c3@gmail.com"].map((a) => sender(a, "X", "happy birthday!"));
    const replies = ["a4@gmail.com", "b5@gmail.com", "c6@gmail.com"].map((a) => sender(a, "X", "Re: your device was compromised read this now"));
    const known = ["k1@gmail.com", "k2@gmail.com", "k3@gmail.com"].map((a) => sender(a, "X", "your device was compromised read this now"));
    const company = ["n1@shop.example", "n2@shop.example", "n3@shop.example"].map((a) => sender(a, "X", "your device was compromised read this now"));
    expect(markCampaigns([...friends, ...short, ...replies, ...known, ...company], new Set(["k1@gmail.com", "k2@gmail.com", "k3@gmail.com"]))).toBe(0);
  });

  it("masks amounts and order numbers", () => {
    expect(subjectTemplate("Your subscription renewed for $399.99 - order 12345678")).toBe(subjectTemplate("Your subscription renewed for $489.00 - order 87654321"));
    expect(nameInAddress("Lena Khan", "lena_khan26@gmail.com")).toBe(true);
    expect(nameInAddress("Billing Department", "omar520@gmail.com")).toBe(false);
  });
});
