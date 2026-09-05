// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  add,
  Acceptor,
  attachMotion,
  byId,
  Bounded,
  Carry,
  Container,
  Draggable,
  fieldsOf,
  freeLayout,
  Grabber,
  installStockGrabs,
  installStockSurfaces,
  Inviting,
  mount,
  node,
  rect,
  registerLayout,
  Surfaced,
  Transformable,
  unwireDrag,
  wireDrag,
  type CoatedFields,
  type Painter,
  type TransformableFields,
} from "../index.js";
import { chain, move, rotate, scale } from "../core/transform.js";

function stubPainter(): Painter {
  return { ready: Promise.resolve(), draw: () => {}, resize: () => {}, destroy: () => {} };
}

const finger = (type: string, x: number, y: number, ms = 0): MouseEvent => {
  const e = Object.assign(new MouseEvent(type, { clientX: x, clientY: y }), { pointerId: 1 });
  Object.defineProperty(e, "timeStamp", { value: ms, configurable: true });
  return e;
};

describe("wireDrag in kit", () => {
  it("drag.bare-scene-wire — wireDrag works on a bare host + motions + element without devtools", () => {
    installStockSurfaces();
    installStockGrabs();
    registerLayout("drag.free", freeLayout);

    const root = node("desk", Container({ layout: "drag.free" }), Grabber());
    const zone = node(
      "zone",
      Bounded({ bounds: rect(2, 2) }),
      Container({ layout: "drag.free" }),
      Acceptor({ accept: { and: [] } }),
      Transformable({ at: { x: 5, y: 0 } }),
    );
    const card = node(
      "card",
      Bounded({ bounds: rect(1, 1) }),
      Surfaced(),
      Transformable({ at: { x: 0, y: 0 } }),
      Draggable({ onReject: "stay" }),
    );
    add(root, zone);
    add(root, card);

    const div = document.createElement("div");
    Object.defineProperty(div, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 600, height: 400, x: 0, y: 0, toJSON: () => {} }),
    });
    document.body.appendChild(div);

    const host = mount(div, root, { hudUnit: 64, theme: "dark" });
    Object.defineProperty(host.view, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 600, height: 400, x: 0, y: 0, toJSON: () => {} }),
    });
    const motions = attachMotion(host, stubPainter());

    const bareScene = { host, motions, el: host.view };

    let settledNodeId: string | undefined;

    wireDrag(bareScene, {
      zoneAt: (_r, _at, lead) => (lead.id === "card" ? byId(_r, "zone") : undefined),
      onSettled: (_r, ids) => {
        settledNodeId = ids[0];
      },
    });

    host.view.dispatchEvent(finger("pointerdown", 300, 200, 0));
    host.view.dispatchEvent(finger("pointermove", 450, 200, 50));
    host.view.dispatchEvent(finger("pointerup", 450, 200, 100));

    expect(settledNodeId).toBe("card");
    const movedCard = byId(host.root, "card");
    expect(movedCard).toBeDefined();
    expect(movedCard!.parent?.id).toBe("zone");

    motions.stop();
    host.unmount();
  });
  it("drag.willing-option — willing dresses only the zones it names, and undresses them on release", () => {
    installStockSurfaces();
    installStockGrabs();
    registerLayout("drag.willing.free", freeLayout);

    const root = node("desk3", Container({ layout: "drag.willing.free" }), Grabber());
    const zone = node(
      "zone3",
      Bounded({ bounds: rect(2, 2) }),
      Container({ layout: "drag.willing.free" }),
      Acceptor({ accept: { and: [] } }),
      Inviting(),
      Transformable({ at: { x: 5, y: 0 } }),
    );
    const other = node(
      "other3",
      Bounded({ bounds: rect(2, 2) }),
      Container({ layout: "drag.willing.free" }),
      Acceptor({ accept: { and: [] } }),
      Inviting(),
      Transformable({ at: { x: -5, y: 0 } }),
    );
    const card = node(
      "card3",
      Bounded({ bounds: rect(1, 1) }),
      Surfaced(),
      Transformable({ at: { x: 0, y: 0 } }),
      Draggable({ onReject: "stay" }),
    );
    add(root, zone);
    add(root, other);
    add(root, card);

    const div = document.createElement("div");
    Object.defineProperty(div, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 600, height: 400, x: 0, y: 0, toJSON: () => {} }),
    });
    document.body.appendChild(div);

    const host = mount(div, root, { hudUnit: 64, theme: "dark" });
    Object.defineProperty(host.view, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 600, height: 400, x: 0, y: 0, toJSON: () => {} }),
    });
    const motions = attachMotion(host, stubPainter());

    const scene = { host, motions, el: host.view };
    wireDrag(scene, {
      willing: (r) => [byId(r, "zone3")!],
    });

    const wornOf = (id: string): boolean => (fieldsOf<CoatedFields>(byId(host.root, id)!, "Coated")?.self.recipe ?? "") !== "";

    host.view.dispatchEvent(finger("pointerdown", 300, 200, 0));
    expect(wornOf("zone3")).toBe(true);
    expect(wornOf("other3")).toBe(false);

    host.view.dispatchEvent(finger("pointerup", 300, 200, 100));
    expect(wornOf("zone3")).toBe(false);
    expect(wornOf("other3")).toBe(false);

    motions.stop();
    host.unmount();
  });
  it("drag.unwire-clears-listeners — unwireDrag removes pointer listeners so events are no longer handled", () => {
    installStockSurfaces();
    installStockGrabs();
    registerLayout("drag.unwire.free", freeLayout);

    const root = node("desk2", Container({ layout: "drag.unwire.free" }), Grabber());
    const card = node(
      "card2",
      Bounded({ bounds: rect(1, 1) }),
      Surfaced(),
      Transformable({ at: { x: 0, y: 0 } }),
      Draggable({ onReject: "stay" }),
    );
    add(root, card);

    const div = document.createElement("div");
    Object.defineProperty(div, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 600, height: 400, x: 0, y: 0, toJSON: () => {} }),
    });
    document.body.appendChild(div);

    const host = mount(div, root, { hudUnit: 64, theme: "dark" });
    Object.defineProperty(host.view, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 600, height: 400, x: 0, y: 0, toJSON: () => {} }),
    });
    const motions = attachMotion(host, stubPainter());

    let settled = false;
    const scene = { host, motions, el: host.view };
    wireDrag(scene, { onSettled: () => { settled = true; } });

    // After unwire the listeners are gone — a full gesture must not trigger onSettled.
    unwireDrag(host.view);

    host.view.dispatchEvent(finger("pointerdown", 300, 200, 0));
    host.view.dispatchEvent(finger("pointermove", 350, 200, 50));
    host.view.dispatchEvent(finger("pointerup", 350, 200, 100));

    expect(settled).toBe(false);

    motions.stop();
    host.unmount();
  });
  it("drag.round-trip-off-centre — grabbed off its own middle, carried away and brought back to the very point it was picked up from, a piece lands exactly where it stood", () => {
    installStockSurfaces();
    installStockGrabs();
    registerLayout("drag.round-trip.free", freeLayout);

    const root = node("desk4", Container({ layout: "drag.round-trip.free" }), Grabber());
    const card = node(
      "card4",
      Bounded({ bounds: rect(1, 1.4) }),
      Surfaced(),
      Transformable({ at: { x: 0, y: 0 } }),
      Draggable({ onReject: "stay" }),
    );
    add(root, card);

    const div = document.createElement("div");
    Object.defineProperty(div, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 600, height: 400, x: 0, y: 0, toJSON: () => {} }),
    });
    document.body.appendChild(div);

    const host = mount(div, root, { hudUnit: 64, theme: "dark" });
    Object.defineProperty(host.view, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 600, height: 400, x: 0, y: 0, toJSON: () => {} }),
    });
    const motions = attachMotion(host, stubPainter());

    const scene = { host, motions, el: host.view };
    // NO `underFinger` — the default every desk with no zones to aim at should keep: the anchor
    // rides the finger's own delta, so a piece that came back to the exact glass point it was
    // taken from comes down on the exact seat it left, however far off its own middle the finger
    // first landed.
    wireDrag(scene, {});

    // The finger lands 20 glass px off the card's own middle (300,200 is the card's centre at
    // this mount's scale) — a wholly ordinary miss, not a corner case.
    host.view.dispatchEvent(finger("pointerdown", 320, 210, 0));
    host.view.dispatchEvent(finger("pointermove", 470, 210, 50));
    host.view.dispatchEvent(finger("pointermove", 320, 210, 100));
    host.view.dispatchEvent(finger("pointerup", 320, 210, 150));

    const settledCard = byId(host.root, "card4");
    const at = fieldsOf<TransformableFields>(settledCard!, "Transformable")?.at;
    expect(at?.x).toBeCloseTo(0, 5);
    expect(at?.y).toBeCloseTo(0, 5);

    motions.stop();
    host.unmount();
  });
  it("drag.orients-carried-card-to-holder — a card marked Carry({orient:'holder'}) turns to face a camera turned 180°, and keeps that turn once dropped", () => {
    installStockSurfaces();
    installStockGrabs();
    registerLayout("drag.orient.free", freeLayout);

    const root = node("desk5", Container({ layout: "drag.orient.free" }), Grabber());
    const card = node(
      "card5",
      Bounded({ bounds: rect(1, 1.4) }),
      Surfaced(),
      Transformable({ at: { x: 0, y: 0 }, angle: 0 }),
      Draggable({ onReject: "stay" }),
      Carry({ orient: "holder" }),
    );
    add(root, card);

    const div = document.createElement("div");
    Object.defineProperty(div, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 600, height: 400, x: 0, y: 0, toJSON: () => {} }),
    });
    document.body.appendChild(div);

    const host = mount(div, root, { hudUnit: 64, theme: "dark" });
    Object.defineProperty(host.view, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 600, height: 400, x: 0, y: 0, toJSON: () => {} }),
    });
    const motions = attachMotion(host, stubPainter());

    // A camera turned 180° — the seat looking at this desk from the far side of it.
    const view = chain([move(300, 200), scale(64), rotate(180)]);
    const scene = { host, motions, el: host.view };
    wireDrag(scene, { view: () => view });

    host.view.dispatchEvent(finger("pointerdown", 300, 200, 0));
    host.view.dispatchEvent(finger("pointermove", 340, 200, 50));
    host.view.dispatchEvent(finger("pointerup", 340, 200, 100));

    const settledCard = byId(host.root, "card5");
    const angle = fieldsOf<TransformableFields>(settledCard!, "Transformable")?.angle ?? 0;
    expect(((angle % 360) + 360) % 360).toBeCloseTo(180, 5);

    motions.stop();
    host.unmount();
  });
  it("drag.node-without-carry-orient-does-not-rotate — a card with no Carry keeps whatever angle it landed with, camera turn or not", () => {
    installStockSurfaces();
    installStockGrabs();
    registerLayout("drag.no-orient.free", freeLayout);

    const root = node("desk6", Container({ layout: "drag.no-orient.free" }), Grabber());
    const card = node(
      "card6",
      Bounded({ bounds: rect(1, 1.4) }),
      Surfaced(),
      Transformable({ at: { x: 0, y: 0 }, angle: 0 }),
      Draggable({ onReject: "stay" }),
    );
    add(root, card);

    const div = document.createElement("div");
    Object.defineProperty(div, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 600, height: 400, x: 0, y: 0, toJSON: () => {} }),
    });
    document.body.appendChild(div);

    const host = mount(div, root, { hudUnit: 64, theme: "dark" });
    Object.defineProperty(host.view, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 600, height: 400, x: 0, y: 0, toJSON: () => {} }),
    });
    const motions = attachMotion(host, stubPainter());

    const view = chain([move(300, 200), scale(64), rotate(180)]);
    const scene = { host, motions, el: host.view };
    wireDrag(scene, { view: () => view });

    host.view.dispatchEvent(finger("pointerdown", 300, 200, 0));
    host.view.dispatchEvent(finger("pointermove", 340, 200, 50));
    host.view.dispatchEvent(finger("pointerup", 340, 200, 100));

    const settledCard = byId(host.root, "card6");
    const angle = fieldsOf<TransformableFields>(settledCard!, "Transformable")?.angle ?? 0;
    expect(angle).toBe(0);

    motions.stop();
    host.unmount();
  });
});
