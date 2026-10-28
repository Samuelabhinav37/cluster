// The ⋯ button on a list row: a real menu (Apple's "More" pull-down) with the
// row's secondary actions. Same keyboard pattern as the account menu.

export type MenuEntry = { label: string; run: () => void; danger?: boolean } | "sep";

const DOTS =
  '<svg viewBox="0 0 20 20" width="17" height="17" fill="currentColor" aria-hidden="true"><circle cx="5" cy="10" r="1.5"></circle><circle cx="10" cy="10" r="1.5"></circle><circle cx="15" cy="10" r="1.5"></circle></svg>';

let openMenu: { menu: HTMLElement; button: HTMLButtonElement } | null = null;

function close(focusButton = false) {
  if (!openMenu) return;
  openMenu.menu.hidden = true;
  openMenu.button.setAttribute("aria-expanded", "false");
  if (focusButton) openMenu.button.focus();
  openMenu = null;
}

let wired = false;
function wireDocument() {
  if (wired) return;
  wired = true;
  document.addEventListener("click", (event) => {
    if (openMenu && !openMenu.menu.parentElement!.contains(event.target as Node)) close();
  });
}

export function rowMenu(entries: MenuEntry[], label = "More actions"): HTMLElement {
  wireDocument();
  const wrap = document.createElement("span");
  wrap.className = "row-menu";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-icon";
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = DOTS;

  const menu = document.createElement("div");
  menu.className = "account-menu row-menu-list";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  for (const entry of entries) {
    if (entry === "sep") {
      menu.appendChild(Object.assign(document.createElement("hr"), { className: "menu-sep" }));
      continue;
    }
    const item = document.createElement("button");
    item.type = "button";
    item.className = entry.danger ? "menu-item danger" : "menu-item";
    item.setAttribute("role", "menuitem");
    item.textContent = entry.label;
    item.onclick = (event) => {
      event.stopPropagation();
      close();
      entry.run();
    };
    menu.appendChild(item);
  }

  const items = () => Array.from(menu.querySelectorAll<HTMLButtonElement>(".menu-item"));
  button.onclick = (event) => {
    event.stopPropagation();
    const wasOpen = openMenu?.menu === menu;
    close();
    if (wasOpen) return;
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    openMenu = { menu, button };
    items()[0]?.focus();
  };
  menu.addEventListener("keydown", (event) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      list[(at + (event.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
    } else if (event.key === "Escape") {
      close(true);
    }
  });

  wrap.append(button, menu);
  return wrap;
}

/** Moves a row's secondary controls into `strip` (shown under the row) and
 * returns a ⋯ menu that runs one of them, showing only that one's confirm. */
export function menuForControls(controls: HTMLElement[], strip: HTMLElement): HTMLElement {
  strip.hidden = true;
  const entries: MenuEntry[] = [];
  for (const control of controls) {
    strip.appendChild(control);
    const button = control instanceof HTMLButtonElement ? control : control.querySelector("button");
    if (!button) continue;
    entries.push({
      label: button.textContent ?? "",
      danger: button.classList.contains("danger") || button.classList.contains("btn-danger"),
      run: () => {
        strip.hidden = false;
        for (const c of controls) c.hidden = c !== control;
        button.click();
      },
    });
  }
  // Destructive items go last, after a separator, so focus never lands on them first.
  const safe = entries.filter((e) => e !== "sep" && !e.danger);
  const risky = entries.filter((e) => e !== "sep" && e.danger);
  return rowMenu(risky.length > 0 && safe.length > 0 ? [...safe, "sep", ...risky] : [...safe, ...risky]);
}
