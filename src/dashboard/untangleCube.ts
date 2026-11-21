// The "untangle" cube shown while Cluster reads mail
// (research/2026-11-20-web-onboarding-plan.md, step 3). A real 3x3x3 cube in
// black, white and greys (2026-11-20 review): each label is one shade. It
// starts scrambled, slowly spins the whole time, and turns one layer at a
// time as reading goes on until each face is one shade, one label. The turns are the scramble played
// backwards, so the cube really ends solved, and progress decides how many
// turns have happened, so it never runs ahead of the real count.

type V = [number, number, number];
type Axis = 0 | 1 | 2;

/** One quarter turn: the layer at `layer` (-1, 0 or 1) on `axis`, by `dir` (+1 or -1). */
export interface Move {
  axis: Axis;
  layer: -1 | 0 | 1;
  dir: 1 | -1;
}

interface Sticker {
  n: V;
  color: number;
}
interface Cubie {
  p: V;
  stickers: Sticker[];
}

/** Turns a vector a quarter (or `t` of a quarter) around an axis. */
function rot(v: V, axis: Axis, angle: number): V {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const [x, y, z] = v;
  if (axis === 0) return [x, y * c - z * s, y * s + z * c];
  if (axis === 1) return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}
const round = (v: V): V => v.map((n) => Math.round(n)) as V;

/** A solved cube: each of the six outward faces has its own colour 0..5. */
export function solvedCube(): Cubie[] {
  const cubies: Cubie[] = [];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        const stickers: Sticker[] = [];
        if (x) stickers.push({ n: [x, 0, 0], color: x > 0 ? 0 : 1 });
        if (y) stickers.push({ n: [0, y, 0], color: y > 0 ? 2 : 3 });
        if (z) stickers.push({ n: [0, 0, z], color: z > 0 ? 4 : 5 });
        cubies.push({ p: [x, y, z], stickers });
      }
  return cubies;
}

/** Applies one whole quarter turn to the cube, in place. */
export function applyMove(cube: Cubie[], m: Move): void {
  const a = (m.dir * Math.PI) / 2;
  for (const c of cube) {
    if (c.p[m.axis] !== m.layer) continue;
    c.p = round(rot(c.p, m.axis, a));
    for (const s of c.stickers) s.n = round(rot(s.n, m.axis, a));
  }
}

/** `count` random outer-layer turns, never undoing the one before. */
export function scramble(count: number, random = Math.random): Move[] {
  const moves: Move[] = [];
  while (moves.length < count) {
    const m: Move = {
      axis: Math.floor(random() * 3) as Axis,
      layer: random() < 0.5 ? -1 : 1,
      dir: random() < 0.5 ? -1 : 1,
    };
    const prev = moves[moves.length - 1];
    if (prev && prev.axis === m.axis && prev.layer === m.layer) continue;
    moves.push(m);
  }
  return moves;
}

/** The turns that solve a scramble: the same turns, backwards and reversed. */
export const solution = (moves: Move[]): Move[] => [...moves].reverse().map((m) => ({ ...m, dir: (-m.dir) as 1 | -1 }));

/** True when every face shows one colour. */
export function isSolved(cube: Cubie[]): boolean {
  const seen = new Map<string, number>();
  for (const c of cube)
    for (const s of c.stickers) {
      const key = s.n.join(",");
      if (seen.has(key) && seen.get(key) !== s.color) return false;
      seen.set(key, s.color);
    }
  return true;
}

// ── Drawing ──────────────────────────────────────────────────────────────
const SVG = "http://www.w3.org/2000/svg";
const SCALE = 38;
const PITCH = -0.52;
// Held still at one three-quarter angle: a spin hid the layer turns, so the cube read as
// "just rotating" (2026-11-20 review). Only a turning layer moves, drawn at about 24 frames
// a second, and nothing is redrawn between turns, to go easy on the CPU.
const YAW = 0.6;
const FRAME_MS = 42;
// Slow, steady turns with a rest between (2026-11-20 review: "solving slowly").
const TURN_MS = 1000;
const REST_MS = 180;
/** Detours open at once while waiting for the read to earn the next solving turn. */
const WOBBLE_MAX = 2;
const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const ALL_NORMALS: V[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
/** Ease out with a small overshoot, so a turn snaps into place like a real cube. */
const easeBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

/** Two half-edge vectors across the face with normal `n`. */
function tangents(n: V): [V, V] {
  if (Math.abs(n[0]) > 0.5) return [[0, 0.5, 0], [0, 0, 0.5]];
  if (Math.abs(n[1]) > 0.5) return [[0.5, 0, 0], [0, 0, 0.5]];
  return [[0.5, 0, 0], [0, 0.5, 0]];
}

/** The camera: spin around the cube's up axis (z), then tip it toward you. */
function view(v: V, yaw: number): V {
  const a = rot(v, 2, yaw);
  return rot([a[0], a[2], a[1]], 0, PITCH);
}

export interface Quad {
  depth: number;
  d: string;
  /** "unt-face" for the plastic, "unt-sticker c0".."c5" for a sticker. */
  cls: string;
  /** How much the face turns toward the light, 0..1: faces away go darker. */
  light: number;
}

/** Every visible face of every cubie, back to front, as SVG paths. */
export function cubeQuads(cube: Cubie[], m: Move | null, angle: number, yaw: number): Quad[] {
  const quads: Quad[] = [];
  for (const c of cube) {
    const moving = m !== null && c.p[m.axis] === m.layer;
    const turn = (v: V): V => (moving && m ? rot(v, m.axis, angle) : v);
    for (const n0 of ALL_NORMALS) {
      const n = view(turn(n0), yaw);
      if (n[2] > -0.01) continue; // faces away, or edge-on
      const [u, v] = tangents(n0);
      const sticker = c.stickers.find((s) => s.n[0] === n0[0] && s.n[1] === n0[1] && s.n[2] === n0[2]);
      const corners = (k: number) =>
        ([[1, 1], [1, -1], [-1, -1], [-1, 1]] as const).map(([a, b]) => view(turn(add(add(add(c.p, n0, 0.5), u, a * k), v, b * k)), yaw));
      const path = (pts: V[]) => `M${pts.map(([x, y]) => `${(x * SCALE).toFixed(1)},${(-y * SCALE).toFixed(1)}`).join("L")}Z`;
      const face = corners(0.98);
      const depth = -face.reduce((d, p) => d + p[2], 0) / 4;
      // Light from the top left, toward the viewer.
      const light = Math.max(0, Math.min(1, 0.55 - n[2] * 0.25 + n[1] * 0.35 - n[0] * 0.15));
      quads.push({ depth, d: path(face), cls: "unt-face", light });
      if (sticker) quads.push({ depth: depth + 0.001, d: path(corners(0.8)), cls: `unt-sticker c${sticker.color}`, light });
    }
  }
  return quads.sort((a, b) => a.depth - b.depth);
}

export interface UntangleCube {
  el: SVGSVGElement;
  /** Share read so far, 0 to 1. Turns catch up to it one at a time. */
  progress(share: number): void;
  stop(): void;
}

/** Builds the cube. `turns` is how many turns the scramble has. */
export function untangleCube(turns = 18): UntangleCube {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "-110 -110 220 220");
  svg.setAttribute("class", "unt-cube");
  svg.setAttribute("aria-hidden", "true");
  const shadow = document.createElementNS(SVG, "ellipse");
  shadow.setAttribute("class", "unt-shadow");
  for (const [k, v] of Object.entries({ cx: 0, cy: 100, rx: 70, ry: 8 })) shadow.setAttribute(k, String(v));
  const body = document.createElementNS(SVG, "g");
  body.setAttribute("class", "unt-body");
  svg.append(shadow, body);

  const cube = solvedCube();
  const plan = solution(scramble(turns));
  // Start from the scramble: apply its turns (the solution's inverse) up front.
  for (const m of solution(plan)) applyMove(cube, m);
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  // The turns left to solve it. Reading earns solving turns (`target`); while it
  // hasn't earned one, the cube keeps working anyway (2026-11-20 review: "keep on
  // solving, don't stop"): it turns a layer out of the way and later turns it back.
  // At most WOBBLE_MAX of those are open, so the final unwind is short, and it is
  // only solved once everything is read.
  const pending: Array<{ m: Move; back: boolean }> = plan.map((m) => ({ m, back: false }));
  let real = 0;
  let target = 0;
  let open = 0;
  let turning: { m: Move; t0: number; kind: "solve" | "out" | "back" } | null = null;
  let restUntil = 0;
  let frame = 0;
  let stopped = false;
  let shown = false;
  let drawnAt = 0;

  /** A turn on another axis than the next one to solve, so it never just cancels it. */
  function wanderMove(): Move {
    const axes = ([0, 1, 2] as Axis[]).filter((a) => a !== pending[0]?.m.axis);
    return { axis: axes[Math.floor(Math.random() * axes.length)], layer: Math.random() < 0.5 ? -1 : 1, dir: Math.random() < 0.5 ? -1 : 1 };
  }

  function draw(m: Move | null, angle: number, yaw: number) {
    body.replaceChildren(
      ...cubeQuads(cube, m, angle, yaw).map((q) => {
        const p = document.createElementNS(SVG, "path");
        p.setAttribute("d", q.d);
        p.setAttribute("class", q.cls);
        p.style.setProperty("--l", q.light.toFixed(2));
        return p;
      }),
    );
  }

  /** The next turn: earned solving first, else an open detour back once enough are open, else a new detour. */
  function nextTurn(now: number) {
    const front = pending[0];
    if (!front) return;
    // Fully earned (all read): only unwinding now, no more detours.
    if (real < target || target === plan.length || (front.back && open >= WOBBLE_MAX)) {
      pending.shift();
      turning = { m: front.m, t0: now, kind: front.back ? "back" : "solve" };
      return;
    }
    const m = wanderMove();
    pending.unshift({ m: { ...m, dir: m.dir === 1 ? -1 : 1 }, back: true });
    open++;
    turning = { m, t0: now, kind: "out" };
  }

  // Always turning while on screen and unsolved, so it never looks stuck.
  function tick(now: number) {
    frame = 0;
    if (stopped) return;
    // Off the page (the screen moved on): stop drawing.
    if (svg.isConnected) shown = true;
    else if (shown) return;
    if (!turning && now >= restUntil) nextTurn(now);
    if (turning) {
      const t = Math.min(1, (now - turning.t0) / TURN_MS);
      if (t < 1 && now - drawnAt >= FRAME_MS) {
        drawnAt = now;
        draw(turning.m, ((turning.m.dir * Math.PI) / 2) * easeBack(t), YAW);
      }
      if (t >= 1) {
        applyMove(cube, turning.m);
        if (turning.kind === "solve") real++;
        if (turning.kind === "back") open--;
        turning = null;
        restUntil = now + REST_MS;
        draw(null, 0, YAW);
        if (pending.length === 0) svg.classList.add("is-solved");
      }
    }
    // Solved: nothing left to draw.
    if (pending.length > 0 || turning) frame = requestAnimationFrame(tick);
  }

  draw(null, 0, YAW);
  if (!reduced) frame = requestAnimationFrame(tick);
  return {
    el: svg,
    progress(share) {
      target = Math.max(target, Math.min(plan.length, Math.floor(Math.max(0, Math.min(1, share)) * plan.length)));
      if (reduced) {
        while (real < target) {
          applyMove(cube, pending.shift()!.m);
          real++;
        }
        draw(null, 0, YAW);
        svg.classList.toggle("is-solved", pending.length === 0);
        return;
      }
      if (!frame && !stopped) frame = requestAnimationFrame(tick);
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/** How far setup's quick scan of 100 emails turns the cube; the dashboard's read does the rest. */
export const SETUP_SHARE = 0.5;
let shared: UntangleCube | null = null;
/** One cube for the whole first read (2026-11-20 review): setup's scan turns
 * it partway, then the dashboard's read (its card, or the sidebar card on
 * other pages) carries on with the same cube until labels go on and it is
 * solved. Appending its element elsewhere moves it. */
export function sharedCube(): UntangleCube {
  return (shared ??= untangleCube(18));
}
