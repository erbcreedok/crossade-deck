// PRESENCE — WHERE THE PEOPLE ARE, as a thing standing on the desk rather than a badge on the glass.
//
// A mirror (`mirror.ts`) says what somebody's hand is doing WHILE it is doing it, and says nothing
// the rest of the time. That leaves a desk where the other players exist only when they move, and a
// board with three silent seats reads as a board with one person at it. Presence is the other half
// of the same message and the permanent one: who is here, what they are called, whether they are
// still looking, and — the part that makes it a desk and not a roster — WHERE THEY SIT.
//
// AND WHERE THEY SIT IS THEIR OWN CAMERA. Nothing else on a shared desk answers it: a seat index is
// a number the game invented, and a game that has none would have no answer at all. How a person
// turned, moved and zoomed their view IS the direction they are looking at the desk from, so the
// avatar STANDS WHERE THAT VIEW SITS — the felt under the low middle of their glass, the very point
// their own ring stands on when they are at home (`HOME_ANCHOR`) — and it is read the same way on
// every screen because the view is the message.
//
// AN AVATAR IS A NODE, not a picture on the HUD, and that is a decision with a reason rather than a
// convenience: the first version is a coloured disc, and the ones after it walk about — a crocodile,
// a knight, something that is picked up and put down. A thing on the desk can become any of those by
// having a different picture; a rectangle drawn over the glass can become none of them.
//
// It holds NUMBERS AND NODES ONLY. Nothing here starts a clock, listens for a pointer or knows what
// a socket is: a consumer feeds it views and states, and it answers with places and a tree.

import { apply, chain, invert, move, rotate, scale, type Transform, type Vec } from "../core/transform.js";
import { polyline } from "../core/path.js";
import { Bounded, type Shape } from "../core/atoms/bounded.js";
import { Labeled } from "../core/atoms/labeled.js";
import { Oriented } from "../core/atoms/oriented.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Transformable } from "../core/atoms/transformable.js";
import { Valued, type ValuedFields } from "../core/atoms/valued.js";
import { add, byId, fieldsOf, node, remove, type Node } from "../core/node.js";
import { type Paint } from "../core/paint.js";
import { registerAsset } from "./assets.js";
import { registerSurface } from "./surfaces.js";
import { registerTextStyle } from "./textStyles.js";

/**
 * HOW A PERSON'S VIEW ARRIVES on somebody else's screen — the whole of what the far side needs to
 * work out where they are sitting.
 *
 * `zoom` is SCREEN PIXELS PER UNIT, not the camera's own zoom factor. A glass point can only be
 * turned into a desk point by the TOTAL scale, and how that total is split between a page's etalon
 * and the reader's zoom is a fact of the near camera's own tuning — one screen's etalon is not the
 * other's, and a message carrying the factor alone would land every avatar at the wrong distance on
 * any screen whose unit differed.
 */
export interface PresenceView {
  /** The desk point in the middle of that person's glass. */
  readonly target: Vec;
  /** Screen pixels per unit — see above. */
  readonly zoom: number;
  /** Degrees, clockwise on their screen. */
  readonly rotation: number;
  /** How big their glass is, in screen pixels. */
  readonly glass: { readonly w: number; readonly h: number };
}

/** Online · the tab is not being looked at · gone from the desk · not connected. */
export type PresenceState = "online" | "away" | "left" | "offline";

/** One person at the desk, as everybody else's screen is told about them. */
export interface Presence {
  readonly seat: string;
  readonly place?: { readonly at: Vec; readonly facing: number };
  /** Already written in the reader's language — the kit knows no localization (CANONS §6). */
  readonly name: string;
  /** A picture inside the disc. Absent, the initials of the name are drawn instead. */
  readonly picture?: string | undefined;
  /** The seat's own colour, as a theme token. */
  readonly ink: Paint;
  readonly state: PresenceState;
  /** Whether there is something in that hand right now. */
  readonly holding: boolean;
  readonly view: PresenceView;
}

/**
 * THE DISC, in units of the felt — the seat design's 54px disc in its 74px arch, so the disc sits
 * IN the arch when its owner is at home and is the same thing at every zoom the arch is.
 *
 * Felt-sized and not held on the glass: the chair it stands in is felt-sized, and a disc that kept
 * its pixels through a zoom would burst out of the arch on a board seen close and drown in it on
 * one seen whole.
 */
export const DISC = 1.6;
/** The design's own lines over the disc — the keyline round it and the ink rim inside. */
const LINE = 0.09;
/** The name plate under the disc: its distance below the centre, its padding and its rule. */
const PLATE = { at: 1.34, padX: 0.24, padY: 0.09, line: 0.06 };
/** The glyph inside the disc — one em of the pixel face — and the plate's smaller one. */
const GLYPH_EM = 0.5;
const PLATE_EM = 0.24;
/** The ring round a disc whose hand is full — the design's halo. */
const HALO = { width: 0.12, out: 0.06 };
/**
 * THE CONE THAT SAYS WHICH WAY THIS PERSON IS LOOKING — the design's own: its apex AT the centre
 * of the disc, so it cannot come apart from it, opening into the desk. In units of the felt, and
 * quiet. The disc is already turned by its owner's camera, so the cone is a fixed shape on it and
 * the angle costs nothing.
 */
const CONE = { half: 0.89, length: 1.84, fade: 0.3 };
/**
 * THE CONE LIES UNDER EVERYTHING ON THE FELT — a look is not a thing on the desk, it is a light
 * over it: the cards and the chairs are drawn over it, and a finger never meets it (it wears no
 * atom a finger answers to, so every pick falls through it to whatever it is looking at).
 */
const CONE_Z = -1;
/**
 * THE CONE FOLLOWS THE CAMERA — its length is how much felt the owner's glass shows AHEAD of the
 * disc: the desk from the home anchor to the top of the glass, in units, through THEIR zoom. Zoom
 * out and the cone reaches further, zoom in and it shortens; `min`..`max` keep it a cone and not a
 * needle or a road. Read off the message, so every screen draws the same cone for the same view.
 */
const CONE_REACH = { of: 0.28, min: 0.6, max: 6 };

/**
 * WHAT THE DISC IS PAINTED WITH — the keyline round it and the ground under the initials, top to
 * bottom. Tokens by default, so the kit holds no colour of its own; a desk with a look of its own
 * (the seat design's dark green ground and black keyline, shipped by the desks preset) sets them
 * once (`setPresencePaints`), and every disc on the shelf wears them.
 */
export interface PresencePaints {
  readonly keyline: Paint;
  readonly groundHi: Paint;
  readonly groundLo: Paint;
  /** The initials and the name — the design's cream, whatever the desk's theme. */
  readonly ink: Paint;
  /** The ring round a full hand — the design's gold. */
  readonly gold: Paint;
}
let PAINTS: PresencePaints = { keyline: "shadow", groundHi: "panelBg", groundLo: "sunkBg", ink: "text", gold: "accent" };
export function setPresencePaints(paints: PresencePaints): void {
  PAINTS = paints;
  // The faces carry the ink, so they are registered again with the next disc.
  facesInstalled = false;
}
export function presencePaints(): PresencePaints {
  return PAINTS;
}

/**
 * WHAT EACH STATE LOOKS LIKE, as data. Not a branch: a product that wants a fifth state — idle,
 * thinking, timed out — registers a look for it, and nothing in here is touched.
 *
 * The design says a state with the cone and with the disc: somebody LOOKING at the desk wears the
 * cone; somebody at the desk but looking elsewhere (a hidden tab) wears the disc and no cone;
 * somebody gone is not drawn at all — their chair stays, in their ink, and says the place is held.
 */
export interface PresenceLook {
  /** Whether the disc is drawn at all. */
  readonly drawn: boolean;
  /** Whether the cone of the look is drawn. */
  readonly cone: boolean;
}

const LOOKS = new Map<string, PresenceLook>([
  ["online", { drawn: true, cone: true }],
  ["away", { drawn: true, cone: false }],
  ["left", { drawn: false, cone: false }],
  ["offline", { drawn: false, cone: false }],
]);

/** A look for a state the kit does not ship. Overwriting a stock one is allowed and is the point. */
export function registerPresenceLook(state: string, look: PresenceLook): void {
  LOOKS.set(state, look);
}

/** The look in force. An unregistered state is drawn as present rather than skipped: a person the
 * desk cannot describe is still at the desk, and a blank space would say they had gone. */
export function lookOf(state: string): PresenceLook {
  return LOOKS.get(state) ?? LOOKS.get("online")!;
}

// ---- the arithmetic ------------------------------------------------------------------------

/**
 * A BOX AS A PATH, built here rather than taken from `presets/rect`: the presets stand ABOVE the
 * renderer, and a file down here reaching for one would invert the ladder (`guard.layering`).
 */
/** A CIRCLE AS A PATH, four cubic arcs — built here for the same reason `box` is. */
function round(r: number): Shape {
  const k = 0.5523 * r;
  return {
    start: { x: -r, y: 0 },
    segments: [
      { c1: { x: -r, y: -k }, c2: { x: -k, y: -r }, to: { x: 0, y: -r } },
      { c1: { x: k, y: -r }, c2: { x: r, y: -k }, to: { x: r, y: 0 } },
      { c1: { x: r, y: k }, c2: { x: k, y: r }, to: { x: 0, y: r } },
      { c1: { x: -k, y: r }, c2: { x: -r, y: k }, to: { x: -r, y: 0 } },
    ],
  };
}

function box(w: number, h: number): Shape {
  return polyline([
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ]);
}

/**
 * THE VIEW AS A MATRIX — the same composition `Camera.transform` builds, from a message instead of
 * from a camera. Read outwards: take the desk to the target, scale it, turn it, drop it in the
 * middle of the glass.
 *
 * No pitch. A tilt is what the near camera does to its OWN picture, and it does not move anybody:
 * the desk point somebody is sitting over is the same point whether or not their head is tipped
 * back, and folding a squash in here would put every avatar at a different place on every screen.
 */
export function presenceTransform(v: PresenceView): Transform {
  return chain([
    move(v.glass.w / 2, v.glass.h / 2),
    rotate(v.rotation),
    scale(v.zoom),
    move(-v.target.x, -v.target.y),
  ]);
}

/** A point on somebody's glass, in the desk's units — the inverse of the above. */
export function deskPoint(v: PresenceView, glass: Vec): Vec {
  const inv = invert(presenceTransform(v));
  return inv ? apply(inv, glass) : glass;
}

/**
 * WHERE ONE'S OWN PLACE STANDS ON ONE'S OWN GLASS WHEN ONE IS SITTING AT IT, as a fraction of the
 * glass — the LOW MIDDLE, not the middle.
 *
 * A person at a table is not hovering over the middle of it: they are at the near edge looking
 * across, and the whole of the desk they are playing on is IN FRONT of them. Sat in the middle of
 * the glass, half the screen is the felt behind one's own back — the one part of the table that
 * never has anything on it — and the cards being played are crowded into the top half.
 *
 * ONE NUMBER, and everything about home is read off it: the glide brings a view here
 * (`idleReturn`), `isHome` asks whether a view is here, and the disc stands on the felt under this
 * very point (`avatarAt`). Asked twice they would drift, and a desk would then draw somebody's
 * disc a screen's-worth away from the ring it is supposed to be hiding inside.
 *
 * Low and not AT the bottom: the ring is a thing with a size and a name under it, and an anchor on
 * the very edge would hang both off the glass.
 */
export const HOME_ANCHOR = { x: 0.5, y: 0.82 };

/** The home anchor in SCREEN PIXELS on a given glass — the same point, measured. */
export function homeGlassPoint(glass: PresenceView["glass"]): Vec {
  return { x: glass.w * HOME_ANCHOR.x, y: glass.h * HOME_ANCHOR.y };
}

/**
 * WHAT A CAMERA MUST LOOK AT FOR A PLACE TO STAND ON THE HOME ANCHOR — the desk point that goes in
 * the middle of the glass when the ring is to sit low and centred.
 *
 * The camera's own word for where it is aimed is the MIDDLE of the glass (`lookAt`), and home is
 * not the middle any more, so the two differ by exactly the anchor's offset from the centre —
 * measured in pixels, turned into units by that glass's own scale, and turned back out of the
 * screen's rotation, because a reader at 180° has their low edge on the other side of the felt.
 */
export function homeTarget(
  place: { readonly at: Vec },
  view: { readonly zoom: number; readonly rotation: number; readonly glass: PresenceView["glass"] },
): Vec {
  const anchor = homeGlassPoint(view.glass);
  const off = { x: anchor.x - view.glass.w / 2, y: anchor.y - view.glass.h / 2 };
  if (view.zoom === 0) return place.at;
  const back = apply(rotate(-view.rotation), { x: off.x / view.zoom, y: off.y / view.zoom });
  return { x: place.at.x - back.x, y: place.at.y - back.y };
}

/**
 * WHERE THIS PERSON STANDS ON THE DESK — the felt under the HOME ANCHOR of their glass, and nothing
 * else. The one question the whole file exists to answer, and it is answered from the message
 * alone, so a screen works it out for somebody else exactly as it works it out for itself and the
 * two can never disagree about who is sitting where.
 *
 * An avatar IS what its owner is looking at. Not a spot they were once put down on and not a corner
 * of their screen: those are two places that drift apart the moment the view moves, and then the
 * desk has to say which of them is the person. There is one answer here, so there is nothing to
 * drift. It is the ANCHOR and not the centre of the glass because that is where a person sits on
 * their own screen (`HOME_ANCHOR`) — read at home it lands exactly on one's own ring, which is what
 * makes "the ring IS them while they are in it" a picture rather than a claim.
 */
export function avatarAt(p: Presence): Vec {
  return deskPoint(p.view, homeGlassPoint(p.view.glass));
}

/**
 * HOW CLOSE COUNTS AS HOME — the same numbers the idle glide calls "already there" (`idleReturn`).
 *
 * Asked twice they would drift, and then a desk would glide a view home and go on drawing the
 * person as away, or stop gliding at a place that never filled the ring.
 */
/**
 * WHAT COUNTS AS HOME — the owner's own words: turned the camera, nudged the zoom, but still keeps
 * their place in the LOWER PART of their glass, and they are still on their chair; started walking
 * the felt, or off to somewhere else, and the camera has left.
 *
 * `band` is the fraction of the glass's height the place may stand in, measured from the foot — the
 * lower half. `zoomOut` and `zoomIn` bound the zoom against the home zoom, where a screen knows it.
 */
export const HOME = { band: 0.5, zoomOut: 0.5, zoomIn: 2 };

/**
 * IS THIS PERSON STILL ON THEIR CHAIR — their place standing in the lower part of their own glass
 * (`HOME.band`), whichever way the glass is turned and however the pinch has drifted inside
 * `HOME.zoomOut`…`HOME.zoomIn` of the home zoom. The turn and the zoom are not the question here:
 * they are worn by the DISC (`avatarNode`) — the cone turns with the camera and grows with it while
 * the disc sits in the arch — so a reader who spun their view is still at their seat, and looks it.
 *
 * Read off the MESSAGE and nothing else, so every screen at the desk gets the same answer about
 * everybody, which is the whole point: "who is at their seat" is a fact of the desk, not of the
 * screen asking.
 *
 * `homeZoom` is what a fitted view is worth in SCREEN PIXELS PER UNIT on the OWNER'S glass, and it
 * is optional because only the owner's own screen can work it out (`camera.fitZoom`) — a far reader
 * knows the sender's glass but not their etalon. Absent, the zoom is not asked, which is the honest
 * reading: a place kept low on the glass is home whatever it is magnified to.
 */
export function isHome(
  view: PresenceView,
  place: { readonly at: Vec; readonly facing: number },
  homeZoom?: number,
): boolean {
  const g = apply(presenceTransform(view), place.at);
  if (g.x < 0 || g.x > view.glass.w) return false;
  if (g.y < view.glass.h * (1 - HOME.band) || g.y > view.glass.h) return false;
  if (homeZoom === undefined || homeZoom === 0) return true;
  const ratio = view.zoom / homeZoom;
  return ratio >= HOME.zoomOut && ratio <= HOME.zoomIn;
}

/** Whether the person this presence is about is sitting at their own place right now. */
export function atHome(p: Presence, homeZoom?: number): boolean {
  return p.place !== undefined && isHome(p.view, p.place, homeZoom);
}

// ---- the node ------------------------------------------------------------------------------

/** The disc's own surfaces, one per seat: re-registered as the state changes, so the name is stable. */
function discSurface(seat: string): string {
  return `presence.disc.${seat}`;
}
function haloSurface(seat: string): string {
  return `presence.halo.${seat}`;
}
function faceSurface(seat: string): string {
  return `presence.face.${seat}`;
}
function faceAsset(seat: string): string {
  return `presence.face.picture.${seat}`;
}
function coneSurface(seat: string): string {
  return `presence.cone.${seat}`;
}
function plateSurface(seat: string): string {
  return `presence.plate.${seat}`;
}

const KEYLINE_SURFACE = "presence.keyline";

/** The id an avatar answers to. Built here, never parsed — an id is a name (`guard.id-is-opaque`). */
export function avatarId(seat: string): string {
  return `avatar ${seat}`;
}

/**
 * THE ID OF THE CONE ON A DISC — built here, never parsed, so a reader that wants the direction
 * asks for it by name instead of matching the shape of an id (`guard.id-is-opaque`).
 */
export function avatarConeId(seat: string): string {
  return `${avatarId(seat)} cone`;
}

/** The id of the name plate under a disc. */
export function avatarNameId(seat: string): string {
  return `${avatarId(seat)} name`;
}

/**
 * THE LETTERS A PERSON IS KNOWN BY WHEN THERE IS NO PICTURE — up to two, from the first two words.
 *
 * Two and not one because one initial collides the moment a second player's name starts with the
 * same letter, which at a four-seat desk is not rare.
 */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 2)
    .map((w) => [...w][0]!.toUpperCase())
    .join("");
}

/**
 * THE FACES OF THE SEAT DESIGN — the pixel face for the name on its plate and for the initials in
 * the disc. A ROLE each, registered with the disc that wears them so a page that draws a disc by
 * hand draws it in the same face a live desk does; a consumer with faces of its own re-registers
 * them under the same names after the first disc is made.
 */
const PIXEL_FACE = "'Press Start 2P', ui-monospace, monospace";
let facesInstalled = false;

/** The pictures and paints this presence is drawn with — re-registered whenever the state moves. */
function installLook(p: Presence): void {
  if (!facesInstalled) {
    facesInstalled = true;
    registerTextStyle(PRESENCE_TEXT, { family: PIXEL_FACE, size: PLATE_EM, weight: 400, lineHeight: 1.6, fill: PAINTS.ink });
    registerTextStyle(PRESENCE_GLYPH, { family: PIXEL_FACE, size: GLYPH_EM, weight: 400, lineHeight: 1, fill: PAINTS.ink });
  }
  registerSurface(KEYLINE_SURFACE, { layers: [{ paint: PAINTS.keyline }] });
  // THE DISC: the design's dark ground, top to bottom, with the seat's ink as the rim inside the
  // keyline — the same two lines the chair wears, so a disc in an arch reads as one thing.
  registerSurface(discSurface(p.seat), {
    layers: [{ gradient: { stops: [{ at: 0, paint: PAINTS.groundHi }, { at: 1, paint: PAINTS.groundLo }], angle: 90 } }],
    stroke: { color: p.ink, width: LINE, alignment: 1 },
  });
  // A RING FOR A FULL HAND. The one thing on this disc that is about the moment rather than the
  // person: a hand with something in it is the difference between "they are here" and "they are
  // doing something", and it is the state everybody else is waiting on.
  registerSurface(haloSurface(p.seat), { layers: [], stroke: { color: PAINTS.gold, width: HALO.width, alignment: 0, opacity: 0.55 } });
  // SCREEN-UP ON THE OWNER'S GLASS is what the disc's own turn already means (see `avatarNode`), so
  // the cone is drawn straight up the node's own local axis and needs no angle of its own.
  // ...AND THINS OUT WITH DISTANCE: solid at the apex (the disc's centre, the node's +y end), gone
  // at the far edge — the owner's rule. Said as the stops' own solidity, so the ink stays a token.
  registerSurface(coneSurface(p.seat), {
    layers: [{ gradient: { stops: [{ at: 0, paint: p.ink, opacity: 0 }, { at: 1, paint: p.ink, opacity: 1 }], angle: 90 }, opacity: CONE.fade }],
  });
  registerSurface(plateSurface(p.seat), {
    layers: [{ paint: PAINTS.keyline }],
    stroke: { color: p.ink, width: PLATE.line, alignment: 1 },
  });
  if (p.picture) {
    const inner = DISC - 2 * LINE;
    registerAsset(faceAsset(p.seat), { src: p.picture, w: inner, h: inner });
    registerSurface(faceSurface(p.seat), { layers: [{ image: faceAsset(p.seat), fit: "contain" }], radius: inner / 2 });
  }
}

/** How far the cone reaches, as a factor of the design's own — see `CONE_REACH`. */
export function coneReach(view: PresenceView): number {
  if (view.zoom <= 0) return 1;
  const ahead = (view.glass.h * HOME_ANCHOR.y) / view.zoom;
  return Math.min(CONE_REACH.max, Math.max(CONE_REACH.min, (ahead * CONE_REACH.of) / CONE.length));
}

/** How wide the plate under a disc is — the pixel face is monospaced, so a name is its length in ems. */
function plateWidth(name: string): number {
  return Math.max(1, [...name].length * PLATE_EM + 2 * PLATE.padX);
}

/**
 * ONE AVATAR — the seat design's: the cone of the look under a disc in the seat's ink, the initials
 * in it, a ring round it while the hand is full, and the name on a plate under it.
 *
 * TURNED BY ITS OWNER'S CAMERA, because it is a picture with a TOP and that top is the message: it
 * says which way up that person is holding the desk, and a disc that faced every reader alike would
 * be a person with no direction — the one thing a disc standing away from its seat is for.
 *
 * NOT `Draggable`, and not one's own either: an avatar is a READING of where its owner is looking,
 * so a finger that moved the disc would be moving a measurement. What a person moves when they want
 * to sit somewhere else is their PLACE (`seatChair`), and the disc follows the camera to it. The
 * absence of the atom is the whole of that refusal (CANONS §1, no negation flags).
 *
 * `pose` is where it stands and how it is turned: at the place, in the arch, when its owner is at
 * home; under their glass otherwise (`placeAvatars` decides, `avatarAt` measures).
 */
export function avatarNode(p: Presence, pose: { readonly at: Vec; readonly angle: number } = { at: avatarAt(p), angle: -p.view.rotation }): Node {
  installLook(p);
  const look = lookOf(p.state);
  const reach = coneReach(p.view);
  const root = node(
    avatarId(p.seat),
    Bounded({ bounds: box(DISC, DISC) }),
    // TURNED THE WAY ITS OWNER IS TURNED — a disc is not only WHERE somebody is looking from but
    // WHICH WAY UP they are holding the desk, and that is half of "where they are sitting". Their
    // screen turns the desk by `rotation`, so what stands upright on it stands at `-rotation` on the
    // felt, and every other screen adds its own turn to that and reads the difference. Their own
    // screen adds exactly the turn that cancels it, so at home one's own disc is upright.
    Transformable({ at: pose.at, angle: pose.angle }),
    // NOT `Oriented: "viewer"`. A billboard is indifferent to every turn there is, which is right
    // for a caption and wrong for the one node whose whole message is an angle.
    // AN AVATAR SAYS IT IS ONE. What makes a node a person at this desk is that it says so, not that
    // it is called something (`guard.id-is-opaque`).
    Valued({ values: { [AVATAR_VALUE]: 1 } }),
  );
  // THE CONE FIRST, so it lies UNDER the disc: its apex is the disc's centre, and a cone drawn over
  // the initials would be a badge over somebody's name.
  //
  // ITS OWN SHAPE IS CENTRED ON ITS OWN ORIGIN, apex included, and `at` carries it to the disc —
  // the same split every other contour in the kit keeps, and not a style: `layerOf` reads a
  // gradient's axis through the shape's OWN bounds, centred on that origin, with no word for an
  // offset. Written apex-at-origin instead, half the fade's axis fell outside the triangle
  // altogether — clamped to the near stop's alpha for the whole reach beyond it — and the sliver
  // left inside sat under the disc that draws over it. The cone painted; nothing of it showed.
  if (look.cone) {
    const half = (CONE.length * reach) / 2;
    add(
      root,
      node(
        avatarConeId(p.seat),
        Bounded({ bounds: polyline([{ x: 0, y: half }, { x: -CONE.half * reach, y: -half }, { x: CONE.half * reach, y: -half }]) }),
        Surfaced({ surface: coneSurface(p.seat) }),
        Transformable({ at: { x: 0, y: -half }, z: CONE_Z }),
      ),
    );
  }
  if (p.holding) {
    add(
      root,
      node(
        `${avatarId(p.seat)} halo`,
        Bounded({ bounds: round(DISC / 2 + HALO.out) }),
        Surfaced({ surface: haloSurface(p.seat) }),
        Transformable({ at: { x: 0, y: 0 } }),
      ),
    );
  }
  add(root, node(`${avatarId(p.seat)} keyline`, Bounded({ bounds: round(DISC / 2) }), Surfaced({ surface: KEYLINE_SURFACE }), Transformable({ at: { x: 0, y: 0 } })));
  add(root, node(`${avatarId(p.seat)} disc`, Bounded({ bounds: round(DISC / 2 - LINE) }), Surfaced({ surface: discSurface(p.seat) }), Transformable({ at: { x: 0, y: 0 } })));
  // THE FACE: a picture when there is one, the initials in the pixel face when there is not. The
  // letters stand UP to whoever is looking (`Oriented`): a glyph read upside down is read wrong.
  if (p.picture) {
    add(root, node(`${avatarId(p.seat)} face`, Bounded({ bounds: round(DISC / 2 - LINE) }), Surfaced({ surface: faceSurface(p.seat) }), Transformable({ at: { x: 0, y: 0 } })));
  } else {
    add(
      root,
      node(
        `${avatarId(p.seat)} face`,
        Bounded({ bounds: box(DISC - 2 * LINE, DISC - 2 * LINE) }),
        Labeled({ label: initials(p.name), style: PRESENCE_GLYPH }),
        Transformable({ at: { x: 0, y: 0 } }),
        Oriented({ orientation: "viewer" }),
      ),
    );
  }
  // THE NAME, on a plate under the disc — hung on the owner's side of it, in the disc's own frame,
  // and upright to whoever is looking: a name is a caption, and a caption has a top.
  add(
    root,
    node(
      avatarNameId(p.seat),
      Bounded({ bounds: box(plateWidth(p.name), PLATE_EM * 1.6 + 2 * PLATE.padY) }),
      Surfaced({ surface: plateSurface(p.seat) }),
      Labeled({ label: p.name, style: PRESENCE_TEXT }),
      Transformable({ at: { x: 0, y: PLATE.at } }),
      Oriented({ orientation: "viewer" }),
    ),
  );
  return root;
}

/** The caption's role. A NAME, not a font — what it is worth is the theme's to re-decide. */
export const PRESENCE_TEXT = "presence.name";
/** The initials' role, inside the disc. */
export const PRESENCE_GLYPH = "presence.glyph";

/**
 * PUT THE PEOPLE ON THE DESK, and keep them there — one node per seat, rebuilt when its person
 * changed and left alone when they did not.
 *
 * A rebuild rather than a patch, because everything about an avatar can move at once: the state
 * repaints it, the view moves it, and a name can be corrected. What is NOT rebuilt is the place in
 * the tree — a node standing under the same id stays the same node to a mirror and to a drag.
 *
 * AT HOME THE DISC STANDS IN THE ARCH — at the place itself — and away it stands under the owner's
 * glass; either way it is turned as the owner's camera is turned. Two pictures, one node: a person
 * looking at their own place IS the disc in their chair, and the moment they look away the disc is
 * the only thing that says where they went. Gone, they are not drawn at all (`lookOf`).
 */
export function placeAvatars(
  root: Node,
  presences: readonly Presence[],
  /** What a fitted view is worth on that person's own glass, when the caller can say — see `isHome`. */
  homeZoom?: (p: Presence) => number | undefined,
): void {
  // NOT INTO THE DESK'S OWN LIST — into the people's layer (`AVATAR_LAYER`), which is what keeps a
  // disc out of a square and out of every arrangement the desk has.
  const layer = avatarLayer(root);
  for (const p of presences) {
    const standing = byId(root, avatarId(p.seat));
    if (standing?.parent) remove(standing.parent, standing);
    if (!lookOf(p.state).drawn) continue;
    const home = p.place && atHome(p, homeZoom?.(p));
    // AT HOME the disc stands at the place, but it is still turned by its owner's CAMERA and its
    // cone reaches as far as their glass does: the seat is a fact, the look is a reading.
    add(layer, avatarNode(p, { at: home && p.place ? p.place.at : avatarAt(p), angle: -p.view.rotation }));
  }
  // WHOEVER IS NO LONGER IN THE MESSAGE IS NO LONGER AT THE DESK. Left standing, a player who closed
  // the tab would sit there for the rest of the evening, which is a lie the desk tells.
  //
  // An avatar SAYS SO ON ITSELF and is not recognised by its id — an id is a name and nothing parses
  // one (`guard.id-is-opaque`). Told to look for a shape of id, this would also have swept away
  // whatever else a game happened to have named alike.
  const here = new Set(presences.filter((p) => lookOf(p.state).drawn).map((p) => avatarId(p.seat)));
  for (const child of [...layer.children]) {
    if (!isAvatar(child)) continue;
    if (!here.has(child.id)) remove(layer, child);
  }
}

/** The mark an avatar wears so the desk can find its own again. */
export const AVATAR_VALUE = "presence";

/**
 * THE LAYER THE PEOPLE STAND IN — a node of the desk that holds discs and nothing else.
 *
 * A disc is not a piece. Put among the desk's own children it becomes one to everything that reads
 * them: a container's arrangement seats it like a card, a square's `Displacer` sends whoever is
 * standing there to the tray, and an `Acceptor` counts it as the thing that is now in the place. A
 * board is the sharpest case — a disc dropped into the desk's own list is a man on e4 that no game
 * put there — but the fault is the same on a felt, and it is a fault of PARENTAGE rather than of
 * arithmetic.
 *
 * So the layer, and it carries no `Container`, no `Acceptor` and no `Displacer` at all: nothing
 * arranges what is in it, nothing may be dropped in it, and its children keep their own pose. What
 * makes the discs read on top is that it is the desk's LAST child — equals in the plan are ranked
 * by document order — and it is kept there on every placement, because a desk grows furniture after
 * the people arrived.
 */
export const AVATAR_LAYER = "presence layer";

function avatarLayer(desk: Node): Node {
  const standing = byId(desk, AVATAR_LAYER);
  const layer = standing ?? node(AVATAR_LAYER);
  if (standing?.parent === desk && desk.children[desk.children.length - 1] === standing) return layer;
  if (layer.parent) remove(layer.parent, layer);
  add(desk, layer);
  return layer;
}

function isAvatar(n: Node): boolean {
  return Boolean(fieldsOf<ValuedFields>(n, "Valued")?.values[AVATAR_VALUE]);
}

/**
 * WHETHER THE PERSON IS STILL LOOKING — the one piece of state a browser will actually tell us.
 *
 * A hidden tab is `away` and not `offline`: the socket is up, the moves are arriving, and the person
 * is simply looking at something else. Calling that "offline" would have every desk in the world
 * report a disconnection every time somebody answered a message.
 *
 * `pagehide` is `left`, and it is the honest reading of it: the document is going away, so whatever
 * else happens next, this person is no longer at this desk.
 *
 * Returns the unsubscriber. Nothing here polls and nothing here holds a clock.
 */
export interface PresenceDoc {
  readonly hidden: boolean;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

export function watchPresence(doc: PresenceDoc, onState: (state: PresenceState) => void): () => void {
  const visibility = (): void => onState(doc.hidden ? "away" : "online");
  const gone = (): void => onState("left");
  doc.addEventListener("visibilitychange", visibility);
  doc.addEventListener("pagehide", gone);
  return () => {
    doc.removeEventListener("visibilitychange", visibility);
    doc.removeEventListener("pagehide", gone);
  };
}
