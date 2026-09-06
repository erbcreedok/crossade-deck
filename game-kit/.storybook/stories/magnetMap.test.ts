// THE MAGNET'S OWN ARITHMETIC — which zone a release belongs to, and how far "belongs" reaches.
//
// A drop is otherwise decided by a POINT: the finger comes up somewhere and whatever container is
// under that somewhere takes the card. This is the widening of that answer, and it is pure — two
// outlines and a number — so it is checked without a glass, at the exact distances where it turns
// over, which is the one thing a person dragging a card by hand can never do.

import { describe, expect, it } from "vitest";
import {
  Acceptor,
  add,
  Bounded,
  compose,
  Container,
  fieldsOf,
  freeLayout,
  heapOf,
  node,
  rect,
  registerLayout,
  Reaching,
  remove,
  Valued,
  Transformable,
  type LayoutChild,
  type Node,
  type TransformableFields,
  type Vec,
  zoneNear,
} from "../../src/index.js";
import { CARD_SHARE, FAN_TILT, fitStep, handLayout, HELD_SHARE, magnetMap, PULL, zoneFan, zoneHolds, poseOnLanding } from "./magnetMap.js";
import { GRIP, heapBox, isGrip, MAP, regrip, restsAt, stackSeats, threwAt, THROWN_AT , kindOf , heapKindOf } from "./gestureMap.js";
import { mergeRule } from "./mergeMap.js";

/** A card off the desk itself — the real shape, not a stand-in built to make the sums come out. */
const leadOf = (desk: Node): Node => desk.children[1]!;

/** Everything is welcome; what these cases are about is WHERE the zone is, not what it will take. */
const ACCEPTS = Acceptor({});

const zoneOf = (desk: Node): Node => desk.children[0]!;

/** A run's own handle, standing where it landed — what `settle` would have drawn under the heap. */
let tabs = 0;
const handle = (at: Vec): Node =>
  node(`stack handle ${tabs++}`, Bounded({ bounds: rect(GRIP.w, GRIP.w / 4) }), Valued({ values: { grip: 0 } }), Transformable({ at }));

describe("which zone a release belongs to", () => {
  it("magnet.a-zone-is-found-wherever-it-is-filed — a place in a layer is still a place", () => {
    // THE FAULT THIS EXISTS FOR: a hand that is also somebody's SEAT stands in the desk's layer of
    // places (`@game-presets/desks`, `CHAIR_LAYER`), so that nothing reading the felt's own children
    // mistakes it for a piece. Asked of the top level alone, such a desk answers "no zone anywhere"
    // — and a card let go over an open hand lands on the felt beside it.
    const desk = magnetMap(PULL);
    const zone = zoneOf(desk);
    const lead = leadOf(desk);
    remove(desk, zone);
    const layer = node("places layer");
    add(layer, zone);
    add(desk, layer);
    expect(zoneNear(desk, { x: 0, y: 1.8 }, lead), "one storey down is still on the desk").toBe(zone);

    // ...AND THE WALK STOPS AT A ZONE. What is inside a hand is the cards in it, and a card is not
    // somewhere a release belongs — a zone nested in a zone would be one.
    const inner = node("a card that accepts", Bounded({ bounds: rect(1, 1.4) }), ACCEPTS, Reaching({ reach: PULL }), Transformable({ at: { x: 0, y: 0 } }));
    add(zone, inner);
    expect(zoneNear(desk, { x: 0, y: 1.8 }, lead), "the hand, never what is in it").toBe(zone);
  });

  it("magnet.a-release-short-of-the-border-still-belongs — and one further out does not", () => {
    const desk = magnetMap(PULL);
    const zone = zoneOf(desk);
    const lead = leadOf(desk);
    // The zone stands at y = 1.8 and is 2 tall, so its top edge is at 0.8; the card is 1.4 tall, so
    // its own bottom edge is 0.7 below wherever it is released.
    const releasedAt = (y: number): Node | undefined => zoneNear(desk, { x: 0, y }, lead);

    expect(releasedAt(1.8), "squarely inside the border").toBe(zone);
    // Its bottom edge exactly on the border: touching, so nothing has to be forgiven at all.
    expect(releasedAt(0.1), "the card's edge on the border").toBe(zone);
    // A gap of bare felt, within the pull — the whole point of the page.
    expect(releasedAt(0.1 - PULL * 0.6), "a gap smaller than the pull").toBe(zone);
    // ...and past it, nothing. The number is a THRESHOLD and the desk keeps to it.
    expect(releasedAt(0.1 - PULL * 1.4), "a gap bigger than the pull").toBeUndefined();
  });

  it("magnet.a-handle-is-never-put-anywhere — a zone takes cards, not controls", () => {
    // A handle is a PICTURE of a heap, redrawn wherever that heap ends up. A zone that took one
    // would be given a control to keep — and its row would lay the tab out among the cards as though
    // it were one of them, which is what it did until this law existed.
    //
    // ASKED OF THE HANDLE, ANSWERED FOR THE CARDS. The tab is exactly what a zone is asked ABOUT — a
    // run carried by its tab is anchored on it, and that is what was aimed — and it is exactly what
    // a zone never KEEPS. The two are not in tension: one is a question, the other is a delivery.
    const desk = magnetMap(PULL);
    const zone = zoneOf(desk);
    const card = leadOf(desk);
    const tab = handle({ x: 0, y: 1.8 });
    add(desk, tab);
    expect(zoneNear(desk, { x: 0, y: 1.8 }, tab), "the anchor is what the zone is asked about").toBe(zone);
    poseOnLanding(HELD_SHARE)(desk, [tab.id, card.id]);
    expect(card.parent, "the cards go in").toBe(zone);
    expect(tab.parent, "and the tab stays the desk's own picture").toBe(desk);
  });

  it("magnet.no-pull-is-every-other-desk — the release has to land inside the border", () => {
    // Off is not a second code path: it is the same lookup with nothing to forgive, which is what
    // every desk on this shelf said before one of them grew a reach.
    const desk = magnetMap(0);
    const lead = leadOf(desk);
    expect(zoneNear(desk, { x: 0, y: 1.8 }, lead), "inside is still inside").toBe(zoneOf(desk));
    expect(zoneNear(desk, { x: 0, y: 0.05 }, lead), "a hair short of it is now nothing").toBeUndefined();
  });

  it("magnet.the-nearest-zone-takes-it — never the first one somebody added", () => {
    // Two zones within reach of one release is a real arrangement — a desk of player areas — and
    // deciding it by tree order would be deciding it by something no player can see or predict.
    registerLayout("magnet.test.free", freeLayout);
    const desk = node("desk", Bounded({ bounds: rect(9, 9) }), Container({ layout: "magnet.test.free" }));
    const zone = (id: string, x: number): Node =>
      node(id, Bounded({ bounds: rect(1, 1) }), Transformable({ at: { x, y: 0 } }), Container({ layout: "magnet.test.free" }), ACCEPTS, Reaching({ reach: 3 }));
    // BOTH within reach of the release, so the tie is a real one — and added right-first, so
    // first-found and nearest disagree about it.
    add(desk, zone("right", 1));
    add(desk, zone("left", -1));
    const card = node("card", Bounded({ bounds: rect(0.2, 0.2) }));
    expect(zoneNear(desk, { x: -0.2, y: 0 }, card)?.id, "nearer to the left one").toBe("left");
    expect(zoneNear(desk, { x: 0.2, y: 0 }, card)?.id, "and to the right one from the other side").toBe("right");
  });
});


describe("where a throw will come to rest", () => {
  it("magnet.a-throw-is-the-speed-ABOVE-the-throwing-speed — carrying is not throwing", () => {
    // A hand crossing the desk with a card in it is going somewhere at three or four units a second.
    // Take that as the throw and every ordinary putting-down is a flick: let go while still walking
    // the card over and it sails off, which is what a hand never does.
    expect(threwAt(0), "standing still").toBe(0);
    expect(threwAt(THROWN_AT * 0.9), "carrying, under the threshold").toBe(0);
    // NO CLIFF AT THE THRESHOLD. Below it nothing flies; a hair above it the piece used to leave at
    // full carrying speed — the same gesture a millimetre apart giving nothing and giving
    // everything. It begins at nothing exactly where it begins to be a throw.
    expect(threwAt(THROWN_AT)).toBe(0);
    expect(threwAt(THROWN_AT + 0.01)).toBeCloseTo(0.01, 9);
    // ...and grows from there, one for one: what travels is the part of the gesture that was a throw.
    expect(threwAt(THROWN_AT + 6)).toBeCloseTo(6, 9);
  });

  it("magnet.a-throw-is-aimed-too — asked where it will STOP, not where the finger came up", () => {
    // A magnet that only catches a piece put down near a zone is half a magnet: a card flicked at
    // somebody's area is aimed just as plainly as one carried there, and a desk that answered "you
    // let go too far away" to a throw that was going to land in the zone anyway would be refusing
    // the more confident of the two gestures.
    //
    // The sum is exact for the flight the desk actually files: a slide bleeds a fixed amount of
    // speed per second, so `v² / 2a` is the distance, not an estimate.
    const feel = { fall: "settle", throwGain: 1, friction: 2, gravity: 11, bounce: 0, wallBounce: 0, girth: 0, solid: "", scatter: 0 } as const;
    const from = { x: 0, y: 0 };
    // Four units a second against a drag of two: sixteen over four, so four units on.
    expect(restsAt(from, { x: 4, y: 0 }, feel, 99)).toEqual({ x: 4, y: 0 });
    // ...and it keeps the heading, whichever way the hand went.
    const back = restsAt(from, { x: 0, y: -4 }, feel, 99);
    expect(back.x).toBeCloseTo(0, 6);
    expect(back.y).toBeCloseTo(-4, 6);
    // Its OWN share of the hand's speed, because not everything leaves a hand at the hand's speed.
    expect(restsAt(from, { x: 4, y: 0 }, { ...feel, throwGain: 0.5 }, 99).x).toBeCloseTo(1, 6);
    // A hand that was not going anywhere aims where it is: a putting-down is not a throw of nothing.
    expect(restsAt(from, undefined, feel, 99)).toBe(from);
    expect(restsAt(from, { x: 0, y: 0 }, feel, 99)).toBe(from);
    // And with no friction of its own it takes the desk's, or the sum has no drag to divide by.
    const { friction: _own, ...noDrag } = feel;
    expect(restsAt(from, { x: 4, y: 0 }, noDrag, 4).x).toBeCloseTo(2, 6);
  });
});

describe("how a place poses what it lifts", () => {
  const LOOK = { gapMin: 0.18, gapMax: 0.62, wideMin: 0.24, wideMax: 1 };
  const fan = zoneFan(LOOK, FAN_TILT);

  it("magnet.a-hand-comes-up-as-a-fan — laid out by its WIDTH, and turned to match", () => {
    // The width is the thing anybody has an opinion about ("a hand may take the whole desk if it
    // has to"), so the width is what the numbers control and the angles are what follow.
    const desk = magnetMap();
    const cards = desk.children.filter((n) => heapOf(n) === "card").slice(0, 5);
    const spread = fan(cards, GRIP.w);
    expect(spread.length).toBe(5);
    // Symmetrical about the middle, the middle card upright, the turns growing outwards in order.
    expect(spread[2]!.deg).toBeCloseTo(0, 6);
    expect(spread[0]!.deg).toBeCloseTo(-spread[4]!.deg, 6);
    for (let i = 1; i < spread.length; i++) expect(spread[i]!.deg).toBeGreaterThan(spread[i - 1]!.deg);
    // ...and the outermost leans by exactly the tilt asked for: the arc is DERIVED from the width
    // and that angle, so a wide hand is a shallow sweep and a narrow one a steep one.
    expect(Math.abs(spread[4]!.deg)).toBeCloseTo(FAN_TILT, 6);
    // The middle card lands on the stack's own seat — a hand opening must not drift up the finger.
    expect(spread[2]!.at.y).toBeCloseTo(stackSeats([cards[2]!], GRIP.w)[0]!.y, 6);
    expect(spread[2]!.at.x).toBeCloseTo(0, 6);
    // The ends swing out to the sides and hang a little LOWER, which is the whole difference
    // between a fan and a row of cards at angles.
    expect(spread[0]!.at.x).toBeLessThan(0);
    expect(spread[4]!.at.x).toBeGreaterThan(0);
    expect(spread[0]!.at.y).toBeGreaterThan(spread[2]!.at.y);
  });

  it("magnet.a-hand-is-bounded-by-the-GLASS — not by how big the desk happens to be", () => {
    // A desk is as big as the game wants and a screen is as big as it is. Measured against the
    // first, the outer cards of a big hand sit past the glass — unreadable and unreachable, which
    // is the opposite of what a hand is for.
    const desk = magnetMap();
    const cards = desk.children.filter((n) => heapOf(n) === "card").slice(0, 8);
    const wide = fan(cards, GRIP.w, 12);
    const narrow = fan(cards, GRIP.w, 3);
    const span = (seats: readonly { at: { x: number } }[]): number =>
      Math.max(...seats.map((s) => s.at.x)) - Math.min(...seats.map((s) => s.at.x));
    expect(span(narrow), "a small screen holds a smaller hand").toBeLessThan(span(wide));
    expect(span(narrow), "and the hand fits inside it").toBeLessThanOrEqual(3);
    // ...and shrinking the room does not turn a fan into a stack: it is still a spread, in order.
    for (let i = 1; i < narrow.length; i++) expect(narrow[i]!.at.x).toBeGreaterThan(narrow[i - 1]!.at.x);
  });

  it("magnet.a-hand-of-one-is-not-a-fan — and no tilt asked for is a straight line", () => {
    const desk = magnetMap();
    const cards = desk.children.filter((n) => heapOf(n) === "card");
    // One card has nothing to splay against, so it stands exactly as the stack would leave it.
    const alone = fan(cards.slice(0, 1), GRIP.w);
    expect(alone[0]!.deg).toBe(0);
    expect(alone[0]!.at).toEqual(stackSeats([cards[0]!], GRIP.w)[0]);
    // No arc asked for, no arc: upright cards in a line, which is a legitimate thing to want.
    const flat = zoneFan(LOOK, 0)(cards.slice(0, 5), GRIP.w);
    for (const seat of flat) expect(seat.deg).toBe(0);
    expect(new Set(flat.map((seat) => seat.at.y)).size, "all at one height").toBe(1);
  });

  it("magnet.a-run-lands-where-its-ANCHOR-landed — one answer for the whole hand, never card by card", () => {
    // Asked card by card — does THIS one lie in a zone? — a stack let go of at the edge of an area
    // is torn in half: the cards whose corners crossed the line are taken and the rest are left on
    // the felt, and a player who aimed at ONE place has their hand dealt into two. Sixty per cent of
    // a stack touching somebody's area is still a stack anchored outside it.
    //
    // A run is one thing a hand carried to one point, and the point is the ANCHOR: the handle. That
    // is what the hand had hold of, and it is what was aimed.
    const desk = magnetMap();
    const zone = zoneOf(desk);
    const cards = desk.children.filter((n) => heapOf(n) === "card");
    const home = fieldsOf<TransformableFields>(zone, "Transformable")!.at!;
    const seat = (n: Node) => fieldsOf<TransformableFields>(n, "Transformable")!;
    const fanOut = (run: readonly Node[], from: Vec) =>
      run.forEach((card, i) => compose(card, Transformable({ at: { x: from.x - 1.2 + i * 1.2, y: from.y }, angle: 8 + i * 6 })));

    // THE ANCHOR IS IN THE ZONE: the whole run goes in, spread and all — including the one the fan
    // put a long way outside the border.
    const inside = cards.slice(0, 3);
    fanOut(inside, home);
    const tabIn = handle(home);
    add(desk, tabIn);
    poseOnLanding(HELD_SHARE)(desk, [tabIn.id, ...inside.map((n) => n.id)]);
    for (const card of inside) {
      expect(card.parent, "the anchor landed in the zone, so the hand did").toBe(zone);
      expect(seat(card).angle, "and the lean a lift put on them comes off").toBe(0);
    }

    // THE ANCHOR IS ON THE FELT: the whole run stays out — including the one lying squarely in the
    // area — and it stacks ON THE ANCHOR. Squared onto a CARD instead, the pile appears wherever the
    // fan happened to put its first one, which is a hand's width to the far LEFT of the finger.
    const felt = cards.slice(3, 6);
    const away = { x: home.x, y: home.y - 3 };
    fanOut(felt, away);
    compose(felt[2]!, Transformable({ at: home, angle: 8 }));
    const tabOut = handle(away);
    add(desk, tabOut);
    poseOnLanding(HELD_SHARE)(desk, [tabOut.id, ...felt.map((n) => n.id)]);
    for (const card of felt) {
      expect(card.parent, "the anchor landed on the felt, so the hand did").toBe(desk);
      expect(seat(card).angle, "flat again, the lean is the hand's not the felt's").toBe(0);
      // ON the anchor: a pile stands over its handle, within a card of it and never a fan away.
      expect(Math.abs(seat(card).at!.x - away.x), "the pile is on the anchor, not off to the left").toBeLessThan(0.2);
      expect(seat(card).at!.y, "and it stands over the tab, as a heap does").toBeLessThan(away.y);
    }
  });

  it("magnet.a-pile-stands-over-its-anchor-and-goes-under-it-when-there-is-no-room", () => {
    // A heap stands OVER its handle — that is what a handle is, a tab under the thing it lifts — so
    // the pile is seated in the anchor's own frame (`stackSeats`), which is the very seat the run
    // already had in the hand. Nothing is invented and nothing is measured off a card.
    //
    // AND IT GOES THE OTHER WAY AT THE TOP OF THE DESK. Seated above an anchor let go of near the
    // top border, the cards would stand off the edge of the desk the whole page is walled by. Sides
    // are not answered: a pile is a card wide and the desk is eight, so it cannot run out of room
    // sideways the way it can vertically.
    const desk = magnetMap();
    const cards = desk.children.filter((n) => heapOf(n) === "card");
    const seatOf = (n: Node) => fieldsOf<TransformableFields>(n, "Transformable")!.at!;
    const drop = (run: readonly Node[], at: Vec) => {
      run.forEach((card, i) => compose(card, Transformable({ at: { x: at.x + i * 0.8, y: at.y }, angle: 12 * i })));
      const tab = handle(at);
      add(desk, tab);
      poseOnLanding(HELD_SHARE)(desk, [tab.id, ...run.map((n) => n.id)]);
    };

    // MID-DESK: the pile stands over the tab, and it is a PILE — the step is a sliver, not a spread.
    const middle = cards.slice(0, 3);
    const at = { x: -1, y: -0.4 };
    drop(middle, at);
    for (const card of middle) expect(seatOf(card).y, "over the tab, as a heap stands").toBeLessThan(at.y);
    const step = Math.hypot(seatOf(middle[1]!).x - seatOf(middle[0]!).x, seatOf(middle[1]!).y - seatOf(middle[0]!).y);
    expect(step, "a pile, not a row").toBeLessThan(0.2);
    expect(step, "and not one card either — the step is still there").toBeGreaterThan(0);

    // AT THE TOP BORDER: the same run hangs BELOW the anchor instead, and stays on the desk.
    const top = cards.slice(3, 6);
    const high = { x: -1, y: -MAP.h / 2 + 0.3 };
    drop(top, high);
    for (const card of top) {
      expect(seatOf(card).y, "no room above, so it hangs below").toBeGreaterThan(high.y);
      expect(seatOf(card).y, "and it is still on the desk").toBeGreaterThan(-MAP.h / 2);
    }
  });
});

describe("the step a spread actually takes", () => {
  const LOOK = { gapMin: 0.2, gapMax: 0.6, wideMin: 0.5, wideMax: 1 };

  it("magnet.four-bounds-with-an-order — the room wins, then the widths, then the gaps", () => {
    // Four numbers, because none of them says what another says: a step alone cannot state "twenty
    // cards may be wider than three but not wider than the desk", and a width alone cannot state
    // "two cards must not sit a hand's length apart just because there is room". They can therefore
    // contradict each other, and something has to lose in a stated order.
    //
    // NOTHING TO SPREAD. One card has no step to take, and nor has none.
    expect(fitStep(1, 10, LOOK)).toBe(0);
    expect(fitStep(0, 10, LOOK)).toBe(0);

    // THE COMFORTABLE STEP, when nothing above it has an opinion: plenty of room, no floor asked
    // for, and the widest the widths allow is more than the gap wants.
    expect(fitStep(3, 10, { ...LOOK, wideMin: 0 }), "two gaps in ten units of room").toBeCloseTo(LOOK.gapMax, 9);

    // THE WIDTHS BEAT THE GAPS. Told to fill half the room, a short hand opens past its comfortable
    // step rather than huddling in the middle of a place it was told to fill.
    expect(fitStep(3, 10, LOOK), "two gaps, half of ten between them").toBeCloseTo(2.5, 9);
    // ...and the other way: a wide ceiling shuts a long hand tighter than its comfortable step.
    expect(fitStep(21, 6, { ...LOOK, wideMax: 0.5 }), "twenty gaps, three units allowed").toBeCloseTo(0.15, 9);

    // THE ROOM BEATS EVERYTHING. A spread never leaves the place it is in, whatever any other
    // number says — that is not a preference, it is what an edge means.
    expect(fitStep(11, 1, LOOK), "ten gaps in one unit").toBeCloseTo(0.1, 9);
    expect(fitStep(11, 1, { ...LOOK, gapMin: 5, wideMin: 5 }), "and the floors cannot break it").toBeCloseTo(0.1, 9);
  });
});

describe("a hand that never outgrows its room", () => {
  const card = (w: number, i = 0): LayoutChild => ({ id: `c${i}` as LayoutChild["id"], at: { x: 0, y: 0 }, footprint: rect(w, 1.4) });
  const LOOK = { gapMin: 0.08, gapMax: 0.55, wideMin: 0, wideMax: 1 };
  const hand = handLayout(LOOK, 0.1);
  const room = rect(3.4, 2);
  const spread = (n: number): number[] => hand.place(Array.from({ length: n }, (_v, i) => card(1, i)), room).map((p) => p!.x);

  it("magnet.a-hand-closes-up-as-it-grows — and never crosses the border", () => {
    // A row of a fixed step gets wider with every card, and a zone is a place with an EDGE: eight
    // cards at a comfortable step hang half a card past the border on each side, which reads as the
    // zone having failed to hold what it was given.
    for (const n of [1, 2, 5, 8, 20]) {
      const xs = spread(n);
      const half = 3.4 / 2 - 0.1 - 0.5; // the room a card's own centre may stand in
      for (const x of xs) expect(Math.abs(x), `${n} cards`).toBeLessThanOrEqual(half + 1e-9);
    }
    // ...and it is always a row: in order, evenly, centred on the zone.
    const eight = spread(8);
    for (let i = 1; i < eight.length; i++) expect(eight[i]!).toBeGreaterThan(eight[i - 1]!);
    expect(eight[0]! + eight[7]!).toBeCloseTo(0, 9);
  });

  it("magnet.a-small-hand-is-not-a-squashed-big-one — below the crossing nothing changes", () => {
    // The step is the smaller of two: the one that looks right and the one that fits. A hand of
    // three must look like a hand of three, not like a hand of twelve with nine cards missing.
    const three = spread(3);
    expect(three[1]! - three[0]!, "the comfortable step, untouched").toBeCloseTo(LOOK.gapMax, 9);
    // Twenty cannot have it, and takes what the room allows instead — strictly less.
    const twenty = spread(20);
    expect(twenty[1]! - twenty[0]!).toBeLessThan(LOOK.gapMax);
    // One card has no step to take and stands in the middle.
    expect(spread(1)).toEqual([0]);
  });

  it("magnet.a-hand-with-no-room-named-places-nobody — a guess about an edge is worse than silence", () => {
    // Given no box the layout has no number to measure a border from. It says so rather than
    // inventing one, which is the same answer a free canvas gives.
    expect(hand.place([card(1, 0), card(1, 1)])).toEqual([undefined, undefined]);
  });
});

describe("what the zone is holding", () => {
  const NEVER = (): boolean => false;

  /** Put a card of the desk at a place, in root units, and hand it back. */
  function laid(desk: Node, nth: number, at: { x: number; y: number }): Node {
    const card = desk.children.filter((n) => heapOf(n) === "card")[nth]!;
    compose(card, Transformable({ at }));
    return card;
  }

  it("magnet.a-place-holds-what-lies-IN-it — not only what it was handed", () => {
    // Parentage alone is not the answer. A card can end up in somebody's area without anybody
    // giving it to them — pushed there, knocked there, left half across the border — and a zone
    // that counted only what it had been given would leave those on the felt while a player
    // looking at the desk would call them theirs.
    const desk = magnetMap();
    const zone = desk.children[0]!;
    const deep = laid(desk, 0, { x: 0, y: 1.8 }); // squarely inside
    const edge = laid(desk, 1, { x: 0, y: 0.75 }); // half across the border
    const away = laid(desk, 2, { x: 0, y: -2 }); // on the felt, nowhere near
    const holds = zoneHolds(HELD_SHARE)(desk, NEVER);
    expect(holds.length, "one zone, one hold").toBe(1);
    expect(holds[0]!.under, "the handle stands under the ZONE, not under the cards").toBe(zone);
    const ids = holds[0]!.pieces.map((n) => n.id);
    expect(ids).toContain(deep.id);
    expect(ids, "half in is far more than the share, so it is in").toContain(edge.id);
    expect(ids).not.toContain(away.id);
  });

  it("magnet.the-share-is-what-decides — the same card, in and out, on one number", () => {
    const desk = magnetMap();
    // A SLIVER over the border. The zone's top edge is at 0.8 and a card is 1.4 tall, so a card
    // centred at 0.24 has a tenth of itself inside — the exact distance the answer turns over at,
    // which is the one thing a person dragging a card by hand can never aim for.
    const sliver = laid(desk, 0, { x: 0, y: 0.24 });
    const held = (share: number): string[] => zoneHolds(share)(desk, NEVER)[0]!.pieces.map((n) => n.id);
    expect(held(0.05), "a low bar takes it").toContain(sliver.id);
    expect(held(0.5), "a high one does not").not.toContain(sliver.id);
  });

  it("magnet.a-place-s-handle-stands-under-the-PLACE — it does not follow what is in it", () => {
    // A heap's handle is drawn under the heap, because the heap is all there is. A zone's is drawn
    // under the ZONE: the tab belongs to the place, so it is in the same spot whatever is lying in
    // it and however that has been pushed about — which is what makes it findable at all.
    const desk = magnetMap();
    const zone = desk.children[0]!;
    // One card, high inside the zone: its own bottom edge is a long way above the zone's.
    const card = laid(desk, 0, { x: 0, y: 1.3 });
    const held = regrip(desk, heapKindOf, undefined, NEVER, undefined, { ...mergeRule(CARD_SHARE), held: zoneHolds(HELD_SHARE) });
    const tab = desk.children.find(isGrip)!;
    expect([...held.get(tab.id)!].map((n) => n.id), "and it lifts the cards, never the zone").toEqual([card.id]);
    const seat = fieldsOf<TransformableFields>(tab, "Transformable")!.at!;
    const under = heapBox(desk, [zone]).bottom;
    expect(seat.y, "just below the zone's own bottom edge").toBeGreaterThan(under);
    expect(seat.y - under, "and only just — a tab is under a thing, not adrift below it").toBeLessThan(0.3);
    // Under the CARD's edge instead, the tab would be most of a card higher up.
    expect(seat.y, "not under the card").toBeGreaterThan(heapBox(desk, [card]).bottom + 0.3);
  });

  it("magnet.a-stale-handle-is-swept-wherever-it-ended-up — not only off the desk's own top", () => {
    // A handle is drawn as a child of the desk, but a desk with zones on it can re-home a node. A
    // tab that found its way inside one would be laid out by that zone as though it were a card, and
    // a sweep that only looked at the desk's own children would never see it again — one stale tab
    // is one control that lifts a heap that is not there.
    const desk = magnetMap();
    const zone = desk.children[0]!;
    laid(desk, 0, { x: 0, y: 1.8 });
    const stowaway = node("stack handle stray", Bounded({ bounds: rect(0.6, 0.15) }), Valued({ values: { grip: 0 } }));
    add(zone, stowaway);
    regrip(desk, heapKindOf, undefined, NEVER, undefined, { ...mergeRule(CARD_SHARE), held: zoneHolds(HELD_SHARE) });
    expect(zone.children.filter(isGrip), "the zone holds cards, never controls").toEqual([]);
    // ...and the desk has exactly the handles it should: the zone's own, and the deck's — thirty-odd
    // cards on one spot are a heap like any other, and it is the stray that had to go.
    expect(desk.children.filter(isGrip).length).toBe(2);
  });

  it("magnet.what-the-clock-is-carrying-is-in-nobody-s-zone", () => {
    // The same law every heap on this shelf keeps: a piece in the air is not lying anywhere, and a
    // handle that counted it would pull it back out of its own flight.
    const desk = magnetMap();
    const flying = laid(desk, 0, { x: 0, y: 1.8 });
    expect(zoneHolds(HELD_SHARE)(desk, (id) => id === flying.id)[0]!.pieces.map((n) => n.id)).not.toContain(flying.id);
  });
});
