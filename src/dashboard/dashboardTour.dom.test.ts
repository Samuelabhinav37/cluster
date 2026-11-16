// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ctx } from "./state";
import { startDashboardTour } from "./dashboardTour";
import type { ClusterSettings } from "../lib/settingsStore";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("dashboard tour", () => {
  it("walks the stops on the page with Next, and Skip ends it", () => {
    ctx.settings = { showKai: false } as ClusterSettings;
    document.body.innerHTML = '<button id="a">A</button><button id="b">B</button>';
    // jsdom lays nothing out; pretend both are on screen.
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
    startDashboardTour([
      { selector: "#a", line: "This is A." },
      { selector: "#missing", line: "Never shown." },
      { selector: "#b", line: "This is B." },
    ]);
    const line = () => document.getElementById("tour-line")!.textContent;
    expect(line()).toBe("This is A.");
    expect(document.querySelector(".tour-count")!.textContent).toBe("1 of 2");
    (document.getElementById("tour-next") as HTMLButtonElement).click();
    expect(line()).toBe("This is B.");
    expect(document.getElementById("tour-next")!.textContent).toBe("Done");
    (document.getElementById("tour-skip") as HTMLButtonElement).click();
    expect(document.querySelector(".tour")).toBeNull();
  });
});
