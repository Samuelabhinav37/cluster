// Overview charts (approved mockup research/2026-11-05-redesign-mockup.html).
// Each returns an element. The SVG strings hold only numbers and fixed words,
// never mail data, so building them as markup is safe.

const div = (cls: string, html = ""): HTMLDivElement => {
  const d = document.createElement("div");
  d.className = cls;
  d.innerHTML = html;
  return d;
};

/** Ring with gaps, the total in the middle. */
export function donutChart(parts: Array<[label: string, count: number, color: string]>, middle: string): HTMLElement {
  const total = parts.reduce((a, [, n]) => a + n, 0) || 1, R = 52, C = 2 * Math.PI * R, gap = parts.filter((p) => p[1] > 0).length > 1 ? 4 : 0;
  let off = 0;
  const arcs = parts
    .filter(([, n]) => n > 0)
    .map(([, n, c]) => {
      const len = (n / total) * C;
      const a = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${c}" stroke-width="20" stroke-dasharray="${Math.max(len - gap, 1)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`;
      off += len;
      return a;
    })
    .join("");
  const root = div("ov-donut", `<svg viewBox="0 0 140 140" aria-hidden="true"><circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--neutral-fill)" stroke-width="20"/>${arcs}</svg><div class="ov-mid"><b></b><span></span></div>`);
  root.querySelector("b")!.textContent = parts.reduce((a, [, n]) => a + n, 0).toLocaleString();
  root.querySelector(".ov-mid span")!.textContent = middle;
  return root;
}

/** A row of small ticks, the first `n / max` of them filled. */
export function ticks(n: number, max: number): HTMLElement {
  const N = 28, on = Math.round((n / Math.max(max, 1)) * N);
  return div("ov-ticks", Array.from({ length: N }, (_, i) => `<i${i < on ? ' class="on"' : ""}></i>`).join(""));
}
