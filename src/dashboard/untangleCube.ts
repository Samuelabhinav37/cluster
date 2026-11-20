// The "untangle" cube shown while Cluster reads mail
// (research/2026-11-20-web-onboarding-plan.md, step 3). A real 3x3x3 cube in
// the scan stage's isometric line style: it starts scrambled, with every face
// a mix of label colours, and turns one layer at a time as reading goes on
// until each face is one colour, one label. The turns are the scramble played
// backwards, so the cube really ends solved, and progress decides how many
// turns have happened, so it never runs ahead of the real count.

const SVG = "http://www.w3.org/2000/svg";
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
const COS = Math.cos(Math.PI / 6);
/** Same isometric projection as the scan stage: x right-front, y left-front, z up. */
const project = ([x, y, z]: V, unit: number): [number, number] => [(x - y) * COS * unit, ((x + y) * 0.5 - z) * unit];
/** Faces whose outward normal points at the viewer (1, 1, 1) are drawn. */
const facing = (n: V) => n[0] + n[1] + n[2] > 0.01;
const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** Two half-edge vectors across the face with normal `n`. */
function tangents(n: V): [V, V] {
  if (Math.abs(n[0]) > 0.5) return [[0, 0.5, 0], [0, 0, 0.5]];
  if (Math.abs(n[1]) > 0.5) return [[0.5, 0, 0], [0, 0, 0.5]];
  return [[0.5, 0, 0], [0, 0.5, 0]];
}

const UNIT = 40;
const ALL_NORMALS: V[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const TURN_MS = 620;
/** Ease out with a small overshoot, so a turn snaps into place like a real cube. */
const easeBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

export interface UntangleCube {
  el: SVGSVGElement;
  /** Share read so far, 0 to 1. Turns catch up to it one at a time. */
  progress(share: number): void;
  stop(): void;
}

/** Builds the cube. `turns` is how many turns the scramble has. */
export function untangleCube(turns = 18): UntangleCube {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "-150 -150 300 280");
  svg.setAttribute("class", "unt-cube");
  svg.setAttribute("aria-hidden", "true");
  const floor = document.createElementNS(SVG, "g");
  floor.setAttribute("class", "unt-floor");
  // Dashed construction lines on the floor, like the scan stage's grid.
  for (let i = -3; i <= 3; i++) {
    for (const [a, b] of [
      [[i, -3.2, -1.6], [i, 3.2, -1.6]],
      [[-3.2, i, -1.6], [3.2, i, -1.6]],
    ] as [V, V][]) {
      const line = document.createElementNS(SVG, "path");
      const [ax, ay] = project(a, UNIT * 0.62);
      const [bx, by] = project(b, UNIT * 0.62);
      line.setAttribute("d", `M${ax.toFixed(1)},${(ay + 34).toFixed(1)}L${bx.toFixed(1)},${(by + 34).toFixed(1)}`);
      floor.append(line);
    }
  }
  const body = document.createElementNS(SVG, "g");
  body.setAttribute("class", "unt-body");
  svg.append(floor, body);

  const cube = solvedCube();
  const plan = solution(scramble(turns));
  // Start from the scramble: apply its turns (the solution's inverse) up front.
  for (const m of solution(plan)) applyMove(cube, m);
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  let done = 0;
  let target = 0;
  let turning: { m: Move; t0: number } | null = null;
  let frame = 0;

  function draw(m: Move | null, angle: number) {
    const quads: Array<{ depth: number; d: string; cls: string }> = [];
    for (const c of cube) {
      const moving = m !== null && c.p[m.axis] === m.layer;
      const turn = (v: V): V => (moving && m ? rot(v, m.axis, angle) : v);
      const center = turn(c.p);
      const cubieDepth = center[0] + center[1] + center[2];
      for (const n0 of ALL_NORMALS) {
        const n = turn(n0);
        if (!facing(n)) continue;
        const [u, v] = tangents(n0);
        const sticker = c.stickers.find((s) => s.n[0] === n0[0] && s.n[1] === n0[1] && s.n[2] === n0[2]);
        const corners = (k: number) =>
          ([[1, 1], [1, -1], [-1, -1], [-1, 1]] as const).map(([a, b]) =>
            project(turn(add(add(add(c.p, n0, 0.5), u, a * k), v, b * k)), UNIT),
          );
        const path = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}Z`;
        quads.push({ depth: cubieDepth, d: path(corners(0.96)), cls: "unt-face" });
        if (sticker) quads.push({ depth: cubieDepth + 0.001, d: path(corners(0.78)), cls: `unt-sticker c${sticker.color}` });
      }
    }
    quads.sort((a, b) => a.depth - b.depth);
    body.replaceChildren(
      ...quads.map((q) => {
        const p = document.createElementNS(SVG, "path");
        p.setAttribute("d", q.d);
        p.setAttribute("class", q.cls);
        return p;
      }),
    );
  }

  function tick(now: number) {
    frame = 0;
    if (!turning && done < target) turning = { m: plan[done], t0: now };
    if (turning) {
      const t = Math.min(1, (now - turning.t0) / TURN_MS);
      draw(turning.m, ((turning.m.dir * Math.PI) / 2) * easeBack(t));
      if (t >= 1) {
        applyMove(cube, turning.m);
        done++;
        turning = null;
        draw(null, 0);
        if (done === plan.length) svg.classList.add("is-solved");
      }
      frame = requestAnimationFrame(tick);
    }
  }

  draw(null, 0);
  return {
    el: svg,
    progress(share) {
      target = Math.max(target, Math.min(plan.length, Math.floor(Math.max(0, Math.min(1, share)) * plan.length)));
      if (reduced) {
        while (done < target) applyMove(cube, plan[done++]);
        draw(null, 0);
        svg.classList.toggle("is-solved", done === plan.length);
        return;
      }
      if (!frame) frame = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
