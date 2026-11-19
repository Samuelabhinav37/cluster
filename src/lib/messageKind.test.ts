import { describe, expect, it } from "vitest";
import { classifyMessageKind, looksAutomated, withPurchase } from "./messageKind";

describe("classifyMessageKind", () => {
  it("detects one-time codes", () => {
    expect(classifyMessageKind("Your verification code is 123456", false)).toBe("otp");
    expect(classifyMessageKind("Use this one-time passcode to sign in", false)).toBe("otp");
    expect(classifyMessageKind("Your login code", false)).toBe("otp");
  });

  // Real subjects that sat unlabelled in an inbox (2026-11-14).
  it("labels codes, account notices and job replies that used to be missed", () => {
    const who = (address: string, displayName = "") => ({ address, displayName });
    expect(classifyMessageKind("Your single-use code", false)).toBe("otp");
    expect(classifyMessageKind("Your Pega Access Code", false)).toBe("otp");
    expect(classifyMessageKind("Use 87189915 to change your password", false)).toBe("otp");
    expect(classifyMessageKind("TCM Security: Account Created", false)).toBe("accounts");
    expect(classifyMessageKind("You've been invited to join Datadog", false)).toBe("accounts");
    expect(classifyMessageKind("Position Has Been Filled", false)).toBe("jobs");
    expect(classifyMessageKind("Your VEG application is officially in review 🚀", false)).toBe("jobs");
    expect(classifyMessageKind("You are invited to interview with HGV", false)).toBe("jobs");
    expect(classifyMessageKind("Thank you for considering Brookdale Senior Living Inc.", false)).toBe("jobs");
    expect(classifyMessageKind("Update from AbbVie", false, who("notifications@talentacquisition.abbvie.com", "AbbVie Hiring Team"))).toBe("jobs");
    expect(classifyMessageKind("Answering Service Care Update: Thank you!", false, who("no-reply@ats.rippling.com"))).toBe("jobs");
    expect(classifyMessageKind("Your monthly Course Hero membership has renewed", false)).toBe("receipt");
    expect(classifyMessageKind("Login activity on your account", false)).toBe("accounts");
    expect(looksAutomated(false, undefined, undefined, "13914398:10562142:100009:iterable")).toBe(true);
    // A subdomain alone names no job: mail.example.com stays other.
    expect(classifyMessageKind("Hello", false, who("team@mail.perplexity.ai"))).toBe("other");
  });

  it("detects shipping/order updates", () => {
    expect(classifyMessageKind("Your order has shipped!", false)).toBe("shipping");
    expect(classifyMessageKind("Order confirmation #12345", false)).toBe("shipping");
    expect(classifyMessageKind("Out for delivery today", false)).toBe("shipping");
  });

  it("detects receipts/invoices", () => {
    expect(classifyMessageKind("Your receipt from Acme", false)).toBe("receipt");
    expect(classifyMessageKind("Invoice #99 is ready", false)).toBe("receipt");
    expect(classifyMessageKind("Payment received, thank you", false)).toBe("receipt");
    expect(classifyMessageKind("Cinemark Purchase Confirmation", true)).toBe("receipt");
    expect(classifyMessageKind("Cinemark Refund Confirmation", true)).toBe("receipt");
    expect(classifyMessageKind("We've received your payment", true)).toBe("receipt");
    expect(classifyMessageKind("The hottest ticket in the multiverse", true)).toBe("newsletter");
  });

  it("detects social notifications", () => {
    expect(classifyMessageKind("Sam mentioned you in a comment", false)).toBe("social");
    expect(classifyMessageKind("You have a new follower", false)).toBe("social");
  });

  it("falls back to newsletter when List-Unsubscribe is present but nothing else matches", () => {
    expect(classifyMessageKind("This week in tech", true)).toBe("newsletter");
  });

  it("falls back to other when nothing matches and there is no List-Unsubscribe", () => {
    expect(classifyMessageKind("Let's catch up sometime", false)).toBe("other");
    expect(classifyMessageKind("", false)).toBe("other");
  });

  it("needs a real code next to 'your code is'", () => {
    expect(classifyMessageKind("Your code is 482913", false)).toBe("otp");
    expect(classifyMessageKind("482913 is your Slack code", false)).toBe("otp");
    expect(classifyMessageKind("Your code is in the repo now", false)).toBe("other");
  });

  it("reads codes in other languages", () => {
    expect(classifyMessageKind("Votre code de vérification : 304411", false)).toBe("otp");
    expect(classifyMessageKind("Tu código de verificación es 7790", false)).toBe("otp");
    expect(classifyMessageKind("Ihr Bestätigungscode", false)).toBe("otp");
  });

  it("lets Gmail's Purchases view make a receipt, but not over a code or shipping", () => {
    expect(withPurchase("newsletter", true)).toBe("receipt");
    expect(withPurchase("shipping", true)).toBe("shipping");
    expect(withPurchase("otp", true)).toBe("otp");
    expect(withPurchase("newsletter", undefined)).toBe("newsletter");
  });

  it("treats renewal notices as receipts", () => {
    expect(classifyMessageKind("Your membership will renew on Nov 3", true)).toBe("receipt");
    expect(classifyMessageKind("Your subscription is renewing soon", true)).toBe("receipt");
  });

  it("falls back to a sender named for receipts or shipping", () => {
    const uber = { address: "noreply@uber.com", displayName: "Uber Receipts" };
    expect(classifyMessageKind("Your Thursday evening trip with Uber", true, uber)).toBe("receipt");
    const amazon = { address: "shipment-tracking@amazon.com", displayName: "Amazon.com" };
    expect(classifyMessageKind("A note about your package", true, amazon)).toBe("shipping");
    const shop = { address: "deals@shop.example", displayName: "Shop" };
    expect(classifyMessageKind("New arrivals", true, shop)).toBe("newsletter");
  });

  it("prioritizes specific kinds over the newsletter fallback", () => {
    expect(classifyMessageKind("Your order has shipped!", true)).toBe("shipping");
  });
});

describe("looksAutomated", () => {
  it("is true whenever List-Unsubscribe is present", () => {
    expect(looksAutomated(true)).toBe(true);
  });

  it("is true for a bulk/list/junk Precedence header", () => {
    expect(looksAutomated(false, "bulk")).toBe(true);
    expect(looksAutomated(false, "list")).toBe(true);
    expect(looksAutomated(false, "junk")).toBe(true);
    expect(looksAutomated(false, "Bulk")).toBe(true);
  });

  it("is true for an Auto-Submitted auto-generated/auto-replied header", () => {
    expect(looksAutomated(false, undefined, "auto-generated")).toBe(true);
    expect(looksAutomated(false, undefined, "auto-replied; foo=bar")).toBe(true);
  });

  it("is false with no bulk/list-unsubscribe/auto-submitted signal at all", () => {
    expect(looksAutomated(false)).toBe(false);
    expect(looksAutomated(false, "normal", "no")).toBe(false);
  });

  it("reads a statement with a card or month named before it as a receipt", () => {
    expect(classifyMessageKind("Your October Affirm Card statement is here", true)).toBe("receipt");
  });
});

describe("job mail left unlabelled in a real inbox (Nov 2026)", () => {
  it("labels job notifications by subject or by a jobs@ sender", () => {
    expect(classifyMessageKind("Your Randstad USA Job Notification", true)).toBe("jobs");
    expect(classifyMessageKind("Are you still looking for Security Analyst jobs?", true)).toBe("jobs");
    expect(classifyMessageKind("Weekly roundup", true, { address: "jobs@randstadusa.com", displayName: "Randstad USA" })).toBe("jobs");
    expect(classifyMessageKind("Steve Jobs biography is on sale", true)).toBe("newsletter");
  });
});

describe("subjects seen unlabelled in a real inbox", () => {
  it.each([
    ["Thank You for Your Interest in Everpure", "jobs"],
    ["Cybersecurity Engineer I opportunity at Space Coast Credit Union", "jobs"],
    ["Your first job recommendations are ready", "jobs"],
    ["Background Screening Report Returned", "jobs"],
    ["Verify your email address", "accounts"],
    ["[OCEG] Your OCEG authentication code", "otp"],
    ["Your IBM Bob subscription has expired", "receipt"],
    ["Confirmation of change to your IBM Bob Pro Plus plan subscription", "receipt"],
    ["Registration confirmed for Portfolios That Get You Hired", "receipt"],
  ])("%s is %s", (subject, kind) => {
    expect(classifyMessageKind(subject, false)).toBe(kind);
  });
});

describe("mislabels seen in a real inbox", () => {
  it.each([
    ["Get paid. Test privately. Get discovered.", undefined, "other"],
    ["Update on Cybersecurity Practitioner: Paid Expert Interviews and next steps", undefined, "other"],
    ["Your Zolve bill has been paid.", undefined, "receipt"],
    ["A new passkey was added to your account", undefined, "accounts"],
    ["Confirm it's you", undefined, "otp"],
    ["You shared some Google Account data with oceg.org", undefined, "accounts"],
    // Old inbox mail no rule matched (real subjects, Nov 2026).
    ["Your Amazon Web Services Password Has Been Updated", undefined, "accounts"],
    ["Amazon Web Services Password Assistance", undefined, "accounts"],
    ["Verify your identity", undefined, "otp"],
    ["Confirm your identity for job Cybersecurity Analyst I - 109551", undefined, "otp"],
    ["Roblox Email Verification: Silentzephyrus37", undefined, "accounts"],
    ["Thank you for your interest", undefined, "jobs"],
    ["Position Closed", undefined, "jobs"],
    ["RTS resume submission", undefined, "jobs"],
    ["Application – Information Security Analyst II Status", undefined, "jobs"],
    ["Samuel Abhinav - Phone Interview w/ Merchants Bonding!", undefined, "jobs"],
    ["RE: EHR Security Analyst - Samuel Meruga has applied on Dice", undefined, "jobs"],
    ["Don't Miss Out on a Spot in MIT IDSS' Data Science Program!", { address: "career@academy.mygreatlearning.com", displayName: "MIT IDSS" }, "other"],
    ["Next steps with Peraton", { address: "no-reply@icims.com", displayName: "Peraton Careers" }, "jobs"],
  ] as const)("%s", (subject, sender, kind) => {
    expect(classifyMessageKind(subject, false, sender)).toBe(kind);
  });
});

describe("bounces and carriers", () => {
  it("a bounce is not a parcel; a carrier's mail is shipping", () => {
    expect(classifyMessageKind("Delivery Status Notification (Failure)", false)).toBe("other");
    expect(classifyMessageKind("Undeliverable: your message", false, { address: "postmaster@outlook.com", displayName: "" })).toBe("other");
    expect(classifyMessageKind("Your package update", false, { address: "mcinfo@ups.com", displayName: "UPS" })).toBe("shipping");
    expect(classifyMessageKind("Your sign-in link for Notion", false)).toBe("otp");
    expect(classifyMessageKind("Your Apple ID was used to sign in to iCloud", false)).toBe("accounts");
  });
});

describe("statements", () => {
  it("a statement or balance is its own kind, not a receipt", () => {
    for (const s of ["Your statement is available", "Your eStatement is ready", "Low balance alert", "A direct deposit was posted", "Your monthly account summary"])
      expect(classifyMessageKind(s, false)).toBe("statement");
    expect(classifyMessageKind("Your receipt from Apple", false)).toBe("receipt");
  });
});

describe("one order, one label (real Amazon subjects, 2026-11)", () => {
  it.each([
    "Ordered 2 items: Beverages, Household Supplies",
    'Ordered: "Bosch Siemens Quick..."',
    "Item cancelled successfully: Coffee",
    "Payment declined: Update your information so we can ship your order.",
    "Your return of CLONEZO Mosquito Bat with UV...",
  ])("%s is shipping", (subject) => {
    expect(classifyMessageKind(subject, false)).toBe("shipping");
  });
  it("leaves a review request and a renewal alone", () => {
    expect(classifyMessageKind("Did your recent Amazon order meet your expectations? Review it on Amazon", true)).toBe("newsletter");
    expect(classifyMessageKind("Your locked-in price is renewing soon", true)).toBe("receipt");
  });
});

describe("Screener misses (real subjects, 2026-11)", () => {
  it("a staffing agency's 'Position |' post is a job", () => {
    expect(classifyMessageKind("Position | Senior Microsoft Entra ID Security Engineer | Chicago, IL / Tempe, AZ", false)).toBe("jobs");
    expect(classifyMessageKind("Position update for the team offsite", false)).toBe("other");
  });
  it("a recruiter's bulk post with an unsubscribe link is still a job", () => {
    expect(classifyMessageKind("Exciting opportunity - ServiceNow Vulnerability Response (VR) Engineer - Charlotte, NC (Hybrid)", true)).toBe("jobs");
    expect(classifyMessageKind("Full time - Senior ServiceNow AI Developer - Remote", true)).toBe("jobs");
    // A newsletter about remote work keeps its kind.
    expect(classifyMessageKind("Why remote engineers are happier", true)).toBe("newsletter");
    expect(classifyMessageKind("New role for our CEO: what it means for engineers", true)).toBe("newsletter");
  });
  it("a bank's money on its way is not a parcel", () => {
    expect(classifyMessageKind("Your Zelle® payment is on its way", false)).not.toBe("shipping");
    expect(classifyMessageKind("Your package is on its way", false)).toBe("shipping");
    expect(classifyMessageKind("Payment declined: Update your information so we can ship your order.", false)).toBe("shipping");
  });
  it("a phone unlinked from an account is an account notice", () => {
    expect(
      classifyMessageKind("Final notice: The forwarding phone (515) 916-8493 is no longer connected to your Google Voice account", false),
    ).toBe("accounts");
  });
});

describe("a job application's receipt", () => {
  it("is Jobs, not Receipts", () => {
    expect(classifyMessageKind("Resume Receipt Confirmation", false)).toBe("jobs");
    expect(classifyMessageKind("Confirmation of receipt of your application", false)).toBe("jobs");
    expect(classifyMessageKind("Your receipt from Cinemark", false)).toBe("receipt");
  });
});
