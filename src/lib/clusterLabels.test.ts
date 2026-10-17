import { describe, expect, it } from "vitest";
import {
  CLUSTER_LABELS,
  canonicalLabelName,
  clusterLabelKeyFor,
  labelLookupNames,
} from "./clusterLabels";

describe("clusterLabels table", () => {
  it("gives every label a distinct name with no invisible variation selector", () => {
    const names = Object.values(CLUSTER_LABELS).map((s) => s.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const s of Object.values(CLUSTER_LABELS)) {
      expect(s.name).not.toMatch(/️/);
      expect(s.name).not.toContain("/");
    }
  });

  it("covers every legacy label seen in a real mailbox", () => {
    const live = [
      "Cluster/One-time codes",
      "Cluster/Receipts & invoices",
      "Cluster/Order & shipping updates",
      "Cluster/Newsletters",
      "Cluster/Shopping",
      "Cluster/Travel",
      "Cluster/Finance",
      "Cluster/Productivity",
      "Cluster/Muted",
      "Declutter/Screener",
    ];
    for (const name of live) expect(clusterLabelKeyFor(name), name).not.toBeNull();
  });
});

describe("canonicalLabelName", () => {
  it("maps any older name to today's", () => {
    expect(canonicalLabelName("Cluster/Order & shipping updates")).toBe("📦 Orders & shipping");
    expect(canonicalLabelName("declutter/screener")).toBe("✋ Screener");
    expect(canonicalLabelName("Productivity")).toBe("💼 Work");
  });

  it("strips the prefix from a per-sender label and leaves other names alone", () => {
    expect(canonicalLabelName("Cluster/Jobright Job Alert")).toBe("Jobright Job Alert");
    expect(canonicalLabelName("Notes/Psychology")).toBe("Notes/Psychology");
  });
});

describe("labelLookupNames", () => {
  it("tries the given name, then today's, then prefixed older names, never a bare old name", () => {
    expect(labelLookupNames("🔇 Muted")).toEqual(["🔇 Muted", "Cluster/Muted", "Declutter/Muted"]);
    expect(labelLookupNames("Shopping").slice(0, 2)).toEqual(["Shopping", "🛍 Shopping"]);
  });

  it("looks for a per-sender label under its old prefixed name too", () => {
    expect(labelLookupNames("Jobright Job Alert")).toEqual([
      "Jobright Job Alert",
      "Cluster/Jobright Job Alert",
      "Declutter/Jobright Job Alert",
    ]);
  });
});
