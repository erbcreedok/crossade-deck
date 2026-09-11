// THE DESK OPENS AT ITS OWN PLACE, AND THROUGH THE KIT'S OWN GLIDE.
//
// The hub used to answer this itself — its own opening zoom, its own stand-in for "home", its own
// `idleReturn` built on the side — and every one of those was a second answer to a question the kit
// had already answered for the catalog's `Live/*` pages. Where the two disagreed nobody had looked:
// the view opened in the middle of the room instead of at the reader's place, so `isHome` was false
// on the first frame, the ring stayed empty and a disc was drawn on the felt instead.
//
// Three guards, about different things. The first is the PICTURE — the glide the kit builds, run to
// its end in one step, leaves a view `isHome` already reads as home. The second is that the runtime
// owns none of the machinery: a SCAN, because a rule that only held where somebody looked comes back
// the next time this file is touched. The third is the owner's rule that the view takes in the whole
// page.
//
// THE DESKS BELOW ARE FIXTURES, not imports of the real games: a runtime that reached for
// `@apps/cards` to test itself would be the very dependency this package exists to refuse. What they
// share with the real specs is the `desks` presets they are built from, which is where the numbers
// under test actually live.

import { readFileSync } from "node:fs";
import {
  CHESS_UNIT,
  chessMap,
  chessPlaces,
  chessRoom,
  LIVE_UNIT,
  NARDY_UNIT,
  nardyMap,
  nardyPlaces,
  nardyRoom,
  ROUND_R,
  roundMap,
  roundPlaces,
  roundRoom,
} from "@game-presets/desks";
import {
  Camera,
  idleReturn,
  isHome,
  ROUND_HOME_SPAN,
  type CameraContent,
  type Presence,
  type SeatPlace,
} from "game-kit";
import { describe, expect, it } from "vitest";
import { limitsOfDesk, roomOfDesk } from "./camera.js";
import type { DeskSpec } from "./types.js";

/** A phone held upright — the glass every one of these numbers is measured against. */
const GLASS = { w: 393, h: 744 };

/** Only the fields the camera reads; `play` is never called here. */
function fixture(over: Partial<DeskSpec> & Pick<DeskSpec, "id" | "places" | "room" | "unit" | "map">): DeskSpec {
  return { seats: 2, play: () => ({}), ...over } as DeskSpec;
}

const ROUND = fixture({
  id: "round",
  map: () => roundMap([]),
  places: (n) => roundPlaces(n),
  room: () => roundRoom(),
  unit: LIVE_UNIT,
  home: { span: ROUND_HOME_SPAN, width: ROUND_R * 2 },
});

const BOARDS: readonly DeskSpec[] = [
  fixture({ id: "squares", map: () => chessMap(), places: (n) => chessPlaces(n), room: () => chessRoom(), unit: CHESS_UNIT }),
  fixture({ id: "points", map: () => nardyMap(), places: (n) => nardyPlaces(n), room: () => nardyRoom(), unit: NARDY_UNIT }),
];

const ALL = [ROUND, ...BOARDS];

/** The glide `liveTable`'s `seats` option builds, standing on this camera at this place. */
function openedAt(place: SeatPlace, room: CameraContent, unit: number): Camera {
  const camera = new Camera({ minZoom: 0.5, maxZoom: 2.5 });
  camera.setScreen(GLASS.w, GLASS.h);
  camera.setContent(room, unit);
  // WHERE `liveTable` LEAVES IT: fitted to the room and looking at the room's middle. The seat only
  // arrives from the room afterwards, which is when the glide is asked to take the view home.
  camera.setZoom(camera.fitZoom());
  camera.lookAt({ x: room.x + room.w / 2, y: room.y + room.h / 2 });
  const sitting = (): Presence => ({
    seat: "p1",
    place,
    name: "",
    ink: "accent",
    state: "online",
    holding: false,
    view: { target: { x: 0, y: 0 }, zoom: 1, rotation: 0, glass: { w: 0, h: 0 } },
  });
  const glide = idleReturn(camera, sitting, { glideMs: 600 });
  glide.goHome();
  // THE WHOLE GLIDE IN ONE STEP — the desk opens home rather than easing there, because the people
  // are published synchronously right after and `isHome` reads the camera at that very moment.
  glide.step(600);
  return camera;
}

function viewOf(camera: Camera): Presence["view"] {
  return { target: camera.target, zoom: camera.pixelsPerUnit, rotation: camera.rotation, glass: GLASS };
}

const cameraOn = (spec: DeskSpec): Camera => {
  const camera = new Camera({ minZoom: 0.5, maxZoom: 2.5 });
  camera.setScreen(GLASS.w, GLASS.h);
  camera.setContent(roomOfDesk(spec, { width: GLASS.w, height: GLASS.h }), spec.unit);
  return camera;
};

describe("the desk opens at this screen's own place", () => {
  it("desk.opens-home — every seat at every desk is home on the first frame", () => {
    for (const spec of ALL) {
      const room = roomOfDesk(spec, { width: GLASS.w, height: GLASS.h });
      for (const place of spec.places(spec.seats)) {
        const camera = openedAt(place, room, spec.unit);
        expect(isHome(viewOf(camera), place), `${spec.id}: a reader at their own place is home`).toBe(true);
      }
    }
  });

  it("desk.home-zoom-is-the-desk's-own-number — a span is measured across what the spec says", () => {
    const home = ROUND.home!;
    expect(home.span, "the number is the kit's, not this desk's own 1.5").toBe(ROUND_HOME_SPAN);
    expect(home.width, "measured across the TABLE — the room is the felt plus half a glass behind it").toBe(ROUND_R * 2);
    const camera = cameraOn(ROUND);
    const zoom = camera.spanZoom(home.span, home.width);
    expect(ROUND_R * 2 * ROUND.unit * zoom, "the table is 1.5 glasses wide").toBeCloseTo(GLASS.w * ROUND_HOME_SPAN, 5);
    // THE GUARD'S OWN PROOF THE WIDTH MATTERS: measured across the widened room, the same ask ends up
    // under the floor the camera is held at, which is the whole-table-from-across-the-room picture
    // the desk used to open at.
    expect(camera.spanZoom(home.span)).toBeLessThan(zoom);
  });

  it("desk.one-zoom-for-opening-and-returning — the glide lands exactly where the desk opened", () => {
    const place = ROUND.places(2)[0]!;
    const camera = cameraOn(ROUND);
    const home = ROUND.home!;
    const opened = camera.spanZoom(home.span, home.width);
    camera.setZoom(opened);
    camera.lookAt({ x: 0, y: 0 });
    const sitting = (): Presence => ({
      seat: "p1",
      place,
      name: "",
      ink: "accent",
      state: "online",
      holding: false,
      view: { target: { x: 0, y: 0 }, zoom: 1, rotation: 0, glass: { w: 0, h: 0 } },
    });
    const glide = idleReturn(camera, sitting, { glideMs: 600, homeZoom: () => camera.spanZoom(home.span, home.width) });
    glide.goHome();
    glide.step(600);
    expect(camera.zoom, "one number for both moments a view arrives home").toBeCloseTo(opened, 5);
    expect(isHome(viewOf(camera), place), "and it is home at that zoom").toBe(true);
  });

  it("desk.a-board-names-no-span — a board is played on the whole of itself, which is the fit", () => {
    for (const board of BOARDS) expect(board.home, `${board.id}`).toBeUndefined();
  });
});

describe("the runtime keeps no camera of its own", () => {
  it("desk.no-camera-of-its-own — every lever the kit already has is the kit's here too", () => {
    for (const file of ["startDesk.ts", "camera.ts"]) {
      const raw = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      for (const own of ["CARDS_OVERFILL", "hudUnit", "snapHome"]) {
        expect(raw.split(own).length - 1, `\`${own}\` is the kit's answer, not this runtime's`).toBe(0);
      }
    }
  });
});

describe("the view takes in the whole page", () => {
  it("desk.the-view-can-take-in-the-whole-page — the zoom floor is let down until the game zone fits", () => {
    // THE OWNER'S RULE: zoomed all the way out, the whole page — the game zone — is on the glass. A
    // desk whose page fits at the shelf's own floor keeps that floor; the round desk's page does not,
    // on a phone, so its floor is lower — and exactly low enough.
    const glass = { width: GLASS.w, height: GLASS.h };
    const limits = limitsOfDesk(ROUND, glass);
    const room = roomOfDesk(ROUND, glass);
    const page = roundRoom();
    const unit = ROUND.unit;
    expect(limits.minZoom * unit * page.w, "the page's width fits the glass").toBeLessThanOrEqual(GLASS.w + 1e-6);
    expect(limits.minZoom * unit * page.h, "…and its height").toBeLessThanOrEqual(GLASS.h + 1e-6);
    expect(Math.min(GLASS.w / (page.w * unit), GLASS.h / (page.h * unit)), "and no lower than that").toBeCloseTo(limits.minZoom, 6);
    expect(limits.minZoom).toBeLessThan(0.5);
    expect(room.w, "the camera's room holds the page").toBeGreaterThanOrEqual(page.w);
  });
});
