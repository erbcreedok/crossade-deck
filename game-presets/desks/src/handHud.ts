// THE HAND ON THE GLASS — the player's own cards drawn at the foot of their screen, where a thumb
// reaches them, and the controls that go with them. ALWAYS: a card desk's HUD is the hand and its
// controls, and a hand holding nothing keeps its place at the foot — an empty box a card is dealt
// into — because the place is what says "this screen plays cards".
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
// THE CONTROLS COME WITH THE GLASS, not with the cards (`handBar.ts`): the rights at the foot of the
// screen on the left, the pose and the glass on the right, standing whether or not a hand is drawn
// between them — a hand is put onto the glass by pressing one of them. The strip lies ABOVE them,
// in the fold the chair's pose names, and the room they all take is what `floor` reports, so
// nothing else on the screen (the camera's own pair) is laid over them.
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
  deviceInsets,
  type LayoutChild,
  type SurfacedFields,
  type TransformableFields,
} from "game-kit";
import { BAR, BAR_FADE, barHeight, chairBarId, dressBar, fitBar, seatBar } from "./handBar.js";
import { HAND, handPose, handRoom, type HandFold } from "./handZone.js";
import { chairId } from "./seatPlace.js";

/** The nodes this file makes, by the names a reader sees in the inspector. */
export const HAND_HUD = "hud/hand";
export const HAND_HUD_BOX = "hud/hand/box";
/** The shade behind the cards — from the bar up, dense at the bar and nothing at the top. */
export const HAND_HUD_FADE = "hud/hand/fade";
/** The empty strip's own outline — a dashed place a card is dealt into; nothing once a card is in it. */
const HAND_HUD_EMPTY = "hud/hand/empty";
const HAND_HUD_FREE = "hud/hand/free";
const HAND_HUD_SCREEN = "hud/hand/screen";

/** The strip's own arrangements, one per fold — the row the chair's `shrink` is, the fan, and the row again for a tucked hand. */
function foldLayout(fold: HandFold): string {
  return `hud/hand/${fold}`;
}
/** How much of a tucked hand shows above the bar, in HUD units — the tip that is pulled on. */
const TUCK_TIP = 0.45;
/**
 * THE CARDS ON THE GLASS NEVER CHANGE SIZE — the owner's rule. Their size is ONE number of the
 * glass: what six cards abreast with a gap would get across it (`HUD_CARDS`), or their own size on
 * a glass wide enough. One card, six or fifteen: the same card; a fan closes up and a shut row
 * presses together, and neither is ever drawn smaller for it.
 */
const HUD_CARDS = 6;
const HUD_GAP = 0.06;
/**
 * THE FAN ON THE GLASS — a real one: the cards stand on an arc round a pivot well below them, so
 * the outer ones sit a little LOWER and lean out, and the arc's ends are PINNED TO THE EDGES of the
 * glass: a full hand runs from one side to the other. `radius` is the pivot's distance from the
 * cards' middle, in card heights — far, so the arc is shallow and the outer cards drop a third of a
 * card, no more. Few cards do not spread to the edges: neighbours stand at most `apart` card widths
 * apart along the arc, so two or three sit together in the middle.
 */
const HUD_FAN = { radius: 7, apart: 1.06 };

/** Where every card of a fan of `n` stands, in strip units — its lean is its angle on the arc. */
function fanPlan(n: number, w: number, h: number, roomU: number): readonly { readonly x: number; readonly y: number; readonly angle: number }[] {
  const R = HUD_FAN.radius * h;
  // The whole arc: the chord that reaches the glass's edges, less a card so the outer ones stay on it.
  const chord = Math.max(0, Math.min(1, (roomU - w) / (2 * R)));
  const widest = n > 1 ? (2 * Math.asin(chord) * 180) / Math.PI : 0;
  // ...BUT NEVER FURTHER APART THAN A CARD AND A GAP: few cards keep together in the middle.
  const most = (2 * Math.asin(Math.min(1, (HUD_FAN.apart * w) / (2 * R))) * 180) / Math.PI;
  const step = n > 1 ? Math.min(most, widest / (n - 1)) : 0;
  const mid = (n - 1) / 2;
  return Array.from({ length: n }, (_, i) => {
    const angle = (i - mid) * step;
    const rad = (angle * Math.PI) / 180;
    return { x: R * Math.sin(rad), y: R * (1 - Math.cos(rad)), angle };
  });
}
/** How far the outer cards of a fan of `n` drop below the middle one, in strip units. */
function fanDrop(n: number, w: number, h: number, roomU: number): number {
  const plan = fanPlan(n, w, h, roomU);
  return plan.reduce((m, p) => Math.max(m, p.y), 0);
}
/**
 * SHUT UP, THE CARDS PRESS INTO EACH OTHER — and the more of them, the harder: the row is never
 * wider than `SHRINK.span` cards, so the step is what that span allows, down to `SHRINK.least`.
 */
const SHRINK = { most: 0.55, span: 3, least: 0.08 };
/**
 * HOW THE HAND MOVES BETWEEN TWO LAYS — a card dealt, one played, a fold switched: the cards glide
 * to their new places rather than jump. The kit's own settle, named on the arrangement; the shown
 * cards keep their nodes between refreshes (`shownId`), which is what gives the glide something to go from.
 */
const HUD_SETTLE = { hold: 0, ms: 220, ease: "easeOut" };
/** The step of a shut row, in card widths. */
function shrinkStep(n: number): number {
  return n > 1 ? Math.max(SHRINK.least, Math.min(SHRINK.most, SHRINK.span / (n - 1))) : 0;
}

/** How far the strip stands in from the sides of the glass, in HUD units. */
export const HAND_HUD_MARGIN = 0.14;


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
  /** The scale the strip is drawn at — one while the cards are their own size, less on a narrow glass. */
  scale(): number;
  /** How much of the foot of the glass it has taken, in device pixels. Nothing, holding nothing. */
  floor(): number;
  /**
   * THE CARD A PICTURE ON THE GLASS IS OF — the node on the FELT, or nothing for anything else on
   * the screen. What a finger landing on the strip takes hold of (`DragOptions.standIn`): there is
   * one card, it lies in its owner's place, and this is a way of reaching it.
   */
  standFor(shown: Node): Node | undefined;
  /**
   * IS THIS POINT ON THE GLASS AIMED AT THIS HAND — over the strip at the foot of the screen. A run
   * let go there is a run given to this hand, which is why a drop asks before it lands on the felt.
   */
  overHand(glass: { readonly x: number; readonly y: number }): boolean;
  /**
   * WHAT IS IN THE AIR RIGHT NOW, by the ids of the cards on the felt — left out of the picture for
   * as long as it is: a card drawn under the finger AND still lying in the strip is one card shown
   * twice, and the reader cannot tell which of them they are holding.
   */
  lifting(ids: readonly string[]): void;
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
  registerSurface(HAND_HUD_EMPTY, { layers: [], radius: 0.06, stroke: { color: "text", width: 0.03, opacity: 0.45, dash: { on: 0.12, off: 0.08 } } });
  // THE THREE FOLDS ON THE GLASS: a fan abreast, a shut row pressed together, and the same row put
  // away under the bar. The lean of the fan is written by `refresh`.
  // SHUT AND PUT AWAY are the same pressed row, centred; put away is then let down under the bar.
  const shut = {
    place: (children: readonly LayoutChild[]) => {
      const n = children.length;
      const widest = children.reduce((w, c) => Math.max(w, c.footprint ? extentOf(c.footprint).w : 1), 1);
      const step = shrinkStep(n) * widest;
      const from = -(step * (n - 1)) / 2;
      return children.map((_c, i) => ({ x: from + step * i, y: -handRoom() / 2 }));
    },
  };
  registerLayout(foldLayout("shrink"), { ...shut, settle: HUD_SETTLE });
  registerLayout(foldLayout("tuck"), { ...shut, settle: HUD_SETTLE });
  // THE FAN: cards on an arc, the middle one highest. The lean is written by `refresh` off the
  // same plan, so every card leans exactly as far as it has swung.
  registerLayout(foldLayout("fan"), {
    place: (children, box) => {
      const n = children.length;
      const widest = children.reduce((w, c) => Math.max(w, c.footprint ? extentOf(c.footprint).w : 1), 1);
      const tallest = children.reduce((h, c) => Math.max(h, c.footprint ? extentOf(c.footprint).h : 1.4), 1.4);
      const roomU = box ? extentOf(box).w : 0;
      const plan = fanPlan(n, widest, tallest, roomU);
      return plan.map((p) => ({ x: p.x, y: -handRoom() / 2 + p.y }));
    },
    settle: HUD_SETTLE,
  });
  const screen = o.screen ?? node(HAND_HUD_SCREEN, Container({ layout: HAND_HUD_FREE }));
  const ownScreen = o.screen === undefined;
  const previous = host.hudRoot;
  if (ownScreen) host.setHudRoot(screen);

  // ONE NODE FOR THE WHOLE THING — the box of cards and the controls over it — so it is placed once,
  // measured once, and taken down once. The BOX inside it arranges what it holds in the fold the
  // chair's own pose names (`foldLayout`), so a hand that fans here fans there, by the same numbers.
  // THE SHADE BEHIND THE CARDS goes in first, so it lies under them and under the bar alike.
  const fade = node(HAND_HUD_FADE, Bounded({ bounds: roundedRect(1, BAR.fade, 0) }), Surfaced({ surface: BAR_FADE }), Transformable({ at: { x: 0, y: 0 } }));
  add(screen, fade);
  const root = node(HAND_HUD, Container({ layout: HAND_HUD_FREE }), Transformable({ at: { x: 0, y: 0 } }));
  const strip = node(
    HAND_HUD_BOX,
    Bounded({ bounds: roundedRect(1, 1, HAND.pad) }),
    Container({ layout: foldLayout("shrink") }),
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
    // ON THE SCREEN, beside the strip and not inside it: the controls stand at the foot of the glass
    // whether or not a hand is drawn there, and are placed off the glass's own corners (`fitBar`).
    for (const one of made) add(screen, one);
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
  /**
   * THE NAME EACH FELT CARD'S PICTURE KEEPS between refreshes. A picture is rebuilt at every refresh
   * (the felt card may have turned, or moved in the hand), but under the SAME name for the same card:
   * a name that survives is what lets the animator see the picture's old place and glide it to the
   * new one, where a fresh name at every deal would be a fresh card that appears where it lands.
   */
  const named = new Map<string, string>();
  function shownOf(card: Node): Node {
    const bounds = fieldsOf<BoundedFields>(card, "Bounded")?.bounds ?? roundedRect(1, 1.4, 0.06);
    const surf = fieldsOf<SurfacedFields>(card, "Surfaced");
    const flip = fieldsOf<FlippableFields>(card, "Flippable");
    let name = named.get(card.id);
    if (!name) {
      name = shownId();
      named.set(card.id, name);
    }
    const shown = node(
      name,
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

  /** How tall the strip is right now, in its own units, and the scale it is drawn on the glass at. */
  let high = 0;
  let scale = 1;
  let fold: HandFold = "shrink";
  let wide = 0;
  /** The cards a hand is holding in the AIR — not drawn here for as long as they are (`lifting`). */
  let aloft = new Set<string>();
  /** WHICH FELT CARD EACH PICTURE IS OF, in the order they are drawn — the manifest, kept beside the
   * tree because an id is a name and nothing reads a fact out of one. */
  let manifest: string[] = [];

  const refresh = (): void => {
    makeBar();
    const chair = chairOf();
    fold = chair ? handPose(chair).fold : "shrink";
    const cards = held();
    for (const old of [...strip.children]) remove(strip, old);
    // THE STRIP IS ALWAYS THERE — holding nothing, it is the one-card box a card is dealt into, the
    // place at the foot of the glass that says this screen plays cards. The desk that has no hand
    // (a board) hangs no strip at all, which is the whole of that difference.
    manifest = cards.map((c) => c.id);
    for (const id of [...named.keys()]) if (!manifest.includes(id)) named.delete(id);
    for (const card of cards) add(strip, shownOf(card));
    // EMPTY, A DASHED PLACE THE SIZE OF A CARD stands where the cards would — laid by the same
    // arrangement, tucked under the bar the same way — and nothing else: holding a card, the cards
    // are the place.
    if (cards.length === 0) {
      add(strip, node(HAND_HUD_EMPTY, Bounded({ bounds: roundedRect(1, 1.4, 0.06) }), Surfaced({ surface: HAND_HUD_EMPTY }), Transformable({ at: { x: 0, y: 0 } })));
    }
    compose(strip, Container({ layout: foldLayout(fold) }));
    // THE LEAN OF A FAN is its angle on the arc; a row lies level. Written once the box is known.

    const sizes = cards.map((c) => {
      const shape = footprint(c);
      return shape ? extentOf(shape) : { w: 1, h: 1.4 };
    });
    const widest = sizes.reduce((w, s) => Math.max(w, s.w), 1);
    const tallest = sizes.reduce((h, s) => Math.max(h, s.h), 1.4);
    const u = host.unit();
    const v = host.viewport();
    const glass = u > 0 ? { w: v.width / u, h: v.height / u } : { w: 0, h: 0 };
    // THE STRIP'S SCALE IS ONE NUMBER OF THE GLASS — six cards abreast across it, or their own size —
    // and the same for one card or fifteen. Everything below is in the strip's own units; the scale
    // carries it onto the glass.
    scale = glass.w > 0 ? Math.min(1, room() / (HUD_CARDS * widest * (1 + HUD_GAP))) : 1;
    // THE BOX IS THE GLASS, in strip units: the fan opens to its very edges, the shut row presses
    // together in its middle.
    wide = Math.max(1, (u > 0 ? v.width / u : 1) / scale);
    // A FAN IS TALLER THAN ITS CARD — the outer cards drop below the middle one — and the box holds the lot.
    const fanned = fold === "fan" ? fanDrop(strip.children.length, widest, tallest, wide) : 0;
    high = tallest + fanned + 2 * HAND.pad + handRoom();
    compose(strip, Bounded({ bounds: roundedRect(wide, Math.max(high, 1), HAND.pad) }));
    if (fold === "fan") {
      const plan = fanPlan(strip.children.length, widest, tallest, wide);
      strip.children.forEach((c, i) => compose(c, Transformable({ ...(fieldsOf<TransformableFields>(c, "Transformable") ?? {}), angle: plan[i]?.angle ?? 0 })));
    }

    // THE BAR ACROSS THE FOOT OF THE GLASS, on the device's own inset, and the strip standing on
    // it — the cards' bottom edge `BAR.tuck` UNDER the bar's top edge, drawn beneath it, like under
    // a spine. Worked out from the glass every time and never remembered, because a phone turned
    // on its side is a different foot (`cameraHud`'s own note). A tucked hand is let down so only
    // its tip shows above the bar: the tip is what is pulled on to bring it back up.
    const inset = u > 0 ? deviceInsets(host.view).bottom / u : 0;
    fitBar(screen, o.seat, glass, inset);
    dressBar(screen, o.seat, chair);
    const barTop = glass.h / 2 - inset - barHeight();
    // The strip's box keeps the grip's room UNDER the row (`handRoom`), so the row's own bottom
    // edge is `handRoom()` above the box's; the box is placed so that edge is `BAR.tuck` below
    // the bar's top.
    const cardsBottom = barTop + BAR.tuck + (fold === "tuck" ? Math.max(0, (high - handRoom()) * scale - TUCK_TIP) : 0);
    const low = cardsBottom + (handRoom() - high / 2) * scale;
    compose(root, Transformable({ at: { x: 0, y: low }, scale }));
    // ...AND THE SHADE, from the bar's top edge up, as wide as the glass.
    compose(fade, Bounded({ bounds: roundedRect(Math.max(1, glass.w), BAR.fade, 0) }));
    compose(fade, Transformable({ at: { x: 0, y: barTop - BAR.fade / 2 } }));
    // ...AND THE SCREEN IS TOLD IT CHANGED. The strip was re-laid in place, and whoever eases a
    // moved node to its new rest (the animator) reads rests when the host speaks — told now, the
    // cards glide from where they were; not told, the next reconcile finds them already there.
    host.setHudRoot(host.hudRoot ?? screen);
  };
  /**
   * HOW MUCH OF THE FOOT IS SPOKEN FOR, in device pixels — read off the glass AS IT IS NOW and not
   * off a number remembered at the last refresh: the camera's own pair asks this when the glass is
   * measured, and it may ask before this strip has heard of the measurement.
   */
  const floorNow = (): number => {
    const u = host.unit();
    const inset = u > 0 ? deviceInsets(host.view).bottom : 0;
    const shown = fold === "tuck" ? TUCK_TIP : Math.max(0, (high - handRoom()) * scale - BAR.tuck);
    return inset + (barHeight() + shown + HAND_HUD_MARGIN) * u;
  };
  refresh();
  // A GLASS THAT CHANGED SIZE IS A DIFFERENT FOOT. The host measures it and tells everyone; the
  // controls stand at the foot of the glass whether or not a hand is drawn there, so they are put
  // back the moment the glass is measured — the first measurement included, which arrives AFTER
  // this hangs them (a screen is stood up before its element has a size), and a phone turned on
  // its side after that. The camera's own pair listens the same way (`cameraHud`).
  let measured = { w: host.viewport().width, h: host.viewport().height, u: host.unit() };
  const stopFitting = host.onChange(() => {
    const now = { w: host.viewport().width, h: host.viewport().height, u: host.unit() };
    if (now.w === measured.w && now.h === measured.h && now.u === measured.u) return;
    measured = now;
    refresh();
  });

  return {
    root,
    refresh,
    standFor: (shown: Node) => {
      const i = strip.children.indexOf(shown);
      const id = i >= 0 ? manifest[i] : undefined;
      return id === undefined ? undefined : byId(o.desk(), id);
    },
    overHand: (glass) => {
      const u = host.unit();
      const v = host.viewport();
      const box = footprint(strip);
      if (u <= 0 || !box) return false;
      const size = extentOf(box);
      const at = fieldsOf<TransformableFields>(root, "Transformable")?.at ?? { x: 0, y: 0 };
      const mid = { x: v.width / 2 + at.x * u, y: v.height / 2 + at.y * u };
      return Math.abs(glass.x - mid.x) <= (size.w * u * scale) / 2 && Math.abs(glass.y - mid.y) <= (size.h * u * scale) / 2;
    },
    lifting: (ids) => {
      const next = new Set(ids);
      if (next.size === aloft.size && [...next].every((id) => aloft.has(id))) return;
      aloft = next;
      refresh();
    },
    cards: () => manifest,
    faces: () => strip.children.map((n) => facing(n)),
    width: () => wide * scale,
    scale: () => scale,
    floor: floorNow,
    stop() {
      stopFitting();
      remove(screen, root);
      const bar = byId(screen, chairBarId(o.seat));
      if (bar) remove(screen, bar);
      remove(screen, fade);
      if (ownScreen && host.hudRoot === screen) host.setHudRoot(previous);
    },
  };
}
