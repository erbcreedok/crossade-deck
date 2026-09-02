// THE MOTION RUNTIME — the ONE clock. It watches the host's tree: when a node's resting pose moves,
// the node keeps its identity and a spring plays it there instead of teleporting. Everything else
// that moves on the desk rides the same clock: a turn-over, a shuffle, a die's tumble (all
// CHOREOGRAPHIES — a pose per node per progress, with one commit at a phase), a card let go on a
// spring carry, a thrown body in FLIGHT (`launch` down the screen, `slide` across the desk).
//
// This is the only file in the kit that holds a frame loop (`guard.one-clock`). A settling scene runs
// the loop; a still one does not touch it (the idle-gate the canon asks of any continuous animation).
// The clock is injectable so a plain test can step frames without a browser — the same seam the scene
// shell uses for its painter.
//
// EVERY NUMBER OF FEEL COMES FROM THE TUNING (`core/motion.ts: MotionTuning`): the kit's defaults, a
// game's record handed in as options, a per-call patch — and the onlooker's `motionSpeed` on top,
// read off the viewer plane on EVERY frame. The runtime keeps a WARPED clock: `warped` advances by
// `dt · speed`, every flight is measured against it, every spring and body is stepped by `dt · speed`,
// so a speed change mid-flight is smooth (progress kept, pace changed) and `0` is "no animation":
// whatever is in flight finishes on the next frame — a settle lands, a turn is over, a carry sits under
// the finger, a thrown body stops where it stands.
//
// GESTURE vs SETTLE, the joint the whole thing turns on (docs/design/transaction.md): while a finger
// owns nodes it must NOT ease from the tree — its pose is the finger's, an OVERRIDE, never a tree
// write, so a pointer-move costs one paint and no reconcile. `grab`/`dragTo` are that gesture, and
// they carry the "feel": the run rides the finger 1:1 (no position lag — a held thing does not trail
// the hand), and a spring per axis CHASES the same target beside it, purely to READ the finger's speed:
// that speed asks for a lean (`lean`), a THIRD spring banks the run toward it (`carry` style), and
// the same speed is what a throw inherits. A lift spring pops the run up on the way in. The run's per-card poses are a
// `CarryStyle` (rigid = one plank about the pivot, loose = per-card) fed the finger's anchor each
// frame. `release(id)` hands the node back, and because the tree never moved, the
// next reconcile eases it home from exactly where the finger left it — the lean and lift unwind on the
// way. (`hold(id)` is the older, tree-driven gesture the same `release` closes.)

import { byId, fieldsOf, type Node, type NodeId } from "../../core/node.js";
import { easing, flipScale, sample, tune, type CarryTuning, type Motion, type MotionTuning, type TuningPatch } from "../../core/motion.js";
import { springAt, springSettled, stepSpring, type SpringConfig, type SpringState } from "../../core/spring.js";
import { carry, lean, type CarryStyle } from "../../core/atoms/carry.js";
import { layoutRecord, type ContainerFields, type Settle } from "../../core/atoms/container.js";
import { bodyAt, separate, slideRests, stepFall, stepSlide, velocityOf, type Body, type Walls } from "../../core/ballistic.js";
import { apply, compose, IDENTITY, invert, move, pose, rotate, scale, type Transform, type Vec } from "../../core/transform.js";
import { type Host } from "../host.js";
import { type Painter } from "../painter.js";
import { renderFrame } from "../stage.js";
import { type TextMeasure } from "../textMetrics.js";
import { transformsOf, viewTransform } from "../scenePlan/index.js";

export * from "./motions.js";
// HOW MUCH A PIECE GROWS PER UNIT OF HEIGHT off the desk. Out through the runtime's own door, so a
// consumer that holds a piece at a scale and then drops it from that height states one rate and not
// two — see the note on the same name in `src/index.ts`.
export { RISE } from "./physics.js";
import { type CarryItem, type MotionOptions, type Motions, type WallHit } from "./motions.js";
import {
  BANK_EPS,
  CARRY_EPS,
  EPSILON,
  MAX_DT,
  OFF_GLASS,
  RISE,
  SLIDE_EPS,
  SPIN_EPS,
  TUMBLE_TAIL,
  TURN_PER_FACE,
  UNITS_PER_FACE,
  facesLeft,
  tumbleAt,
  tumbleEase,
  tumbleStep,
  type Tumbling,
} from "./physics.js";
import { shuffleRecipe, type ShuffleBox, type ShuffleContext } from "../shuffles.js";
import { hscale, same, seatAt, turnOf } from "./poses.js";
import { type Carry, type Choreo, type Flight } from "./records.js";
import { choreographies } from "./choreographies.js";
import { throws } from "./throws.js";
import { groupContext } from "./groups.js";
import { type Runtime } from "./runtime.js";
import { type Clock } from "./motions.js";

/**
 * The default clock: the browser's own frame. It lives HERE and not beside `Clock` because it is
 * behaviour, and `motions.ts` declares and does nothing — and because `guard.one-clock` names the
 * single file allowed to schedule a frame, which is this one.
 */
const rafClock: Clock = {
  now: () => performance.now(),
  frame: (cb) => {
    const id = requestAnimationFrame(cb);
    return () => cancelAnimationFrame(id);
  },
};

export function attachMotion(host: Host, painter: Painter, options: MotionOptions = {}): Motions {
  let tuning: MotionTuning = tune(options);
  const clock = options.clock ?? rafClock;

  const displayed = new Map<NodeId, Transform>(); // what is on the glass now, root-unit space
  const active = new Map<NodeId, Motion>(); // nodes mid-settle
  const held = new Set<NodeId>(); // nodes a gesture owns — no easing
  // Nodes a finger is dragging: their pose is the FINGER's, an override, not the tree's. A drag never
  // touches the tree — the carry step only writes here — so a pointer-move costs one paint, not a reconcile.
  const carried = new Set<NodeId>();
  let carrying: Carry | null = null;
  // Choreographies keyed by their subject — a node for a turn or a tumble, a container for a shuffle —
  // so a second call on the same subject replaces the first: the latest word wins, as everywhere here.
  const choreos = new Map<NodeId, Choreo>();
  const flights = new Map<NodeId, Flight>();
  let retaining = false;
  let cancelFrame: (() => void) | null = null;

  // THE WARPED CLOCK. `warped` is what every flight is measured against; it advances by real time
  // times the viewer's speed. `lastMs` is the real reading of the previous step, so a loop resumed
  // from idle does not count the idle as flight time.
  let warped = 0;
  let lastMs = clock.now();
  const speedNow = (): number => {
    const s = host.viewer().motionSpeed;
    return s === undefined || !Number.isFinite(s) || s < 0 ? 1 : s;
  };

  /**
   * Is this flight OFF THE DESK — up in the air, whether or not its turn has come?
   *
   * A waiting flight is normally invisible to everything here, because a stagger must not freeze a
   * piece that was only ever lying on the felt. One filed with a height is the other case entirely:
   * it is a thing a hand let go of above the desk, and it has to hang there until it falls.
   */
  const airborne = (f: Flight): boolean => f.body.up > 0;

  /** Where a choreography is, 0..1, on the warped clock. */
  const progressOf = (ch: Choreo): number => {
    if (ch.durMs <= 0) return 1;
    const t = (warped - ch.startMs) / ch.durMs;
    return t <= 0 ? 0 : t >= 1 ? 1 : t;
  };

  /** Every node some choreography is posing right now. */
  const choreographed = (): Set<NodeId> => {
    const out = new Set<NodeId>();
    for (const ch of choreos.values()) for (const id of ch.ids) out.add(id);
    return out;
  };

  /**
   * THE BANK COMES OFF OVER THE FALL — the piece rights itself as it comes down, and is flat at the
   * instant it touches. Not over a span of its own: a card that takes a second to land and a die
   * that takes a quarter of one would then straighten at the same rate, and one of them would be
   * standing crooked in mid-air long after the other was flat, or done turning while still high up.
   *
   * The fall's own progress, and it needs no duration to be known in advance — which is the point,
   * since where a body ends is the physics' answer and nobody else's. Under a constant pull the
   * height left is `up0 - ½gt²`, so `sqrt(1 - up/up0)` IS the fraction of the fall already flown,
   * measured off the body itself. The settle's easing shapes it, as it shapes every other road home
   * here: it rights itself briskly and arrives gently.
   *
   * A body with no height to give up — a flat slide across the felt — has no fall to spread the bank
   * over, so it takes the road a piece let go of with no flight at all takes: the settle's span.
   */
  const leanNow = (f: Flight): number => {
    if (f.up0 > 0) return 1 - easing(tuning.settleEase)(Math.sqrt(Math.max(0, 1 - Math.min(1, f.body.up / f.up0))));
    const ms = tuning.settleMs;
    if (ms <= 0) return 0;
    const t = (warped - f.leanFromMs) / ms;
    return t >= 1 ? 0 : 1 - easing(tuning.settleEase)(t <= 0 ? 0 : t);
  };

  /** Degrees of the hand's bank a flying body is still wearing — see `Flight.lean`. */
  const leanLeft = (f: Flight): number => (f.lean ? f.lean * f.leanLeft : 0);

  /** The short way round, degrees — a bank is small, and a wrap must never send it the long way. */
  const shortWay = (deg: number): number => {
    const wrapped = ((deg + 180) % 360 + 360) % 360 - 180;
    return wrapped;
  };

  /** The pose overrides to hand the plan this frame: everything not at its rest, at where it is now. */
  const overrides = (looks = true): ReadonlyMap<NodeId, Transform> | undefined => {
    if (active.size === 0 && choreos.size === 0 && carried.size === 0 && flights.size === 0) return undefined;
    const map = new Map<NodeId, Transform>();
    for (const id of active.keys()) {
      const at = displayed.get(id);
      if (at) map.set(id, at);
    }
    // A dragged node sits under the finger — its live pose is in `displayed`, put there by the carry step.
    for (const id of carried) {
      const at = displayed.get(id);
      if (at) map.set(id, at);
    }
    // A choreographed node keeps its resting pose (which carries e.g. a flip's reflection) and wears
    // the recipe's pose on top — the recipe is handed the rest and returns the frame's pose. Asked
    // for what a FINGER can reach, the recipe is skipped: see `Motions.reach`.
    if (looks)
      for (const ch of choreos.values()) {
      const t = progressOf(ch);
      ch.ids.forEach((id, i) => {
        const rest = displayed.get(id);
        if (rest) map.set(id, ch.poseAt(i, ch.ids.length, t, rest));
      });
      }
    // A flying body's pose is its own: where the physics put it, turned as it spins, at the rest's
    // size. A flight still WAITING its turn is mostly NOT here — until it goes, the node is whatever
    // it was (at rest, or mid-settle), so a stagger never freezes a card that was merely lying there.
    //
    // WITH ONE EXCEPTION, and it is the whole of what a staggered DROP is: a body filed with a
    // height was let go of IN THE AIR, and the air is where it waits. Left to its rest it is drawn
    // already landed and then falls from nowhere the moment its turn comes — a card standing on the
    // desk waiting to arrive on it.
    for (const [id, f] of flights) {
      if (!f.started && !airborne(f)) continue;
      const rest = displayed.get(id);
      if (rest) map.set(id, seatAt(rest, f.body.pos, f.body.angle + leanLeft(f), 1 + f.body.up * RISE));
    }
    return map;
  };

  /**
   * The nodes in FLIGHT this frame — settling, finger-owned, choreographed, thrown — handed to the
   * plan as its paint-order lift: a moving card rides above whatever it crosses, however tall the
   * pile (`PlanInput.raised`). The finger set is `held`, which contains every carried node too.
   */
  const flying = (): NodeId[] => [...flights].filter(([, f]) => f.started || airborne(f)).map(([id]) => id);
  /**
   * The bodies the clock is TAKING SOMEWHERE, with their height — a slide on the felt, a fall over
   * the glass, a bounce up the screen. Their shadow rides with them; what stays behind at the seat
   * is the shadow of a piece merely on its WAY to one (a settle, a turn-over). See `PlanInput.grounded`.
   */
  const grounded = (): ReadonlyMap<NodeId, number> | undefined => {
    const out = new Map<NodeId, number>();
    // EVERY BODY IN FLIGHT, on the felt or over it. A thrown piece is not on its way to a seat —
    // it IS somewhere, at every instant, and how high tells the onlooker how far it has to fall.
    // Its height is what parts the shadow from it; leaving the shadow at the seat instead said the
    // piece had never gone, which is the one thing a throw is about.
    for (const [id, f] of flights) if (f.started || airborne(f)) out.set(id, f.body.up);
    // A choreography that TRAVELS. Flat on the felt (height 0), so the shadow rides directly under
    // it at the resting fall — which is exactly what says the piece never left the desk.
    for (const ch of choreos.values()) if (ch.rides) for (const id of ch.ids) out.set(id, 0);
    return out.size > 0 ? out : undefined;
  };
  const raised = (): ReadonlySet<NodeId> | undefined => {
    if (active.size === 0 && held.size === 0 && choreos.size === 0 && flights.size === 0) return undefined;
    return new Set<NodeId>([...active.keys(), ...held, ...choreographed(), ...flying()]);
  };

  const draw = (): void =>
    renderFrame(host, painter, {
      overrides: overrides(),
      raised: raised(),
      // The finger's own set, apart from `raised`: what a HAND holds is off the desk, and only that
      // takes its shadow along (`PlanInput.carried`). A node the clock is flying is on its way to a
      // seat, not standing at a new one.
      carried: carried.size > 0 ? carried : undefined,
      grounded: grounded(),
      retain: retaining,
      measure: options.measure,
      ...(options.view ? { view: options.view } : {}),
      ...(options.pitch ? { pitch: options.pitch } : {}),
      ...(options.bake ? { bake: options.bake } : {}),
    });

  /** The bank this frame's speed is ASKING for — what the lean spring chases, degrees. */
  const wantLean = (cy: Carry): number => lean(cy.sx.vel, cy.tiltFactor, cy.tiltMax);

  /**
   * True once a carry's springs have all but arrived and stopped — the gate the loop sleeps on.
   *
   * The bank is one of them: it outlives the speed that raised it, and a loop that slept on the
   * other three would leave the card standing at whatever angle the last frame caught it at.
   */
  const carrySettled = (cy: Carry): boolean =>
    springSettled(cy.sx, cy.target.x, CARRY_EPS) &&
    springSettled(cy.sy, cy.target.y, CARRY_EPS) &&
    springSettled(cy.sl, cy.liftTo, CARRY_EPS) &&
    springSettled(cy.sa, wantLean(cy), BANK_EPS) &&
    gathering(cy) <= 0 &&
    (cy.trail <= 0 ||
      cy.tails.every((t, i) => i === 0 || (springSettled(t.x, heldAt(cy).x, CARRY_EPS) && springSettled(t.y, heldAt(cy).y, CARRY_EPS))));

  /**
   * Lay the carried run out UNDER THE FINGER this frame, writing each node's override pose.
   *
   * The anchor is the finger's own target, 1:1 — a thing a hand is holding does not trail behind
   * the hand, and a position lag reads as sluggishness, not as weight. The chase spring runs
   * BESIDE the pose, never under it: its velocity is the finger's speed, smoothed by the spring's
   * own time constant, and that is what the lean is drawn from and what a throw on release
   * inherits. So the liveliness sits where it belongs — the bank into the motion, the lift's
   * overshoot on the way in, the settle on the way out — and never in the position.
   *
   * The lean drawn here is the BANK SPRING's position, not that speed's lean: a card has weight in
   * its turn as much as in its travel, and the raw lean cannot show it — it saturates, so an
   * ordinary drag pins it, and a hand that turns round trades one pin for the other in four frames.
   */
  /** The finger's point as the run is allowed to have it: inside the tray, if the gesture has one. */
  const heldAt = (cy: Carry): Vec => {
    const w = cy.walls;
    if (!w) return cy.target;
    return { x: Math.min(w.x1, Math.max(w.x0, cy.target.x)), y: Math.min(w.y1, Math.max(w.y0, cy.target.y)) };
  };

  /**
   * The gesture is over without a release: the run comes off the finger WHERE IT STANDS.
   *
   * The reconcile is the whole of "where it stands". Dropped from the finger's set and left alone,
   * a piece has no override at all and the very next frame paints it back at its seat — a teleport,
   * and one that would happen behind the game's back. Reconciled, it is a settle from the wall like
   * any other, and a game that means it to stay writes the seat in its callback: the reconcile that
   * write brings simply retargets a motion that is already under way.
   */
  const letGo = (cy: Carry): void => {
    for (const it of cy.items) {
      carried.delete(it.id);
      held.delete(it.id);
    }
    if (carrying === cy) carrying = null;
    reconcile();
  };

  /**
   * THE BORDER, WHILE THE HAND IS STILL ON THE RUN. The clamp in `layCarry` has already stopped the
   * run at the wall; what is left is whether the gesture survives being pressed against one.
   *
   * Two ways it does not. SHOVED in at `wallSpeed` or more, the wall wins: the run comes off the
   * hand with the bounce it earned, and what happens next is the game's (a die throws itself back
   * across the tray). PULLED on past `leash`, the hold breaks instead: a hand that keeps dragging a
   * piece which cannot follow is not holding it any more. Anything gentler is a run straining after
   * a finger it cannot reach, which is what a piece in a box does.
   */
  const wallCheck = (cy: Carry): void => {
    const at = heldAt(cy);
    const outX = cy.target.x - at.x;
    const outY = cy.target.y - at.y;
    const out = Math.hypot(outX, outY);
    if (out <= EPSILON) return; // not against it at all
    // The outward normal of whatever the finger is past — a corner gives the diagonal, which is
    // the honest answer for a piece shoved into one.
    const nx = outX / out;
    const ny = outY / out;
    const into = cy.sx.vel * nx + cy.sy.vel * ny;
    const ids = cy.items.map((it) => it.id);
    if (into >= cy.wallSpeed) {
      const hit: WallHit = {
        ids,
        at,
        speed: into,
        velocity: { x: (cy.sx.vel - 2 * into * nx) * cy.wallBounce, y: (cy.sy.vel - 2 * into * ny) * cy.wallBounce },
      };
      letGo(cy);
      cy.onWall?.(hit);
      return;
    }
    if (out > cy.leash) {
      letGo(cy);
      cy.onSnap?.(ids, at);
    }
  };

  /**
   * The chase of the i-th piece of a trailing run: the same spring, slower the further down it is.
   *
   * Slower and not later: a delay would be a queue of stale positions, and a run leaving a queue
   * behind it snaps into line the moment the hand stops. A softer spring stretches while the hand
   * moves and closes up when it stops, which is what anything held by one end does. Damping follows
   * the square root of the stiffness so every piece keeps the same shape of arrival, only its own
   * pace — otherwise the far end would ring.
   */
  const tailCfg = (cy: Carry, i: number): SpringConfig => {
    const slower = 1 + cy.trail * i;
    return { stiffness: cy.follow.stiffness / slower, damping: cy.follow.damping / Math.sqrt(slower) };
  };

  /** Where a piece is drawn against where the run's offsets put it — the raw gap, before the lead's. */
  const gapOf = (it: CarryItem, anchor: Vec): Vec => {
    const was = displayed.get(it.id);
    if (!was) return { x: 0, y: 0 };
    const o = apply(was, { x: 0, y: 0 });
    return { x: o.x - (anchor.x + it.offset.x), y: o.y - (anchor.y + it.offset.y) };
  };

  /** How much of the gathering is still to come, 1 at the grab and 0 once the run is in line. */
  const gathering = (cy: Carry): number => {
    // NOTHING TO GATHER IS NOTHING TO WAIT FOR. An ordinary grab has no residues at all, and a
    // carry that asked for a frame to ease a gap of zero would light the loop for a journey of
    // nothing — which is the idle gate this file is built around.
    if (cy.gaps.every((g) => g.x === 0 && g.y === 0)) return 0;
    const ms = tuning.settleMs;
    if (ms <= 0) return 0;
    const t = (warped - cy.gatheredMs) / ms;
    return t >= 1 ? 0 : 1 - easing(tuning.settleEase)(t <= 0 ? 0 : t);
  };

  const layCarry = (cy: Carry): void => {
    const leanDeg = cy.sa.pos;
    const anchor = heldAt(cy);
    const n = cy.items.length;
    const left = gathering(cy);
    cy.items.forEach((it, i) => {
      // Piece zero is the hand's own: exactly at the anchor, never a spring. What hangs off it is
      // what trails, and it trails from its own chase rather than from a share of the hand's.
      const chased = cy.trail > 0 && i > 0 ? { x: cy.tails[i]!.x.pos, y: cy.tails[i]!.y.pos } : anchor;
      // ...and whatever is left of the gap it started with — a hand closing on a heap GATHERS it.
      const gap = cy.gaps[i]!;
      const seat = left > 0 ? { x: chased.x + gap.x * left, y: chased.y + gap.y * left } : chased;
      // A piece marked `still` is the hand's own — a handle, and a handle does not pop or bank.
      const pop = it.still ? 1 : cy.sl.pos;
      const styled = cy.style({ anchor: seat, offset: it.offset, leanDeg: it.still ? 0 : leanDeg, lift: pop, i, n });
      // SEATED ON WHAT THE PIECE IS. The style says where it goes, how it leans and how it is
      // lifted; its own resting pose says what it looks like — a mirror, a turn of its own — and a
      // carry must not take that off. Read back as a point, a turn and a size, it composes onto the
      // rest exactly as a flight does, and a piece with nothing special about it is unchanged.
      const base = cy.bases.get(it.id);
      displayed.set(
        it.id,
        base
          ? seatAt(base, apply(styled, { x: 0, y: 0 }), turnOf(styled), Math.hypot(styled.a, styled.b))
          : styled,
      );
    });
  };

  /**
   * WHICH SETTLE EACH NODE IS UNDER — its OWNER's arrangement, by id, in one walk.
   *
   * Asked of the owner and not of the node, because the road into rest is the zone's manner and not
   * the card's: the same card squares up on the board and lies askew on the mat. Walked once rather
   * than looked up per node — a `byId` per moved node would make a reflow quadratic for an answer
   * that is the same for every child of one container.
   */
  const settles = (): Map<NodeId, Settle | undefined> => {
    const out = new Map<NodeId, Settle | undefined>();
    const walk = (n: Node): void => {
      const record = layoutRecord(fieldsOf<ContainerFields>(n, "Container")?.layout ?? "")?.settle;
      for (const child of n.children) {
        out.set(child.id, record);
        walk(child);
      }
    };
    walk(host.root);
    return out;
  };

  /** Read the tree's new rest poses and start a spring for every node whose pose moved. */
  const reconcile = (): void => {
    const target = transformsOf(host.root);
    const posed = choreographed();
    const road = settles();
    for (const [id, to] of target) {
      if (held.has(id) || posed.has(id) || flights.get(id)?.started) {
        // Finger-owned, choreographed or thrown: sit exactly where the tree says, no easing. A flip's
        // `commit` changes this node's rest pose (the reflection flips sign) — snapping it here is what
        // keeps that change from starting a second flight that would race the turn. A CARRIED node is
        // the exception: its pose is the finger's, not the tree's, so a stray reconcile must not snap it.
        if (!carried.has(id)) displayed.set(id, to);
        active.delete(id);
        continue;
      }
      const from = displayed.get(id);
      if (!from) {
        displayed.set(id, to); // a new node appears at rest — it did not fly in from nowhere
      } else if (!same(from, to)) {
        // A HOLD NEEDS NO MACHINERY OF ITS OWN: a settle that starts in the future is a settle
        // whose `t` is still zero, and `sample` clamps it there — so the node goes on being drawn
        // exactly where it landed until the wait is over, and the ease then runs as any other.
        const set = road.get(id);
        // A SNAP IS NOT A SETTLE OF LENGTH ZERO. An arrangement that asks for no road at all wants
        // the node THERE, on this frame — so the displayed pose is written outright and no frame is
        // scheduled. Routed through the loop it would arrive one frame late and light the idle-gate
        // for a journey of nothing.
        if (set && set.hold <= 0 && set.ms <= 0) {
          displayed.set(id, to);
          active.delete(id);
          continue;
        }
        active.set(id, {
          from,
          to,
          startMs: warped + (set?.hold ?? 0),
          durMs: set ? set.ms : tuning.settleMs,
          ease: set ? set.ease : tuning.settleEase,
        });
      }
    }
    // Forget nodes that left the tree, in flight or not.
    for (const id of [...displayed.keys()]) if (!target.has(id)) displayed.delete(id);
    for (const id of [...active.keys()]) if (!target.has(id)) active.delete(id);
    for (const id of [...flights.keys()]) if (!target.has(id)) flights.delete(id);
    if (active.size > 0) ensureLoop();
  };

  /** The glass in root units — the floor a launch bounces off and the edge it is gone past. */
  const glass = (): { halfW: number; halfH: number } => {
    const v = host.viewport();
    const u = host.unit();
    return u > 0 ? { halfW: v.width / u / 2, halfH: v.height / u / 2 } : { halfW: 0, halfH: 0 };
  };

  /**
   * End a flight: the override goes and the game hears where it stopped. What is on the glass is
   * recorded as the node's displayed pose FIRST — so a game that writes the landing into the tree
   * gets no second flight (from = to), and one that does not gets an honest settle home from
   * where the body lies, not a jump back to the old seat and a glide from there.
   */
  const land = (id: NodeId, f: Flight): void => {
    flights.delete(id);
    const rest = displayed.get(id);
    // WITH WHATEVER BANK IS LEFT: a fall shorter than the settle lands still leaning a little, and
    // written upright here that remainder would snap. Recorded, the reconcile below eases it away
    // like any other difference between where a piece is drawn and where it belongs.
    if (rest) displayed.set(id, seatAt(rest, f.body.pos, f.body.angle + leanLeft(f)));
    f.done?.({ at: f.body.pos, angle: f.angle0 + f.body.angle });
    // Read the tree NOW, in the same frame: a landing the game wrote in place is found equal and
    // nothing flies; one it did not write starts the settle home from here — never a frame at the
    // old seat in between.
    reconcile();
  };

  const step = (): void => {
    cancelFrame = null;
    const now = clock.now();
    const realDt = Math.max(0, (now - lastMs) / 1000);
    lastMs = now;
    const speed = speedNow();
    const instant = speed <= 0;
    // Flights are measured against the warped clock UNCLAMPED (a hidden tab's flight is over when it
    // returns); the integrators get the clamped dt (a hidden tab must not fling a spring).
    warped += realDt * 1000 * speed;
    const dt = Math.min(realDt, MAX_DT) * speed;

    for (const [id, m] of active) {
      const s = instant ? { transform: m.to, done: true } : sample(m, warped);
      displayed.set(id, s.transform);
      if (s.done) active.delete(id);
    }
    // Advance the carry springs: chase the finger, pop the lift, and lay the run out from where the
    // springs now are — the lag and the lean both fall out of the spring state, no separate tween.
    if (carrying) {
      const cy = carrying;
      if (instant) {
        cy.sx = springAt(cy.target.x);
        cy.sy = springAt(cy.target.y);
        cy.sl = springAt(cy.liftTo);
        cy.sa = springAt(wantLean(cy));
      } else {
        cy.sx = stepSpring(cy.sx, cy.target.x, cy.follow, dt);
        cy.sy = stepSpring(cy.sy, cy.target.y, cy.follow, dt);
        cy.sl = stepSpring(cy.sl, cy.liftTo, cy.liftCfg, dt);
        // The bank chases AFTER the chase spring moved: within one frame the lean is answering the
        // speed this frame has, one step behind it and never a step ahead.
        cy.sa = stepSpring(cy.sa, wantLean(cy), cy.bankCfg, dt);
      }
      if (cy.trail > 0) {
        const to = heldAt(cy);
        cy.tails = cy.tails.map((t, i) =>
          i === 0 ? t : { x: stepSpring(t.x, to.x, tailCfg(cy, i), dt), y: stepSpring(t.y, to.y, tailCfg(cy, i), dt) },
        );
      }
      layCarry(cy);
      if (cy.walls) wallCheck(cy);
    }
    // Advance the flights: a stagger holds a body at rest until its turn; then the physics.
    for (const [id, f] of [...flights]) {
      if (!f.started) {
        if (!instant && warped < f.goMs) continue;
        // It goes NOW, from wherever it is drawn at this moment — the seat it rests on, or the
        // point of a settle it was still riding — and that settle ends here: the body owns the pose.
        f.started = true;
        active.delete(id);
        const at = displayed.get(id);
        if (at) {
          f.body = { ...f.body, pos: apply(at, { x: 0, y: 0 }) };
          f.angle0 = turnOf(at);
        }
        // WHERE it was is the body's now; what it IS goes back to the tree's word.
        //
        // The two are not the same reading, and only one of them may survive the takeoff. The point
        // and the turn are taken from the glass, because a body that started at its seat instead
        // would jump the moment it left the hand. The SIZE cannot come from there: the drawn pose of
        // a piece just let go of is the hand's, height and all, and the flight then multiplies its
        // OWN height onto the hand's — a piece held at 1.3 and dropped from that height is drawn at
        // 1.69 and pops the instant it is released. The flight is seated on the rest for the rest of
        // its life anyway (`overrides`); this is the frame that makes that true.
        const seat = transformsOf(host.root).get(id);
        if (seat) {
          displayed.set(id, seat);
          // THE HAND'S BANK COMES OFF WHILE IT FLIES, not on the frame it leaves and not on the one
          // it lands. It is the difference between the two turns, and from here it eases to nothing
          // on the settle's own road (`leanLeft`). The landing is reported at the RESTING turn plus
          // the body's own spin, because that is what will be on the glass by then.
          if (at) f.lean = shortWay(turnOf(at) - turnOf(seat));
          f.up0 = f.body.up;
          f.leanLeft = 1;
          f.leanFromMs = warped;
          f.angle0 = turnOf(seat);
        }
      }
      const was = f.body;
      f.body = instant ? f.halt(f.body) : f.step(f.body, dt);
      // Never back on: the road is the DESCENT, and a bounce sends the body back up.
      if (f.lean) f.leanLeft = Math.min(f.leanLeft, leanNow(f));
      // What it shows as it goes. At speed 0 there is no going: the body is already where it stops,
      // and the only face anyone sees is the one the landing writes.
      if (f.tumble) {
        if (instant) f.tumble.ended = true;
        else tumbleStep(f.tumble, was, f.body);
      }
    }
    // AND THEN THEY GET OUT OF EACH OTHER'S WAY. Every body has taken its own step; now the ones
    // that take up room are pushed apart and traded speeds (`separate`).
    //
    // A PASS OF ITS OWN, after all of them have moved, because two bodies cannot resolve each other
    // one at a time: whichever stepped first would be pushed off where the other one WAS, and the
    // answer would depend on the order the map happens to hold them in.
    const solid = [...flights].filter(([, f]) => f.girth > 0 && f.started);

    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        const [, a] = solid[i]!;
        const [, b] = solid[j]!;
        const hit = separate(a.body, b.body, a.girth + b.girth, Math.min(a.bodyBounce, b.bodyBounce));
        if (!hit) continue;
        a.body = hit.a;
        b.body = hit.b;
      }
    }
    // A SOLID BODY IS NOT PUT DOWN WHILE ANOTHER ONE CAN STILL REACH IT.
    //
    // A body that has stopped is no longer a body — it lands, its pose is written, and the physics
    // forgets it. On a desk where nothing collides that is exactly right and costs nothing. Where
    // things DO collide it is the hole the whole feature falls through: two dice thrown at different
    // speeds stop at different moments, and the first one to stop drops out of the world just in
    // time for the second to slide onto it and come to rest on its face.
    //
    // So it waits. It keeps its body, at rest, until every other body that takes up room has stopped
    // too — and because it is still a body, a die that runs into it PUSHES it, and it is moving
    // again. Which is what a die does when another one hits it. The wait cannot outlast them: every
    // one of them is slowing down, and once the last has stopped they all go down together.
    // STILL TO COME COUNTS AS STILL MOVING. A handful is poured out with a stagger — each piece a
    // few milliseconds behind the one before it — so a body can be at rest before the last of its
    // own run has even left the hand. Counting only what is already moving, the first one down is
    // put away and forgotten exactly in time for the last one to land on it.
    const rolling = [...flights].some(([, f]) => f.girth > 0 && (!f.started || !f.over(f.body)));
    for (const [id, f] of [...flights]) {
      if (!f.started || !f.over(f.body)) continue;
      if (f.girth > 0 && rolling) continue;
      land(id, f);
    }
    // Advance the choreographies: commit once, at the phase; drop each when it lands. Commits first
    // and a reconcile after them while the nodes are STILL choreographed — so the rest a commit
    // changes is snapped, not flown — and only then are the finished ones let go.
    // What a choreography SHOWS as it plays, before what it commits: a tumble's faces are paid out
    // here, and its last one falls on the same step as the commit — that is what puts the result on
    // a piece still turning instead of on one that has stopped.
    for (const ch of choreos.values()) {
      if (!ch.onBeat || ch.beaten >= ch.beats.length) continue;
      if (instant) {
        ch.beaten = ch.beats.length; // no motion to count faces off, and only the last would be seen
        continue;
      }
      const t = progressOf(ch);
      while (ch.beaten < ch.beats.length && t >= ch.beats[ch.beaten]!) {
        const count = ++ch.beaten;
        ch.onBeat(count, count === ch.beats.length);
      }
    }
    let committed = false;
    for (const ch of choreos.values()) {
      const t = instant ? 1 : progressOf(ch);
      if (t >= ch.commitAt && !ch.committed) {
        ch.committed = true;
        ch.commit();
        committed = true;
      }
    }
    if (committed) reconcile();
    for (const [key, ch] of [...choreos]) if (instant || progressOf(ch) >= 1) choreos.delete(key);
    draw();
    if (active.size > 0 || choreos.size > 0 || flights.size > 0 || (carrying && !carrySettled(carrying))) ensureLoop();
  };

  const ensureLoop = (): void => {
    if (cancelFrame) return; // a frame is already scheduled — one clock, not two
    // The loop is alive from NOW: an idle stretch before this is not flight time, or the first
    // frame after a long rest would find every new flight already over.
    lastMs = clock.now();
    cancelFrame = clock.frame(step);
  };

  const unsubscribe = host.onChange(() => {
    reconcile();
    draw();
  });

  // First frame: every node is new, so nothing flies — it just paints where things rest.
  reconcile();
  draw();

  /** The rest pose of a node as it stands on the glass now — where a throw or a tumble starts from. */
  const restOf = (id: NodeId): Transform | undefined => displayed.get(id) ?? transformsOf(host.root).get(id);

  /**
   * WHAT THE ONLOOKER CAN SEE, root units — handed to a shuffle recipe so it can carry a packet off
   * the glass and turn the order over out of sight.
   *
   * Taken through the VIEW rather than from the viewport: with a camera in front, what is visible is
   * whatever her matrix shows, and the honest answer is the glass's four corners brought back into
   * root space, boxed. Degenerate before the first layout (a host still measuring itself reports a
   * viewport of nothing, and a unit of zero has no inverse) — the recipes take that for the absence
   * it is and fall back to the group's own extent.
   */
  const visibleBox = (): ShuffleBox => {
    const v = host.viewport();
    const view = options.view?.() ?? viewTransform(host.unit(), v.width, v.height);
    const back = invert(view);
    if (!back || v.width <= 0 || v.height <= 0) return { x: 0, y: 0, w: 0, h: 0 };
    const corners = [
      { x: 0, y: 0 },
      { x: v.width, y: 0 },
      { x: v.width, y: v.height },
      { x: 0, y: v.height },
    ].map((p) => apply(back, p));
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
  };

  /** A flight is filed; the finger lets go of the node at once, and a settle it may be riding runs on until the flight goes. */
  const beginFlight = (id: NodeId, f: Flight): void => {
    flights.set(id, f);
    held.delete(id);
    carried.delete(id);
    if (carrying && carrying.items.every((it) => !carried.has(it.id))) carrying = null;
    ensureLoop();
  };

  /**
   * WHAT THE LEAF VERBS ARE HANDED. Built here, once, and it is the only thing they may touch: a
   * choreography or a throw files a record and asks for a frame, and everything else in this file
   * is deliberately out of its reach.
   */
  const rt: Runtime = {
    host,
    get warped() {
      return warped;
    },
    get tuning() {
      return tuning;
    },
    choreos,
    restOf,
    visibleBox,
    glass,
    beginFlight,
    ensureLoop,
  };

  return {
    hold(id) {
      held.add(id);
      active.delete(id);
    },
    release(id) {
      held.delete(id);
      carried.delete(id);
      // The run empties one node at a time (the scene releases per card). When the last is gone the
      // carry is over — the springs and target go with it, and the next reconcile eases the nodes home.
      if (carrying && carrying.items.every((it) => !carried.has(it.id))) carrying = null;
    },
    grab(items, opts) {
      // THE FINGER IS THE LATEST WORD. Whatever the clock was doing to these nodes ends HERE, and it
      // ends by LANDING rather than by being thrown away: a throw the hand caught is a throw that
      // finished where it was caught, so the seat and the face it was carrying are written, and the
      // piece never comes to rest showing a number nobody rolled. Without this the flight goes on
      // stepping under the carry and wins the frame — which is the hand feeling blocked by a picture.
      for (const it of items) {
        const f = flights.get(it.id);
        if (f) land(it.id, f);
        for (const [key, ch] of [...choreos]) {
          if (!ch.ids.includes(it.id)) continue;
          if (!ch.committed) {
            ch.committed = true;
            ch.commit(); // the LOOK is interrupted; the truth it was carrying still lands
          }
          choreos.delete(key);
        }
      }
      reconcile();
      const t = tune({ ...tuning, ...opts });
      const anchor = opts.anchor;
      carrying = {
        items,
        style: carry(t.carry),
        target: anchor,
        sx: springAt(anchor.x),
        sy: springAt(anchor.y),
        sl: springAt(1),
        // Flat: a card is picked up level, whatever the hand was doing before it closed.
        sa: springAt(0),
        liftTo: t.lift,
        follow: { stiffness: t.followStiffness, damping: t.followDamping },
        liftCfg: { stiffness: t.liftStiffness, damping: t.liftDamping },
        bankCfg: { stiffness: t.leanStiffness, damping: t.leanDamping },
        tiltFactor: t.leanFactor,
        tiltMax: t.leanMaxDeg,
        trail: t.trail,
        // Seeded AT the anchor, so a run that trails does not start by catching up from nowhere:
        // the pieces are where they are on the first frame, and only what MOVES falls behind.
        tails: items.map(() => ({ x: springAt(anchor.x), y: springAt(anchor.y) })),
        // WHERE THE HAND FOUND EACH PIECE, against where the run now says it belongs — MINUS the
        // lead's own, which is the whole of keeping this from fighting the law above it.
        //
        // A grab places the run under the finger AT ONCE: that is what a hand closing on a thing
        // does, and a position lag there reads as sluggishness rather than as weight. So the piece
        // the hand has hold of never eases anywhere — its gap is subtracted from every other, and
        // what is left is the run's own SHAPE. Move the whole run and every gap is the same vector,
        // the residues are nothing, and the placement is instant as it always was. ARRANGE it — a
        // heap pulled into a stack by its handle — and the residues are what each piece still has to
        // travel to fall into line, which is a settle and not a snap.
        gaps: items.map((it, i) => {
          const lead = gapOf(items[0]!, anchor);
          const own = i === 0 ? lead : gapOf(it, anchor);
          return { x: own.x - lead.x, y: own.y - lead.y };
        }),
        gatheredMs: warped,
        // What each piece IS, as against where the carry puts it — see `Carry.bases`.
        bases: new Map(items.map((it) => [it.id, transformsOf(host.root).get(it.id) ?? IDENTITY])),
        walls: opts.walls,
        wallSpeed: t.wallSpeed,
        wallBounce: t.wallBounce,
        leash: t.leash,
        onWall: opts.onWall,
        onSnap: opts.onSnap,
      };
      for (const it of items) {
        carried.add(it.id);
        held.add(it.id);
        active.delete(it.id);
      }
      layCarry(carrying); // paint the run under the finger at once
      draw();
      if (!carrySettled(carrying)) ensureLoop(); // a pop or an off-anchor seat needs the loop; a bare grab does not
    },
    dragTo(anchor) {
      if (!carrying) return;
      carrying.target = anchor;
      ensureLoop();
    },
    velocity() {
      return carrying ? { x: carrying.sx.vel, y: carrying.sy.vel } : undefined;
    },
    ...choreographies(rt),
    ...throws(rt),
    retain(on) {
      if (retaining === on) return;
      retaining = on;
      draw();
    },
    redraw: () => draw(),
    retune(patch) {
      tuning = tune({ ...tuning, ...patch });
    },
    poses() {
      return overrides();
    },
    reach() {
      // The same map without the LOOKS — see `Motions.reach`. Never `undefined`: a caller asking
      // where things can be touched wants an answer, and "nothing is moving" is an empty map.
      return overrides(false) ?? new Map<NodeId, Transform>();
    },
    busy(id) {
      if (flights.has(id)) return true;
      for (const ch of choreos.values()) if (ch.ids.includes(id)) return true;
      return false;
    },
    tuning() {
      return tuning;
    },
    stop() {
      unsubscribe();
      cancelFrame?.();
      cancelFrame = null;
      active.clear();
      choreos.clear();
      flights.clear();
      carried.clear();
      carrying = null;
    },
  };
}


