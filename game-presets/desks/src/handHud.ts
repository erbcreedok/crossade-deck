// THE HAND ON THE GLASS — the player's own cards drawn at the foot of their screen, where a thumb
// reaches them, and the controls that go with them.
//
// IT IS A PICTURE AND NOT A PLACE. The hand on the felt is the truth (`handZone.ts`): one array, one
// set of nodes, one set of events that change it (`handRule`). This draws that array on the screen
// root — a card is SHOWN here, never held here — which is the whole reason the two can never
// disagree about what somebody is holding. It is also why the other players can still be dealt from
// this hand and can still see it: what they reach is the box on the felt, which never went away.
//
// A CARD PUT INTO EITHER GOES INTO BOTH, because there is only one to go into. A finger that carries
// a card onto the box on the felt puts it in the hand and the picture redraws; a finger that carries
// one onto this strip is aimed at the same hand and the same drop happens. Nothing is synchronised,
// because nothing is duplicated.
//
// THE FOUR CONTROLS COME WITH IT, by the same ids and the same meanings (`handBar.ts`): a press on
// either copy reads back the same `{seat, what}`, so one wiring answers both and there is no second
// lock to disagree with the first. They stand ABOVE the cards, outside them, exactly as they do on
// the felt — and the room they take is what `floor` reports, so nothing else on the screen (the
// camera's own pair) is laid over them.
//
// WHAT IT IS NOT: a second hand, a second array, or a second state. Every question it answers, it
// answers by reading the chair.

import {
  add,
  Bounded,
  compose,
  Container,
  extentOf,
  facing,
  fieldsOf,
  footprint,
  freeLayout,
  byId,
  node,
  registerLayout,
  registerSurface,
  remove,
  roundedRect,
  setFacing,
  Flippable,
  Surfaced,
  Transformable,
  type BoundedFields,
  type FlippableFields,
  type Host,
  type Node,
  type Paint,
  type SurfacedFields,
  type TransformableFields,
} from "game-kit";
import { BAR, dressBar, fitBar, seatBar } from "./handBar.js";
import { HAND, HAND_LAYOUT, handRoom, handWidth } from "./handZone.js";
import { chairId } from "./seatPlace.js";

/** The nodes this file makes, by the names a reader sees in the inspector. */
export const HAND_HUD = "hud/hand";
export const HAND_HUD_BOX = "hud/hand/box";
export const HAND_HUD_ANCHOR = "hud/hand/anchor";
const HAND_HUD_FREE = "hud/hand/free";
const HAND_HUD_SCREEN = "hud/hand/screen";

/** How far the strip stands off the foot of the glass, in HUD units, before the device's own inset. */
export const HAND_HUD_MARGIN = 0.14;

/** What the anchor is, in HUD units, when there is no hand to measure it against yet. */
const ANCHOR_EMPTY = { w: 3, h: 1.7 };

/** The two faces of the anchor: a dotted outline while it is only offered, filled while it is aimed at. */
const ANCHOR_OPEN = "hud/hand/anchor/open";
function anchorKeen(seat: string): string {
  return `hud/hand/anchor/keen/${seat}`;
}

/**
 * The id a shown card answers to. Built here and never parsed back (`guard.id-is-opaque`): which
 * felt card a picture is of is remembered in a list beside the tree, not spelled into a name.
 */
let shownDrawn = 0;
function shownId(): string {
  return `${HAND_HUD}/card ${shownDrawn++}`;
}

export interface HandHudOptions {
  /** Whose hand this is — the seat, which is also what the controls report on a press. */
  readonly seat: string;
  /**
   * THE TREE THE CHAIR STANDS IN, read fresh: a hub tree is REPLACED wholesale on every revision
   * (`host.setRoot` swaps the object), so a wiring holding the first one would go on drawing a hand
   * nobody has played from in an hour.
   */
  readonly desk: () => Node;
  /** The seat's own ink — what a control that is ON is lit with. */
  readonly ink: Paint;
  /**
   * THE SCREEN THIS HANGS ON. Given, it is somebody else's (the camera's pair already made one) and
   * this only adds a child to it; absent, one is made here and hung on the host. Two screens would
   * be two answers to where the corner of the glass is.
   */
  readonly screen?: Node;
}

export interface HandHud {
  /** The strip itself — one node, holding the shown cards and the bar. */
  readonly root: Node;
  /** Re-read the chair: which cards, which way up, how wide, and what the controls are lit by. */
  refresh(): void;
  /** What is shown right now, by the ids of the cards on the FELT — the picture's own manifest. */
  cards(): readonly string[];
  /** Which side each shown card is showing — the owner's own reading, in the same order. */
  faces(): readonly ("up" | "down")[];
  /** How wide the strip is, in HUD units. */
  width(): number;
  /** How much of the foot of the glass it has taken, in device pixels. Nothing, holding nothing. */
  floor(): number;
  /** Whether the hand is pinned to this glass. A hand starts on the felt, where every player's is. */
  attached(): boolean;
  /**
   * THE CARD A PICTURE ON THE GLASS IS OF — the node on the FELT, or nothing for anything else on
   * the screen. What a finger landing on the strip takes hold of (`DragOptions.standIn`): there is
   * one card, it lies in its owner's place, and this is a way of reaching it.
   */
  standFor(shown: Node): Node | undefined;
  /**
   * IS THIS POINT ON THE GLASS AIMED AT THIS HAND — over the strip while it is pinned there, or over
   * the ANCHOR while one is up. Both, because they are one place: a run let go at the foot of the
   * screen is a run given to this hand, whether the hand is already there or is arriving with it.
   * Without the anchor half, carrying a hand to the glass by its own handle drops the cards on the
   * felt at the bottom of the table, which is a hand spilled at the moment it was being put away.
   */
  overHand(glass: { readonly x: number; readonly y: number }): boolean;
  /**
   * WHAT IS IN THE AIR RIGHT NOW, by the ids of the cards on the felt — left out of the picture for
   * as long as it is: a card drawn under the finger AND still lying in the strip is one card shown
   * twice, and the reader cannot tell which of them they are holding.
   */
  lifting(ids: readonly string[]): void;
  /** Pin it or let it go — the state itself, for a consumer that remembers one across sessions. */
  attach(on: boolean): void;
  /**
   * A RING IS IN HAND, at this point on the glass — or nothing, when none is. Puts the anchor up
   * while one is being carried and answers whether the finger is over it, so the reader is told
   * where the drop will land BEFORE they let go rather than by what happens after.
   */
  carrying(glass: { readonly x: number; readonly y: number } | undefined): boolean;
  /**
   * THE RING WAS LET GO at this point. Over the anchor it is the switch — on if it was off, off if
   * it was on: one place and one act, both ways. Anywhere else it is a ring being moved on the felt
   * and says nothing about the glass. Answers whether anything changed.
   */
  dropped(glass: { readonly x: number; readonly y: number } | undefined): boolean;
  stop(): void;
}

/**
 * HANG THE PLAYER'S OWN HAND AT THE FOOT OF THEIR GLASS. Returns the handle its consumer refreshes.
 *
 * Nothing is watched from in here: the desk is written by a gesture, by the room, or by a press, and
 * every one of those already ends in a call the consumer makes (`onDeskChanged`, a publish, a
 * press). A watcher of its own would be a second clock over the same events.
 */
export function handHud(host: Host, o: HandHudOptions): HandHud {
  registerLayout(HAND_HUD_FREE, freeLayout);
  // A PLACE TO PUT SOMETHING, drawn the way a plan drawing says it: a dotted outline. Aimed at, it
  // stops being an offer and becomes the answer — filled in the seat's own ink, the same light every
  // zone on the felt wears when a hand is over it (`zoneKeen`).
  registerSurface(ANCHOR_OPEN, {
    layers: [],
    radius: HAND.pad,
    stroke: { color: "textFaint", width: 0.03, opacity: 0.85, dash: { on: 0.12, off: 0.1 } },
  });
  registerSurface(anchorKeen(o.seat), {
    layers: [{ paint: o.ink, opacity: 0.22 }],
    radius: HAND.pad,
    stroke: { color: o.ink, width: 0.03, opacity: 0.9 },
  });
  const screen = o.screen ?? node(HAND_HUD_SCREEN, Container({ layout: HAND_HUD_FREE }));
  const ownScreen = o.screen === undefined;
  const previous = host.hudRoot;
  if (ownScreen) host.setHudRoot(screen);

  // ONE NODE FOR THE WHOLE THING — the box of cards and the controls over it — so it is placed once,
  // measured once, and taken down once. The BOX inside it arranges what it holds exactly as the box
  // on the felt does: one registered arrangement (`HAND_LAYOUT`), so a row that closes up here
  // closes up there, by the same numbers.
  const root = node(HAND_HUD, Container({ layout: HAND_HUD_FREE }), Transformable({ at: { x: 0, y: 0 } }));
  const strip = node(
    HAND_HUD_BOX,
    Bounded({ bounds: roundedRect(HAND.empty, HAND.empty, HAND.pad) }),
    Container({ layout: HAND_LAYOUT }),
    Transformable({ at: { x: 0, y: 0 } }),
  );
  add(root, strip);
  add(screen, root);
  // THE BAR IS MADE WHEN THERE IS A CHAIR TO MAKE IT FROM, and not before: a screen is stood up
  // while the room is still being joined, and a hand belongs to a seat this glass has not been
  // told it holds yet. Built once, from the first chair that answers (`seatBar` refuses a place
  // that is not a hand, which is every board).
  let barMade = false;
  const makeBar = (): void => {
    const chair = chairOf();
    if (barMade || !chair) return;
    const made = seatBar(o.seat, chair, o.ink);
    if (made.length === 0) return;
    barMade = true;
    for (const one of made) add(root, one);
  };

  function chairOf(): Node | undefined {
    return byId(o.desk(), chairId(o.seat));
  }

  /** What is in the hand right now — the chair's own children, which is the array itself. */
  function held(): readonly Node[] {
    const chair = chairOf();
    return chair ? chair.children.filter((c) => !aloft.has(c.id)) : [];
  }

  /**
   * ONE SHOWN CARD — the same box, the same face and the same side, and NOTHING that would make it a
   * thing on a desk: no grab, no carry, no heaping. What it is for is being looked at; what a finger
   * does with it is the strip's own business, not a copied atom's.
   *
   * The SIDE is the owner's own reading (`facing`), written onto the copy rather than inherited: the
   * copy hangs on the screen and not in the chair, so the chain that would have turned it is not
   * over it. This screen belongs to the player whose hand it is — what the hiding does to everybody
   * ELSE (`Poser.others`) is not theirs to be shown.
   */
  function shownOf(card: Node): Node {
    const bounds = fieldsOf<BoundedFields>(card, "Bounded")?.bounds ?? roundedRect(1, 1.4, 0.06);
    const surf = fieldsOf<SurfacedFields>(card, "Surfaced");
    const flip = fieldsOf<FlippableFields>(card, "Flippable");
    const shown = node(
      shownId(),
      Bounded({ bounds }),
      ...(surf ? [Surfaced({ ...surf })] : []),
      ...(flip ? [Flippable({ ...flip, turns: 0 })] : []),
      Transformable({ at: { x: 0, y: 0 } }),
    );
    if (flip) setFacing(shown, facing(card));
    return shown;
  }

  /** How wide the strip may be, in HUD units — its own row, and never wider than the glass. */
  function room(): number {
    const u = host.unit();
    const v = host.viewport();
    return u > 0 ? v.width / u - 2 * HAND_HUD_MARGIN : 0;
  }

  let floorPx = 0;
  let wide = 0;
  let pinned = false;
  /** The cards a hand is holding in the AIR — not drawn here for as long as they are (`lifting`). */
  let aloft = new Set<string>();
  /** The anchor, while a ring is in hand — made and taken down with the gesture, never left standing. */
  let anchor: Node | undefined;
  let aimed = false;
  /** WHICH FELT CARD EACH PICTURE IS OF, in the order they are drawn — the manifest, kept beside the
   * tree because an id is a name and nothing reads a fact out of one. */
  let manifest: string[] = [];

  const refresh = (): void => {
    makeBar();
    const cards = held();
    for (const old of [...strip.children]) remove(strip, old);
    // NOTHING HELD IS NOTHING DRAWN. An empty strip across the foot of a phone is glass spent on a
    // fact the felt already shows, and the controls with it: there is nothing to shut or turn over.
    const show = pinned && cards.length > 0;
    manifest = show ? cards.map((c) => c.id) : [];
    if (show) for (const card of cards) add(strip, shownOf(card));

    const sizes = cards.map((c) => {
      const shape = footprint(c);
      return shape ? extentOf(shape) : { w: 1, h: 1.4 };
    });
    const widest = sizes.reduce((w, s) => Math.max(w, s.w), 0);
    const tallest = sizes.reduce((h, s) => Math.max(h, s.h), 0);
    wide = show ? Math.min(handWidth(cards.length, widest), Math.max(HAND.empty, room())) : 0;
    const high = show ? tallest + 2 * HAND.pad + handRoom() : 0;
    compose(strip, Bounded({ bounds: roundedRect(Math.max(wide, HAND.empty), Math.max(high, HAND.empty), HAND.pad) }));

    // AT THE FOOT OF THE GLASS, centred — worked out from the glass every time and never remembered,
    // because a phone turned on its side is a different foot (`cameraHud`'s own note). Holding
    // nothing, it is put OFF the glass rather than drawn empty: absence is the refusal (CANONS §1).
    const u = host.unit();
    const v = host.viewport();
    const low = u > 0 ? v.height / u / 2 - high / 2 - HAND_HUD_MARGIN : 0;
    compose(root, Transformable({ at: { x: 0, y: show ? low : v.height } }));
    // ...AND THE CONTROLS ABOVE THE BOX, on the far side of it from the reader — the same row the
    // felt's own bar is, placed by the same call, in the group's own frame.
    fitBar(root, o.seat, { x: 0, y: 0 }, 0, high / 2);
    dressBar(root, o.seat, chairOf());
    floorPx = show ? (high / 2 + BAR.size + 2 * BAR.gap + HAND_HUD_MARGIN + high / 2) * u : 0;
  };
  refresh();

  /** WHERE THE ANCHOR STANDS AND HOW BIG IT IS, in HUD units — where the strip is, or would be. */
  function anchorBox(): { readonly w: number; readonly h: number; readonly at: { x: number; y: number } } {
    const u = host.unit();
    const v = host.viewport();
    const box = footprint(strip);
    const size = pinned && box ? extentOf(box) : { w: ANCHOR_EMPTY.w, h: ANCHOR_EMPTY.h };
    const low = u > 0 ? v.height / u / 2 - size.h / 2 - HAND_HUD_MARGIN : 0;
    return { w: size.w, h: size.h, at: { x: 0, y: low } };
  }

  /** Is this point on the glass over the anchor? Asked in pixels, because a finger is measured in them. */
  function over(glass: { readonly x: number; readonly y: number }): boolean {
    const u = host.unit();
    const v = host.viewport();
    if (u <= 0) return false;
    const box = anchorBox();
    const mid = { x: v.width / 2 + box.at.x * u, y: v.height / 2 + box.at.y * u };
    return Math.abs(glass.x - mid.x) <= (box.w * u) / 2 && Math.abs(glass.y - mid.y) <= (box.h * u) / 2;
  }

  const showAnchor = (on: boolean, keen: boolean): void => {
    if (!on) {
      if (anchor) remove(screen, anchor);
      anchor = undefined;
      aimed = false;
      return;
    }
    const box = anchorBox();
    if (!anchor) {
      anchor = node(HAND_HUD_ANCHOR, Bounded({ bounds: roundedRect(box.w, box.h, HAND.pad) }), Surfaced({ surface: ANCHOR_OPEN }), Transformable({ at: box.at }));
      add(screen, anchor);
    }
    compose(anchor, Bounded({ bounds: roundedRect(box.w, box.h, HAND.pad) }));
    compose(anchor, Transformable({ at: box.at }));
    if (keen !== aimed) {
      aimed = keen;
      compose(anchor, Surfaced({ surface: keen ? anchorKeen(o.seat) : ANCHOR_OPEN }));
    }
  };

  return {
    root,
    refresh,
    attached: () => pinned,
    standFor: (shown: Node) => {
      const i = strip.children.indexOf(shown);
      const id = i >= 0 ? manifest[i] : undefined;
      return id === undefined ? undefined : byId(o.desk(), id);
    },
    overHand: (glass) => {
      const u = host.unit();
      const v = host.viewport();
      const box = footprint(strip);
      if (anchor && over(glass)) return true;
      if (!pinned || u <= 0 || !box) return false;
      const size = extentOf(box);
      const at = fieldsOf<TransformableFields>(root, "Transformable")?.at ?? { x: 0, y: 0 };
      const mid = { x: v.width / 2 + at.x * u, y: v.height / 2 + at.y * u };
      return Math.abs(glass.x - mid.x) <= (size.w * u) / 2 && Math.abs(glass.y - mid.y) <= (size.h * u) / 2;
    },
    lifting: (ids) => {
      const next = new Set(ids);
      if (next.size === aloft.size && [...next].every((id) => aloft.has(id))) return;
      aloft = next;
      refresh();
    },
    attach: (on: boolean) => {
      pinned = on;
      refresh();
    },
    carrying: (glass) => {
      if (!glass) {
        showAnchor(false, false);
        return false;
      }
      const keen = over(glass);
      showAnchor(true, keen);
      return keen;
    },
    dropped: (glass) => {
      const keen = glass !== undefined && over(glass);
      showAnchor(false, false);
      if (!keen) return false;
      pinned = !pinned;
      refresh();
      return true;
    },
    cards: () => manifest,
    faces: () => strip.children.map((n) => facing(n)),
    width: () => wide,
    floor: () => floorPx,
    stop() {
      showAnchor(false, false);
      remove(screen, root);
      if (ownScreen && host.hudRoot === screen) host.setHudRoot(previous);
    },
  };
}
