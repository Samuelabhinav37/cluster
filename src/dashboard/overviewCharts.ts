// Overview charts (approved mockup research/2026-11-05-redesign-mockup.html).
// Each returns an element. The SVG strings hold only numbers and fixed words,
// never mail data, so building them as markup is safe.

const div = (cls: string, html = ""): HTMLDivElement => {
  const d = document.createElement("div");
  d.className = cls;
  d.innerHTML = html;
  return d;
};

/** A row of small ticks, the first `n / max` of them filled. */
export function ticks(n: number, max: number): HTMLElement {
  const N = 28, on = Math.round((n / Math.max(max, 1)) * N);
  return div("ov-ticks", Array.from({ length: N }, (_, i) => `<i${i < on ? ' class="on"' : ""}></i>`).join(""));
}
