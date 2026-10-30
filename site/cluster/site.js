/* global document, IntersectionObserver, matchMedia, setTimeout */
// Each part fades up as it scrolls in, and each product piece plays its
// little story once. With reduced motion every piece shows its end state.
document.documentElement.classList.add("js");
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms) => new Promise((r) => setTimeout(r, still ? 0 : ms));

/** Counts an element's number from `from` to `to` over `ms`. */
async function count(el, from, to, ms) {
  const steps = still ? 1 : 24;
  for (let i = 1; i <= steps; i++) {
    el.textContent = String(Math.round(from + ((to - from) * i) / steps));
    await wait(ms / steps);
  }
}

const plays = {
  // Mail leaves for its label; people stay; the fake PayPal is flagged and held.
  async sort(box) {
    const inbox = box.querySelector('[data-count="inbox"]');
    const replay = box.querySelector(".replay");
    replay.hidden = true;
    await wait(900);
    let left = 10;
    for (const row of box.querySelectorAll("li")) {
      const to = row.dataset.go;
      if (to === "people") {
        row.classList.add("stay");
        continue;
      }
      if (to === "held") {
        row.classList.add("flag");
        await wait(900);
      }
      row.classList.add("gone");
      const lbl = box.querySelector(`[data-to="${to}"]`);
      const n = lbl.querySelector("b");
      n.textContent = String(Number(n.textContent) + 1);
      lbl.classList.remove("bump");
      void lbl.offsetWidth;
      lbl.classList.add("bump");
      setTimeout(() => lbl.classList.remove("bump"), still ? 0 : 700);
      inbox.textContent = String(--left);
      await wait(420);
    }
    box.classList.add("quiet");
    replay.hidden = false;
    replay.onclick = () => {
      for (const row of box.querySelectorAll("li")) row.classList.remove("gone", "flag", "stay");
      for (const lbl of box.querySelectorAll("[data-to]")) {
        lbl.classList.remove("bump");
        lbl.querySelector("b").textContent = "0";
      }
      inbox.textContent = "10";
      box.classList.remove("quiet");
      void plays.sort(box);
    };
  },

  // Trash is pressed, the senders cross out, the count runs to zero, Undo shows.
  async clean(card) {
    await wait(1000);
    const trash = card.querySelector(".trash");
    trash.classList.add("press");
    await wait(160);
    trash.classList.remove("press");
    const rows = [...card.querySelectorAll(".senders li")];
    const counting = count(card.querySelector('[data-count="clean"]'), 111, 0, 1300);
    for (const row of rows) {
      row.classList.add("gone");
      await wait(220);
    }
    await counting;
    card.classList.add("done");
  },

  // Each group's picker slides to how long that group stays.
  async groups(card) {
    await wait(500);
    for (const seg of card.querySelectorAll(".seg")) {
      const pick = Number(seg.dataset.pick);
      const opts = seg.querySelectorAll("s");
      seg.querySelector("i").style.transform = `translateX(${opts[0].offsetWidth * pick}px)`;
      opts.forEach((o, i) => o.classList.toggle("on", i === pick));
      await wait(260);
    }
  },

  // The fake part of each address is marked, then stamped.
  async scams(card) {
    await wait(700);
    for (const row of card.querySelectorAll(".scam")) {
      row.classList.add("hit");
      await wait(550);
    }
  },

  // A question types itself into Ask Kai.
  async ask(box) {
    const q = box.querySelector(".q");
    const text = q.dataset.text;
    if (still) return;
    q.textContent = "";
    await wait(600);
    for (let i = 1; i <= text.length; i++) {
      q.textContent = text.slice(0, i);
      await wait(55);
    }
  },
};

const seen = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      const play = plays[e.target.dataset.play];
      if (play) void play(e.target);
      seen.unobserve(e.target);
    }
  },
  { rootMargin: "0px 0px -15% 0px" },
);
for (const el of document.querySelectorAll(".up")) seen.observe(el);
