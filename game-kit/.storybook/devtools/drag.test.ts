// @vitest-environment jsdom
//
// THE CATALOG'S DRAG WIRING — the order things happen in when a gesture ends.
//
// The pick, the springs and the drop rules are the kit's and are tested there. What is only ever
// true HERE is the sequence: which callback sees which tree. It shipped wrong once — the handles of
// the stacking desk were redrawn from the seats the pieces had BEFORE they were put down — and that
// is not a bug any assertion about geometry could have caught.

import { beforeEach, describe, expect, it } from "vitest";
import {
  add,
  Bounded,
  Container,
  Draggable,
  fieldsOf,
  freeLayout,
  node,
  rect,
  registerLayout,
  Surfaced,
  Transformable,
  type Mark,
  type Node,
  type Painter,
  type Quad,
  type TransformableFields,
} from "../../src/index.js";
import { currentSettings } from "./catalogSettings.js";
import { HUD_UNIT_CHOICES } from "./hudUnitChoices.js";
import { scene as buildScene } from "./scene.js";
import { wireDrag } from "./drag.js";

/** An etalon, or a jsdom viewport of nothing has nothing to hit — the shell's own tests do this. */
function measure(el: HTMLElement): void {
  const select = el.querySelector("[data-hud-unit]") as HTMLSelectElement;
  select.value = String(HUD_UNIT_CHOICES.find((c) => c === 60) ?? "auto");
  select.dispatchEvent(new Event("change"));
}

function stubPainter(): Painter {
  return { ready: Promise.resolve(), draw: () => {}, resize: () => {}, destroy: () => {} };
}
const scene: typeof buildScene = (root, options = {}, settings = currentSettings()) =>
  buildScene(root, options, settings, stubPainter);

/** jsdom has no `PointerEvent`; a mouse event of that type carries everything the wiring reads. */
const finger = (type: string, x: number, y: number): MouseEvent =>
  Object.assign(new MouseEvent(type, { clientX: x, clientY: y }), { pointerId: 1 });

const seatOf = (n: Node): { x: number; y: number } => fieldsOf<TransformableFields>(n, "Transformable")!.at!;

function desk(): Node {
  registerLayout("drag.free", freeLayout);
  const root = node("desk", Container({ layout: "drag.free" }));
  add(root, node("card", Bounded({ bounds: rect(1, 1) }), Surfaced(), Transformable({ at: { x: 0, y: 0 } }), Draggable({ onReject: "stay" })));
  return root;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("the drag wiring's order", () => {
  it("drag.settled-sees-the-written-tree — and the carry's `done` does not", () => {
    // `onCarry`'s `done` is the HAND finishing, which happens before the drop has been decided, let
    // alone written. A scene that redrew from the tree there is reading yesterday's seats.
    const root = desk();
    const s = scene(root, { animate: true });
    document.body.appendChild(s.el);
    measure(s.el);
    let atDone: { x: number; y: number } | undefined;
    let atSettled: { x: number; y: number } | undefined;
    let settledCount = 0;
    let settledIds: string[] = [];
    wireDrag(s, {
      onCarry: ({ done }) => {
        if (done) atDone = { ...seatOf(s.host.root.children[0]!) };
      },
      onSettled: (tree, ids) => {
        settledCount++;
        settledIds = [...ids];
        atSettled = { ...seatOf(tree.children[0]!) };
      },
    });
    s.host.view.dispatchEvent(finger("pointerdown", 0, 0));
    s.host.view.dispatchEvent(finger("pointermove", 120, 0));
    s.host.view.dispatchEvent(finger("pointerup", 120, 0));
    // The hand's own report still says where the card WAS — that is what a carry is.
    expect(atDone).toEqual({ x: 0, y: 0 });
    // The settled report says where it now lives, which is the only thing a redraw can use.
    expect(atSettled!.x).not.toBe(0);
    expect(atSettled).toEqual(seatOf(s.host.root.children[0]!));
    // Once per gesture, and not once per pointer event...
    expect(settledCount).toBe(1);
    // ...and it says WHICH pieces arrived. "What just landed" is a different question from "what is
    // on the desk", and a scene that has to put the newest one in front needs the first.
    expect(settledIds).toEqual(["card"]);
    s.dispose();
  });

});
