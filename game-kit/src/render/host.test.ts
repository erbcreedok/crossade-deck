// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { node } from "../core/node.js";
import { Bounded, footprint } from "../core/atoms/bounded.js";
import { rect } from "../presets/shapes.js";
import { HUD_UNIT_FRACTION, mount } from "./host.js";

function container(w: number, h: number): HTMLElement {
  const el = document.createElement("div");
  // jsdom has no layout, so the box is supplied rather than measured.
  el.getBoundingClientRect = () => ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) });
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("host", () => {
  it("host.owns-pixels — the node knows units, the host knows the viewport", () => {
    const root = node("h1");
    const host = mount(container(800, 600), root);
    expect(host.viewport().width).toBe(800);
    expect(host.viewport().height).toBe(600);
    // Nothing about pixels reached the node.
    expect(root.atoms.size).toBe(0);
    host.unmount();
  });

  it("host.hud-unit-from-viewport — the etalon is a fraction of the SHORTER side", () => {
    const host = mount(container(1000, 400), node("h2"));
    expect(host.unit()).toBe(Math.round(400 * HUD_UNIT_FRACTION));
    host.unmount();
  });

  it("host.view-not-called-canvas — the element is a canvas, the name is view", () => {
    const host = mount(container(320, 240), node("h3"));
    expect(host.view.tagName.toLowerCase()).toBe("canvas");
    expect(host.view.isConnected).toBe(true);
    host.unmount();
  });

  it("host.mount-unmount — nothing is left behind", () => {
    const el = container(320, 240);
    const host = mount(el, node("h4"));
    expect(el.children.length).toBe(1);
    host.unmount();
    expect(el.children.length).toBe(0);
  });

  it("host.context-carries-unit — resolution gets the etalon and the chain", () => {
    const root = node("h5");
    const host = mount(container(600, 600), root);
    const ctx = host.contextFor(root);
    expect(ctx.unit).toBe(150);
    expect(ctx.chain).toEqual([root]);
    host.unmount();
  });

  it("host.new-data-replaces-the-tree — not the canvas it is drawn on", () => {
    // New data — a move from the server, a save loaded, a spec edited — is a different tree in
    // the SAME view. Remounting instead would drop the WebGL context and every viewer setting
    // with it, and a browser hands out about a dozen contexts before it takes them back.
    const host = mount(container(600, 600), node("h6"));
    const view = host.view;
    host.setRoot(node("h7"));
    expect(host.root.id).toBe("h7");
    expect(host.view).toBe(view);
    expect(host.view.isConnected).toBe(true);
    host.unmount();
  });

  it("host.a-new-tree-is-an-onchange — whoever draws is told, exactly as after a resize", () => {
    // Everything downstream reads `host.root` when it draws, so a swap that nobody announces
    // is a tree that only appears on the next unrelated event.
    const host = mount(container(600, 600), node("h8"));
    let told = 0;
    host.onChange(() => (told += 1));
    host.setRoot(node("h9"));
    expect(told).toBe(1);
    host.unmount();
  });

  it("host.viewer-survives-new-data — the two planes do not touch", () => {
    // The viewer plane is who is LOOKING; the tree is what there is to look at. A rebuild used
    // to reset the first because it replaced the second.
    const host = mount(container(600, 600), node("h10"), { theme: "light", hudUnit: 34, debugBounds: true });
    host.setRoot(node("h11"));
    expect(host.viewer()).toEqual({ theme: "light", hudUnit: 34, debugBounds: true });
    expect(host.unit()).toBe(34);
    host.unmount();
  });
  it("unit.hud-etalon — the etalon moves HUD sizes and leaves desk sizes alone", () => {
    // The two measures, and the whole point of keeping them apart: a unit is a WORLD number a
    // node is authored in, and the etalon is how many screen pixels one of them is worth right
    // now. Change the etalon and the picture rescales; the model does not move a millimetre.
    const desk = node("u1", Bounded({ bounds: rect(2, 1) }));
    const host = mount(container(600, 600), desk, { theme: "dark", hudUnit: 46 });
    const authored = footprint(host.root)!;
    expect(host.unit()).toBe(46);
    host.setViewer({ theme: "dark", hudUnit: 60 });
    expect(host.unit()).toBe(60);
    // Same shape, same numbers. Nothing about the node knows what a pixel is.
    expect(footprint(host.root)).toEqual(authored);
    host.unmount();
  });

  it("unit.override-local — an etalon is per viewer and travels nowhere", () => {
    // Two hosts over the SAME tree, at two etalons. Both are right at once, which is only
    // possible because the number is not on the node — and it is why lowering it on one screen
    // cannot be allowed to become a fact everybody else receives.
    const shared = node("u2", Bounded({ bounds: rect(1, 1) }));
    const mine = mount(container(600, 600), shared, { theme: "dark", hudUnit: 30 });
    expect(mine.unit()).toBe(30);
    const spec = JSON.parse(JSON.stringify(shared.atoms.get("Bounded")!.fields)) as Record<string, unknown>;
    expect(JSON.stringify(spec)).not.toContain("30");
    mine.unmount();
  });

  it("life.mount-unmount — nothing is left behind", () => {
    // The claim a leak test has to make in a headless suite: the view leaves the document, the
    // host stops answering for it, and a second unmount is not an error. What a fake cannot
    // prove is a GPU resource, and `e2e.a-rebuild-does-not-leak-a-context` is where that lives.
    const box = container(600, 600);
    const host = mount(box, node("u3"));
    expect(host.view.isConnected).toBe(true);
    const changes: number[] = [];
    host.onChange(() => changes.push(1));
    host.unmount();
    expect(host.view.isConnected).toBe(false);
    expect(box.children.length).toBe(0);
    expect(() => host.unmount()).not.toThrow();
    expect(changes).toEqual([]);
  });
  it("host.mount-twice-into-one-box — cardinality: two hosts, two views, one container", () => {
    // Not forbidden and not merged: `mount` builds a host, and a caller that wants one is the
    // caller's business. What must hold is that neither host answers for the other's view —
    // the failure mode is the second unmount emptying the box the first is still drawing in.
    const box = container(600, 600);
    const a = mount(box, node("m1"));
    const b = mount(box, node("m2"));
    expect(box.children.length).toBe(2);
    a.unmount();
    expect(b.view.isConnected).toBe(true);
    expect(box.children.length).toBe(1);
    b.unmount();
    expect(box.children.length).toBe(0);
  });

  it("host.mount-unmount-repeats — time: fifty rounds leave nothing behind", () => {
    // A stress case, and the only kind a headless layer can honestly make: a listener kept, a
    // view left in the document or a container growing by one per round all show up as a
    // number that climbs. What it cannot see is GPU memory — that is `e2e.a-rebuild-does-not-
    // leak-a-context`, on real glass.
    const box = container(600, 600);
    for (let i = 0; i < 50; i += 1) {
      const host = mount(box, node(`m${i}-a`));
      host.onChange(() => undefined);
      host.setRoot(node(`m${i}-b`));
      host.unmount();
      expect(box.children.length).toBe(0);
    }
  });

  it("host.setRoot-after-unmount — exception path: the host is retired, not broken", () => {
    // Feeding a dead host is what a stale timer does — an animation frame that lands after the
    // page moved on. It must not throw and must not resurrect the view: throwing turns a benign
    // race into a crash, and reattaching would put a scene back on a page that discarded it.
    const box = container(600, 600);
    const host = mount(box, node("m50"));
    host.unmount();
    expect(() => host.setRoot(node("m51"))).not.toThrow();
    expect(box.children.length).toBe(0);
    expect(host.view.isConnected).toBe(false);
  });

  it("host.a-viewport-of-nothing — range: a zero-sized box divides by nothing", () => {
    // A container measures 0×0 before layout runs, and on a hidden tab it stays that way. The
    // etalon is a fraction of the SHORTER side, so this is where a division reaches zero — and
    // a NaN unit poisons every coordinate downstream, silently, as a blank canvas.
    const host = mount(container(0, 0), node("m60"));
    // The floor is one pixel, and the number matters: a viewport of zero makes the etalon zero,
    // and a unit of zero turns every world coordinate into a division by nothing. What reaches
    // the screen then is not an error — it is a blank canvas with no message.
    expect(host.viewport()).toMatchObject({ width: 1, height: 1 });
    // And the etalon has a floor of its own: a quarter of one pixel rounds to nothing, and an
    // etalon of nothing is a unit worth no pixels. That is not a crash — the plan guards its
    // division — it is every quad at zero scale, a blank canvas, and no complaint.
    expect(host.unit()).toBe(1);
    host.unmount();
  });
});
