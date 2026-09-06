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
import { homeTarget } from "./presence.js";

function stubPainter(): Painter {
  return { ready: Promise.resolve(), draw: () => {}, resize: () => {}, destroy: () => {} };
}

const finger = (type: string, x: number, y: number, ms = 0): MouseEvent => {
  const e = Object.assign(new MouseEvent(type, { clientX: x, clientY: y }), { pointerId: 1 });
  Object.defineProperty(e, "timeStamp", { value: ms, configurable: true });
  return e;
};

/** A glass of a fixed size — jsdom lays nothing out, and a host asked its size answers one by one. */
function glass(el: { getBoundingClientRect?: unknown }): void {
  Object.defineProperty(el, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 600, height: 400, x: 0, y: 0, toJSON: () => {} }),
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
