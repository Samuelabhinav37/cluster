// The "untangle" cube shown while Cluster reads mail
// (research/2026-11-20-web-onboarding-plan.md, step 3). A real 3x3x3 cube
// drawn in black-and-white ASCII (2026-11-20 review): each label is its own
// character instead of a colour. It starts scrambled, slowly spins the whole
// time, and turns one layer at a time as reading goes on until each face is
// one character, one label. The turns are the scramble played
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
/** One character per label (sticker colour); the plastic between stickers is ':'. */
const INK = ["@", "#", "%", "*", "+", "="];
const COLS = 58;
const ROWS = 22;
/** A monospace cell is about 0.6 as wide as it is tall (line-height 1 in dashboard.css). */
const ASPECT = 0.6;
const SCALE = 6.2;
const PITCH = -0.52;
const SPIN_PER_MS = 0.00042;
const TURN_MS = 620;
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

type Quad = { depth: number; pts: [number, number][]; ink: string };

/** Fills a convex quad into the grid (cells whose centre is inside it). */
function fill(grid: string[], q: Quad) {
  const xs = q.pts.map((p) => p[0]);
  const ys = q.pts.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(COLS - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(ROWS - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      let pos = 0;
      let neg = 0;
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = q.pts[i];
        const [bx, by] = q.pts[(i + 1) % 4];
        const c = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if (c > 0) pos++;
        else if (c < 0) neg++;
      }
      if (!pos || !neg) grid[y * COLS + x] = q.ink;
    }
}

/** The cube as text: every visible face of every cubie, back to front. */
export function renderAscii(cube: Cubie[], m: Move | null, angle: number, yaw: number): string {
  const quads: Quad[] = [];
  for (const c of cube) {
    const moving = m !== null && c.p[m.axis] === m.layer;
    const turn = (v: V): V => (moving && m ? rot(v, m.axis, angle) : v);
    for (const n0 of ALL_NORMALS) {
      const n = view(turn(n0), yaw);
      if (n[2] > -0.01) continue; // faces you, or edge-on
      const [u, v] = tangents(n0);
      const sticker = c.stickers.find((s) => s.n[0] === n0[0] && s.n[1] === n0[1] && s.n[2] === n0[2]);
      const corners = (k: number) =>
        ([[1, 1], [1, -1], [-1, -1], [-1, 1]] as const).map(([a, b]) => view(turn(add(add(add(c.p, n0, 0.5), u, a * k), v, b * k)), yaw));
      const toGrid = (pts: V[]) => pts.map(([x, y]) => [COLS / 2 + x * SCALE, ROWS / 2 - y * SCALE * ASPECT] as [number, number]);
      const face = corners(0.98);
      const depth = -face.reduce((d, p) => d + p[2], 0) / 4;
      quads.push({ depth, pts: toGrid(face), ink: ":" });
      if (sticker) quads.push({ depth: depth + 0.001, pts: toGrid(corners(0.74)), ink: INK[sticker.color] });
    }
  }
  quads.sort((a, b) => a.depth - b.depth);
  const grid: string[] = new Array<string>(COLS * ROWS).fill(" ");
  for (const q of quads) fill(grid, q);
  const lines: string[] = [];
  for (let y = 0; y < ROWS; y++) lines.push(grid.slice(y * COLS, (y + 1) * COLS).join("").trimEnd());
  return lines.join("\n");
}

export interface UntangleCube {
  el: HTMLElement;
  /** Share read so far, 0 to 1. Turns catch up to it one at a time. */
  progress(share: number): void;
  stop(): void;
}

/** Builds the cube. `turns` is how many turns the scramble has. */
export function untangleCube(turns = 18): UntangleCube {
  const pre = document.createElement("pre");
  pre.className = "unt-cube";
  pre.setAttribute("aria-hidden", "true");

  const cube = solvedCube();
  const plan = solution(scramble(turns));
  // Start from the scramble: apply its turns (the solution's inverse) up front.
  for (const m of solution(plan)) applyMove(cube, m);
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  let done = 0;
  let target = 0;
  let turning: { m: Move; t0: number } | null = null;
  let frame = 0;
  let stopped = false;
  let shown = false;
  const yaw0 = performance.now();
  const yawAt = (now: number) => (reduced ? 0.6 : 0.6 + (now - yaw0) * SPIN_PER_MS);

  // Always running while on screen: the cube spins between turns, so it never looks stuck.
  function tick(now: number) {
    frame = 0;
    if (stopped) return;
    // Off the page (the screen moved on): stop drawing.
    if (pre.isConnected) shown = true;
    else if (shown) return;
    if (!turning && done < target) turning = { m: plan[done], t0: now };
    if (turning) {
      const t = Math.min(1, (now - turning.t0) / TURN_MS);
      pre.textContent = renderAscii(cube, turning.m, ((turning.m.dir * Math.PI) / 2) * easeBack(t), yawAt(now));
      if (t >= 1) {
        applyMove(cube, turning.m);
        done++;
        turning = null;
        if (done === plan.length) pre.classList.add("is-solved");
      }
    } else pre.textContent = renderAscii(cube, null, 0, yawAt(now));
    frame = requestAnimationFrame(tick);
  }

  pre.textContent = renderAscii(cube, null, 0, yawAt(yaw0));
  if (!reduced) frame = requestAnimationFrame(tick);
  return {
    el: pre,
    progress(share) {
      target = Math.max(target, Math.min(plan.length, Math.floor(Math.max(0, Math.min(1, share)) * plan.length)));
      if (reduced) {
        while (done < target) applyMove(cube, plan[done++]);
        pre.textContent = renderAscii(cube, null, 0, yawAt(0));
        pre.classList.toggle("is-solved", done === plan.length);
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
