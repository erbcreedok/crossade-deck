// ONE CLOCK FOR THE HUB, and the reason is the kit's own law rather than tidiness: "any continuous
// animation runs on ONE clock — a node does not start its own ticker", guarded in the kit by
// `guard.one-clock`. That scan reads `game-kit/src` and cannot see an app, so the hub keeps the rule
// itself. It already had two candidates on day one — the tile's loading sweep and the felt's drift —
// and two `requestAnimationFrame` loops drift apart, each redrawing over the other's frame.
//
// The loop OWNS THE REDRAW. A tick writes to the tree and says whether it wrote; the frame repaints
// once, at the end, if anybody did. Left to the subscribers, two writers would mean two full plans
// and two stage rebuilds for one frame — and a tick that changed nothing would still pay for one.
//
// Nothing runs while nobody is watching: with no subscribers there is no frame request at all. That
// is what makes "turn the motion off" cost nothing rather than cost a no-op every 16ms.

/** A tick: how long the clock has run, and how long since the last frame. Returns "I wrote". */
export type Tick = (seconds: number, dt: number) => boolean;

export interface Beat {
  /** Join the clock. The returned function leaves it — and the last one out stops the loop. */
  join(tick: Tick): () => void;
  /** Drop everyone and stop. */
  stop(): void;
}

export function beat(redraw: () => void, now: () => number = () => performance.now()): Beat {
  const ticks = new Set<Tick>();
  let frame: number | undefined;
  let started = 0;
  let last = 0;

  const run = (): void => {
    frame = undefined;
    if (ticks.size === 0) return;
    const at = now();
    const seconds = (at - started) / 1000;
    const dt = (at - last) / 1000;
    last = at;
    // Copied before iterating: a tick is allowed to leave the clock from inside itself — the
    // sweep does exactly that when its chunk lands — and a Set edited mid-walk is a bug that
    // shows up as one dropped frame in a hundred.
    let wrote = false;
    for (const tick of [...ticks]) wrote = tick(seconds, dt) || wrote;
    if (wrote) redraw();
    schedule();
  };

  const schedule = (): void => {
    if (frame === undefined && ticks.size > 0) frame = requestAnimationFrame(run);
  };

  return {
    join(tick) {
      if (ticks.size === 0) {
        started = now();
        last = started;
      }
      ticks.add(tick);
      schedule();
      return () => {
        ticks.delete(tick);
        if (ticks.size === 0 && frame !== undefined) {
          cancelAnimationFrame(frame);
          frame = undefined;
        }
      };
    },
    stop() {
      ticks.clear();
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
    },
  };
}
