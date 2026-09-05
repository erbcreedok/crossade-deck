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
// avatar's place on the felt is read out of their view and their pin, and it is read the same way on
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
import { Screened } from "../core/atoms/screened.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Transformable } from "../core/atoms/transformable.js";
import { Valued, type ValuedFields } from "../core/atoms/valued.js";
import { add, byId, fieldsOf, node, remove, type Node } from "../core/node.js";
import { type Paint } from "../core/paint.js";
import { registerAsset } from "./assets.js";
import { registerSurface } from "./surfaces.js";
import { svg } from "./svg.js";
import { type Camera } from "./camera/index.js";

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

/**
 * WHAT THE AVATAR IS FASTENED TO, and it is one of two things.
 *
 * Pinned to the SCREEN it rides its owner's glass — the bottom-left corner of their own view — and
 * travels the desk as they pan. Pinned to the DESK it stands on a spot of the felt and stays there,
 * and then the view can leave it behind; `leash` is what happens next.
 */
export type PresencePin =
  | { readonly mode: "screen"; readonly at: Vec }
  | { readonly mode: "desk"; readonly at: Vec; readonly leash: string };

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
  readonly pin: PresencePin;
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
/** How close to the edge of the glass a chased avatar is allowed, in screen pixels. */
const EDGE = 34;
/** The face inside the disc, as a fraction of it — under one, so the seat's ink reads all round. */
const FACE = 0.82;

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

/** Where a fraction of the glass lands on the desk. `{x:0,y:1}` is the bottom-left corner. */
function pinnedToGlass(v: PresenceView, at: Vec): Vec {
  return deskPoint(v, { x: at.x * v.glass.w, y: at.y * v.glass.h });
}

/**
 * THE POINT, PRESSED BACK AGAINST THE EDGE IT LEFT BY. What "the avatar chases the view" means:
 * the desk keeps the spot, and the picture of the person slides along whichever border of the glass
 * they went out through, so they are never off screen and never lying about where they stand.
 */
function chased(v: PresenceView, at: Vec): Vec {
  const g = apply(presenceTransform(v), at);
  const lo = EDGE;
  const inside = {
    x: Math.min(Math.max(g.x, lo), Math.max(lo, v.glass.w - lo)),
    y: Math.min(Math.max(g.y, lo), Math.max(lo, v.glass.h - lo)),
  };
  if (inside.x === g.x && inside.y === g.y) return at;
  return deskPoint(v, inside);
}

/**
 * WHAT A LEASH DOES TO A DESK-PINNED AVATAR, by name — a registry and not two branches, because the
 * third answer (a soft tether, a spring, a leash that only holds one axis) is a game's to write and
 * must not be a patch to this file.
 */
export type Leash = (v: PresenceView, at: Vec) => Vec;

const LEASHES = new Map<string, Leash>([
  // THE VIEW IS HELD, NOT THE PICTURE. Under a lock the avatar simply stays where it was put; what
  // gives is the CAMERA, and only its owner's (`leash`). Every other screen reads the spot unchanged.
  ["lock", (_v, at) => at],
  ["chase", chased],
]);

export function registerLeash(name: string, rule: Leash): void {
  LEASHES.set(name, rule);
}

/**
 * WHERE A PIN PUTS THE AVATAR, by name. Same reason as the leashes: a pin that follows a piece, or
 * one that sits over a zone, is data a game adds rather than a case added here.
 */
export type PinRule = (v: PresenceView, pin: PresencePin) => Vec;

/**
 * THE SAME PIN READ BACKWARDS — a hand moved the picture to `at`, and this says which pin would put
 * it there.
 *
 * It is the OTHER HALF of the same entry rather than a registry of its own, and that is the whole
 * lesson of the bug it was written for: a pin can be worked out but not written back is a picture a
 * finger can move and nothing can keep. Dragged, the avatar was re-pinned with the desk point the
 * carry speaks in — and a SCREEN pin is written in fractions of the glass, so the next frame read
 * "two units" as "two glass-widths" and the person was flung a screen and a half off the felt.
 * Registered together, a pin that cannot answer this does not exist to be picked up in the first
 * place.
 */
export type PinBack = (v: PresenceView, at: Vec, pin: PresencePin) => PresencePin;

/** One way of fastening an avatar: where it puts them, and what it takes to move them. */
export interface PinKind {
  readonly at: PinRule;
  readonly from: PinBack;
}

/** Where a desk point sits on somebody's glass, as fractions of it — the units a screen pin holds. */
function glassFraction(v: PresenceView, at: Vec): Vec {
  const g = apply(presenceTransform(v), at);
  return { x: v.glass.w === 0 ? 0 : g.x / v.glass.w, y: v.glass.h === 0 ? 0 : g.y / v.glass.h };
}

const PINS = new Map<string, PinKind>([
  [
    "screen",
    { at: (v, pin) => pinnedToGlass(v, pin.at), from: (v, at) => ({ mode: "screen", at: glassFraction(v, at) }) },
  ],
  [
    "desk",
    {
      at: (v, pin) => (LEASHES.get("leash" in pin ? pin.leash : "") ?? ((_v, at) => at))(v, pin.at),
      // THE SPOT ITSELF, and the leash it was standing on kept: a hand that moved the picture said
      // where on the felt this person is, not what happens when the view walks off them.
      from: (_v, at, pin) => ({ mode: "desk", at, leash: "leash" in pin ? pin.leash : "lock" }),
    },
  ],
]);

export function registerPin(name: string, kind: PinKind): void {
  PINS.set(name, kind);
}

/**
 * WHERE THIS PERSON STANDS ON THE DESK. The one question the whole file exists to answer, and it is
 * answered from the message alone — so a screen works it out for somebody else exactly as it works
 * it out for itself, and the two can never disagree about who is sitting where.
 *
 * A pin nobody registered leaves the avatar at the pin's own point, rather than throwing: an unknown
 * name must not take the desk down with it (CANONS §1).
 */
export function avatarAt(p: Presence): Vec {
  const kind = PINS.get(p.pin.mode);
  return kind ? kind.at(p.view, p.pin) : p.pin.at;
}

/**
 * THE PIN A HAND JUST MADE — this person, put down at the desk point `at`, in the units their own
 * pin is written in.
 *
 * The inverse of `avatarAt` and its companion in one respect that matters: fed straight back into
 * it, this pin puts the avatar exactly where the finger left it, on any zoom and any turn of the
 * view. That is the property a dragged picture lives or dies by, and it is arithmetic — so it holds
 * on every screen, for one's own avatar and for the far side reading the message.
 *
 * An unregistered pin is left as it was rather than throwing: an unknown name must not take the desk
 * down with it (CANONS §1), and a picture that refuses to move says so quietly.
 */
export function repin(p: Presence, at: Vec): PresencePin {
  const kind = PINS.get(p.pin.mode);
  return kind ? kind.from(p.view, at, p.pin) : p.pin;
}

/**
 * THE OWN CAMERA, HELD TO ITS OWN AVATAR — the other half of a desk pin, and the half that only the
 * person themselves can play.
 *
 * `lock` moves the CAMERA: the view is panned back just far enough that the spot is on the glass
 * again, so a desk-pinned avatar cannot be left behind. `chase` moves the PICTURE and returns where
 * it now stands, leaving the view where the hand put it.
 *
 * Both return the point to draw at, so a caller need not know which of the two it asked for.
 */
export function leash(camera: Camera, at: Vec, mode: string): Vec {
  const v: PresenceView = {
    target: camera.target,
    zoom: camera.pixelsPerUnit,
    rotation: camera.rotation,
    glass: camera.glass,
  };
  if (mode !== "lock") return (LEASHES.get(mode) ?? ((_v, p) => p))(v, at);
  const g = apply(presenceTransform(v), at);
  const want = chased(v, at);
  if (want === at) return at;
  const to = apply(presenceTransform(v), want);
  camera.panBy(to.x - g.x, to.y - g.y);
  return at;
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

/** The id an avatar answers to. Built here, never parsed — an id is a name (`guard.id-is-opaque`). */
export function avatarId(seat: string): string {
  return `avatar ${seat}`;
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
 * `Oriented: "viewer"` because it is a picture with a TOP: the black player's camera is turned, and
 * a person drawn upside down is not "the same person from the other side", it is a broken picture.
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
    Transformable({ at: avatarAt(p) }),
    Oriented({ orientation: "viewer" }),
    Screened({ screened: true }),
    // AN AVATAR SAYS IT IS ONE. What makes a node a person at this desk is that it says so, not that
    // it is called something (`guard.id-is-opaque`).
    Valued({ values: { [AVATAR_VALUE]: 1 } }),
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
export function placeAvatars(root: Node, presences: readonly Presence[]): void {
  for (const p of presences) {
    const standing = byId(root, avatarId(p.seat));
    if (standing?.parent) remove(standing.parent, standing);
    add(root, avatarNode(p));
  }
  // WHOEVER IS NO LONGER IN THE MESSAGE IS NO LONGER AT THE DESK. Left standing, a player who closed
  // the tab would sit there for the rest of the evening, which is a lie the desk tells.
  //
  // An avatar SAYS SO ON ITSELF and is not recognised by its id — an id is a name and nothing parses
  // one (`guard.id-is-opaque`). Told to look for a shape of id, this would also have swept away
  // whatever else a game happened to have named alike.
  const here = new Set(presences.map((p) => avatarId(p.seat)));
  for (const child of [...root.children]) {
    if (!isAvatar(child)) continue;
    if (!here.has(child.id)) remove(root, child);
  }
}

/** The mark an avatar wears so the desk can find its own again. */
export const AVATAR_VALUE = "presence";

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
