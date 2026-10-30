/* global document, window, IntersectionObserver, matchMedia, setTimeout */
// Each part fades up as it scrolls in, and each product piece plays its
// little story once. With reduced motion every piece shows its end state.
document.documentElement.classList.add("js");
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms) => new Promise((r) => setTimeout(r, still ? 0 : ms));

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

  // The fake part of each address is marked, then stamped.
  async scams(card) {
    await wait(700);
    for (const row of card.querySelectorAll(".scam")) {
      row.classList.add("hit");
      await wait(550);
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

// Kai: follows the pointer, waves when clicked, answers a few questions.
// The answers are written here; the real Kai lives in the extension.
const answers = [
  [/receipt|order|invoice/i, "In the Receipts label, in Gmail and in Cluster.", "found"],
  [/paypal|scam|fake|real|phish|safe/i, "If the address isn't really paypal.com, I hold it before you open it.", "found"],
  [/read|privacy|private|data/i, "No. I look at who sent it, the subject and the date.", "found"],
  [/undo|back|delete|trash/i, "Yes. Anything I move can come back. Trash keeps it 30 days.", "found"],
  [/most|who sends|newsletter|unsubscribe/i, "Open Clean up. The busiest senders are at the top.", "found"],
  [/hi|hello|hey/i, "Hi! I'm Kai. I keep your inbox calm.", "hello"],
  [/joke|funny/i, "I tried to unsubscribe from my own thoughts. Still getting them.", "joke"],
];
const fallback = ["Good question. Add Cluster and ask me in your own inbox.", "miss"];

const stage = document.getElementById("kai");
if (stage && typeof window.Kai === "function") {
  const kai = new window.Kai(stage, { src: "kai/", imgWidth: 320, auto: true });
  stage.classList.add("on-light");
  const say = document.querySelector(".say");
  const field = document.querySelector(".ask input");
  let turn = 0;

  const ask = async (q) => {
    const mine = ++turn;
    const [, text, kind] = answers.find(([re]) => re.test(q)) || [null, ...fallback];
    say.textContent = "…";
    kai.think(true);
    await wait(700);
    if (mine !== turn) return;
    kai.think(false);
    say.textContent = text;
    kai.react(kind, text.length);
  };

  document.querySelector(".kai-btn").addEventListener("click", () => {
    say.textContent = "Hi! I'm Kai. I keep your inbox calm.";
    kai.react("hello");
  });
  for (const chip of document.querySelectorAll(".chips button")) {
    chip.addEventListener("click", () => void ask(chip.textContent));
    chip.addEventListener("pointerenter", () => kai.lookAt(chip));
  }
  document.querySelector(".ask").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = field.value.trim();
    if (!q) return;
    field.value = "";
    void ask(q);
  });
}
