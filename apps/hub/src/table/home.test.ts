// THE DESK OPENS AT ITS OWN PLACE, AND THROUGH THE KIT'S OWN GLIDE.
//
// The hub used to answer this itself — its own opening zoom, its own stand-in for "home", its own
// `idleReturn` built on the side — and every one of those was a second answer to a question the kit
// had already answered for the catalog's `Live/*` pages. Where the two disagreed nobody had looked:
// the view opened in the middle of the room instead of at the reader's place, so `isHome` was false
// on the first frame, the ring stayed empty and a disc was drawn on the felt instead.
//
// Two guards, and they are about different things. The first is the PICTURE — the glide the kit
// builds, run to its end in one step, leaves a view `isHome` already reads as home. The second is
// that the hub owns none of the machinery any more: a SCAN of the file, because a rule that only
// held where somebody looked is a rule that comes back the next time this desk is touched.

import { readFileSync } from "node:fs";
import { chessPlaces, nardyPlaces, ROUND_R, roundPlaces } from "@game-presets/desks";
import { Camera, homeTarget, idleReturn, isHome, ROUND_HOME_SPAN, type CameraContent, type Presence, type SeatPlace } from "game-kit";
import { describe, expect, it } from "vitest";
import { homeZoomOfDesk, roomOfDesk, unitOfDesk } from "./index.js";
import { type TableGame } from "./mapFor.js";

/** A phone held upright — the glass every one of these numbers is measured against. */
const GLASS = { w: 393, h: 744 };

/** The glide `liveTable`'s `seats` option builds, standing on this camera at this place. */
function openedAt(place: SeatPlace, room: CameraContent, unit: number): Camera {
  const camera = new Camera({ minZoom: 0.5, maxZoom: 2.5 });
  camera.setScreen(GLASS.w, GLASS.h);
  camera.setContent(room, unit);
  // WHERE `liveTable` LEAVES IT: fitted to the room and looking at the room's middle. The seat only
  // arrives from `joinTable` afterwards, which is when the glide is asked to take the view home.
  camera.setZoom(camera.fitZoom());
  camera.lookAt({ x: room.x + room.w / 2, y: room.y + room.h / 2 });
  const sitting = (): Presence => ({ seat: "p1", place, name: "", ink: "accent", state: "online", holding: false, view: { target: { x: 0, y: 0 }, zoom: 1, rotation: 0, glass: { w: 0, h: 0 } } });
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

/** Every desk on this shelf, with the places it seats — one loop, because none of them is special. */
const DESKS: readonly (readonly [TableGame, readonly SeatPlace[]])[] = [
  ["cards", roundPlaces(2)],
  ["chess", chessPlaces(2)],
  ["nardy", nardyPlaces(2)],
];

const glassOf = (game: TableGame): { room: CameraContent; unit: number } => ({
  room: roomOfDesk(game, { width: GLASS.w, height: GLASS.h }),
  unit: unitOfDesk(game),
});

describe("the desk opens at this screen's own place", () => {
  it("hub.opens-home — every seat at every desk is home on the first frame", () => {
    for (const [game, places] of DESKS) {
      const { room, unit } = glassOf(game);
      for (const place of places) {
        const camera = openedAt(place, room, unit);
        expect(isHome(viewOf(camera), place), `${game}: a seat the eye cannot be put at is a seat nobody sits at`).toBe(true);
      }
    }
  });

  it("hub.the-far-seat-turns-with-its-place — 180° comes off `places[1].facing`, not off a branch", () => {
    // Chess is the desk that cares: the second seat looks at the SAME board from the other side. The
    // turn is the PLACE's, so the glide brings it along and nothing here asks which game it is.
    for (const [game, places] of DESKS) {
      expect(places[1]!.facing).toBe(180);
      const { room, unit } = glassOf(game);
      expect(openedAt(places[1]!, room, unit).rotation).toBe(180);
    }
  });

  it("hub.the-shelf's-own-room-is-too-narrow-for-a-phone — the guard's own proof it can fail", () => {
    // The round desk's own room, unwidened: half a glass held upright is thirteen units of felt and
    // it declares six, so `lookAt` centres the eye instead of pinning it and the seat is unreachable.
    const place = roundPlaces(2)[0]!;
    const camera = openedAt(place, { x: -12.5, y: -12.5, w: 25, h: 25 }, unitOfDesk("cards"));
    // The eye is NOT where the seat asks it to be: the ring stands nowhere near the home anchor.
    const asked = homeTarget(place, viewOf(camera));
    expect(Math.hypot(camera.target.x - asked.x, camera.target.y - asked.y)).toBeGreaterThan(0.5);
  });
});

describe("home is one zoom, and the felt is the width it is measured across", () => {
  /** The camera the hub stands the desk on — this glass, this desk's own room and etalon. */
  const cameraOn = (game: TableGame): Camera => {
    const { room, unit } = glassOf(game);
    const camera = new Camera({ minZoom: 0.5, maxZoom: 2.5 });
    camera.setScreen(GLASS.w, GLASS.h);
    camera.setContent(room, unit);
    return camera;
  };

  it("hub.home-zoom-is-the-shelf's-own-number — the round felt spans 1.5 glasses, measured across the felt", () => {
    const home = homeZoomOfDesk("cards")!;
    expect(home.span, "the number is the kit's, not a 1.5 of this desk's own").toBe(ROUND_HOME_SPAN);
    expect(home.width, "measured across the TABLE — the room is the felt plus half a glass behind it").toBe(ROUND_R * 2);
    const camera = cameraOn("cards");
    const zoom = camera.spanZoom(home.span, home.width);
    expect(ROUND_R * 2 * unitOfDesk("cards") * zoom, "the table is 1.5 glasses wide").toBeCloseTo(GLASS.w * ROUND_HOME_SPAN, 5);
    // THE GUARD'S OWN PROOF THE WIDTH MATTERS: measured across the widened room, the same ask ends
    // up under the floor the camera is held at, which is the whole-table-from-across-the-room
    // picture the desk used to open at.
    expect(camera.spanZoom(home.span)).toBeLessThan(zoom);
  });

  it("hub.one-zoom-for-opening-and-returning — the glide lands exactly where the desk opened", () => {
    const place = roundPlaces(2)[0]!;
    const camera = cameraOn("cards");
    const home = homeZoomOfDesk("cards")!;
    const opened = camera.spanZoom(home.span, home.width);
    camera.setZoom(opened);
    camera.lookAt({ x: 0, y: 0 });
    const sitting = (): Presence => ({ seat: "p1", place, name: "", ink: "accent", state: "online", holding: false, view: { target: { x: 0, y: 0 }, zoom: 1, rotation: 0, glass: { w: 0, h: 0 } } });
    const glide = idleReturn(camera, sitting, { glideMs: 600, homeZoom: () => camera.spanZoom(home.span, home.width) });
    glide.goHome();
    glide.step(600);
    expect(camera.zoom, "one number for both moments a view arrives home").toBeCloseTo(opened, 5);
    expect(isHome(viewOf(camera), place), "and it is home at that zoom").toBe(true);
  });

  it("hub.a-board-names-no-span — chess and nardy are played on the whole board, which is the fit", () => {
    expect(homeZoomOfDesk("chess")).toBeUndefined();
    expect(homeZoomOfDesk("nardy")).toBeUndefined();
  });
});

describe("the hub keeps no camera of its own", () => {
  it("hub.no-camera-of-its-own — every lever the kit already has is the kit's here too", () => {
    const raw = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    for (const own of ["CARDS_OVERFILL", "hudUnit", "snapHome"]) {
      expect(raw.split(own).length - 1, `\`${own}\` is the kit's answer, not this desk's`).toBe(0);
    }
  });
});
