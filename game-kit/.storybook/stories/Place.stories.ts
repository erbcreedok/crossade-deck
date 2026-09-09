import type { Meta, StoryObj } from "@storybook/html";
import {
  add,
  avatarNode,
  Bounded,
  circle,
  Container,
  Flippable,
  freeLayout,
  installStockCoats,
  installStockFlips,
  installStockGrains,
  Labeled,
  node,
  rect,
  registerLayout,
  registerSurface,
  registerTextStyle,
  setFacing,
  Surfaced,
  Transformable,
  type Node,
  type Paint,
  type Presence,
  type Vec,
} from "../../src/index.js";
import {
  dressChair,
  HAND_POSE_DEFAULT,
  HAND_POSES,
  handPoseName,
  handPoseOf,
  installRoundArt,
  ROUND_R,
  ROUND_SURFACE,
  roundPlaces,
  seatChairs,
  setChairPin,
  setHandHidden,
  setHandLock,
  setHandPose,
  type HandPose,
} from "@game-presets/desks";
import { crossade, deckBackSurface, deckFaceSurface, installDeckBacks, installDeckSkin, type DeckStyle } from "@game-presets/cards";
import { scene } from "../devtools/scene.js";
import { currentSettings } from "../devtools/catalogSettings.js";
import { loadedPage, loadPage, type PageText } from "../locales/pages.js";
import { documented } from "./surfaceControls.js";

// LIVE / PLACE — the seat design, as the desks add-on ships it: the CHAIR (a place: it stands on
// the felt, looks into the desk, carries a hand and its rights, and exists without anybody in it)
// and the AVATAR (a camera: a disc, a cone of the look, a name, a ring for a full hand), apart and
// together, in every state each of them has — the same pages the design draws, built out of the
// same nodes a live desk is.
//
// Everything here is STILL. No camera of a reader's own moves a disc, no finger deals a card: the
// pages after this one are where the same furniture is driven. This one is where it is looked at.

installStockCoats();
installStockFlips();
installStockGrains();

const meta: Meta = {
  title: "Live/Place",
  parameters: { gkDoc: "place.component" },
};
export default meta;

/** The look the cards on a chair wear — the deck design's classic style, on the plaid back. */
const DECK: DeckStyle = { layout: "classic", fourColour: false, cyrillic: false };
const FREE = "story.place.free";
const CAPTION = "story.place.caption";
const PANEL = "story.place.panel";

/** A camera that opens fitted to a desk of `w`×`h` units centred on the origin, and lets the reader zoom. */
function fitted(w: number, h: number) {
  return {
    // A LOW FLOOR: a gallery is a wall of cells, and a floor sized for one card holds it wider than
    // a phone. The fit itself is what the page opens on; the floor only says how far out it may go.
    limits: { minZoom: 0.05, maxZoom: 6, input: { zoom: true, pan: true, rotate: false } },
    content: { x: -w / 2, y: -h / 2, w, h },
    start: { zoom: "fit" as const },
  };
}

function install(): void {
  installDeckSkin(DECK);
  installDeckBacks();
  installRoundArt();
  registerLayout(FREE, freeLayout);
  registerSurface(PANEL, { layers: [{ paint: "sunkBg" }], radius: 0.3, stroke: { color: "panelBorder", width: 0.05 } });
  registerTextStyle(CAPTION, { family: "'Press Start 2P', ui-monospace, monospace", size: 0.22, weight: 400, lineHeight: 1.4, fill: "textMuted" });
}

/** A seat's ink — the kit's hue wheel, one recipe for every place at every desk. */
const inkOf = (q: number): Paint => ({ token: "spin", param: q });

/** The page's own words, when they have arrived — the key itself until then, as everywhere in the catalog. */
type Words = (key: string) => string;
function wordsOf(text: PageText | undefined): Words {
  return (key) => (text ? text.text(`docs.place.${key}` as Parameters<PageText["text"]>[0]) : key);
}

/** One of the deck's cards, by index into the set — its own id, so a page may deal the set as often as it likes. */
let dealt = 0;
function card(i: number, face: "up" | "down"): Node {
  const spec = crossade()[i % 52]!;
  const made = node(
    `place/card ${dealt++}`,
    Bounded({ bounds: rect(1, 1.4) }),
    Surfaced({ surface: deckFaceSurface(spec, DECK) }),
    Flippable({ flip: "turnOver", back: deckBackSurface("plaid") }),
    Transformable({ at: { x: 0, y: 0 } }),
  );
  setFacing(made, face);
  return made;
}

type AvatarState = "seated" | "adrift" | "away" | "none";

/** Everything one place can be — the design's own knobs, as data. */
interface Spot {
  readonly seat: string;
  readonly q: number;
  readonly at: Vec;
  /** The chair's facing, degrees clockwise: 0 looks up the glass, into the desk from its near edge. */
  readonly facing: number;
  readonly mine?: boolean;
  /** A place nobody holds: the dashed outline, and nothing else. */
  readonly empty?: boolean;
  /** No chair at all — the avatar alone. */
  readonly noChair?: boolean;
  readonly hand?: number;
  readonly pose?: HandPose;
  readonly open?: "up" | "down" | "mix";
  readonly pin?: boolean;
  readonly lock?: boolean;
  readonly hide?: boolean;
  readonly name?: string;
  readonly state?: AvatarState;
  /** Where the camera looks, degrees relative to the chair — 0 is into the desk. */
  readonly gaze?: number;
  readonly turn?: boolean;
}

/** How far an adrift disc slides from its chair, in the direction of its look — the design's 20px. */
const ADRIFT = 0.6;

/** ONE PLACE on a desk — the chair, its hand and its marks, and the person in it or beside it. */
function place(desk: Node, people: Node, s: Spot): void {
  const ink = inkOf(s.q);
  const chairAngle = -s.facing;
  if (!s.noChair) {
    if (s.empty) {
      seatChairs(desk, [{ at: s.at, facing: s.facing }], []);
      return;
    }
    const [chair] = seatChairs(desk, [{ at: s.at, facing: s.facing }], [{ seat: s.seat, ink }], true);
    if (!chair) return;
    for (let i = 0; i < (s.hand ?? 0); i += 1) {
      const face = s.open === "up" ? "up" : s.open === "mix" ? (i % 2 ? "up" : "down") : "down";
      add(chair, card(i, face));
    }
    if (s.pin) setChairPin(chair, true);
    if (s.lock) setHandLock(chair, true);
    if (s.hide) setHandHidden(chair, true);
    setHandPose(chair, s.pose ?? HAND_POSE_DEFAULT);
    dressChair(chair, { mine: !!s.mine, home: s.state === "seated" });
  }
  if (!s.state || s.state === "none") return;
  const gaze = s.gaze ?? 0;
  const rad = ((chairAngle + gaze) * Math.PI) / 180;
  // ADRIFT: the disc slides off the chair the way it is looking; the cone goes with it, because
  // the cone's apex IS the disc's centre.
  const off = s.state === "adrift" ? { x: ADRIFT * Math.sin(rad), y: -ADRIFT * Math.cos(rad) } : { x: 0, y: 0 };
  const presence: Presence = {
    seat: s.seat,
    name: s.name ?? s.seat,
    ink,
    state: s.state === "away" ? "away" : "online",
    holding: !!s.turn,
    view: { target: s.at, zoom: 1, rotation: s.facing, glass: { w: 1, h: 1 } },
  };
  add(people, avatarNode(presence, { at: { x: s.at.x + off.x, y: s.at.y + off.y }, angle: chairAngle + gaze }));
}

/** A caption under a cell — the design's own label, in the reader's language. */
function caption(at: Vec, label: string): Node {
  return node(`place/caption ${label}`, Bounded({ bounds: rect(4.8, 0.5) }), Labeled({ label, style: CAPTION }), Transformable({ at }));
}

/** A rectangular felt with places on it, and the people's layer after everything else. */
function panel(w: number, h: number): { readonly desk: Node; readonly people: Node } {
  install();
  const desk = node("place desk", Bounded({ bounds: rect(w, h) }), Container({ layout: FREE }), Surfaced({ surface: PANEL }));
  const people = node("place people");
  return { desk, people };
}

/** The felt, the places, the captions, and only then the people — a disc is over everything on the desk. */
function finish(desk: Node, people: Node, captions: readonly Node[]): Node {
  for (const c of captions) add(desk, c);
  add(desk, people);
  return desk;
}

/**
 * A STORY THAT WAITS FOR ITS WORDS. The captions are the page's prose, loaded when the page is
 * opened; until they arrive the keys stand in, and the scene is fed the same desk again once they do.
 */
function worded(build: (words: Words) => Node, camera: ReturnType<typeof fitted>): HTMLElement {
  const locale = currentSettings().text.locale;
  const built = scene(build(wordsOf(loadedPage("place", locale))), { camera });
  const again = (): void => {
    if (currentSettings().text.locale !== locale) return;
    built.setRoot(build(wordsOf(loadedPage("place", locale))));
  };
  if (!loadedPage("place", locale)) void loadPage("place", locale).then(again);
  // ...AND ONCE MORE WHEN THE PIXEL FACE ARRIVES: a name plate laid out against the fallback's
  // widths is re-measured by nothing, and a canvas never asks for a font by itself.
  void document.fonts?.ready.then(again);
  return built.el;
}

// ---------------------------------------------------------------- the sample

const POSE_NAMES = HAND_POSES.map(handPoseName);
const STATES: readonly (AvatarState | "empty")[] = ["seated", "adrift", "away", "none", "empty"];

interface SampleArgs {
  seatAngle: number;
  seatColour: number;
  handSize: number;
  handPose: string;
  open: "down" | "up" | "mix";
  mine: boolean;
  pin: boolean;
  lock: boolean;
  hide: boolean;
  avatarState: AvatarState | "empty";
  gaze: number;
  turn: boolean;
}

/**
 * ONE PLACE UNDER EVERY KNOB THE DESIGN HAS — the chair's angle and colour, its hand's count and
 * pose, its rights, and the avatar's state and look. The page to see a place change on.
 */
export const Sample: StoryObj<SampleArgs> = {
  render: (a) =>
    worded((words) => {
      const { desk, people } = panel(8, 8);
      place(desk, people, {
        seat: "sample",
        q: a.seatColour,
        at: { x: 0, y: 0 },
        facing: -a.seatAngle,
        mine: a.mine,
        empty: a.avatarState === "empty",
        hand: a.handSize,
        pose: handPoseOf(a.handPose) ?? HAND_POSE_DEFAULT,
        open: a.open,
        pin: a.pin,
        lock: a.lock,
        hide: a.hide,
        name: words(a.mine ? "name.you" : "name.kira"),
        state: a.avatarState === "empty" ? "none" : a.avatarState,
        gaze: a.gaze,
        turn: a.turn,
      });
      return finish(desk, people, []);
    }, fitted(8.5, 8.5)),
  args: {
    seatAngle: 0,
    seatColour: 0.35,
    handSize: 5,
    handPose: handPoseName(HAND_POSE_DEFAULT),
    open: "down",
    mine: false,
    pin: false,
    lock: false,
    hide: false,
    avatarState: "seated",
    gaze: 0,
    turn: false,
  },
  argTypes: {
    seatAngle: documented("arg.seatAngle", { control: { type: "number", min: -180, max: 180, step: 2 } }, "chair"),
    seatColour: documented("arg.seatColour", { control: { type: "number", min: 0, max: 1, step: 0.05 } }, "chair"),
    handSize: documented("arg.handSize", { control: { type: "number", min: 0, max: 52, step: 1 } }, "chair"),
    handPose: documented("arg.handPose", { control: "select", options: POSE_NAMES }, "chair"),
    open: documented("arg.handOpen", { control: "select", options: ["down", "up", "mix"] }, "chair"),
    mine: documented("arg.mine", { control: { type: "boolean" } }, "chair"),
    pin: documented("arg.pin", { control: { type: "boolean" } }, "rights"),
    lock: documented("arg.lock", { control: { type: "boolean" } }, "rights"),
    hide: documented("arg.hide", { control: { type: "boolean" } }, "rights"),
    avatarState: documented("arg.avatarState", { control: "select", options: STATES }, "avatar"),
    gaze: documented("arg.gaze", { control: { type: "number", min: -180, max: 180, step: 2 } }, "avatar"),
    turn: documented("arg.turn", { control: { type: "boolean" } }, "avatar"),
  },
  parameters: { gkDocStory: "place.sample" },
};

// ---------------------------------------------------------------- the galleries

/** Cells four to a row — a phone held upright first, the design's own pitch inside a cell. */
const CELL = { w: 5.2, h: 6.2, columns: 4 };
function cellAt(i: number, count: number): Vec {
  const columns = Math.min(CELL.columns, count);
  const rows = Math.ceil(count / columns);
  const col = i % columns;
  const row = Math.floor(i / columns);
  return { x: (col - (columns - 1) / 2) * CELL.w, y: (row - (rows - 1) / 2) * CELL.h - 0.4 };
}
function gallerySize(count: number): { readonly w: number; readonly h: number } {
  const columns = Math.min(CELL.columns, count);
  return { w: columns * CELL.w + 0.6, h: Math.ceil(count / columns) * CELL.h + 0.6 };
}

interface Cell {
  readonly key: string;
  readonly spot: Omit<Spot, "at" | "seat">;
}

/** A gallery of cells, each a place in one state, captioned with the design's own label. */
function gallery(cells: readonly Cell[]): StoryObj {
  return {
    render: () =>
      worded((words) => {
        const size = gallerySize(cells.length);
        const { desk, people } = panel(size.w, size.h);
        const captions: Node[] = [];
        cells.forEach((cell, i) => {
          const at = cellAt(i, cells.length);
          const nameKey = cell.spot.name;
          place(desk, people, { ...cell.spot, seat: `${cell.key}`, at, ...(nameKey ? { name: words(`name.${nameKey}`) } : {}) });
          captions.push(caption({ x: at.x, y: at.y + CELL.h / 2 - 0.5 }, words(cell.key)));
        });
        return finish(desk, people, captions);
      }, fitted(gallerySize(cells.length).w + 0.4, gallerySize(cells.length).h + 0.4)),
  };
}

/** 1 · THE AVATAR ALONE — a camera's state, with no furniture and no cards: a disc, a cone, a name, a ring. */
export const Avatars: StoryObj = {
  ...gallery([
    { key: "avatars.looking", spot: { q: 0.25, facing: 0, noChair: true, name: "kira", state: "seated" } },
    { key: "avatars.aside", spot: { q: 0.4, facing: 0, noChair: true, name: "dan", state: "seated", gaze: -64 } },
    { key: "avatars.turn", spot: { q: 0.55, facing: 0, noChair: true, name: "rita", state: "seated", turn: true } },
    { key: "avatars.away", spot: { q: 0.9, facing: 0, noChair: true, name: "mark", state: "away" } },
  ]),
  parameters: { gkDocStory: "place.avatars" },
};

const FRONT_FAN: HandPose = { side: "front", fold: "fan" };
const FRONT_SHRINK: HandPose = { side: "front", fold: "shrink" };
const FRONT_TUCK: HandPose = { side: "front", fold: "tuck" };
const SIDE_FAN: HandPose = { side: "side", fold: "fan" };
const SIDE_TUCK: HandPose = { side: "side", fold: "tuck" };

/** 2 · THE CHAIR ALONE — a place: its angle, its colour, its hand in every pose, its rights. Nobody in it. */
export const Chairs: StoryObj = {
  ...gallery([
    { key: "chairs.empty", spot: { q: 0, facing: 0, empty: true } },
    { key: "chairs.held", spot: { q: 0.2, facing: 0, hand: 0 } },
    { key: "chairs.frontFan", spot: { q: 0.5, facing: 0, hand: 5, pose: FRONT_FAN } },
    { key: "chairs.frontShrink", spot: { q: 0.55, facing: 0, hand: 5, pose: FRONT_SHRINK } },
    { key: "chairs.frontTuck", spot: { q: 0.65, facing: 0, hand: 5, pose: FRONT_TUCK } },
    { key: "chairs.sideFan", spot: { q: 0.7, facing: 0, hand: 5, pose: SIDE_FAN } },
    { key: "chairs.sideShrink", spot: { q: 0.78, facing: 0, hand: 5 } },
    { key: "chairs.sideTuck", spot: { q: 0.88, facing: 0, hand: 5, pose: SIDE_TUCK } },
    { key: "chairs.openFan", spot: { q: 0.42, facing: 0, hand: 5, pose: FRONT_FAN, open: "up" } },
    { key: "chairs.openSide", spot: { q: 0.52, facing: 0, hand: 5, open: "up" } },
    { key: "chairs.mixed", spot: { q: 0.62, facing: 0, hand: 6, pose: FRONT_FAN, open: "mix" } },
    { key: "chairs.mine", spot: { q: 0, facing: 0, hand: 4, mine: true } },
    { key: "chairs.pin", spot: { q: 0.6, facing: 0, hand: 4, pin: true } },
    { key: "chairs.lock", spot: { q: 0.75, facing: 0, hand: 4, lock: true } },
    { key: "chairs.hide", spot: { q: 0.9, facing: 0, hand: 4, hide: true } },
    { key: "chairs.allThree", spot: { q: 0.85, facing: 0, hand: 4, pin: true, lock: true, hide: true } },
    { key: "chairs.turned", spot: { q: 0.3, facing: 26, hand: 3 } },
  ]),
  parameters: { gkDocStory: "place.chairs" },
};

/** 3 · TOGETHER — the avatar in the chair, beside it, or gone from it; the hand in the poses a table sees. */
export const Together: StoryObj = {
  ...gallery([
    { key: "together.sideShrink", spot: { q: 0.25, facing: 0, hand: 4, name: "kira", state: "seated" } },
    { key: "together.frontFan", spot: { q: 0.35, facing: 0, hand: 5, pose: FRONT_FAN, name: "vlad", state: "seated" } },
    { key: "together.turned", spot: { q: 0.45, facing: 26, hand: 4, name: "rita", state: "seated" } },
    { key: "together.adrift", spot: { q: 0.7, facing: 0, hand: 4, name: "lyova", state: "adrift", gaze: 128 } },
    { key: "together.away", spot: { q: 0.9, facing: 0, hand: 4, name: "mark", state: "away" } },
    { key: "together.mineRights", spot: { q: 0, facing: 0, hand: 5, mine: true, pin: true, lock: true, name: "you", state: "seated" } },
    { key: "together.fiftyTwoSide", spot: { q: 0.15, facing: 0, hand: 52, name: "kira", state: "seated" } },
    { key: "together.fiftyTwoFan", spot: { q: 0.6, facing: 0, hand: 52, pose: FRONT_FAN, name: "dan", state: "seated" } },
    { key: "together.fiftyTwoOpen", spot: { q: 0.5, facing: 0, hand: 52, pose: FRONT_FAN, open: "up", name: "rita", state: "seated" } },
  ]),
  parameters: { gkDocStory: "place.together" },
};

// ---------------------------------------------------------------- the ring

/** Eight places round a felt — the same arithmetic the live desks seat by. */
const RING = 8;
const LETTERS = ["you", "kira", "dan", "rita", "lyova", "mark", "tim", "vlad"] as const;

export const Ring: StoryObj = {
  render: () =>
    worded((words) => {
      install();
      const desk = node("ring desk", Bounded({ bounds: circle(ROUND_R) }), Container({ layout: FREE }), Surfaced({ surface: ROUND_SURFACE }));
      const people = node("ring people");
      roundPlaces(RING).forEach((p, i) => {
        place(desk, people, {
          seat: `ring ${i}`,
          q: i / RING,
          at: p.at,
          facing: p.facing,
          mine: i === 0,
          hand: 3,
          name: words(`name.${LETTERS[i]!}`),
          state: "seated",
        });
      });
      return finish(desk, people, []);
    }, fitted(ROUND_R * 2 + 1, ROUND_R * 2 + 1)),
  parameters: { gkDocStory: "place.ring" },
};
