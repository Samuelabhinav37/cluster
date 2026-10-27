// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { wireAccountMenu } from "./accountMenu";

function mount() {
  document.body.innerHTML = `
    <div class="account-wrap">
      <button id="account-pill" aria-expanded="false"></button>
      <div id="account-menu" hidden>
        <button class="menu-item" id="a">Rescan mail</button>
        <button class="menu-item" id="b">Connect Outlook</button>
      </div>
    </div>
    <p id="outside">x</p>`;
}

describe("account menu", () => {
  beforeEach(mount);

  it("opens on click and focuses the first item", () => {
    wireAccountMenu();
    document.getElementById("account-pill")!.click();
    expect(document.getElementById("account-menu")!.hidden).toBe(false);
    expect(document.getElementById("account-pill")!.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.id).toBe("a");
  });

  it("closes after an item runs its own handler", () => {
    wireAccountMenu();
    const ran = vi.fn();
    document.getElementById("b")!.addEventListener("click", ran);
    document.getElementById("account-pill")!.click();
    document.getElementById("b")!.click();
    expect(ran).toHaveBeenCalledOnce();
    expect(document.getElementById("account-menu")!.hidden).toBe(true);
  });

  it("closes on Escape and on a click outside", () => {
    wireAccountMenu();
    const menu = document.getElementById("account-menu")!;
    document.getElementById("account-pill")!.click();
    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(menu.hidden).toBe(true);
    document.getElementById("account-pill")!.click();
    document.getElementById("outside")!.click();
    expect(menu.hidden).toBe(true);
  });

  it("skips hidden items with the arrow keys", () => {
    wireAccountMenu();
    document.getElementById("b")!.hidden = true;
    document.getElementById("account-pill")!.click();
    document.getElementById("account-menu")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement?.id).toBe("a");
  });
});
