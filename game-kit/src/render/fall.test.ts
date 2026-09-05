// @vitest-environment jsdom
// THE FALL RUNTIME TESTS — pure data, ballistic calculations, and letFall execution.

import { describe, expect, it } from "vitest";
import {
  add,
  attachMotion,
  Bounded,
  byId,
  caps,
  compose,
  Container,
  fieldsOf,
  Flippable,
  freeLayout,
  mount,
  node,
  polar,
  rect,
  registerLayout,
  Rollable,
  Transformable,
  Valued,
  type BoundedFields,
  type MarkedFields,
  type Node,
  type TransformableFields,
  type Vec,
} from "../index.js";
import {
  dropOf,
  fallOrder,
  flickOf,
  flightOf,
  flockTo,
  letFall,
  mapWalls,
  restsAt,
  stackSeats,
  thrown,
  THROW_REACH,
  THROWN_AT,
  STACK_FALL_STEP,
  STACK_POUR,
  type FallScene,
} from "./fall.js";

const piece = (w: number, h: number): Node => node("p", Bounded({ bounds: rect(w, h) }));

describe("the fall runtime", () => {
  it("fall.drop-feel-is-read-off-what-the-piece-is — never off its name", () => {
    const die = node("die", Bounded({ bounds: rect(0.5, 0.5) }), Valued({ values: { face: 5 } }), Rollable());
    const knight = node("knight", Bounded({ bounds: rect(0.9, 1.1) }));
    const card = node("card", Bounded({ bounds: rect(1, 1.4) }), Flippable());

    const dieFeel = dropOf(die);
    const knightFeel = dropOf(knight);
    const cardFeel = dropOf(card);

    expect(cardFeel.gravity).toBeLessThan(dieFeel.gravity);
    expect(cardFeel.gravity).toBeLessThan(knightFeel.gravity);
    expect(cardFeel.bounce).toBe(0);

    expect(dieFeel.bounce).toBeGreaterThan(knightFeel.bounce);
    expect(knightFeel.bounce).toBeGreaterThan(0);
    expect(knightFeel.bounce, "a carved piece does not bounce").toBeLessThan(0.01);
    expect(knightFeel.wallBounce, "and not off a rail either").toBeLessThan(0.01);

    expect(Math.abs(dieFeel.gravity - knightFeel.gravity) / dieFeel.gravity).toBeLessThan(0.3);

    expect(dieFeel.wallBounce).toBeGreaterThan(cardFeel.wallBounce);
    expect(cardFeel.wallBounce).toBeGreaterThan(knightFeel.wallBounce);
    expect(cardFeel.wallBounce).toBeGreaterThan(cardFeel.bounce);
  });

  it("fall.a-slow-hand-puts-down-and-a-fast-one-throws — `settle` is a speed, not a prohibition", () => {
    const card = node("card", Flippable());
    const chip = node("chip", Valued({ values: { chip: 25 } }));
    expect(thrown(card, 0), "set down at a standstill").toBe(false);
    expect(thrown(card, THROWN_AT), "and thrown when the hand meant it").toBe(true);
    expect(thrown(chip, 0)).toBe(true);
  });

  it("fall.not-everything-leaves-a-hand-at-the-hand-s-speed — the share is the piece's own", () => {
    const card = dropOf(node("card", Flippable()));
    const chip = dropOf(node("chip", Valued({ values: { chip: 25 } })));
    const die = dropOf(node("die", Valued({ values: { face: 5 } }), Rollable()));
    expect(chip.throwGain).toBeLessThan(card.throwGain);
    expect(chip.throwGain).toBeLessThan(die.throwGain);
    expect(chip.friction!).toBeGreaterThan(card.friction!);
  });

  it("fall.a-dropped-heap-pours-rather-than-slabs — a step apart, bottom first, and the handle not at all", () => {
    const run = [node("chip 0"), node("chip 1")];
    const falling = fallOrder(run);
    expect(falling.map((f) => f.piece.id)).toEqual(["chip 0", "chip 1"]);
    expect(falling[0]!.delayMs).toBe(0);
    expect(falling[1]!.delayMs).toBe(STACK_FALL_STEP);
    expect(fallOrder([run[1]!])).toEqual([{ piece: run[1], delayMs: 0 }]);
    expect(fallOrder([])).toEqual([]);

    const deck = Array.from({ length: 6 }, (_, i) => node(`c${i}`, Flippable()));
    const few = fallOrder(deck.slice(0, 5));
    expect(few[4]!.delayMs).toBe(4 * STACK_FALL_STEP);
    const many = fallOrder([...deck, ...deck, ...deck, ...deck, ...deck, ...deck]);
    expect(many[many.length - 1]!.delayMs).toBeLessThanOrEqual(STACK_POUR);
    expect(many[many.length - 1]!.delayMs, "still a pour, not a slab").toBeGreaterThan(STACK_POUR * 0.9);
  });

  it("fall.a-thrown-run-is-aimed-at-its-own-formation — it converges on the way down, not on arrival", () => {
    const seatOf = (n: Node): Vec => fieldsOf<TransformableFields>(n, "Transformable")!.at!;
    const run = [
      node("a", Bounded({ bounds: rect(1, 1.4) }), Transformable({ at: { x: -1.2, y: 0 } })),
      node("b", Bounded({ bounds: rect(1, 1.4) }), Transformable({ at: { x: 0, y: 0.1 } })),
      node("c", Bounded({ bounds: rect(1, 1.4) }), Transformable({ at: { x: 1.2, y: 0.2 } })),
    ];
    const at = { x: 0, y: 1 };
    const hand = { x: 3, y: -2 };
    const feel = dropOf(run[0]!, {});
    const drag = 6;
    const home = restsAt(at, hand, feel, drag);
    const seats = stackSeats(run);
    const thrownTo = flockTo(run, at, hand, feel, drag);
    run.forEach((piece, i) => {
      const rad = (thrownTo[i]!.angle * Math.PI) / 180;
      const lands = restsAt(
        seatOf(piece),
        { x: Math.cos(rad), y: Math.sin(rad) },
        { ...feel, throwGain: thrownTo[i]!.speed, friction: thrownTo[i]!.friction },
        drag,
      );
      const want = { x: home.x + seats[i]!.x, y: home.y + seats[i]!.y };
      expect(lands.x, `piece ${i} stops at its seat`).toBeCloseTo(want.x, 6);
      expect(lands.y).toBeCloseTo(want.y, 6);
    });

    const spread = Math.hypot(seats[2]!.x - seats[0]!.x, seats[2]!.y - seats[0]!.y);
    expect(spread, "they arrive stacked, not strung out").toBeLessThan(0.3);

    const poured = fallOrder(run);
    expect(Math.max(...poured.map((p) => p.delayMs)), "a heap tipping out is staggered").toBeGreaterThan(0);
    const flying = fallOrder(run, new Map(run.map((n) => [n.id, true])));
    for (const one of flying) expect(one.delayMs, "a formation is not a pour").toBe(0);

    const spans = thrownTo.map((t) => t.speed / t.friction);
    for (const span of spans) expect(span, "one hand, one flight time").toBeCloseTo(spans[0]!, 9);
    expect(spans[0]!, "as long as the hand meant, and no longer").toBeCloseTo((Math.hypot(hand.x, hand.y) * feel.throwGain) / drag, 9);

    const own = { ...feel, friction: drag * 3 };
    const ownHome = restsAt(at, hand, own, drag);
    flockTo(run, at, hand, own, drag).forEach((throwAt, i) => {
      const rad = (throwAt.angle * Math.PI) / 180;
      const lands = restsAt(
        seatOf(run[i]!),
        { x: Math.cos(rad), y: Math.sin(rad) },
        { ...own, throwGain: throwAt.speed, friction: throwAt.friction },
        drag,
      );
      expect(lands.x, `piece ${i} keeps its seat under its own drag`).toBeCloseTo(ownHome.x + seats[i]!.x, 6);
      expect(lands.y).toBeCloseTo(ownHome.y + seats[i]!.y, 6);
    });
  });

  it("fall.the-threshold-is-paid-once — what crosses into the desk is taken whole", () => {
    const hand = flickOf({ x: THROWN_AT * 4, y: 0 }, 100)!;
    const flight = flightOf(hand, 1);
    expect(flight.speed, "the whole excess, not the excess minus a pixel number").toBeCloseTo(Math.hypot(hand.x, hand.y), 9);
    expect(flight.speed, "and it is a flight").toBeGreaterThan(0);
    expect(flightOf(hand, 2).speed, "the piece's own gain scales it").toBeCloseTo(flight.speed * 2, 9);
    expect(flightOf({ x: 0, y: -3 }, 1).angle, "the heading is the hand's").toBeCloseTo(polar({ x: 0, y: -3 }).angle, 9);
  });

  it("fall.a-throw-is-the-gesture-and-not-the-zoom — measured on the glass, converted once", () => {
    const flick = { x: THROWN_AT * 4, y: 0 };
    for (const perUnit of [40, 100, 250]) {
      expect(flickOf(flick, perUnit), "a flick is a flick at any zoom").toBeDefined();
      expect(flickOf({ x: THROWN_AT * 0.6, y: 0 }, perUnit), "and a carry is never one").toBeUndefined();
    }
    for (const perUnit of [40, 100, 250]) {
      expect(flickOf(flick, perUnit)!.x, "the flick's excess, in units").toBeCloseTo((flick.x - THROWN_AT) / perUnit, 9);
    }
    const slanted = flickOf({ x: THROWN_AT * 3, y: THROWN_AT * 3 }, 100)!;
    expect(slanted.x, "square on: the two axes keep their proportion").toBeCloseTo(slanted.y, 9);
    expect(flickOf(undefined, 100)).toBeUndefined();
    expect(flickOf(flick, 0)).toBeUndefined();

    const drag = 6;
    const nudge = { x: THROWN_AT * 1.05, y: 0 };
    expect(flickOf(nudge, 100, drag), "a throw that goes nowhere is a putting-down").toBeUndefined();
    expect(flickOf(nudge, 100, 0), "and with no drag named, nothing is refused").toBeDefined();
    const sent = flickOf({ x: THROWN_AT * 6, y: 0 }, 100, drag);
    expect(sent, "a flick that crosses the desk is a throw").toBeDefined();
    expect((sent!.x ** 2) / (2 * drag), "and it was measured by where it lands").toBeGreaterThan(THROW_REACH);
  });

  it("fall.the-wall-is-the-desks-own-edge — a felt wider than the map is walled at its own size", () => {
    const p = piece(1, 1);
    const stock = mapWalls(p);
    expect(stock.x1, "the shelf's own map, as before").toBeCloseTo(4 - 0.5, 9);
    const felt = mapWalls(p, 1, { w: 14, h: 14 });
    expect(felt.x1, "a wider desk, a wider wall").toBeCloseTo(7 - 0.5, 9);
    expect(felt.y0, "on every side").toBeCloseTo(-(7 - 0.5), 9);
    expect(mapWalls(p, 1.3, { w: 14, h: 14 }).x1).toBeCloseTo(7 - 0.65, 9);
  });

  it("fall.toss-goes-over-only-when-thrown — a die set down keeps its face, a die flicked rolls; and the desk may wall the flight", () => {
    // A die moved out of the way is not a throw. `roll` goes over always, which is right for a
    // dice page and wrong beside a board: there the number changes only when the hand threw.
    registerLayout("fall.free", freeLayout);
    const root = node("root", Container({ layout: "fall.free" }));
    const die = node("die", Bounded({ bounds: rect(0.5, 0.5) }), Valued({ values: { face: 5 } }), Rollable(), Transformable({ at: { x: 0, y: 0 } }));
    add(root, die);
    const host = mount(document.createElement("div"), root);
    const painter = { ready: Promise.resolve(), draw: () => {}, resize: () => {}, destroy: () => {} };
    const motions = attachMotion(host, painter);
    const scene: FallScene = { host, motions };
    const rolls: string[] = [];
    const walls: unknown[] = [];
    const onRoll = (_m: unknown, _root: unknown, piece: { id: string }, opts: { walls?: unknown }) => {
      rolls.push(piece.id);
      walls.push(opts.walls);
    };
    motions.grab([{ id: "die", offset: { x: 0, y: 0 } }], { anchor: { x: 0, y: 0 } });
    expect(letFall(scene, [{ id: "die", offset: { x: 0, y: 0 } }], 1, undefined, undefined, { die: "toss" }, undefined, undefined, onRoll)).toBe(true);
    expect(rolls, "set down: no roll").toEqual([]);
    motions.grab([{ id: "die", offset: { x: 0, y: 0 } }], { anchor: { x: 0, y: 0 } });
    const band = { x0: 1, y0: -2, x1: 3, y1: 2 };
    expect(letFall(scene, [{ id: "die", offset: { x: 0, y: 0 } }], 1, { x: 400, y: 0 }, undefined, { die: "toss" }, undefined, undefined, onRoll, () => band)).toBe(true);
    expect(rolls, "thrown: it goes over").toEqual(["die"]);
    expect(walls[0], "and flies inside the walls the desk gave it").toEqual(band);
  });

  it("fall.bare-scene-fall — letFall executes slide on bare host and motions", () => {
    registerLayout("fall.free", freeLayout);
    const root = node("root", Container({ layout: "fall.free" }));
    const card = node("card", Bounded({ bounds: rect(1, 1.4) }), Flippable(), Transformable({ at: { x: 0, y: 0 } }));
    add(root, card);

    const host = mount(document.createElement("div"), root);
    const painter = { ready: Promise.resolve(), draw: () => {}, resize: () => {}, destroy: () => {} };
    const motions = attachMotion(host, painter);
    motions.grab([{ id: "card", offset: { x: 0, y: 0 } }], { anchor: { x: 0, y: 0 } });

    const scene: FallScene = { host, motions };
    const ok = letFall(scene, [{ id: "card", offset: { x: 0, y: 0 } }], 1, { x: 300, y: 0 });
    expect(ok).toBe(true);
  });

  it("fall.one-mark-per-touch — a thrown run of cards is marked once, not on every card of it", () => {
    // A release is one gesture: a stack of cards thrown at once is one throw, and a mark on every
    // card of it read as a hard border painted around the whole pile — not a note about the hand.
    registerLayout("fall.free", freeLayout);
    const root = node("root", Container({ layout: "fall.free" }));
    const a = node("a", Bounded({ bounds: rect(1, 1.4) }), Flippable(), Transformable({ at: { x: 0, y: 0 } }));
    const b = node("b", Bounded({ bounds: rect(1, 1.4) }), Flippable(), Transformable({ at: { x: 0.01, y: 0.01 } }));
    add(root, a);
    add(root, b);

    const host = mount(document.createElement("div"), root);
    const painter = { ready: Promise.resolve(), draw: () => {}, resize: () => {}, destroy: () => {} };
    const motions = attachMotion(host, painter);
    const items = [
      { id: "a", offset: { x: 0, y: 0 } },
      { id: "b", offset: { x: 0, y: 0 } },
    ];
    motions.grab(items, { anchor: { x: 0, y: 0 } });

    const scene: FallScene = { host, motions, actor: "south" };
    letFall(scene, items, 1, { x: 400, y: 0 });

    const marks = ["a", "b"].map((id) => fieldsOf<MarkedFields>(byId(root, id)!, "Marked")?.mark);
    expect(marks.filter((m) => m === "thrown"), "exactly one card carries the mark").toHaveLength(1);
  });

  it("fall.a-calm-drop-still-marks-the-touch — no swing earns no `thrown`, but the release still says `moved`", () => {
    // A CARD SET DOWN WITHOUT A SWING never trips `thrown` (`flight.speed` stays 0), and it used to
    // leave the release with no mark at all — the far screen had nothing to show for a touch that
    // plainly happened. The one-mark-per-touch rule still owes SOMETHING for a calm release; it is
    // just not the flight glyph.
    registerLayout("fall.free", freeLayout);
    const root = node("root", Container({ layout: "fall.free" }));
    const card = node("card", Bounded({ bounds: rect(1, 1.4) }), Flippable(), Transformable({ at: { x: 0, y: 0 } }));
    add(root, card);

    const host = mount(document.createElement("div"), root);
    const painter = { ready: Promise.resolve(), draw: () => {}, resize: () => {}, destroy: () => {} };
    const motions = attachMotion(host, painter);
    const items = [{ id: "card", offset: { x: 0, y: 0 } }];
    motions.grab(items, { anchor: { x: 0, y: 0 } });

    const scene: FallScene = { host, motions, actor: "south" };
    // NO `hand` — the finger let go where it was, not with a throw behind it.
    letFall(scene, items, 1, undefined);

    const marked = fieldsOf<MarkedFields>(byId(root, "card")!, "Marked");
    expect(marked?.mark, "a calm release still marks the touch").toBe("moved");
  });
});
