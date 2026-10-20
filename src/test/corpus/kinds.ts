// Labelled message-kind corpus for evaluation.test.ts: subject + whether the
// message carried List-Unsubscribe, and the kind a person would give it.
// Includes the registered kind bugs in algorithmAudit.test.ts.
import type { MessageKind } from "../../lib/messageKind";

export interface KindCase {
  subject: string;
  hasListUnsubscribe: boolean;
  kind: MessageKind;
}

const k = (kind: MessageKind, hasListUnsubscribe: boolean, ...subjects: string[]): KindCase[] =>
  subjects.map((subject) => ({ subject, hasListUnsubscribe, kind }));

export const KIND_CORPUS: KindCase[] = [
  ...k(
    "otp",
    false,
    "Your verification code is 482913",
    "482913 is your Instagram code",
    "Your Uber code is 4821",
    "Sign-in code: 773201",
    "Your one-time passcode",
    "Use 551920 to confirm your email",
    "[GitHub] Please verify your device",
    "Your login code for Slack",
    "Security code for your Microsoft account",
    "Your two-factor authentication code",
  ),
  ...k(
    "receipt",
    false,
    "Your receipt from Apple",
    "Payment received – thank you",
    "Your invoice for October",
    "Receipt for your payment to Spotify",
    "Your monthly statement is ready",
    "We received your payment",
    "Your Uber receipt",
  ),
  ...k(
    "shipping",
    true,
    "Your package has shipped",
    "Out for delivery today",
    "Your order #4471 has been delivered",
    "Order confirmation #112-449",
    "Your parcel is on its way",
    "Arriving tomorrow: your Amazon order",
    "Track your package: 1Z999AA10123456784",
  ),
  ...k(
    "social",
    true,
    "Priya commented on your post",
    "Sam mentioned you in a comment",
    "You have a new follower",
    "Alex tagged you in a photo",
    "Jordan sent you a friend request",
  ),
  ...k(
    "newsletter",
    true,
    "Deals picked for you",
    "This week's update",
    "Free delivery on all orders this weekend",
    "Tracking your 2026 fitness goals",
    "Our statement on today's outage",
    "Flash sale ends tonight — 40% off",
    "10 things to read this weekend",
    "New arrivals you'll love",
    "Your weekly digest",
    "Last chance: 30% off sitewide",
    "Delivery of the future: our product roadmap",
    "Members-only: paid early access to the sale",
  ),
  ...k(
    "other",
    false,
    "dinner?",
    "Notes from the meeting",
    "Photos from Saturday",
    "Can you review the draft?",
    "Quick question about the lease",
  ),
];
