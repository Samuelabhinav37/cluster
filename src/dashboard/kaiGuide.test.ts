// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLUSTER_FIRST_ON, CLUSTER_QUESTIONS, initKaiGuide } from "./kaiGuide";

function setup(screen = "overview", extra: Partial<Parameters<typeof initKaiGuide>[1]> = {}) {
  document.body.innerHTML = `
    <nav id="sidebar"><button class="nav-item active" data-screen="${screen}">Here</button><button class="nav-item" data-screen="organize">Sorting</button></nav>
    <section id="sort-inbox-bar">Sort my inbox</section>`;
  const sortNav = document.querySelector<HTMLButtonElement>('.nav-item[data-screen="organize"]')!;
  const navClick = vi.fn();
  sortNav.addEventListener("click", navClick);
  const kai = initKaiGuide(document, {
    questions: CLUSTER_QUESTIONS,
    firstOn: CLUSTER_FIRST_ON,
    currentScreen: () => document.querySelector<HTMLElement>("#sidebar .nav-item.active")?.dataset.screen ?? "overview",
    ...extra,
  });
  const button = document.querySelector<HTMLButtonElement>(".kai-button")!;
  const panel = document.getElementById("kai-chat")!;
  const chips = () => Array.from(panel.querySelectorAll(".kai-q")).map((b) => b.textContent);
  const chip = (text: string) => Array.from(panel.querySelectorAll<HTMLButtonElement>(".kai-q")).find((b) => b.textContent === text)!;
  const said = () => Array.from(panel.querySelectorAll(".kg-msg.kg-kai:not(.typing)")).map((m) => m.firstChild?.textContent ?? "");
  const open = () => { button.click(); vi.advanceTimersByTime(2000); };
  return { kai, button, panel, chips, chip, said, open, navClick };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
  localStorage.clear();
  document.body.replaceChildren();
});

describe("Kai's guide in Cluster", () => {
  it("says Ask Kai once per visit, then folds the bubble away", () => {
    setup();
    const guide = () => document.querySelector(".kai-guide")!;
    vi.advanceTimersByTime(800);
    expect(guide().classList.contains("tag-on")).toBe(true);
    vi.advanceTimersByTime(8000);
    expect(guide().classList.contains("tag-on")).toBe(false);
    document.body.replaceChildren();
    setup();
    vi.advanceTimersByTime(2000);
    expect(guide().classList.contains("tag-on")).toBe(false);
  });

  it("comes back when you look stuck, naming the screen, but not while the chat is open", () => {
    const { kai, open, button } = setup("rules");
    const guide = document.querySelector(".kai-guide")!;
    vi.advanceTimersByTime(13000);
    open();
    kai.watch!.flip("x"); kai.watch!.flip("x"); kai.watch!.flip("x");
    expect(guide.classList.contains("tag-on")).toBe(false);
    button.click();
    kai.watch!.flip("x"); kai.watch!.flip("x"); kai.watch!.flip("x");
    expect(guide.classList.contains("tag-on")).toBe(true);
    expect(document.querySelector(".kg-tag")!.textContent).toBe("Need a hand with Here?");
    vi.advanceTimersByTime(7100);
    expect(guide.classList.contains("tag-on")).toBe(false);
  });

  it("puts the live Kai in the corner with Ask Kai above it", () => {
    const { button } = setup();
    expect(document.querySelector(".kg-tag")!.textContent).toBe("Ask Kai");
    expect(button.querySelector(".kai .kai-body")).not.toBeNull();
    expect(button.getAttribute("aria-label")).toBe("Ask Kai");
  });

  it("greets and lists this screen's questions first", () => {
    const { open, said, chips } = setup("organize");
    open();
    expect(said()).toEqual(["Hi, I'm Kai. I'm small, but I know Cluster inside out. What can I help with?"]);
    expect(chips().slice(0, 2)).toEqual(["How do I sort my inbox?", "How do I make a rule?"]);
    expect(chips().at(-1)).toBe("Ask something else");
  });

  it("answers after thinking, then Show me opens the screen and outlines the section", () => {
    const { open, chip, said, panel, navClick } = setup();
    open();
    chip("How do I sort my inbox?").click();
    expect(panel.querySelector(".kg-msg.typing")).not.toBeNull();
    expect(panel.querySelector(".kg-status")!.textContent).toBe("Thinking");
    vi.advanceTimersByTime(3000);
    expect(said().at(-1)).toContain("Open Labels, set each label, then press Sort inbox");
    expect(panel.querySelectorAll(".kg-msg.kai")).toHaveLength(0);
    panel.querySelector<HTMLButtonElement>(".kg-go")!.click();
    expect(navClick).toHaveBeenCalledOnce();
    expect(panel.hidden).toBe(true);
    // Kai looks at the spot first, then the ring appears
    vi.advanceTimersByTime(300);
    expect(document.getElementById("sort-inbox-bar")!.classList.contains("kai-here")).toBe(false);
    vi.advanceTimersByTime(700);
    expect(document.getElementById("sort-inbox-bar")!.classList.contains("kai-here")).toBe(true);
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
    document.getElementById("sort-inbox-bar")!.click();
    expect(panel.hidden).toBe(true);
  });

  it("answers a typed question with Take me there, learns the pick, and keeps a miss", () => {
    const sort = CLUSTER_QUESTIONS.find((q) => q.id === "sort")!;
    const picked = vi.fn();
    const missed = vi.fn();
    const go = vi.fn();
    const { open, panel, said } = setup("overview", {
      match: (t) => (t.includes("sort") ? [sort] : []),
      picked,
      missed,
      go,
    });
    open();
    const input = panel.querySelector<HTMLInputElement>(".kg-input")!;
    input.value = "sort my mail";
    panel.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    vi.advanceTimersByTime(3000);
    expect(said().at(-1)).toBe(sort.answer);
    const takeMe = panel.querySelector<HTMLButtonElement>(".kg-go")!;
    expect(takeMe.textContent).toBe("Take me there ↵");
    takeMe.click();
    expect(picked).toHaveBeenCalledWith("sort my mail", "sort");
    expect(go).toHaveBeenCalledWith("organize");

    open();
    input.value = "what is the weather";
    panel.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    vi.advanceTimersByTime(3000);
    expect(missed).toHaveBeenCalledWith("what is the weather");
    expect(said().at(-1)).toContain("I don't know that one yet");
  });

  it("every question that opens a screen names a real screen", () => {
    const screens = new Set(["overview", "delete", "senders", "subscriptions", "organize", "impersonation", "screener", "recent", "settings"]);
    for (const q of CLUSTER_QUESTIONS) if (q.screen) expect(screens.has(q.screen), q.id).toBe(true);
    for (const ids of Object.values(CLUSTER_FIRST_ON)) for (const id of ids) expect(CLUSTER_QUESTIONS.some((q) => q.id === id), id).toBe(true);
  });
  it("reacts to what Cluster did: sorted, unsubscribed (counted), undone", () => {
    setup();
    vi.advanceTimersByTime(9000);
    const tag = () => document.querySelector(".kg-tag")!.textContent;
    const fire = (kind: string) => document.dispatchEvent(new CustomEvent("cluster:action", { detail: { kind } }));
    fire("sort");
    expect(tag()).toBe("All sorted.");
    vi.advanceTimersByTime(4000);
    fire("unsubscribe"); fire("unsubscribe"); fire("unsubscribe");
    vi.advanceTimersByTime(1600);
    expect(tag()).toBe("Bye to 3 senders.");
    vi.advanceTimersByTime(4000);
    document.dispatchEvent(new CustomEvent("cluster:undo"));
    expect(tag()).toBe("Undone.");
  });

  it("keeps the conversation when reopened within 10 minutes", () => {
    const { open, button, said } = setup();
    open();
    const before = said();
    button.click();
    vi.advanceTimersByTime(5 * 60000);
    open();
    expect(said()).toEqual(before);
  });
});
