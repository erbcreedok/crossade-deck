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
import { bodyAt, slideRests, stepFall, stepSlide, velocityOf, type Body, type Walls } from "../../core/ballistic.js";
import { journalOn, note, trace } from "../journal.js";
import { apply, compose, IDENTITY, invert, move, pose, rotate, scale, type Transform, type Vec } from "../../core/transform.js";
import { contextFor } from "../../core/resolve.js";
import { applyEffects } from "../effects.js";
import { type Host } from "../host.js";
import { type Painter } from "../painter.js";
import { renderFrame } from "../stage.js";
import { type TextMeasure } from "../textMetrics.js";
import { transformsOf, viewTransform } from "../scenePlan/index.js";

export * from "./motions.js";
import { ONE_HAND, type CarryItem, type MotionOptions, type Motions, type WallHit } from "./motions.js";
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
  /**
   * WHAT THE TREE SAYS a node's pose is — the last reconcile's walk, kept rather than re-walked.
   *
   * A flight needs it and `displayed` cannot serve: `displayed` is where the node was last DRAWN,
   * and a card thrown out of a hand was last drawn wearing that hand's lift. Read from there, the
   * throw inherits the hand's size and carries it the whole way — see `overrides`.
   */
  let seated = new Map<NodeId, Transform>();
  const active = new Map<NodeId, Motion>(); // nodes mid-settle
  const held = new Set<NodeId>(); // nodes a gesture owns — no easing
  // Nodes a finger is dragging: their pose is the FINGER's, an override, not the tree's. A drag never
  // touches the tree — the carry step only writes here — so a pointer-move costs one paint, not a reconcile.
  /** Who a finger has, and the lift each is drawn at — the lamp needs the AMOUNT, not the fact. */
  const carried = new Map<NodeId, number>();
  /**
   * WHO IS CARRYING WHAT, one carry per HAND.
   *
   * A table has two hands on it — a thumb resting on the pack, a finger leading a card off it — and
   * this used to be a single slot. Whichever hand grabbed last took the carry off the other one, so
   * a page that needed both could give real carry physics to only ONE of them and had to write the
   * other's pose into the tree by hand: no follow, no lean, no lift, and the piece dead under the
   * finger. That was never a tuning anybody chose. It was this line.
   *
   * The key is the hand — the pointer's own id, the same number `Pan` reports — so a page never has
   * to invent a name for a finger. One hand is the ordinary case and needs no name at all
   * (`ONE_HAND`).
   */
  const carries = new Map<number, Carry>();
  const handOf = (cy: Carry): number | undefined => {
    for (const [hand, held] of carries) if (held === cy) return hand;
    return undefined;
  };
  /** Drop every carry that has nothing left in it — the run empties one node at a time. */
  const sweepCarries = (): void => {
    for (const [hand, cy] of [...carries]) {
      if (cy.items.every((it) => !carried.has(it.id))) carries.delete(hand);
    }
  };
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

  /** The pose overrides to hand the plan this frame: everything not at its rest, at where it is now. */
  const overrides = (): ReadonlyMap<NodeId, Transform> | undefined => {
    if (active.size === 0 && choreos.size === 0 && carried.size === 0 && flights.size === 0) return undefined;
    const map = new Map<NodeId, Transform>();
    for (const id of active.keys()) {
      const at = displayed.get(id);
      if (at) map.set(id, at);
    }
    // A dragged node sits under the finger — its live pose is in `displayed`, put there by the carry step.
    for (const id of carried.keys()) {
      const at = displayed.get(id);
      if (at) map.set(id, at);
    }
    // A choreographed node keeps its resting pose (which carries e.g. a flip's reflection) and wears
    // the recipe's pose on top — the recipe is handed the rest and returns the frame's pose.
    for (const ch of choreos.values()) {
      const t = progressOf(ch);
      ch.ids.forEach((id, i) => {
        const rest = displayed.get(id);
        if (rest) map.set(id, ch.poseAt(i, ch.ids.length, t, rest));
      });
    }
    // A flying body's pose is its own: where the physics put it, turned as it spins, at the rest's
    // size. A flight still WAITING its turn is not here — until it goes, the node is whatever it
    // was (at rest, or mid-settle), so a stagger never freezes a card in the air.
    for (const [id, f] of flights) {
      if (!f.started) continue;
      // ITS OWN SIZE AND SHAPE, FROM THE TREE — never from what it was last drawn as. A card dealt
      // out of a raised pack was last drawn at the HAND's lift, and a throw that took its shape
      // from there flew the whole way inflated and then snapped to size on landing. The hand's
      // lift is the hand's; a thrown thing is its own.
      const rest = seated.get(id) ?? displayed.get(id);
      if (rest) map.set(id, seatAt(rest, f.body.pos, f.body.angle, 1 + f.body.up * RISE));
    }
    return map;
  };

  /**
   * The nodes in FLIGHT this frame — settling, finger-owned, choreographed, thrown — handed to the
   * plan as its paint-order lift: a moving card rides above whatever it crosses, however tall the
   * pile (`PlanInput.raised`). The finger set is `held`, which contains every carried node too.
   */
  const flying = (): NodeId[] => [...flights].filter(([, f]) => f.started).map(([id]) => id);
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
    for (const [id, f] of flights) if (f.started) out.set(id, f.body.up);
    // A choreography that TRAVELS. Flat on the felt (height 0), so the shadow rides directly under
    // it at the resting fall — which is exactly what says the piece never left the desk.
    for (const ch of choreos.values()) if (ch.rides) for (const id of ch.ids) out.set(id, 0);
    return out.size > 0 ? out : undefined;
  };
  const raised = (): ReadonlySet<NodeId> | undefined => {
    if (active.size === 0 && held.size === 0 && choreos.size === 0 && flights.size === 0) return undefined;
    return new Set<NodeId>([...active.keys(), ...held, ...choreographed(), ...flying()]);
  };

  /** Warped ms at the last painted frame — the journal's `dt`, and only the journal's. */
  let drawnMs = 0;

  /**
   * WHAT WENT ON THE GLASS, for the dashcam (`journal.ts`). Written from `draw` because that is the
   * one place a frame really is a frame: the loop paints here, and so does every tree change.
   *
   * Only what is MOVING, which is what `overrides` already means — a trace of thirty-six resting
   * cards on every frame is a file nobody opens. Poses are flattened to the four numbers a person
   * reads: where, how big, how turned, and how high off the desk.
   */
  const journalFrame = (): void => {
    if (!journalOn()) return;
    const moving = overrides();
    const heights = grounded();
    const drawn: Record<string, { at: [number, number]; size: number; turn: number; up?: number }> = {};
    for (const [id, t] of moving ?? []) {
      const up = heights?.get(id);
      drawn[id] = {
        at: [trace(t.e), trace(t.f)],
        size: trace(Math.hypot(t.a, t.b)),
        turn: trace((Math.atan2(t.b, t.a) * 180) / Math.PI),
        ...(up === undefined ? {} : { up: trace(up) }),
      };
    }
    note("frame", {
      warped: trace(warped),
      dt: trace(warped - drawnMs),
      drawn,
      ...(held.size > 0 ? { held: [...held] } : {}),
      ...(flights.size > 0 ? { flying: [...flights.keys()] } : {}),
    });
    drawnMs = warped;
  };

  const draw = (): void => (
    journalFrame(),
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
    })
  );

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
    springSettled(cy.sa, wantLean(cy), BANK_EPS);

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
    const hand = handOf(cy);
    if (hand !== undefined) carries.delete(hand);
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
   * WHAT THE EFFECTS SAY ABOUT A NODE, as a transform in its own space — today that is one thing: a
   * turned-over card's REFLECTION. Identity for everything else.
   */
  const preOf = (id: NodeId): Transform => {
    const n = byId(host.root, id);
    return n ? applyEffects(n, contextFor(n, 1)).pre : IDENTITY;
  };

  const layCarry = (cy: Carry): void => {
    const leanDeg = cy.sa.pos;
    const anchor = heldAt(cy);
    const n = cy.items.length;
    // ONLY WHAT IS STILL IN THE HAND. A run empties one node at a time — a game deals a card off a
    // held pack and the rest stays held — and an item the scene has already let go must stop being
    // laid out by the hand. `items` is the run as it was taken; `carried` is who is still on it.
    cy.items.forEach((it, i) => {
      if (!carried.has(it.id)) return;
      // A CARRY SAYS WHERE AND HOW TILTED, NOT WHAT THE PIECE IS. The style builds a pose out of
      // the anchor alone, which is right — that is what makes a run one plank — but it means every
      // trace of the node's own matrix is gone while the hand has it, the flip's reflection
      // included. A card lying face down has a MIRRORED matrix, so carried it was drawn
      // un-mirrored, and the settle home then interpolated the horizontal scale from `+1` to `-1`
      // — through ZERO. That is a card squeezing to an edge and reopening: a turn-over, played by
      // nobody, on every release of every face-down card, with the side unchanged at the end of it
      // because nothing had actually turned.
      //
      // So the effects' own transform rides along, innermost, exactly as it does in the tree walk
      // (`transformsOf`): the hand moves the piece, it does not restate what the piece is.
      // The lift is recorded as well as drawn: the lamp lengthens a held piece's fall by it, so a
      // raised pack's shadow says the same height its size does.
      carried.set(it.id, cy.sl.pos);
      displayed.set(it.id, compose(cy.style({ anchor, offset: it.offset, leanDeg, lift: cy.sl.pos, i, n }), preOf(it.id)));
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
    seated = target;
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
    if (rest) displayed.set(id, seatAt(rest, f.body.pos, f.body.angle));
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
    for (const cy of [...carries.values()]) {
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
      }
      const was = f.body;
      f.body = instant ? f.halt(f.body) : f.step(f.body, dt);
      // What it shows as it goes. At speed 0 there is no going: the body is already where it stops,
      // and the only face anyone sees is the one the landing writes.
      if (f.tumble) {
        if (instant) f.tumble.ended = true;
        else tumbleStep(f.tumble, was, f.body);
      }
      if (f.over(f.body)) land(id, f);
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
    if (
      active.size > 0 ||
      choreos.size > 0 ||
      flights.size > 0 ||
      [...carries.values()].some((cy) => !carrySettled(cy))
    )
      ensureLoop();
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
    sweepCarries();
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
    aim: (id, to, up) => {
      const f = flights.get(id);
      if (!f?.aim) return;
      f.aim(to, up);
      ensureLoop();
    },
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
      sweepCarries();
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
      const cy: Carry = {
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
        walls: opts.walls,
        wallSpeed: t.wallSpeed,
        wallBounce: t.wallBounce,
        leash: t.leash,
        onWall: opts.onWall,
        onSnap: opts.onSnap,
      };
      for (const it of items) {
        carried.set(it.id, 1);
        held.add(it.id);
        active.delete(it.id);
      }
      carries.set(opts.hand ?? ONE_HAND, cy);
      layCarry(cy); // paint the run under the finger at once
      draw();
      if (!carrySettled(cy)) ensureLoop(); // a pop or an off-anchor seat needs the loop; a bare grab does not
    },
    grabAlso(items, hand) {
      // NOTHING IS BEING CARRIED, so there is nothing to join. Deliberately silent rather than a
      // grab of its own: a game that means "pick these up" says `grab`, and turning a join into a
      // grab would take the run off whatever hand is really holding it.
      const carrying = carries.get(hand ?? ONE_HAND);
      if (!carrying) return;
      const fresh = items.filter((it) => !carried.has(it.id));
      if (fresh.length === 0) return;
      // Whatever the clock was doing to these ends HERE, and it ends by LANDING — the same bargain
      // `grab` strikes, and for the same reason: a throw the hand caught is a throw that finished.
      for (const it of fresh) {
        const f = flights.get(it.id);
        if (f) land(it.id, f);
      }
      reconcile();
      const joined: Carry = { ...carrying, items: [...carrying.items, ...fresh] };
      carries.set(hand ?? ONE_HAND, joined);
      for (const it of fresh) {
        carried.set(it.id, 1);
        held.add(it.id);
        active.delete(it.id);
      }
      // Laid out at the anchor AT ONCE, so a node that joins mid-gesture is drawn in the hand on
      // the very frame it joins instead of one frame at the seat its tree still names.
      layCarry(joined);
      draw();
    },
    dragTo(anchor, hand) {
      const carrying = carries.get(hand ?? ONE_HAND);
      if (!carrying) return;
      carrying.target = anchor;
      ensureLoop();
    },
    velocity(hand) {
      const carrying = carries.get(hand ?? ONE_HAND);
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
      carries.clear();
    },
  };
}


