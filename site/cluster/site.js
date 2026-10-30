/* global document, IntersectionObserver */
// Fades each section in as it scrolls into view. Without JS, or with reduced
// motion, everything simply shows.
document.documentElement.classList.add("js");
const seen = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      seen.unobserve(e.target);
    }
  },
  { rootMargin: "0px 0px -10% 0px" },
);
for (const el of document.querySelectorAll(".reveal")) seen.observe(el);
