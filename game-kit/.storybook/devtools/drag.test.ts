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

  it("drag.a-gesture-reports-itself-once — a tap, or a carry, never both and never neither", () => {
    // They are the SAME gesture until it ends: the same finger on the same piece, told apart only by
    // how far it went and how long it stayed. Wired as two listeners they would both fire and the
    // scene would be left refereeing them — which is the branch the seam exists to not have. And a
    // tap is not a drop: the piece never went anywhere, so there is nothing to put down.
    const root = desk();
    const s = scene(root, { animate: true });
    document.body.appendChild(s.el);
    measure(s.el);
    const heard: string[] = [];
    wireDrag(s, { onTap: (p) => heard.push(`tap:${p.id}`), onSettled: (_r, ids) => heard.push(`drop:${ids.join()}`) });
    const seat = { ...seatOf(root.children[0]!) };
    const press = (type: string, x: number, y: number, ms: number): void => {
      const e = finger(type, x, y);
      Object.defineProperty(e, "timeStamp", { value: ms });
      s.host.view.dispatchEvent(e);
    };

    // A TAP: down and up on the same spot, at once.
    press("pointerdown", 0, 0, 0);
    press("pointerup", 2, 1, 90);
    expect(heard).toEqual(["tap:card"]);
    expect(seatOf(root.children[0]!), "and it left the piece exactly where it was").toEqual(seat);

    // A HOLD: it never went anywhere either, but it STAYED — so it is not a tap.
    heard.length = 0;
    press("pointerdown", 0, 0, 200);
    press("pointerup", 1, 0, 1400);
    expect(heard).toEqual(["drop:card"]);

    // A CARRY: the same finger, gone somewhere.
    heard.length = 0;
    press("pointerdown", 0, 0, 2000);
    press("pointermove", 140, 0, 2030);
    press("pointerup", 140, 0, 2060);
    expect(heard).toEqual(["drop:card"]);
    s.dispose();
  });


  it("drag.a-release-the-scene-took-is-never-announced — the wiring reports its OWN drops", () => {
    // `onRelease` says "I have taken these", and the wiring then does nothing else at all — not the
    // seats, not the re-parent, and not `onSettled`. That is right: a scene that took the drop knows
    // what it did, and being told about it afterwards would be the wiring reporting somebody else's
    // work as its own.
    //
    // It is worth pinning because it is the trap on the other side: anything a desk hangs off
    // `onSettled` — squaring up what a place was given, redrawing handles — simply does not happen
    // on a release the scene took, and the scene has to do it itself at the end of its own fall.
    const heard: string[] = [];
    const s = scene(desk(), { animate: true });
    document.body.appendChild(s.el);
    measure(s.el);
    wireDrag(s, { onRelease: () => (heard.push("took"), true), onSettled: () => heard.push("announced") });
    s.host.view.dispatchEvent(finger("pointerdown", 0, 0));
    s.host.view.dispatchEvent(finger("pointermove", 120, 0));
    s.host.view.dispatchEvent(finger("pointerup", 120, 0));
    expect(heard).toEqual(["took"]);
    s.dispose();

    // ...and a scene that does NOT take it is told, which is the path every other desk is on.
    heard.length = 0;
    const s2 = scene(desk(), { animate: true });
    document.body.appendChild(s2.el);
    measure(s2.el);
    wireDrag(s2, { onRelease: () => false, onSettled: () => heard.push("announced") });
    s2.host.view.dispatchEvent(finger("pointerdown", 0, 0));
    s2.host.view.dispatchEvent(finger("pointermove", 120, 0));
    s2.host.view.dispatchEvent(finger("pointerup", 120, 0));
    expect(heard).toEqual(["announced"]);
    s2.dispose();
  });


  it("drag.a-taken-release-never-reports-the-hand-letting-go — the scene must say it itself", () => {
    // `onCarry` with `done` comes from inside the wiring's OWN drop, and a release the scene TAKES
    // never reaches it: `onRelease` answers true and the drop is skipped entirely. Anything a desk
    // hangs off that report simply does not happen — which on a shared desk means the other screen
    // goes on holding a card that was thrown a minute ago, lifted and leaning, following a finger
    // that let go.
    const heard: string[] = [];
    const s = scene(desk(), { animate: true });
    document.body.appendChild(s.el);
    measure(s.el);
    wireDrag(s, {
      onRelease: () => true,
      onCarry: ({ done }) => heard.push(done ? "let go" : "moving"),
    });
    s.host.view.dispatchEvent(finger("pointerdown", 0, 0));
    s.host.view.dispatchEvent(finger("pointermove", 120, 0));
    s.host.view.dispatchEvent(finger("pointerup", 120, 0));
    expect(heard, "the hand moved and was never reported to have stopped").toEqual(["moving"]);
    s.dispose();

    // ...and a release the scene does NOT take is reported, which is the ordinary path.
    heard.length = 0;
    const s2 = scene(desk(), { animate: true });
    document.body.appendChild(s2.el);
    measure(s2.el);
    wireDrag(s2, { onRelease: () => false, onCarry: ({ done }) => heard.push(done ? "let go" : "moving") });
    s2.host.view.dispatchEvent(finger("pointerdown", 0, 0));
    s2.host.view.dispatchEvent(finger("pointermove", 120, 0));
    s2.host.view.dispatchEvent(finger("pointerup", 120, 0));
    expect(heard.at(-1)).toBe("let go");
    s2.dispose();
  });

});
