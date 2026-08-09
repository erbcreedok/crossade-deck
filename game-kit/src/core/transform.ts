// THE TRANSFORM — one value for every "where and how big", and the end of four copies of it.
//
// Before this the same arithmetic was written four times, each slightly differently:
// `originsOf` added positions down the tree, `fitBox` scaled and offset a picture into an area,
// the plan turned units into view pixels in three inline places, and the catalog mapped points
// to fit a pasted shape. None of them knew about the others, and the day a node could be TURNED
// three of the four would have been wrong in three different ways.
//
// It is a 2×3 affine matrix, in the order every graphics API writes it:
//
//     | a c e |     x' = a·x + c·y + e
//     | b d f |     y' = b·x + d·y + f
//
// Which is also what a renderer takes, so the day the plan stops baking points and starts
// handing a matrix down, this is already the thing to hand.

/** An affine map. Immutable, and composed rather than mutated. */
export interface Transform {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export interface Vec {
  readonly x: number;
  readonly y: number;
}

export const IDENTITY: Transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/**
 * A move. Called `move` and not `translate` on purpose: the kit has a guard against the word,
 * because `translate` is what a localization library does, and two meanings under one word is
 * how `canvas` and `interface` went wrong before it.
 */
export function move(x: number, y: number): Transform {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
}

export function scale(sx: number, sy: number = sx): Transform {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

/** Degrees, clockwise on screen — screen `y` grows downward, so this is the visible direction. */
export function rotate(deg: number): Transform {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

/**
 * `outer` applied AFTER `inner` — the order the owner chain reads in: a child's own pose first,
 * then its owner's, then the owner's owner. Written the other way round a card in a turned hand
 * would rotate about the desk's centre, which is a class of bug that looks like a physics
 * mistake rather than an ordering one.
 */
export function compose(outer: Transform, inner: Transform): Transform {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  };
}

/** All of them, left to right — `chain([a, b, c])` is `a` applied last. */
export function chain(all: readonly Transform[]): Transform {
  return all.reduce(compose, IDENTITY);
}

export function apply(t: Transform, p: Vec): Vec {
  return { x: t.a * p.x + t.c * p.y + t.e, y: t.b * p.x + t.d * p.y + t.f };
}

/**
 * A POSE, as one value: move to `at`, turned by `angle`, scaled by `scale`.
 *
 * The order is scale, then rotate, then move — read outwards from the node. Any other
 * order turns "twice as big" into "twice as far away", and the two are told apart only by
 * looking, which is how it stays wrong for a week.
 */
export function pose(at: Vec, angle = 0, size = 1): Transform {
  return compose(compose(move(at.x, at.y), rotate(angle)), scale(size));
}

/**
 * The inverse. Needed the moment anything goes the other way — a pointer in view pixels asking
 * which node it landed on.
 *
 * A singular map (a scale of zero) has no inverse, and the honest answer is `undefined` rather
 * than a matrix full of infinities that fails somewhere far away.
 */
export function invert(t: Transform): Transform | undefined {
  const det = t.a * t.d - t.b * t.c;
  if (det === 0) return undefined;
  return {
    a: t.d / det,
    b: -t.b / det,
    c: -t.c / det,
    d: t.a / det,
    e: (t.c * t.f - t.d * t.e) / det,
    f: (t.b * t.e - t.a * t.f) / det,
  };
}
