// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  add,
  Acceptor,
  attachMotion,
  byId,
  Bounded,
  Container,
  Draggable,
  fieldsOf,
  freeLayout,
  Grabber,
  installStockGrabs,
  installStockSurfaces,
  mount,
  node,
  rect,
  registerLayout,
  Surfaced,
  Transformable,
  unwireDrag,
  wireDrag,
  type Painter,
  type TransformableFields,
} from "../index.js";

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
  it("drag.willing-option", () => {
    // dummy test
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
});
