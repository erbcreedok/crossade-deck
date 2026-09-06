// @vitest-environment jsdom
// THE LIVE DESK, STOOD UP WITHOUT A CATALOG — which is the whole claim of the file it tests.
//
// The wiring used to live in the shelf's own `gestureScene.ts`, so the only thing that could prove
// it was a story. A product then wired its own, and the two disagreed: a card could not be thrown on
// the hub's desk at all, because that copy had no release branch. These checks stand the desk up out
// of the kit alone — a bare host, a stub painter, a clock the test steps by hand — so the day the
// wiring loses a branch again, it is a red test and not a bug report from a phone.

import { describe, expect, it } from "vitest";
import {
  add,
  attachMotion,
  byId,
  Bounded,
  Carry,
  compose,
  Container,
  Draggable,
  fieldsOf,
  freeLayout,
  Grabber,
  Screened,
  installStockGrabs,
  installStockSurfaces,
  mount,
  node,
  rect,
  registerLayout,
  Surfaced,
  Transformable,
  type Clock,
  type MarkedFields,
  type Node,
  type Painter,
  type CarryItem,
  type TransformableFields,
  type ValuedFields,
} from "../index.js";
import { Camera } from "./camera/index.js";
import { liveTable } from "./liveTable.js";
import { HOME_ANCHOR, homeTarget, isHome } from "./presence.js";

function stubPainter(): Painter {
  return { ready: Promise.resolve(), draw: () => {}, resize: () => {}, destroy: () => {} };
}

const finger = (type: string, x: number, y: number, ms = 0): MouseEvent => {
  const e = Object.assign(new MouseEvent(type, { clientX: x, clientY: y }), { pointerId: 1 });
  Object.defineProperty(e, "timeStamp", { value: ms, configurable: true });
  return e;
};

/** A glass of a fixed size — jsdom lays nothing out, and a host asked its size answers one by one. */
function glass(el: { getBoundingClientRect?: unknown }, size = { width: 600, height: 400 }): void {
  Object.defineProperty(el, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, ...size, x: 0, y: 0, toJSON: () => {} }),
    configurable: true,
  });
}

/** A desk with one card on it, free to be put anywhere. */
function desk(): { root: Node; card: Node } {
  installStockSurfaces();
  installStockGrabs();
  registerLayout("live.free", freeLayout);
  const root = node("desk", Bounded({ bounds: rect(8, 8) }), Container({ layout: "live.free" }), Grabber());
  const card = node(
    "card",
    Bounded({ bounds: rect(1, 1.4) }),
    Surfaced(),
    Transformable({ at: { x: 0, y: 0 } }),
    Draggable({ onReject: "stay" }),
  );
  add(root, card);
  return { root, card };
}

/**
 * A DESK WITH A CONTROL ON IT — a ring held at its size on the glass (`Screened`), which is what a
 * seat's chair is, standing beside the ordinary card.
 */
function deskWithRing(): { root: Node; ring: Node } {
  const { root } = desk();
  const ring = node(
    "ring",
    Bounded({ bounds: rect(0.9, 0.9) }),
    Surfaced(),
    Transformable({ at: { x: 2, y: 0 } }),
    Screened({ screened: true }),
    Draggable({ onReject: "stay" }),
  );
  add(root, ring);
  return { root, ring };
}

/** A clock the test steps by hand, so a flight is watched rather than waited for. */
function fakeClock(): { clock: Clock; tick: (frames: number) => void } {
  let now = 0;
  let pending: ((ms: number) => void) | null = null;
  return {
    clock: {
      now: () => now,
      frame: (cb) => {
        pending = cb;
        return () => {
          pending = null;
        };
      },
    },
    tick(frames: number) {
      for (let i = 0; i < frames; i += 1) {
        now += 16;
        const cb = pending;
        pending = null;
        cb?.(now);
      }
    },
  };
}

/** A shell handed in from outside — the seam the catalog uses, and the one a test can drive. */
function stage(root: Node, clock: Clock, withCamera = true) {
  const div = document.createElement("div");
  glass(div);
  document.body.appendChild(div);
  const host = mount(div, root, { hudUnit: 64, theme: "dark" });
  glass(host.view);
  const motions = attachMotion(host, stubPainter(), { clock });
  // A CAMERA IS A CHOICE, here as on the shelf: a desk looked at through one reads every finger
  // through it, and a desk without one reads the glass. Both are stood up in these checks.
  const camera = withCamera ? new Camera({ minZoom: 0.5, maxZoom: 2.5 }) : undefined;
  let disposed = false;
  return {
    el: host.view,
    host,
    motions,
    ...(camera ? { camera } : {}),
    setRoot: (next: Node) => host.setRoot(next),
    dispose: () => {
      disposed = true;
      motions.stop();
      host.unmount();
    },
    get disposed() {
      return disposed;
    },
  };
}

/**
 * WHERE A PIECE NOW LIVES, looked up by name every time.
 *
 * Never off a node kept from the build: composing an atom onto a node makes a NEW node, so a
 * reference held across a gesture describes the desk as it was before the gesture, and every check
 * against it reads "nothing moved".
 */
/**
 * THE SAME DESK, with the card marked as wanting to lie the way its holder saw it (`Carry`).
 * A turned camera is the whole of the case: the piece is drawn upright on the holder's glass while
 * it is in the hand, and the turn that put it there has to survive the landing.
 */
function deskFacingHolder(): { root: Node } {
  installStockSurfaces();
  installStockGrabs();
  registerLayout("live.free", freeLayout);
  const root = node("desk", Bounded({ bounds: rect(8, 8) }), Container({ layout: "live.free" }), Grabber());
  const card = node(
    "card",
    Bounded({ bounds: rect(1, 1.4) }),
    Surfaced(),
    Transformable({ at: { x: 0, y: 0 }, angle: 0 }),
    Draggable({ onReject: "stay" }),
    Carry({ orient: "holder" }),
  );
  add(root, card);
  return { root };
}

/** The turn a piece is resting at, folded into a half-open circle so `-270` and `90` compare equal. */
const turnOf = (root: Node, id: string): number => {
  const deg = fieldsOf<TransformableFields>(byId(root, id)!, "Transformable")?.angle ?? 0;
  return ((deg % 360) + 360) % 360;
};

const seatOf = (root: Node, id: string) => fieldsOf<TransformableFields>(byId(root, id)!, "Transformable")?.at ?? { x: 0, y: 0 };

describe("the live desk", () => {
  it("liveTable.stands-a-desk-with-no-catalog-round-it — a host, a renderer, a clock and a camera", () => {
    const { root } = desk();
    const div = document.createElement("div");
    glass(div);
    document.body.appendChild(div);

    let painters = 0;
    const live = liveTable(div, root, {
      painter: () => {
        painters += 1;
        return stubPainter();
      },
      room: { x: -5, y: -5, w: 10, h: 10 },
    });

    expect(painters, "the renderer is asked for exactly once").toBe(1);
    expect(live.host.root).toBe(root);
    expect(live.camera, "a desk of its own gets a camera of its own").toBeDefined();
    expect(live.motions, "…and the one clock's runtime").toBeDefined();
    live.stop();
  });

  it("liveTable.a-flick-leaves-the-hand — a thrown card travels past the point it was let go of", () => {
    const { root } = desk();
    const c = fakeClock();
    const shell = stage(root, c.clock, false);
    const live = liveTable(shell.el.ownerDocument.body, root, { stage: shell, letGo: "throw" });

    // A FLICK, not a carry: five steps of sixteen milliseconds across the glass, which is what a
    // finger throwing a card does — and the whole difference between this and putting one down.
    shell.el.dispatchEvent(finger("pointerdown", 300, 200, 0));
    for (let i = 1; i <= 5; i += 1) {
      shell.el.dispatchEvent(finger("pointermove", 300 + i * 40, 200, i * 16));
      // ...AND A FRAME BETWEEN THE STEPS. The release reads where the piece is DRAWN, and nothing is
      // drawn until the clock has run: a hand that moved between two frames is a hand nothing saw.
      c.tick(1);
    }
    shell.el.dispatchEvent(finger("pointerup", 500, 200, 96));

    // THE SEAT IS WRITTEN FIRST and the flight carries it on from there — so the card is somewhere
    // to the right of where it started the moment the finger came up, and further right once the
    // clock has run the throw out. A drop with no swing would stop at the first of those.
    const atRelease = seatOf(shell.host.root, "card").x;
    expect(atRelease, "the release wrote a seat").toBeGreaterThan(0);
    c.tick(120);
    expect(seatOf(shell.host.root, "card").x, "the throw carried it on past the release").toBeGreaterThan(atRelease);
    live.stop();
  });

  it("liveTable.a-tree-from-the-net-leaves-the-view-alone — and is not echoed back to the room", () => {
    const { root } = desk();
    const c = fakeClock();
    const shell = stage(root, c.clock);
    const camera = shell.camera!;
    camera.lookAt({ x: 2, y: 3 });
    const before = camera.transform();

    let announced = 0;
    const live = liveTable(shell.el.ownerDocument.body, root, {
      stage: shell,
      mirror: { ready: () => {}, changed: () => (announced += 1), hand: () => {} },
    });
    const told = announced;

    const next = desk().root;
    live.setRoot(next, "net");
    expect(shell.host.root, "the tree that arrived is the tree on the glass").toBe(next);
    expect(camera.transform()).toEqual(before);
    expect(announced, "a change from the room is never announced back to it").toBe(told);

    live.setRoot(next, "me");
    expect(announced, "…and this screen's own change is").toBe(told + 1);
    live.stop();
  });

  it("liveTable.seats-idle-return — an idle view glides back to this screen's own place", () => {
    const { root } = desk();
    const c = fakeClock();
    const shell = stage(root, c.clock);
    const camera = shell.camera!;
    // A ROOM WIDER THAN THE GLASS, so a pan away from the seat is not immediately clamped back to
    // it — the camera CENTRES an axis with room to spare (`Camera.clamp`), and the default content
    // is a bare 1x1 unit box, smaller than any pan at all.
    camera.setContent({ x: -100, y: -100, w: 200, h: 200 }, 20);
    camera.setScreen(400, 400);
    // AWAY FROM THE SEAT, so the glide has somewhere to travel back from.
    camera.lookAt({ x: 1, y: 1 });

    const live = liveTable(shell.el.ownerDocument.body, root, {
      stage: shell,
      seats: {
        places: [{ at: { x: 0, y: 0 }, facing: 0 }],
        mine: 0,
        idleReturn: { afterMs: 1000, glideMs: 200 },
      },
    });

    expect(live.idle, "a seat was named, so this screen gets the idle glide").toBeDefined();
    // BEFORE THE DEADLINE, NOTHING MOVES — a countdown that glided early would leave a reader's
    // pan undone the moment they lifted a finger to think.
    live.idle!.step(999);
    expect(camera.target).toEqual({ x: 1, y: 1 });
    // PAST IT, THE VIEW GLIDES ALL THE WAY HOME — the deadline plus the whole glide.
    live.idle!.step(1 + 200);
    // AIMED SHORT OF THE RING BY THE ANCHOR'S OWN OFFSET (`homeTarget`): a seat stands at the LOW
    // middle of its owner's glass, and the camera's word for its aim is the middle.
    const home = homeTarget({ at: { x: 0, y: 0 } }, { zoom: camera.pixelsPerUnit, rotation: 0, glass: camera.glass });
    expect(camera.target.x, "the glide reached the seat's own place").toBeCloseTo(home.x, 5);
    expect(camera.target.y).toBeCloseTo(home.y, 5);
    // AN INPUT RESETS THE COUNTDOWN — a finger back on the glass is not an idle reader.
    camera.lookAt({ x: 1, y: 1 });
    live.idle!.input();
    live.idle!.step(999);
    expect(camera.target, "a reset countdown has not glided yet").toEqual({ x: 1, y: 1 });
    live.stop();
  });

  it("liveTable.seats-home-span — a round desk opens at `spanZoom`, not merely fitted, and the glide lands on the same number", () => {
    // OWNER: the round table's diameter is 1.5× the glass, on the FIRST frame — not eased into
    // starting from a fit. `roundRoom()` for a 393-wide phone would be the real numbers; a plainer
    // 25×25 room here keeps the arithmetic checkable by hand.
    const { root } = desk();
    const div = document.createElement("div");
    // A TALL GLASS, so that the ask is the only thing deciding: on a short one the desk is brought
    // in until the whole of it fits above the home anchor (`homeZoom`), which is a different law
    // and has its own test below.
    glass(div, { width: 600, height: 1200 });
    document.body.appendChild(div);

    const live = liveTable(div, root, {
      painter: () => stubPainter(),
      room: { x: -12.5, y: -12.5, w: 25, h: 25 },
      unit: 1,
      limits: { minZoom: 0.01, maxZoom: 50 },
      seats: { places: [{ at: { x: 0, y: 0 }, facing: 0 }], mine: 0, homeSpan: 1.5 },
    });
    const camera = live.camera!;
    const spanZoom = (600 * 1.5) / 25; // glass.w × 1.5 ÷ room.w, at unit 1
    expect(camera.zoom, "opened at the span, not the fit").toBeCloseTo(spanZoom, 5);
    expect(camera.zoom).toBeGreaterThan(camera.fitZoom());

    // ...AND THE GLIDE HOME LANDS ON THE SAME NUMBER — one reading, asked by both moments.
    camera.lookAt({ x: 5, y: 5 });
    camera.setZoom(1);
    live.idle!.goHome();
    live.idle!.step(600);
    expect(camera.zoom).toBeCloseTo(spanZoom, 5);
    live.stop();
  });

  it("liveTable.seats-home-width — the span is measured across the felt, not across the room round it", () => {
    // A DESK THAT WIDENED ITS ROOM so every seat can be brought under its reader (the hub's
    // `roomOfDesk`): the felt is 10 units across and the room 30. "The table is 1.5 glasses" is a
    // sentence about the TABLE, and the same number decides the opening zoom and the glide.
    const { root } = desk();
    const div = document.createElement("div");
    glass(div, { width: 600, height: 1200 }); // tall, so only the ask decides — see the test above
    document.body.appendChild(div);

    const live = liveTable(div, root, {
      painter: () => stubPainter(),
      room: { x: -15, y: -15, w: 30, h: 30 },
      unit: 1,
      limits: { minZoom: 0.01, maxZoom: 200 },
      seats: { places: [{ at: { x: 0, y: 0 }, facing: 0 }], mine: 0, homeSpan: 1.5, homeWidth: 10 },
    });
    const camera = live.camera!;
    const spanZoom = (600 * 1.5) / 10; // glass.w × 1.5 ÷ the FELT's width, at unit 1
    expect(camera.zoom, "opened across the felt, not across the room").toBeCloseTo(spanZoom, 5);
    // The guard's own proof the two differ: across the room it would be three times smaller.
    expect(camera.spanZoom(1.5)).toBeCloseTo(spanZoom / 3, 5);

    camera.lookAt({ x: 5, y: 5 });
    camera.setZoom(1);
    live.idle!.goHome();
    live.idle!.step(600);
    expect(camera.zoom, "and the glide lands on the very same number").toBeCloseTo(spanZoom, 5);
    live.stop();
  });

  it("liveTable.seats-insets — a short glass under a consumer's own bar opens on the WHOLE desk", () => {
    // THE DESK MUST BE WHOLE between whatever covers the top of the glass and the place at the home
    // anchor. The hub's own strip is not a node on this desk and the kit cannot see it, so the
    // consumer hands the number in (`seats.insets`) and home is brought in until the far rim clears
    // it — a table smaller than the ask and entire, rather than the ask with its top off the screen.
    const { root } = desk();
    const div = document.createElement("div");
    glass(div, { width: 393, height: 740 });
    document.body.appendChild(div);

    const live = liveTable(div, root, {
      painter: () => stubPainter(),
      room: { x: -15, y: -15, w: 30, h: 30 },
      unit: 1,
      limits: { minZoom: 0.01, maxZoom: 200 },
      seats: { places: [{ at: { x: 0, y: 10 }, facing: 0 }], mine: 0, homeSpan: 1.5, homeWidth: 20, insets: { top: 70 } },
    });
    const camera = live.camera!;
    /** Where the top of the felt lands on the glass, in screen pixels, at the zoom standing now. */
    const topOfFelt = (): number => 740 * HOME_ANCHOR.y - 20 * camera.pixelsPerUnit;
    expect(camera.zoom, "smaller than the ask, because the ask would not fit").toBeLessThan((393 * 1.5) / 20);
    expect(topOfFelt(), "and the whole of the desk is under the bar").toBeGreaterThanOrEqual(70);

    // ...AND THE GLIDE LANDS ON THE VERY SAME NUMBER, or a view left alone would slide to a picture
    // the desk never opened with.
    const opened = camera.zoom;
    camera.setZoom(1);
    live.idle!.goHome();
    live.idle!.step(600);
    expect(camera.zoom).toBeCloseTo(opened, 5);
    live.stop();
  });

  it("liveTable.a-new-glass-keeps-its-reader-seated — an address bar hiding is not getting up", () => {
    // WHERE A CAMERA IS AIMED FOR A PLACE TO STAND AT HOME depends on the glass (`HOME_ANCHOR` is a
    // fraction of it). A phone that hides its address bar hands the desk a taller glass under a view
    // that was sitting at home, and the view is then aimed at a point that is no longer home: the
    // ring empties and a disc is drawn beside it, for a reader who never moved.
    const { root } = desk();
    const div = document.createElement("div");
    let size = { width: 393, height: 700 };
    Object.defineProperty(div, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, x: 0, y: 0, ...size, toJSON: () => {} }),
      configurable: true,
    });
    // THE RESIZE, DRIVEN BY HAND: jsdom lays nothing out and observes nothing, so the host's own
    // observer is a stub whose callback this test fires itself.
    let resized: (() => void) | undefined;
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      constructor(fn: () => void) {
        resized = fn;
      }
      observe(): void {}
      disconnect(): void {}
    };
    document.body.appendChild(div);

    const place = { at: { x: 0, y: 5 }, facing: 0 };
    const live = liveTable(div, root, {
      painter: () => stubPainter(),
      // THE ROOM IS THE FELT PLUS ROOM BEHIND THE SEAT, exactly as a desk that seats anybody has to
      // be (`lookAt` centres an axis with room to spare, and a centred eye is at nobody's place).
      room: { x: -30, y: -30, w: 60, h: 60 },
      unit: 20,
      limits: { minZoom: 0.01, maxZoom: 50 },
      seats: { places: [place], mine: 0, idleReturn: { afterMs: 6000, glideMs: 600 }, homeSpan: 1, homeWidth: 10 },
    });
    const camera = live.camera!;
    const seatedNow = (): boolean =>
      isHome({ target: camera.target, zoom: camera.pixelsPerUnit, rotation: camera.rotation, glass: camera.glass }, place);
    live.idle!.goHome();
    live.idle!.step(600);
    expect(seatedNow(), "the desk opens at this screen's own place").toBe(true);

    size = { width: 393, height: 800 };
    resized!();
    expect(camera.glass.h, "the glass really did change").toBe(800);
    expect(seatedNow(), "a taller glass does not take a reader out of their seat").toBe(true);

    // ...AND A READER WHO HAD PANNED AWAY IS LEFT WHERE THEY PANNED TO: the resize is not a tap on
    // the ring, and a view yanked home from under a finger is the whole reason the countdown exists.
    live.idle!.input();
    camera.lookAt({ x: -8, y: -8 });
    live.idle!.step(1);
    const wandered = { ...camera.target };
    size = { width: 393, height: 700 };
    resized!();
    expect(camera.target.x, "nobody was carried home who had walked off").toBeCloseTo(wandered.x, 5);
    expect(camera.target.y).toBeCloseTo(wandered.y, 5);
    live.stop();
  });

  it("liveTable.a-plain-desks-drop-tells-the-mirror — a calm release resyncs the far screen, mark and all", () => {
    // A DESK THAT NEITHER STACKS NOR NAMES ITS OWN RUNS (the shelf's `Live/Cards` with avatars, at
    // `stacking: false`) used to answer `settle()` only if a consumer passed `onDeskChanged`, and
    // `settle()` itself returned before `mirror?.changed()` unless the desk stacked. A card dropped
    // on this desk wrote its `mark(..., "moved")` (`fall.ts`) but the partner's screen was never told
    // to look at the tree again — the glow existed and was never drawn.
    const { root } = desk();
    const c = fakeClock();
    const shell = stage(root, c.clock, false);
    // `letFall` (`fall.ts`) reads its actor off the STAGE, the way `scene()` wires it for a real
    // page — `liveTable`'s own `actor` option only reaches the flip-mark branch below.
    (shell as unknown as { actor?: string }).actor = "south";
    let changed = 0;
    let markAtLastChange: string | undefined;
    const live = liveTable(shell.el.ownerDocument.body, root, {
      stage: shell,
      letGo: "drop",
      actor: "south",
      mirror: {
        ready: () => {},
        changed: () => {
          changed += 1;
          markAtLastChange = fieldsOf<MarkedFields>(byId(shell.host.root, "card")!, "Marked")?.mark;
        },
        hand: () => {},
      },
    });

    shell.el.dispatchEvent(finger("pointerdown", 300, 200, 0));
    shell.el.dispatchEvent(finger("pointermove", 340, 200, 16));
    shell.el.dispatchEvent(finger("pointerup", 340, 200, 32));

    expect(changed, "the mirror was told after the drop settled").toBeGreaterThan(0);
    expect(markAtLastChange, "the tree it was told about already carries the mark").toBe("moved");
    live.stop();
  });

  it("liveTable.a-control-is-carried-bare — a screened ring gets no landing picture and no flight", () => {
    // A CHAIR IS NOT A CARD. It is a control held at its size on the glass, and the three things a
    // carry does for a piece — draw where it will land, lift it off the felt, throw it — are all
    // answers to questions a control does not ask. It goes where the finger put it and stays there.
    const { root } = deskWithRing();
    const c = fakeClock();
    const shell = stage(root, c.clock, false);
    const live = liveTable(shell.el.ownerDocument.body, root, { stage: shell, letGo: "throw", stacking: true });

    // The ring sits two units right of the middle; the glass is 600x400 with the middle at 300,200.
    const from = 300 + 2 * shell.host.unit();
    // SLOWLY, so the hand is never judged to be throwing: a throw takes the picture off the desk by
    // itself (`throwGate`), and a check made during one would pass on a desk that draws it anyway.
    shell.el.dispatchEvent(finger("pointerdown", from, 200, 0));
    for (let i = 1; i <= 4; i += 1) {
      shell.el.dispatchEvent(finger("pointermove", from + i * 4, 200, i * 200));
      c.tick(1);
    }
    const marks = shell.host.root.children.filter((n) => fieldsOf<ValuedFields>(n, "Valued")?.values?.["mark"] !== undefined);
    expect(marks.length, "no picture of a landing is drawn under a control").toBe(0);
    shell.el.dispatchEvent(finger("pointerup", from + 16, 200, 1000));

    // ...AND IT IS NOT THROWN EITHER. A second gesture, this one a flick.
    const back = 300 + 2 * shell.host.unit() + 16;
    shell.el.dispatchEvent(finger("pointerdown", back, 200, 2000));
    for (let i = 1; i <= 5; i += 1) {
      shell.el.dispatchEvent(finger("pointermove", back + i * 40, 200, 2000 + i * 16));
      c.tick(1);
    }
    shell.el.dispatchEvent(finger("pointerup", back + 200, 200, 2096));
    const atRelease = seatOf(shell.host.root, "ring").x;
    c.tick(120);
    expect(seatOf(shell.host.root, "ring").x, "a flicked control stays where the finger let it go").toBeCloseTo(atRelease, 5);
    expect(fieldsOf<MarkedFields>(byId(shell.host.root, "ring")!, "Marked"), "…and earns no mark of a touch").toBeUndefined();
    live.stop();
  });

  it("liveTable.a-control-earns-no-mark — a moved ring says nothing about who touched it, a moved card does", () => {
    // A MARK IS A NOTE ABOUT A PIECE, and a control is not one. The partner's screen paints the
    // owner's ink around anything carrying a `Marked` (`markQuads.ts`), so a ring nudged by its own
    // owner came up glowing on every other desk — a seat's own furniture reported as a move made
    // in the game. Only what lies on the felt is marked; see `isControl` in `liveTable.ts`.
    const { root } = deskWithRing();
    const c = fakeClock();
    const shell = stage(root, c.clock, false);
    // The actor lives on the STAGE for `fall.ts`, the way `scene()` wires a real page.
    (shell as unknown as { actor?: string }).actor = "south";
    const live = liveTable(shell.el.ownerDocument.body, root, { stage: shell, letGo: "drop", actor: "south" });

    const ringAt = 300 + 2 * shell.host.unit();
    shell.el.dispatchEvent(finger("pointerdown", ringAt, 200, 0));
    for (let i = 1; i <= 4; i += 1) {
      shell.el.dispatchEvent(finger("pointermove", ringAt + i * 4, 200, i * 200));
      c.tick(1);
    }
    shell.el.dispatchEvent(finger("pointerup", ringAt + 16, 200, 1000));
    c.tick(120);
    expect(fieldsOf<MarkedFields>(byId(shell.host.root, "ring")!, "Marked"), "a carried ring carries no mark").toBeUndefined();

    // THE SAME GESTURE ON A CARD STILL MARKS — the guard is about controls, not about drops.
    shell.el.dispatchEvent(finger("pointerdown", 300, 200, 2000));
    for (let i = 1; i <= 4; i += 1) {
      shell.el.dispatchEvent(finger("pointermove", 300 + i * 4, 200, 2000 + i * 200));
      c.tick(1);
    }
    shell.el.dispatchEvent(finger("pointerup", 316, 200, 3000));
    c.tick(120);
    expect(fieldsOf<MarkedFields>(byId(shell.host.root, "card")!, "Marked")?.mark, "a carried card still says who moved it").toBe("moved");
    live.stop();
  });

  it("liveTable.a-flick-survives-a-mirror-that-rewrites-the-desk — the far screen is told, the card still flies", () => {
    // A DESK WITH PEOPLE ON IT ANSWERS THE HAND REPORT BY REDRAWING ITSELF — the avatars are placed,
    // the chairs stood, the hands regrown, and every screen told (`avatars.ts`). That report is made
    // FIRST on release, before the fall is asked for; a flight that read the clock after it would
    // find no pose for the card and hand the whole release back to the ordinary drop, which is a
    // throw turning into a putting-down for no reason the reader can see.
    const { root } = desk();
    const c = fakeClock();
    const shell = stage(root, c.clock, false);
    const live = liveTable(shell.el.ownerDocument.body, root, {
      stage: shell,
      letGo: "throw",
      mirror: { ready: () => {}, changed: () => {}, hand: () => shell.host.setRoot(shell.host.root) },
    });

    shell.el.dispatchEvent(finger("pointerdown", 300, 200, 0));
    for (let i = 1; i <= 5; i += 1) {
      shell.el.dispatchEvent(finger("pointermove", 300 + i * 40, 200, i * 16));
      c.tick(1);
    }
    shell.el.dispatchEvent(finger("pointerup", 500, 200, 96));
    const atRelease = seatOf(shell.host.root, "card").x;
    c.tick(120);
    expect(seatOf(shell.host.root, "card").x, "the throw carried it on past the release").toBeGreaterThan(atRelease);
    live.stop();
  });

  it("liveTable.a-carried-control-is-told-still — the far screen draws the ring at its own size", () => {
    // THE OTHER SCREEN IS DRAWING THIS TOO. A control takes no pop and no bank here because the pick
    // reads the atom off it (`drag.ts`); the far screen has only what it is TOLD, and told nothing
    // it picked the same ring up with a card's physics — a seat's ring that swelled and leaned on
    // the partner's desk while standing quietly on its owner's.
    const { root } = deskWithRing();
    const c = fakeClock();
    const shell = stage(root, c.clock, false);
    let said: readonly CarryItem[] = [];
    const live = liveTable(shell.el.ownerDocument.body, root, {
      stage: shell,
      letGo: "throw",
      mirror: { ready: () => {}, changed: () => {}, hand: (items) => (said = items) },
    });

    const on = 300 + 2 * shell.host.unit();
    shell.el.dispatchEvent(finger("pointerdown", on, 200, 0));
    shell.el.dispatchEvent(finger("pointermove", on + 30, 200, 16));
    expect(said.find((one) => one.id === "ring")?.still, "the ring is reported as a control").toBe(true);
    shell.el.dispatchEvent(finger("pointerup", on + 30, 200, 32));

    shell.el.dispatchEvent(finger("pointerdown", 300, 200, 100));
    shell.el.dispatchEvent(finger("pointermove", 330, 200, 116));
    expect(said.find((one) => one.id === "card")?.still, "…and a card is not").toBeUndefined();
    shell.el.dispatchEvent(finger("pointerup", 330, 200, 132));
    live.stop();
  });

  it("liveTable.a-disc-is-not-a-thing-a-finger-reaches — nothing that is not draggable is picked up", () => {
    // AN AVATAR IS A READING OF WHERE ITS OWNER IS LOOKING and not an object on the desk. It is
    // never `Draggable`, and the whole of that refusal is the pick: a finger that comes down on the
    // disc takes nothing at all, however far it then travels.
    const { root } = desk();
    const disc = node(
      "disc",
      Bounded({ bounds: rect(0.6, 0.6) }),
      Surfaced(),
      Transformable({ at: { x: 2, y: 0 } }),
      Screened({ screened: true }),
    );
    add(root, disc);
    const c = fakeClock();
    const shell = stage(root, c.clock, false);
    const live = liveTable(shell.el.ownerDocument.body, root, { stage: shell, letGo: "throw", stacking: true });

    const was = seatOf(shell.host.root, "card");
    const on = 300 + 2 * shell.host.unit();
    shell.el.dispatchEvent(finger("pointerdown", on, 200, 0));
    shell.el.dispatchEvent(finger("pointermove", on + 80, 200, 16));
    shell.el.dispatchEvent(finger("pointerup", on + 80, 200, 32));
    c.tick(60);

    expect(seatOf(shell.host.root, "disc"), "the disc is where it was put").toEqual({ x: 2, y: 0 });
    expect(seatOf(shell.host.root, "card"), "…and nothing else went with the finger either").toEqual(was);
    live.stop();
  });

  it("liveTable.a-flick-with-a-control-on-the-desk — a card is still thrown", () => {
    // THE SAME DESK THE RING STANDS ON. A control that is refused a flight must not take the CARD'S
    // flight with it: the two are decided piece by piece, never once for the whole release.
    const { root } = deskWithRing();
    const c = fakeClock();
    const shell = stage(root, c.clock, false);
    const live = liveTable(shell.el.ownerDocument.body, root, { stage: shell, letGo: "throw", stacking: true });

    shell.el.dispatchEvent(finger("pointerdown", 300, 200, 0));
    for (let i = 1; i <= 5; i += 1) {
      shell.el.dispatchEvent(finger("pointermove", 300 + i * 40, 200, i * 16));
      c.tick(1);
    }
    shell.el.dispatchEvent(finger("pointerup", 500, 200, 96));
    const atRelease = seatOf(shell.host.root, "card").x;
    expect(atRelease, "the release wrote a seat").toBeGreaterThan(0);
    c.tick(120);
    expect(seatOf(shell.host.root, "card").x, "the throw carried it on past the release").toBeGreaterThan(atRelease);
    live.stop();
  });

  it("liveTable.a-thrown-card-lands-as-its-holder-held-it — the flight keeps the holder's turn, in the tree", () => {
    // A THROW IS A RELEASE THE SCENE TAKES, and it never reaches the wiring's own drop — which is
    // the one place the holder's turn was being written into the tree. So a card that was drawn
    // upright in the hand of a seat looking along a turned camera came down pointing north: the
    // picture had it right for the whole of the carry and the landing threw the answer away.
    const { root } = deskFacingHolder();
    const c = fakeClock();
    const shell = stage(root, c.clock);
    // The glass the stub reports, given to the camera by hand: a camera that was never sized reads
    // every finger against a one-pixel screen, and the card is nowhere near where the test aims.
    shell.camera!.setScreen(600, 400);
    shell.camera!.setContent({ x: -4, y: -4, w: 8, h: 8 }, shell.host.unit());
    shell.camera!.turnTo(90);
    const live = liveTable(shell.el.ownerDocument.body, root, { stage: shell, letGo: "throw" });

    shell.el.dispatchEvent(finger("pointerdown", 300, 200, 0));
    for (let i = 1; i <= 5; i += 1) {
      shell.el.dispatchEvent(finger("pointermove", 300 + i * 40, 200, i * 16));
      c.tick(1);
    }
    shell.el.dispatchEvent(finger("pointerup", 500, 200, 96));
    // THE TURN IS WRITTEN AT THE RELEASE, before the flight: the seat arrives later, the pose does not.
    expect(turnOf(shell.host.root, "card"), "the turn the hand held it at survives the throw").toBeCloseTo(270, 5);
    c.tick(200);
    expect(turnOf(shell.host.root, "card"), "…and the landing does not undo it").toBeCloseTo(270, 5);
    live.stop();
  });

  it("liveTable.a-throw-turns-nothing-that-did-not-ask — a card with no Carry keeps the angle its game gave it", () => {
    // The other half of the law: a piece that never asked to face its holder must not be turned.
    // Absent is not zero — a default written where nothing was written before would flatten every
    // angle a game had put on its own pieces.
    const { root } = desk();
    const card = byId(root, "card")!;
    const own = fieldsOf<TransformableFields>(card, "Transformable");
    compose(card, Transformable({ ...(own ?? {}), angle: 30 }));
    const c = fakeClock();
    const shell = stage(root, c.clock, false);
    const live = liveTable(shell.el.ownerDocument.body, root, { stage: shell, letGo: "throw" });

    shell.el.dispatchEvent(finger("pointerdown", 300, 200, 0));
    for (let i = 1; i <= 5; i += 1) {
      shell.el.dispatchEvent(finger("pointermove", 300 + i * 40, 200, i * 16));
      c.tick(1);
    }
    shell.el.dispatchEvent(finger("pointerup", 500, 200, 96));
    c.tick(200);
    expect(turnOf(shell.host.root, "card"), "the angle the game gave it is its own").toBeCloseTo(30, 5);
    live.stop();
  });

  it("liveTable.stop-takes-everything-off — no listener, no shell, nothing left holding the tree", () => {
    const { root } = desk();
    const c = fakeClock();
    const shell = stage(root, c.clock);
    const live = liveTable(shell.el.ownerDocument.body, root, { stage: shell, letGo: "drop" });
    live.stop();

    expect(shell.disposed, "the shell it was handed is torn down with it").toBe(true);
    const before = seatOf(shell.host.root, "card").x;
    shell.el.dispatchEvent(finger("pointerdown", 300, 200, 0));
    shell.el.dispatchEvent(finger("pointermove", 420, 200, 16));
    shell.el.dispatchEvent(finger("pointerup", 420, 200, 32));
    expect(seatOf(shell.host.root, "card").x, "a finger on a stopped desk moves nothing").toBe(before);
  });
});
