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
import { Screened } from "../core/atoms/screened.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Transformable } from "../core/atoms/transformable.js";
import { Valued, type ValuedFields } from "../core/atoms/valued.js";
import { add, byId, fieldsOf, node, remove, type Node } from "../core/node.js";
import { type Paint } from "../core/paint.js";
import { registerAsset } from "./assets.js";
import { registerSurface } from "./surfaces.js";
import { svg } from "./svg.js";

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
 * THE DISC, in units — and a little over half of one, not a whole one.
 *
 * The size is on the GLASS in the end (`Screened`), and the etalon a scene holds itself to is sized
 * for a card on a phone. A face drawn a full unit across at that etalon is a hundred pixels of
 * somebody's picture on a four-hundred-pixel screen: it covers the felt it is meant to be standing
 * on, and two of them meeting in a corner hide the desk between them.
 */
const DISC = 0.55;
/** The caption's box under the disc — wide, because a name is longer than a face. */
const CAPTION = { w: 1.7, h: 0.3, at: 0.48 };
/** The state's own small mark, on the disc's lower right. */
const BADGE = { size: 0.18, at: 0.19 };
/** The face inside the disc, as a fraction of it — under one, so the seat's ink reads all round. */
const FACE = 0.82;
/**
 * THE WEDGE THAT SAYS WHICH WAY THIS PERSON IS FACING — in units, measured out from the disc's
 * middle, and quiet.
 *
 * A disc alone says WHERE somebody is standing and says nothing about which way they are turned,
 * which on a shared desk is half of "where they are sitting": two readers at the same spot looking
 * opposite ways are looking at two different halves of the felt. The disc is already turned by its
 * owner's camera, so the wedge is a fixed shape on it and the angle costs nothing.
 *
 * It starts OUTSIDE the face and not at the anchor: the disc is a circle with initials in it, and a
 * clin drawn across them would be a badge over somebody's name. `spread` widens outwards, so it
 * reads as a cone opening in the direction of the look rather than as a needle pointing at it.
 */
const CONE = { from: DISC / 2, to: DISC * 1.15, near: 0.05, spread: 0.17, fade: 0.42 };

/**
 * A COLOUR THE PICTURE CAN READ. A picture is a data URI — a document of its own — so a theme token
 * written into it resolves against nothing and the letters come out the browser's default black on
 * whatever they are standing on. A CSS name is a colour with a name, and it survives the crossing.
 */
const INITIALS_INK = "white";

/**
 * WHAT EACH STATE LOOKS LIKE, as data. Not a branch: a product that wants a fifth state — idle,
 * thinking, timed out — registers a look for it, and nothing in here is touched.
 */
export interface PresenceLook {
  /** The disc's own opacity: a person who is not watching is quieter, not gone. */
  readonly fade: number;
  /** The badge's colour. */
  readonly badge: Paint;
}

const LOOKS = new Map<string, PresenceLook>([
  ["online", { fade: 1, badge: "accent" }],
  ["away", { fade: 0.55, badge: "textMuted" }],
  ["left", { fade: 0.35, badge: "textFaint" }],
  ["offline", { fade: 0.22, badge: "textFaint" }],
]);

/** A look for a state the kit does not ship. Overwriting a stock one is allowed and is the point. */
export function registerPresenceLook(state: string, look: PresenceLook): void {
  LOOKS.set(state, look);
}

/** The look in force. An unregistered state is drawn as present rather than skipped: a person the
 * desk cannot describe is still at the desk, and a blank space would say they had gone. */
function lookOf(state: string): PresenceLook {
  return LOOKS.get(state) ?? LOOKS.get("online")!;
}

// ---- the arithmetic ------------------------------------------------------------------------

/**
 * A BOX AS A PATH, built here rather than taken from `presets/rect`: the presets stand ABOVE the
 * renderer, and a file down here reaching for one would invert the ladder (`guard.layering`).
 */
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
export const HOME = { near: 0.1, turn: 1, zoom: 0.05 };

/** How far apart two headings are, in degrees, the short way round — never more than 180. */
function apart(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return Math.abs(d);
}

/**
 * IS THIS PERSON LOOKING AT THEIR OWN PLACE — the home anchor of their glass on it (`HOME_ANCHOR`,
 * the low middle and not the middle), their screen turned to it, and (when the reader knows what
 * home is worth in pixels) their zoom at it.
 *
 * Read off the MESSAGE and nothing else, so every screen at the desk gets the same answer about
 * everybody, which is the whole point: "who is at their seat" is a fact of the desk, not of the
 * screen asking. A person at home has their ring filled and their disc not drawn at all — the ring
 * IS them while they are in it, and a disc standing in a filled ring would be the same person twice.
 *
 * `homeZoom` is what a fitted view is worth in SCREEN PIXELS PER UNIT on the OWNER'S glass, and it
 * is optional because only the owner's own screen can work it out (`camera.fitZoom`) — a far reader
 * knows the sender's glass but not their etalon. Absent, the zoom is not asked, which is the honest
 * reading: a view aimed at the right point from the right side is home whatever it is magnified to.
 */
export function isHome(
  view: PresenceView,
  place: { readonly at: Vec; readonly facing: number },
  homeZoom?: number,
): boolean {
  const aimed = homeTarget(place, view);
  // HOW FAR THE ANCHOR ITSELF MOVES WHEN THE PINCH IS NUDGED, and the position is given exactly
  // that much more room. The anchor is a fraction of the GLASS, so where a camera has to be aimed
  // for a ring to stand on it depends on the zoom — and the zoom is allowed to be `HOME.zoom` off
  // (below). Judged on `HOME.near` alone, a reader whose pinch drifted inside the tolerance the
  // very next line grants them would be read as having got up: two rules, disagreeing about one
  // view. Derived rather than a second number, so the two can never come apart.
  const drop = Math.hypot(aimed.x - place.at.x, aimed.y - place.at.y);
  if (Math.hypot(view.target.x - aimed.x, view.target.y - aimed.y) > HOME.near + drop * HOME.zoom) return false;
  if (apart(view.rotation, place.facing) > HOME.turn) return false;
  if (homeZoom === undefined || homeZoom === 0) return true;
  return Math.abs(view.zoom - homeZoom) / homeZoom <= HOME.zoom;
}

/** Whether the person this presence is about is sitting at their own place right now. */
export function atHome(p: Presence, homeZoom?: number): boolean {
  return p.place !== undefined && isHome(p.view, p.place, homeZoom);
}

// ---- the node ------------------------------------------------------------------------------

/** The disc's own surface, one per seat: re-registered as the state changes, so the name is stable. */
function discSurface(seat: string): string {
  return `presence.disc.${seat}`;
}
function badgeSurface(seat: string): string {
  return `presence.badge.${seat}`;
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

/** The id an avatar answers to. Built here, never parsed — an id is a name (`guard.id-is-opaque`). */
export function avatarId(seat: string): string {
  return `avatar ${seat}`;
}

/**
 * THE ID OF THE WEDGE ON A DISC — built here, never parsed, so a reader that wants the direction
 * asks for it by name instead of matching the shape of an id (`guard.id-is-opaque`).
 */
export function avatarConeId(seat: string): string {
  return `${avatarId(seat)} cone`;
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

/** The pictures and paints this presence is drawn with — re-registered whenever the state moves. */
function installLook(p: Presence): void {
  const look = lookOf(p.state);
  registerSurface(discSurface(p.seat), {
    layers: [{ paint: p.ink, opacity: look.fade }],
    radius: DISC / 2,
    // A RING FOR A FULL HAND. The one thing on this disc that is about the moment rather than the
    // person: a hand with something in it is the difference between "they are here" and "they are
    // doing something", and it is the state everybody else is waiting on.
    ...(p.holding ? { stroke: { color: "accent", width: 0.09, alignment: 0 } } : {}),
  });
  // SCREEN-UP ON THE OWNER'S GLASS is what the disc's own turn already means (see `avatarNode`), so
  // the wedge is drawn straight up the node's own local axis and needs no angle of its own.
  registerSurface(coneSurface(p.seat), {
    layers: [{ paint: p.ink, opacity: look.fade * CONE.fade }],
  });
  registerSurface(badgeSurface(p.seat), {
    layers: [{ paint: look.badge }],
    radius: BADGE.size / 2,
    stroke: { color: "sunkBg", width: 0.05, alignment: 1 },
  });
  const src =
    p.picture ??
    svg(
      100,
      100,
      `<text x="50" y="50" fill="${INITIALS_INK}" font-family="ui-sans-serif, system-ui, sans-serif"` +
        ` font-size="46" font-weight="600" text-anchor="middle" dominant-baseline="central">${initials(p.name)}</text>`,
    );
  registerAsset(faceAsset(p.seat), { src, w: DISC * FACE, h: DISC * FACE });
  registerSurface(faceSurface(p.seat), {
    layers: [{ image: faceAsset(p.seat), fit: "contain", opacity: lookOf(p.state).fade }],
    radius: (DISC * FACE) / 2,
  });
}

/**
 * ONE AVATAR — the disc in the seat's ink, the face inside it, the state's mark on its corner and
 * the name under it.
 *
 * TURNED BY ITS OWNER'S CAMERA, because it is a picture with a TOP and that top is the message: it
 * says which way up that person is holding the desk, and a disc that faced every reader alike would
 * be a person with no direction — the one thing a disc standing away from its seat is for.
 * `Screened` because it is sized for the EYE and not for the felt — a face that shrank with the zoom
 * would be a speck on a board seen whole, which is the one view a desk with four people opens at.
 *
 * NOT `Draggable`, and not one's own either: an avatar is a READING of where its owner is looking,
 * so a finger that moved the disc would be moving a measurement. What a person moves when they want
 * to sit somewhere else is their PLACE (`seatChair`), and the disc follows the camera to it. The
 * absence of the atom is the whole of that refusal (CANONS §1, no negation flags).
 */
export function avatarNode(p: Presence): Node {
  installLook(p);
  const root = node(
    avatarId(p.seat),
    Bounded({ bounds: box(DISC, DISC) }),
    Surfaced({ surface: discSurface(p.seat) }),
    // TURNED THE WAY ITS OWNER IS TURNED — a disc is not only WHERE somebody is looking from but
    // WHICH WAY UP they are holding the desk, and that is half of "where they are sitting". Their
    // screen turns the desk by `rotation`, so what stands upright on it stands at `-rotation` on the
    // felt, and every other screen adds its own turn to that and reads the difference. Their own
    // screen adds exactly the turn that cancels it, so at home one's own disc is upright.
    Transformable({ at: avatarAt(p), angle: -p.view.rotation }),
    // NOT `Oriented: "viewer"`. A billboard is indifferent to every turn there is, which is right
    // for a caption and wrong for the one node whose whole message is an angle.
    Screened({ screened: true }),
    // AN AVATAR SAYS IT IS ONE. What makes a node a person at this desk is that it says so, not that
    // it is called something (`guard.id-is-opaque`).
    Valued({ values: { [AVATAR_VALUE]: 1 } }),
  );
  add(
    root,
    node(
      avatarConeId(p.seat),
      Bounded({
        bounds: polyline([
          { x: -CONE.near, y: -CONE.from },
          { x: -CONE.spread, y: -CONE.to },
          { x: CONE.spread, y: -CONE.to },
          { x: CONE.near, y: -CONE.from },
        ]),
      }),
      Surfaced({ surface: coneSurface(p.seat) }),
      Transformable({ at: { x: 0, y: 0 } }),
    ),
  );
  add(
    root,
    node(
      `${avatarId(p.seat)} face`,
      Bounded({ bounds: box(DISC * FACE, DISC * FACE) }),
      Surfaced({ surface: faceSurface(p.seat) }),
      Transformable({ at: { x: 0, y: 0 } }),
    ),
  );
  add(
    root,
    node(
      `${avatarId(p.seat)} badge`,
      Bounded({ bounds: box(BADGE.size, BADGE.size) }),
      Surfaced({ surface: badgeSurface(p.seat) }),
      Transformable({ at: { x: BADGE.at, y: BADGE.at } }),
    ),
  );
  add(
    root,
    node(
      `${avatarId(p.seat)} name`,
      Bounded({ bounds: box(CAPTION.w, CAPTION.h) }),
      Labeled({ label: p.name, style: PRESENCE_TEXT }),
      Transformable({ at: { x: 0, y: CAPTION.at } }),
    ),
  );
  return root;
}

/** The caption's role. A NAME, not a font — what it is worth is the theme's to re-decide. */
export const PRESENCE_TEXT = "presence.name";

/**
 * PUT THE PEOPLE ON THE DESK, and keep them there — one node per seat, rebuilt when its person
 * changed and left alone when they did not.
 *
 * A rebuild rather than a patch, because everything about an avatar can move at once: the state
 * repaints it, the view moves it, and a name can be corrected. What is NOT rebuilt is the place in
 * the tree — a node standing under the same id stays the same node to a mirror and to a drag.
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
    // NOBODY IS DRAWN TWICE. A person looking at their own place IS the ring standing there, filled
    // — and a disc on top of it would be the same person over themselves, at the one moment the two
    // pictures agree least: the ring says "this seat is occupied" and the disc says "somebody is
    // over here". Away, the disc is the only thing that says where they went.
    if (atHome(p, homeZoom?.(p))) continue;
    add(layer, avatarNode(p));
  }
  // WHOEVER IS NO LONGER IN THE MESSAGE IS NO LONGER AT THE DESK. Left standing, a player who closed
  // the tab would sit there for the rest of the evening, which is a lie the desk tells.
  //
  // An avatar SAYS SO ON ITSELF and is not recognised by its id — an id is a name and nothing parses
  // one (`guard.id-is-opaque`). Told to look for a shape of id, this would also have swept away
  // whatever else a game happened to have named alike.
  const here = new Set(presences.filter((p) => !atHome(p, homeZoom?.(p))).map((p) => avatarId(p.seat)));
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
