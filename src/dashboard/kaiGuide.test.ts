// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLUSTER_FIRST_ON, CLUSTER_QUESTIONS, initKaiGuide } from "./kaiGuide";

function setup(screen = "overview") {
  document.body.innerHTML = `
    <nav id="sidebar"><button class="nav-item active" data-screen="${screen}">Here</button><button class="nav-item" data-screen="organize">Sorting</button></nav>
    <section id="sort-inbox-section">Sort my inbox</section>`;
  const sortNav = document.querySelector<HTMLButtonElement>('.nav-item[data-screen="organize"]')!;
  const navClick = vi.fn();
  sortNav.addEventListener("click", navClick);
  initKaiGuide(document, {
    questions: CLUSTER_QUESTIONS,
    firstOn: CLUSTER_FIRST_ON,
    currentScreen: () => document.querySelector<HTMLElement>("#sidebar .nav-item.active")?.dataset.screen ?? "overview",
  });
  const button = document.querySelector<HTMLButtonElement>(".kai-button")!;
  const panel = document.getElementById("kai-chat")!;
  const chips = () => Array.from(panel.querySelectorAll(".kai-q")).map((b) => b.textContent);
  const chip = (text: string) => Array.from(panel.querySelectorAll<HTMLButtonElement>(".kai-q")).find((b) => b.textContent === text)!;
  const said = () => Array.from(panel.querySelectorAll(".kg-msg.kg-kai:not(.typing)")).map((m) => m.firstChild?.textContent ?? "");
  const open = () => { button.click(); vi.advanceTimersByTime(2000); };
  return { button, panel, chips, chip, said, open, navClick };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("Kai's guide in Cluster", () => {
  it("puts the live Kai in the corner with Ask Kai above it", () => {
    const { button } = setup();
    expect(document.querySelector(".kg-tag")!.textContent).toBe("Ask Kai");
    expect(button.querySelector(".kai .kai-body")).not.toBeNull();
    expect(button.getAttribute("aria-label")).toBe("Ask Kai");
  });

  it("greets and lists this screen's questions first", () => {
    const { open, said, chips } = setup("organize");
    open();
    expect(said()).toEqual(["Hi, I'm Kai. Ask me anything about Cluster."]);
    expect(chips().slice(0, 2)).toEqual(["How do I sort my inbox?", "Can Cluster keep new mail sorted?"]);
    expect(chips().at(-1)).toBe("Ask something else");
  });

  it("answers after thinking, then Show me opens the screen and outlines the section", () => {
    const { open, chip, said, panel, navClick } = setup();
    open();
    chip("How do I sort my inbox?").click();
    expect(panel.querySelector(".kg-msg.typing")).not.toBeNull();
    expect(panel.querySelector(".kg-status")!.textContent).toBe("Thinking");
    vi.advanceTimersByTime(3000);
    expect(said().at(-1)).toContain("Open Sorting and press Sort my inbox.");
    expect(panel.querySelectorAll(".kg-msg.kai")).toHaveLength(0);
    panel.querySelector<HTMLButtonElement>(".kg-go")!.click();
    expect(navClick).toHaveBeenCalledOnce();
    expect(panel.hidden).toBe(true);
    vi.advanceTimersByTime(300);
    expect(document.getElementById("sort-inbox-section")!.classList.contains("kai-here")).toBe(true);
  });

  it("answers without Show me when there is nowhere to go, then offers follow-ups", () => {
    const { open, chip, panel, chips } = setup();
    open();
    chip("Does Cluster read my emails?").click();
    vi.advanceTimersByTime(3000);
    expect(panel.querySelector(".kg-go")).toBeNull();
    expect(chips().slice(0, 2)).toEqual(["Will it touch my starred mail?", "How do I undo something?"]);
  });

  it("closes on Escape and on a click elsewhere", () => {
    const { open, panel, button } = setup();
    open();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(panel.hidden).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    open();
    document.getElementById("sort-inbox-section")!.click();
    expect(panel.hidden).toBe(true);
  });

  it("every question that opens a screen names a real sidebar screen", () => {
    const screens = new Set(["overview", "delete", "senders", "subscriptions", "organize", "rules", "impersonation", "screener", "report", "recent"]);
    for (const q of CLUSTER_QUESTIONS) if (q.screen) expect(screens.has(q.screen), q.id).toBe(true);
    for (const ids of Object.values(CLUSTER_FIRST_ON)) for (const id of ids) expect(CLUSTER_QUESTIONS.some((q) => q.id === id), id).toBe(true);
  });
});
