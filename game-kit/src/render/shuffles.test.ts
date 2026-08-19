// THE RECIPES THEMSELVES — pure functions, so the whole of what a shuffle LOOKS like can be held by
// a plain test with no clock, no renderer and no tree. The runtime's half of the story (one commit,
// at the phase, viewer speed) is `animator.test.ts`; here it is only the picture.

import { describe, expect, it } from "vitest";
import { apply, move, type Transform, type Vec } from "../core/transform.js";
import {
  overhand,
  riffle,
  shake,
  wash,
  type ShuffleBox,
  type ShuffleContext,
  type ShuffleRecipe,
} from "./shuffles.js";

/** A row of `n` seats a unit apart, centred, and a glass around them — a phone in units. */
function bench(n: number, glass: ShuffleBox = { x: -5, y: -4, w: 10, h: 8 }) {
  const seats: Vec[] = Array.from({ length: n }, (_, i) => ({ x: i - (n - 1) / 2, y: 0 }));
  const ctx: ShuffleContext = {
    centre: { x: 0, y: 0 },
    spread: { w: n - 1, h: 0 },
    seats,
    glass,
  };
  const rests: Transform[] = seats.map((s) => move(s.x, s.y));
  const at = (r: ShuffleRecipe, i: number, t: number): Vec => apply(r.poseAt(i, n, t, rests[i]!, ctx), { x: 0, y: 0 });
  const outside = (p: Vec): boolean => p.x < glass.x || p.x > glass.x + glass.w || p.y < glass.y || p.y > glass.y + glass.h;
  return { ctx, seats, rests, at, outside, n };
}

const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

describe("the shuffle recipes", () => {
  it("shuffle.a-packet-goes-out-in-sight-or-off-the-glass — both, and the watched one is stock", () => {
    // NOTHING IS EVER SWAPPED: every node keeps its identity, a reorder only moves who sits where.
    // A shuffle is a thing to WATCH, so by default the pack stays in the picture — a fanned packet
    // has no top for the reorder to change, which is what made the swap readable. A deep pack
    // cannot be fanned, and for that there is `glass`: the packet leaves the picture entirely.
    for (const [name, make] of [["riffle", riffle], ["overhand", overhand]] as const) {
      const b = bench(6);
      const stock = make();
      const hidden = make({ reach: "glass" });
      for (let i = 0; i < b.n; i++) {
        expect(b.outside(b.at(stock, i, stock.commitAt)), `${name} #${i} stock`).toBe(false);
        expect(b.outside(b.at(hidden, i, hidden.commitAt)), `${name} #${i} off the glass`).toBe(true);
      }
      // And on a glass barely wider than the group, where "clear of the group" alone would put the
      // packet past the edge: a watched shuffle is pulled back in rather than half-shown.
      const tight = bench(6, { x: -3, y: -3, w: 6, h: 6 });
      for (let i = 0; i < tight.n; i++) {
        expect(tight.outside(tight.at(stock, i, stock.commitAt)), `${name} #${i} on a tight glass`).toBe(false);
      }
    }
  });

  it("shuffle.a-packet-is-fanned-not-piled — the pieces stand apart while they are out", () => {
    // The reason the watched one can be watched. A packet parked as a tight pile shows only its top
    // piece, and a reorder changes which piece that is — that is the whole of what read as a card
    // changing its face. Fanned, there is no top to change, either reach.
    for (const [name, make] of [["riffle", riffle], ["overhand", overhand]] as const) {
      for (const reach of ["group", "glass"] as const) {
        const b = bench(6);
        const recipe = make({ reach });
        const out = Array.from({ length: b.n }, (_, i) => b.at(recipe, i, recipe.commitAt));
        for (let i = 0; i < b.n; i++) {
          for (let j = i + 1; j < b.n; j++) {
            expect(dist(out[i]!, out[j]!), `${name}/${reach} #${i} vs #${j}`).toBeGreaterThan(0.3);
          }
        }
      }
    }
  });

  it("shuffle.at-the-commit-a-piece-either-moves-or-stands-clear — a still pile trades places", () => {
    // The paint order is the TREE's, so it turns over with the reorder — at the commit, exactly.
    // Two pieces lying on each other and standing still therefore visibly trade places, which is
    // the swap of faces a shuffle must never show. Either of two things prevents it: the pieces
    // stand clear of each other (nothing to trade), or they are mid-flight (nothing to read).
    for (const [name, recipe] of [["riffle", riffle()], ["overhand", overhand()], ["wash", wash()]] as const) {
      const b = bench(7);
      const d = 0.02;
      for (let i = 0; i < b.n; i++) {
        const at = b.at(recipe, i, recipe.commitAt);
        const moved = dist(b.at(recipe, i, recipe.commitAt + d), b.at(recipe, i, recipe.commitAt - d));
        let closest = Infinity;
        for (let j = 0; j < b.n; j++) if (j !== i) closest = Math.min(closest, dist(at, b.at(recipe, j, recipe.commitAt)));
        expect(moved > 0.05 || closest > 0.9, `${name} #${i}: moved ${moved.toFixed(2)}, nearest ${closest.toFixed(2)}`).toBe(true);
      }
    }
  });

  it("shuffle.a-recipe-arrives-instead-of-snapping — the last frame is a landing, not a jump", () => {
    // `t = 1` returning `rest` is not the same as GETTING there: a leg whose timing runs past the
    // end leaves the piece halfway home and the last frame teleports it. Measured a hair before
    // the end, where a recipe that arrives is already all but home.
    for (const [name, recipe] of [["riffle", riffle()], ["overhand", overhand()], ["wash", wash()], ["shake", shake()]] as const) {
      const b = bench(7);
      for (let i = 0; i < b.n; i++) {
        expect(dist(b.at(recipe, i, 0.99), b.seats[i]!), `${name} #${i}`).toBeLessThan(0.15);
      }
    }
  });

  it("shuffle.the-pose-at-the-commit-ignores-the-seat — the frame the rests move under it", () => {
    // The runtime reorders AT `commitAt`, and every rest changes in that one frame. A recipe still
    // building its pose on the seat jumps to the new one — which is exactly what a swapped face
    // looks like. Same piece, two different seats, one and the same pose.
    const recipes: readonly [string, ShuffleRecipe][] = [
      ["riffle", riffle()],
      ["riffle (off the glass)", riffle({ reach: "glass" })],
      ["overhand", overhand()],
      ["wash", wash()],
      ["shake", shake()],
      ["shake (still)", shake({ strength: 0 })],
    ];
    for (const [name, recipe] of recipes) {
      const b = bench(6);
      const here = apply(recipe.poseAt(2, b.n, recipe.commitAt, move(1, 0), b.ctx), { x: 0, y: 0 });
      const moved = apply(recipe.poseAt(2, b.n, recipe.commitAt, move(-3, 2), b.ctx), { x: 0, y: 0 });
      expect(moved.x, `${name} x`).toBeCloseTo(here.x, 6);
      expect(moved.y, `${name} y`).toBeCloseTo(here.y, 6);
    }
  });

  it("shuffle.a-recipe-lands-exactly-on-the-seat — no settle has to tidy up after it", () => {
    const b = bench(5);
    for (const recipe of [riffle(), overhand(), wash(), shake()]) {
      for (let i = 0; i < b.n; i++) {
        const end = b.at(recipe, i, 1);
        expect(end.x).toBeCloseTo(b.seats[i]!.x, 6);
        expect(end.y).toBeCloseTo(b.seats[i]!.y, 6);
      }
    }
  });

  it("shuffle.a-shake-keeps-changing-hands — the pieces keep landing on each other's seats", () => {
    // The trembling is not the shuffle; the CHANGING OF HANDS is. A group that trembles and swaps
    // its faces in one frame is the thing this replaces: here a piece is thrown onto a neighbour's
    // seat over and over, all the while it shakes, and the harder the shake the oftener.
    const b = bench(6);
    /** The seats piece `i` is seen over, in order — the hands it changes through the whole shuffle. */
    const visited = (recipe: ShuffleRecipe, i: number): number[] => {
      const seen: number[] = [];
      for (let k = 0; k <= 200; k++) {
        const p = b.at(recipe, i, k / 200);
        // The NEAREST seat, with no tolerance to tune: a harder shake trembles wider, and a
        // threshold that fit the stock tremble would simply stop seeing the harder one.
        let near = 0;
        for (let j = 1; j < b.seats.length; j++) if (dist(b.seats[j]!, p) < dist(b.seats[near]!, p)) near = j;
        if (near !== seen[seen.length - 1]) seen.push(near);
      }
      return seen;
    };
    const soft = visited(shake({ strength: 1 }), 2);
    const hard = visited(shake({ strength: 3 }), 2);
    expect(soft.length).toBeGreaterThan(2); // it changed hands more than once
    expect(hard.length).toBeGreaterThan(soft.length); // harder shake, oftener
    expect(soft[soft.length - 1]).toBe(2); // and it lands on the seat the tree gave it
    // A shake of no strength still trembles, but never changes hands — one seat, its own.
    expect(new Set(visited(shake({ strength: 0 }), 2)).size).toBe(1);
  });

  it("shuffle.a-wash-takes-the-radius-it-is-given — and works one out when it is not", () => {
    const b = bench(6); // seats span 5 units, so the ring that clears them is 5/2 + 0.7
    const ring = (recipe: ShuffleRecipe): number => dist(b.at(recipe, 1, 0.5), b.ctx.centre);
    expect(ring(wash({ radius: 2.5 }))).toBeCloseTo(2.5, 6);
    expect(ring(wash({ radius: 6 }))).toBeCloseTo(6, 6);
    expect(ring(wash())).toBeCloseTo(3.2, 6);
    expect(ring(wash({ radius: 0 }))).toBeCloseTo(3.2, 6); // a ring of no radius is not a ring: auto
  });
});
