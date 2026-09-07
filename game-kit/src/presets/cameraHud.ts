// THE CAMERA'S OWN TWO CONTROLS, ON THE GLASS — "take me back to my place" and "put north up".
//
// They are the kit's and not a product's because every desk with a free camera grows them, and the
// two the hub and the catalog would have written are the same two: a reader who has panned across a
// felt has exactly two ways of being lost, and these are the two ways back. A second copy of the
// pair would be a second answer to where a corner is, and the two would disagree the first time a
// phone hid its address bar.
//
// THEY ARE HUD AND THEREFORE A TREE, not an overlay of markup. The canon settles which root a thing
// hangs under and nothing else about it (`hudRoot.test.ts`): the camera transforms the desk and does
// not touch the screen, so a control that must stay in its corner while the desk slides under it
// hangs here. That also gives them the press wiring, the coats and the shadow every other control in
// the kit already has, for the price of hanging them up.
//
// WHAT THEY DO IS NOT DECIDED HERE. This file draws two buttons and reports a press; what "home"
// and "north" mean to a given desk is that desk's own answer, handed in as two functions. So the
// same pair sits on a catalog page with no network behind it and on the hub's live table.

import { Container, registerLayout } from "../core/atoms/container.js";
import { freeLayout } from "../core/atoms/layouts.js";
import { Transformable } from "../core/atoms/transformable.js";
import { add, compose, node, type Node } from "../core/node.js";
import { button } from "./button.js";
import { circle } from "./shapes.js";
import { registerAsset } from "../render/assets.js";
import { wireButtons, type Meaning } from "../render/buttons.js";
import { type Host } from "../render/host.js";
import { type LiveTable } from "../render/liveTable.js";
import { registerSurface } from "../render/surfaces.js";
import { svg } from "../render/svg.js";

/** The screen the pair hangs on, and the two controls by the names a reader sees in the inspector. */
export const CAMERA_HUD = "hud/camera";
export const CAMERA_HUD_HOME = "hud/camera/home";
export const CAMERA_HUD_NORTH = "hud/camera/north";

/** The arrangement of the screen itself: it places nobody, because the corner is arithmetic. */
const CAMERA_HUD_FREE = "hud/camera/free";
/** The plate both controls wear — a registered record, like every look in the kit. */
const CAMERA_HUD_PLATE = "hud/camera/plate";

/** What each control is worth, read off `Valued` at the press — never parsed out of an id. */
const HOME_MEANS = { does: "camera.home" } as const;
const NORTH_MEANS = { does: "camera.north" } as const;

/** How wide a control is, in HUD units — a comfortable thumb at the etalon the host hands out. */
export const CAMERA_HUD_SIZE = 0.34;
/** The gap between the two, in HUD units. */
const CAMERA_HUD_GAP = 0.1;
/** How far the column stands off the corner of the glass, in HUD units, BEFORE the device's own inset. */
const CAMERA_HUD_MARGIN = 0.14;

/**
 * A SEAT, FACED HEAD ON — the chair a reader is asking to be taken back to. A back, a cushion and
 * two legs, in strokes and no fill: a glyph drawn at a fifth of an inch has no room for a picture,
 * and a filled chair at that size is a blob. Head on rather than in profile, because a chair in
 * profile at this size is an `h`, which is what the first drawing of it turned out to be.
 */
const SEAT_ICON = svg(
  24,
  24,
  '<g fill="none" stroke="white" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M6 11.5V7a2.5 2.5 0 0 1 2.5-2.5h7A2.5 2.5 0 0 1 18 7v4.5"/>' +
    '<rect x="4" y="11.5" width="16" height="5.2" rx="1.6"/>' +
    '<path d="M6.6 16.7v3"/><path d="M17.4 16.7v3"/></g>',
);

/**
 * A COMPASS NEEDLE POINTING UP, in its ring. The half that points north is filled and the other half
 * hollow — the one drawing that says WHICH way is up without a letter, and a letter would need
 * translating, which the kit refuses to do (CANONS §1: no player-facing string in code).
 */
const NORTH_ICON = svg(
  24,
  24,
  '<circle cx="12" cy="12" r="9.2" fill="none" stroke="white" stroke-width="1.7"/>' +
    '<path d="M12 4.6 16 15 12 12.9z" fill="white"/>' +
    '<path d="M12 4.6 8 15l4-2.1z" fill="none" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>',
);

/**
 * The records the pair is made of. Registered ON DEMAND rather than as an effect of importing this
 * module, the same bargain `iconSurface` strikes: a module whose import matters is a module whose
 * import ORDER matters, and the suites that empty these registries between tests would leave the
 * second test of every file drawing nothing at all.
 */
function installCameraHudLook(): void {
  registerLayout(CAMERA_HUD_FREE, freeLayout);
  // A PLATE YOU CAN SEE THROUGH. It sits over the felt, and a control that hid what it stands on
  // would be a hole in the desk wherever the reader happened to leave it.
  registerSurface(CAMERA_HUD_PLATE, {
    layers: [{ paint: "panelBg", opacity: 0.72 }],
    radius: CAMERA_HUD_SIZE / 2,
    stroke: { color: "panelBorder", width: 0.012, alignment: 1, opacity: 0.8 },
  });
  registerAsset("hud.seat", { src: SEAT_ICON, w: CAMERA_HUD_SIZE, h: CAMERA_HUD_SIZE });
  registerAsset("hud.north", { src: NORTH_ICON, w: CAMERA_HUD_SIZE, h: CAMERA_HUD_SIZE });
}

export interface CameraHudOptions {
  /**
   * TAKE ME BACK TO MY PLACE. Absent, the control is NOT DRAWN — which is the whole of "this desk
   * seats nobody" (CANONS §1: absence is the refusal, there is no `disabled` here). A page with no
   * seats has nowhere to send a reader, and a button that admitted so on being pressed would be a
   * control that lies about existing.
   */
  readonly home?: (() => void) | undefined;
  /** PUT NORTH UP. Always drawn: every desk with a camera has an angle, and a reader may lose it. */
  readonly north: () => void;
  /**
   * HOW MUCH OF THE FOOT OF THE GLASS IS ALREADY SPOKEN FOR, in device pixels — a hand laid across
   * the bottom (`handHud`), and nothing else so far. The column stands above it.
   *
   * ASKED FRESH, like the corner itself: a hand grows and shrinks with what is dealt into it, and a
   * number read once would put the controls over the cards the moment somebody was dealt a fourth.
   * Absent, nothing is there, which is every desk that does not deal.
   */
  readonly floor?: (() => number) | undefined;
}

export interface CameraHud {
  /** The screen the pair hangs on — the host's HUD root for as long as this is up. */
  readonly root: Node;
  /**
   * FIND THE CORNER AGAIN — for the one thing the host does not announce: what stands at the foot
   * of the glass has changed size (`floor`). A glass that changed size announces itself and is
   * re-read without anybody asking; a hand that grew a card does not, and whoever grew it says so.
   */
  fit(): void;
  stop(): void;
}

/**
 * Hang the pair in the low corner of the glass and answer their presses. Returns the teardown.
 *
 * THE CORNER IS ARITHMETIC AND NOT A DOCK. `dock.right` lays a column against the right wall and
 * centres it up the middle of it, and `dock.bottom` a row along the floor; the corner is neither,
 * and a pair that took two docks to describe would be two containers arguing about one column. So
 * the screen's own box (the host writes it, in units) is read and the seats are worked out from it —
 * re-read on every change, because turning a phone is a different glass and a different corner.
 *
 * ...AND THE DEVICE'S OWN INSET IS PART OF IT. A phone's rounded corner and its home indicator eat
 * the bottom of the glass; a control laid flush against that floor sits under the reader's own
 * hardware. The insets are asked of the page in the one way a script can ask (`env(safe-area-inset-*)`
 * substituted into a custom property), and where nobody answers — every desktop, and jsdom — they
 * are nothing, which is the honest reading for a screen with no notch.
 */
export function cameraHud(host: Host, opts: CameraHudOptions): CameraHud {
  installCameraHudLook();

  const screen = node(CAMERA_HUD, Container({ layout: CAMERA_HUD_FREE }));
  const one = (id: string, icon: string, means: Meaning): Node =>
    button(id, {
      bounds: circle(CAMERA_HUD_SIZE / 2),
      surface: CAMERA_HUD_PLATE,
      icon,
      iconSize: CAMERA_HUD_SIZE * 0.56,
      means,
      shadow: "footprint",
      at: { x: 0, y: 0 },
    });
  const north = one(CAMERA_HUD_NORTH, "hud.north", NORTH_MEANS);
  // THE ONE THAT IS ASKED FOR MOST SITS LOWEST — nearest the thumb. Home is above it when there is
  // a place at all; with none, north simply takes the corner and nothing stands over it.
  const home = opts.home ? one(CAMERA_HUD_HOME, "hud.seat", HOME_MEANS) : undefined;
  if (home) add(screen, home);
  add(screen, north);

  const seat = (): void => {
    const view = host.viewport();
    const u = host.unit();
    if (u <= 0) return;
    const inset = deviceInsets(host.view);
    const r = CAMERA_HUD_SIZE / 2;
    const x = view.width / u / 2 - r - CAMERA_HUD_MARGIN - inset.right / u;
    const low = view.height / u / 2 - r - CAMERA_HUD_MARGIN - inset.bottom / u - (opts.floor?.() ?? 0) / u;
    compose(north, Transformable({ at: { x, y: low } }));
    if (home) compose(home, Transformable({ at: { x, y: low - CAMERA_HUD_SIZE - CAMERA_HUD_GAP } }));
  };
  seat();

  const previous = host.hudRoot;
  host.setHudRoot(screen);
  // A GLASS THAT CHANGED SIZE IS A DIFFERENT CORNER. The host measures it and tells everyone; the
  // seats are re-read then and never remembered, so a phone turned on its side finds them again.
  let glass = { w: host.viewport().width, h: host.viewport().height, u: host.unit() };
  const stopFitting = host.onChange(() => {
    const now = { w: host.viewport().width, h: host.viewport().height, u: host.unit() };
    if (now.w === glass.w && now.h === glass.h && now.u === glass.u) return;
    glass = now;
    seat();
  });

  // ONLY WHAT THIS PAIR MEANS IS ANSWERED HERE. The wiring reports every press on the glass, and a
  // desk is free to have controls of its own on it; reading a meaning that is not one of these two
  // and calling `north` anyway is how one wiring starts answering for another's buttons.
  const stopPressing = wireButtons({
    host,
    onPress: (meaning) => {
      if (meaning["does"] === NORTH_MEANS.does) opts.north();
      else if (meaning["does"] === HOME_MEANS.does) opts.home?.();
    },
  });

  return {
    root: screen,
    fit: seat,
    stop() {
      stopPressing();
      stopFitting();
      // Put back whatever was hanging here before, rather than emptying the screen: this pair is not
      // necessarily the only thing a consumer ever hung on it.
      if (host.hudRoot === screen) host.setHudRoot(previous);
    },
  };
}

/**
 * THE ROOM THE DEVICE ITSELF TAKES, in glass pixels — the notch's side and the home indicator.
 *
 * `env()` is a CSS value and there is no other door to it from a script: it is substituted into a
 * custom property, and the computed value of that property is what comes back. A page whose viewport
 * is not `viewport-fit=cover` — and jsdom, which computes nothing — answers with something that is
 * not a length, and the honest reading of that is zero: a screen with no notch has no inset.
 */
function deviceInsets(el: HTMLElement): { readonly right: number; readonly bottom: number } {
  const win = el.ownerDocument?.defaultView;
  if (!win?.getComputedStyle) return { right: 0, bottom: 0 };
  el.style.setProperty("--gk-safe-right", "env(safe-area-inset-right, 0px)");
  el.style.setProperty("--gk-safe-bottom", "env(safe-area-inset-bottom, 0px)");
  const read = (name: string): number => {
    const px = Number.parseFloat(win.getComputedStyle(el).getPropertyValue(name));
    return Number.isFinite(px) && px > 0 ? px : 0;
  };
  return { right: read("--gk-safe-right"), bottom: read("--gk-safe-bottom") };
}

/**
 * HANG THE PAIR ON A LIVE DESK — the one line a consumer of `liveTable` writes, and the only place
 * that decides what the two mean.
 *
 * NORTH RIDES THE FLING (`Camera.glideTurnTo`) and not a heartbeat: every consumer already steps a
 * coasting view and already stops when it comes to rest, so the turn is stepped by a clock that is
 * running anyway (`guard.one-clock`). The press itself is what wakes that clock — the press wiring
 * writes the tree back, the host tells its listeners, and the camera's own `refresh` reports a moved
 * view, which is exactly what both consumers start their frames on.
 *
 * HOME IS THE RING'S OWN ASK (`idle.goHome`), the same call and not a second one, so the button and
 * a tap on one's own place can never take a reader to two different places. A desk with no seat has
 * no tracker, so it gets no place button — which is the whole of "this desk seats nobody".
 *
 * A desk with no camera gets nothing at all: there is no view to turn and no corner that stays put.
 */
export function liveCameraHud(live: LiveTable, opts: Pick<CameraHudOptions, "floor"> = {}): CameraHud | undefined {
  const camera = live.camera;
  if (!camera) return undefined;
  const idle = live.idle;
  return cameraHud(live.host, {
    ...(opts.floor ? { floor: opts.floor } : {}),
    north: () => {
      camera.glideTurnTo(0);
      live.motions?.redraw();
    },
    ...(idle
      ? {
          home: (): void => {
            idle.goHome();
            live.motions?.redraw();
          },
        }
      : {}),
  });
}
