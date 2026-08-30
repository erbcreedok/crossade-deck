// THE THROWS — a fall down the screen and a slide across the desk.
//
// A body, not a curve: where it ends is the physics' answer and nobody else's, which is the whole
// difference from a choreography (`choreographies.ts`). The two are carried as functions on the
// flight record — the runtime steps and asks "is it over", it never reads which sort this is.

import { bodyAt, slideCaught, slideRests, stepFall, stepSlide, velocityOf, type Body } from "../../core/ballistic.js";
import { asGlide } from "../../core/glide.js";
import { snapRests, stepSnap } from "../../core/snap.js";
import { apply } from "../../core/transform.js";
import { turnOf } from "./poses.js";
import { type Motions } from "./motions.js";
import { OFF_GLASS, SLIDE_EPS, SPIN_EPS, facesLeft } from "./physics.js";
import { type Runtime } from "./runtime.js";

type Throws = Pick<Motions, "launch" | "slide" | "snap">;

export function throws(rt: Runtime): Throws {
  return {
    launch(id, opts) {
      const rest = rt.restOf(id);
      if (!rest) return;
      // The rt.glass is read at EVERY step, not captured here: a launch asked before the page has laid
      // the view out (a celebration on load) sees a zero rt.glass, and a zero rt.glass must mean "not yet",
      // never "already gone".
      const gravity = opts.gravity ?? rt.tuning.gravity;
      const bounce = opts.bounce ?? rt.tuning.bounce;
      const floorOf = (): number => opts.floor ?? rt.glass().halfH;
      let bounces = 0;
      const offGlass = (b: Body): boolean => {
        const { halfW, halfH } = rt.glass();
        if (halfW <= 0) return !Number.isFinite(b.pos.x);
        return Math.abs(b.pos.x) > halfW + OFF_GLASS || b.pos.y > halfH + OFF_GLASS;
      };
      rt.beginFlight(id, {
        body: { ...bodyAt(apply(rest, { x: 0, y: 0 })), vel: velocityOf(opts.speed, opts.angle), spin: opts.spin ?? 0 },
        goMs: rt.warped + (opts.delayMs ?? 0),
        started: false,
        angle0: turnOf(rest),
        step: (b, dt) => {
          const next = stepFall(b, { gravity, bounce, floor: floorOf() }, dt);
          // Falling before, rising after: the floor just gave it back — a bounce.
          if (b.vel.y > 0 && next.vel.y < 0) opts.onBounce?.(++bounces);
          return next;
        },
        over: offGlass,
        // No animation: a fall is simply gone.
        halt: (b) => ({ ...b, pos: { x: Infinity, y: b.pos.y }, vel: { x: 0, y: 0 }, spin: 0 }),
        done: opts.onDone ? () => opts.onDone!() : undefined,
        tumble: undefined,
        onDesk: false, // a fall is in the AIR over the rt.glass, on its way out of the scene
      });
    },
    slide(id, opts) {
      const rest = rt.restOf(id);
      if (!rest) return;
      const cfg = {
        glide: asGlide(opts.glide ?? rt.tuning.glide),
        spinGlide: asGlide(opts.spinGlide ?? rt.tuning.spinGlide),
        bounce: opts.bounce ?? rt.tuning.bounce,
        walls: opts.walls,
        gravity: rt.tuning.gravity,
        airGlide: opts.airGlide === undefined ? undefined : asGlide(opts.airGlide),
        pull: opts.pull,
        magnus: opts.magnus,
      };
      rt.beginFlight(id, {
        body: {
          ...bodyAt(apply(rest, { x: 0, y: 0 })),
          vel: opts.push ?? velocityOf(opts.speed, opts.angle),
          spin: opts.spin ?? 0,
          up: opts.up ?? 0,
          upVel: opts.hop ?? 0,
        },
        goMs: rt.warped + (opts.delayMs ?? 0),
        started: false,
        angle0: turnOf(rest),
        step: (b, dt) => stepSlide(b, cfg, dt),
        // OVER WHEN IT RESTS, OR WHEN A ZONE HAS IT. The second is not a shortcut: a lean cannot
        // stop a hard throw crossing its field in a few frames, and a seat that only leans watches
        // the card sail past — which is the one thing a seat is there not to do.
        over: (b) => slideRests(b, SLIDE_EPS, SPIN_EPS) || slideCaught(b, cfg),
        // No animation: a slide stops where it stands.
        halt: (b) => ({ ...b, vel: { x: 0, y: 0 }, spin: 0 }),
        done: opts.onDone,
        tumble: opts.onTumble ? { left: facesLeft(cfg), on: opts.onTumble, carried: 0, count: 0, ended: false } : undefined,
        onDesk: true,
      });
    },
    snap(id, opts) {
      const rest = rt.restOf(id);
      if (!rest) return;
      const cfg = {
        to: opts.to,
        up: opts.toUp ?? 0,
        response: opts.response ?? rt.tuning.snapResponse,
        damping: opts.damping ?? rt.tuning.snapDamping,
        spinGlide: asGlide(opts.spinGlide ?? rt.tuning.spinGlide),
      };
      rt.beginFlight(id, {
        body: {
          ...bodyAt(apply(rest, { x: 0, y: 0 })),
          vel: opts.push ?? velocityOf(opts.speed ?? 0, opts.angle ?? 0),
          spin: opts.spin ?? 0,
          up: opts.up ?? 0,
          upVel: 0,
        },
        goMs: rt.warped + (opts.delayMs ?? 0),
        started: false,
        angle0: turnOf(rest),
        step: (b, dt) => stepSnap(b, cfg, dt),
        over: (b) => snapRests(b, cfg, SLIDE_EPS, SPIN_EPS),
        // "No animation" for a snap is BEING THERE. A fall is gone and a slide stands where it
        // stands, but a snap exists to put the body on a place the game has already decided — so
        // the one honest instant answer is the place itself.
        halt: (b) => ({ ...b, pos: cfg.to, vel: { x: 0, y: 0 }, spin: 0, up: cfg.up, upVel: 0 }),
        done: opts.onDone,
        tumble: undefined,
        // ON THE DESK even while it is above it: `onDesk` says the shadow travels WITH the body,
        // and the whole reading of a card losing height is the shadow closing on it as it comes
        // down. A snap that said otherwise would drop its shadow at the seat it left.
        onDesk: true,
      });
    },
  };
}
