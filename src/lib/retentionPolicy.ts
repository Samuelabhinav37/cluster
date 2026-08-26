import type { MessageKind } from "./messageKind";

// Age-since-received is the only expiry signal used anywhere in this project
// — never body content (e.g. no parsing a claimed delivery date out of an
// order-confirmation email). Kinds with no entry here (receipt, other) get no
// default policy: financial records and unclassified mail are never
// auto-suggested for deletion.
export const RETENTION_DAYS: Partial<Record<MessageKind, number>> = {
  otp: 2,
  shipping: 45,
  newsletter: 30,
  social: 30,
};

export const RETENTION_LABELS: Record<MessageKind, string> = {
  otp: "One-time codes",
  shipping: "Order & shipping updates",
  receipt: "Receipts & invoices",
  newsletter: "Newsletters",
  social: "Social notifications",
  other: "Other",
};
