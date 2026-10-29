// Header chrome: the account menu (Activity, Settings) and the sender
// search. Both used to be loose header buttons; the menu keeps rarely used,
// expensive actions one click away instead of on every screen.

/** Wire the account button to open and close its menu (menu button pattern). */
export function wireAccountMenu(): void {
  const button = document.getElementById("account-pill") as HTMLButtonElement | null;
  const menu = document.getElementById("account-menu") as HTMLDivElement | null;
  if (!button || !menu) return;

  const items = () =>
    Array.from(menu.querySelectorAll<HTMLButtonElement>(".menu-item")).filter((b) => !b.hidden && !b.disabled);

  const setOpen = (open: boolean, focusFirst = false) => {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open && focusFirst) items()[0]?.focus();
  };

  button.addEventListener("click", () => setOpen(menu.hidden, true));

  // An item's own handler runs first; closing afterwards keeps the click.
  menu.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest(".menu-item")) setOpen(false);
  });

  menu.addEventListener("keydown", (event) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      list[(at + step + list.length) % list.length]?.focus();
    } else if (event.key === "Escape") {
      setOpen(false);
      button.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (!menu.hidden && !(event.target as HTMLElement).closest(".account-wrap")) setOpen(false);
  });
}
