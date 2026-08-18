// THE FELT DRIFTS — client1's `drift-clubs`, expressed as a pose instead of as a CSS keyframe.
//
// It moves the FELT, not the desk: the title and the shelf stand still on a table whose weave
// crawls under them. That is the whole reason the ground is a node of its own.
//
// A STEP, NOT A POSITION AT TIME T.
//
// `drift(t)` would be shorter and wrong: the moment the pace changes — a settings switch, a
// power-saving mode — the whole pattern would jump to wherever `t × newSpeed` lands. The kit's own
// motion runtime states the rule for flights and it holds here too: "the flight keeps its progress
// and only its pace changes". So this integrates, and the caller keeps the progress.

/** A place on the felt, in TILES. */
export interface Drift {
  readonly x: number;
  readonly y: number;
}

export const AT_REST: Drift = { x: 0, y: 0 };

/**
 * client1's own numbers: `drift-clubs` runs 90s from `0 0` to `720px 432px` over a 72px tile —
 * ten tiles across and six down. Kept as the journey it is rather than reduced to a speed, so the
 * line can be read against the stylesheet it came from.
 */
export const DRIFT = { tilesX: 10, tilesY: 6, seconds: 90 } as const;

/**
 * Advance the felt by `dt` seconds at `speed` times the designed pace, and WRAP.
 *
 * Wrapped because the pattern repeats: a tile over is the same picture, so the node never has to
 * travel — and a drift that ran all evening without this would carry the felt several thousand
 * units off the desk, where the numbers stop being small and start being suspicious.
 *
 * `speed` is the viewer's `motionSpeed`, and `0` means STILL — not slow. Nothing accumulates while
 * it is zero, so a reader who turns motion off and back on finds the pattern where they left it.
 */
export function driftStep(from: Drift, dtSeconds: number, speed: number): Drift {
  // A hidden tab hands back a huge `dt` on the frame it wakes up. Guarded rather than clamped: a
  // clamp would still lurch a fraction of a tile, and nobody is owed the drift they slept through.
  if (!(dtSeconds > 0) || !(speed > 0) || !Number.isFinite(dtSeconds)) return from;
  const gone = (dtSeconds * speed) / DRIFT.seconds;
  return {
    x: wrap(from.x + gone * DRIFT.tilesX),
    y: wrap(from.y + gone * DRIFT.tilesY),
  };
}

/** Into `[0, 1)` — one tile. `%` alone keeps the sign, and a negative pace is a legal setting. */
function wrap(v: number): number {
  const inside = v % 1;
  return inside < 0 ? inside + 1 : inside;
}
