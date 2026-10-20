// Labelled message-kind corpus for evaluation.test.ts: subject + whether the
// message carried List-Unsubscribe, and the kind a person would give it.
// Includes the registered kind bugs in algorithmAudit.test.ts.
import type { MessageKind } from "../../lib/messageKind";

export interface KindCase {
  subject: string;
  hasListUnsubscribe: boolean;
  kind: MessageKind;
  /** Bulk-marketing one-click unsubscribe (List-Unsubscribe-Post). */
  oneClick?: boolean;
  promotion?: boolean;
}

const k = (kind: MessageKind, hasListUnsubscribe: boolean, ...subjects: string[]): KindCase[] =>
  subjects.map((subject) => ({ subject, hasListUnsubscribe, kind }));

// Marketing that borrows transactional words, sent the way bulk marketing
// is (one-click unsubscribe, Promotions tab). The subject alone misreads
// these; the confidence must keep them below the act band.
const dressedUpMarketing: KindCase[] = [
  "Your receipt: 20% off your next order",
  "Delivered to your door: this week's best deals",
  "Your order of savings has shipped!",
].map((subject) => ({
  subject,
  hasListUnsubscribe: true,
  oneClick: true,
  promotion: true,
  kind: "newsletter",
}));

export const KIND_CORPUS: KindCase[] = [
  ...dressedUpMarketing,
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
    "Your one-time payment receipt",
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
    "Use code 2026 for 20% off",
    "Your code SAVE20 is waiting: 20% off",
    "Our package of new features",
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
