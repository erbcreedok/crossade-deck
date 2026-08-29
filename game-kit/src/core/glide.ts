// THE GLIDE — how a desk takes a speed away, and how far what is left will carry.
//
// This is the run-out of a thrown thing, and it is NOT the kit's invention. Every scrolling surface
// on both phones decelerates the same way, and both publish the number: iOS calls it
// `UIScrollView.decelerationRate` (`.normal` = 0.998, `.fast` = 0.99, per MILLISECOND), Android the
// same figure through `ViewConfiguration.getScrollFriction`. The native app is Swift on this model
// and has to move one-to-one with the web, so the law is written here with Apple's own units, and
// the Swift side sets `decelerationRate` to the same number instead of re-deriving anything.
//
// WHY IT REPLACED A LINEAR FRICTION. A linear friction takes a fixed amount of speed per second, so
// the last frames of a run-out are the ones where the largest FRACTION of the speed goes: a body
// travels, travels, and then stops as if it hit something. Exponential decay takes a fixed FRACTION
// per millisecond — fast at first, and a long soft tail. That tail is the whole feel of a card
// coming to rest on felt, and it is why a phone's scroll feels like a phone's scroll.
//
// THE THREE QUESTIONS A THROW ASKS, all answered from the one rate:
//   • `after(dt)`         — what fraction of the speed survives this step. The integrator's lever.
//   • `project(speed)`    — HOW FAR IT WILL GET. Asked BEFORE the throw, which is what makes
//                           "the landing point is worked out in advance" a fact and not a hope.
//   • `speedFor(dist)`    — the same read the other way up: the speed that dies exactly `dist` away.
//                           A throw aimed at a seat is launched with this, so it arrives without a
//                           correction at the end — and a correction at the end IS the jerk.
// `project` and the integrator agree because both come from the same integral (see `travel`), not
// because two formulas were tuned to look alike. Apple publish `project` as
// `(v / 1000) * rate / (1 - rate)` — the discrete sum of the same decay, a tenth of a percent apart.
//
// A REGISTRY, like the easings and the shuffles: a law is named, and a scene names it. The name is
// what crosses the wire to the Swift side; the arithmetic is what makes the two move alike.

/**
 * A NAMED RUN-OUT LAW. Everything is derived from `rate` — a law is one number wearing the four
 * questions a throw asks of it.
 */
export interface GlideLaw {
  /** Apple's `decelerationRate`: the fraction of the speed left after ONE MILLISECOND. */
  readonly rate: number;
  /** The fraction of a speed left after `dt` SECONDS. */
  readonly after: (dt: number) => number;
  /** How far a body going `speed` travels during `dt` seconds — the exact integral, not `v·dt`. */
  readonly travel: (speed: number, dt: number) => number;
  /** How far a body going `speed` still has to go before it stops. `Infinity` for a frictionless law. */
  readonly project: (speed: number) => number;
  /** The speed that dies exactly `dist` away — the inverse of `project`. `0` for a frictionless law. */
  readonly speedFor: (dist: number) => number;
}

/**
 * A law from a deceleration rate PER MILLISECOND, Apple's unit.
 *
 * `1` and above is frictionless — a body that never stops, which `project` reports honestly as
 * `Infinity` rather than as a very large number a caller would then use as a distance. `0` and
 * below is a desk of glue: the speed is gone on the first step.
 */
export function decayGlide(rate: number): GlideLaw {
  if (!(rate > 0)) {
    return { rate: 0, after: () => 0, travel: () => 0, project: () => 0, speedFor: () => Infinity };
  }
  if (rate >= 1) {
    return { rate: 1, after: () => 1, travel: (speed, dt) => speed * dt, project: () => Infinity, speedFor: () => 0 };
  }
  // The decay per SECOND, as a rate constant: `after(dt) = e^(−lambda·dt)`. Everything below is the
  // integral of that, which is why the projection and the stepping cannot drift apart.
  const lambda = -Math.log(rate) * 1000;
  const after = (dt: number): number => Math.exp(-lambda * dt);
  return {
    rate,
    after,
    travel: (speed, dt) => (speed * (1 - after(dt))) / lambda,
    project: (speed) => speed / lambda,
    speedFor: (dist) => dist * lambda,
  };
}

const GLIDES = new Map<string, GlideLaw>();

export function registerGlide(name: string, law: GlideLaw): void {
  GLIDES.set(name, law);
}

/**
 * The named law. An unknown name falls back to `normal` — the shuffles' precedent and not the
 * motions': a throw with no run-out law does not fail quietly, it flies off the desk forever, and
 * "the platform default" is the one answer that is never wrong enough to hide a typo.
 */
export function glideLaw(name: string): GlideLaw {
  return GLIDES.get(name) ?? GLIDES.get("normal") ?? decayGlide(NORMAL_RATE);
}

/** A law given by name or handed over on the spot — what a per-throw option accepts. */
export function asGlide(law: string | GlideLaw): GlideLaw {
  return typeof law === "string" ? glideLaw(law) : law;
}

export function glideNames(): readonly string[] {
  return [...GLIDES.keys()];
}

/** Test seam only — the registry is process-wide and suites must not leak into each other. */
export function resetGlides(): void {
  GLIDES.clear();
}

/** `UIScrollView.DecelerationRate.normal` — what a finger flicking a list gets. */
export const NORMAL_RATE = 0.998;
/** `UIScrollView.DecelerationRate.fast` — a page that is meant to stop under the finger. */
export const FAST_RATE = 0.99;

export function installStockGlides(): void {
  registerGlide("normal", decayGlide(NORMAL_RATE));
  registerGlide("fast", decayGlide(FAST_RATE));
}
