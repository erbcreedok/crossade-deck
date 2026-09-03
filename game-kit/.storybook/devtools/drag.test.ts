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
  Acceptor,
  capture,
  add,
  Bounded,
  Container,
  compose,
  Displacer,
  Draggable,
  byId,
  fieldsOf,
  FLING,
  Grabber,
  Inviting,
  NO_COAT,
  freeLayout,
  node,
  rect,
  registerLayout,
  installStockGrabs,
  installStockOccupied,
  registerOccupied,
  Surfaced,
  Transformable,
  type CoatedFields,
  type Mark,
  type Node,
  type Painter,
  type Quad,
  type TransformableFields,
  type Vec,
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
const finger = (type: string, x: number, y: number, ms?: number): MouseEvent => {
  const e = Object.assign(new MouseEvent(type, { clientX: x, clientY: y }), { pointerId: 1 });
  // `timeStamp` is read-only on a real Event, and the wiring reads it to know how fast a hand moved.
  if (ms !== undefined) Object.defineProperty(e, "timeStamp", { value: ms, configurable: true });
  return e;
};

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


  it("drag.the-zone-a-run-came-from-is-asked-with-the-rest — and the scene may refuse it", () => {
    // A zone that reaches for a card it just gave up is a zone nothing can be taken out of: pull a
    // card clear and let go, and you are still within its pull — you always are, that is what a pull
    // IS — so it takes the card straight back. With two areas near each other the card just hops
    // between them and there is nowhere on the desk to put anything down.
    //
    // The wiring cannot know that: which zone a release belongs to is the scene's answer
    // (`zoneAt`), and so is "not that one". What is pinned here is that the scene GETS the question
    // with everything it needs to answer it — the point AND the piece — on every release.
    const root = desk();
    const s = scene(root, { animate: true });
    document.body.appendChild(s.el);
    measure(s.el);
    const asked: string[] = [];
    wireDrag(s, {
      zoneAt: (_root, _at, lead) => {
        asked.push(lead.id);
        return undefined; // the scene refuses: nothing takes this release
      },
    });
    s.host.view.dispatchEvent(finger("pointerdown", 0, 0));
    s.host.view.dispatchEvent(finger("pointermove", 120, 0));
    s.host.view.dispatchEvent(finger("pointerup", 120, 0));
    // TWICE, AND ABOUT THE PIECE BOTH TIMES: once while the hand is moving, because the zone that
    // would take it lights up so a player can aim (`aimAt`, falling back to this), and once when the
    // hand lets go. What is pinned is WHAT it is asked about — the piece, never the point alone.
    expect(new Set(asked), "always about the piece").toEqual(new Set(["card"]));
    expect(asked.length, "the carry's aim, then the release").toBe(2);
    // ...and a refused release is the ordinary one: the piece stays where the finger left it.
    expect(seatOf(root.children[0]!).x).not.toBe(0);
    s.dispose();
  });

  it("drag.the-zone-that-would-take-it-says-so-while-there-is-time-to-aim", () => {
    // A zone may reach past its own border, so the border cannot answer "have I got there yet":
    // carried across the felt, a player has only their own guess, and finds out they missed by
    // missing. So the zone that would take the release wears its aim coat WHILE the hand is up.
    //
    // LIT BY THE VERY ANSWER THE RELEASE WILL USE. A light with its own idea of near enough is
    // worse than no light: it promises a zone that then does not take the card, and a reader
    // believes the light over the outcome.
    const root = desk();
    const zone = node(
      "zone",
      Bounded({ bounds: rect(2, 2) }),
      Container({ layout: "story.drag.free" }),
      Transformable({ at: { x: 2, y: 0 } }),
      Acceptor({}),
      Inviting({ coat: NO_COAT, keen: { recipe: "wash", level: 0.3, tint: "accent" } }),
    );
    add(root, zone);
    const s = scene(root, { animate: true });
    document.body.appendChild(s.el);
    measure(s.el);
    let near = false;
    wireDrag(s, { zoneAt: () => (near ? zone : undefined) });
    const worn = (): string => fieldsOf<CoatedFields>(zone, "Coated")?.self.recipe ?? "";
    s.host.view.dispatchEvent(finger("pointerdown", 0, 0));
    s.host.view.dispatchEvent(finger("pointermove", 40, 0));
    expect(worn(), "not there yet, and the zone says nothing").toBe("");
    near = true;
    s.host.view.dispatchEvent(finger("pointermove", 120, 0));
    expect(worn(), "over it now — this is the one that takes it").toBe("wash");
    // ...AND OUT AGAIN when the answer changes back, which is the half a light usually gets wrong.
    near = false;
    s.host.view.dispatchEvent(finger("pointermove", 160, 0));
    expect(worn(), "aimed away, so the promise is withdrawn").toBe("");
    near = true;
    s.host.view.dispatchEvent(finger("pointermove", 120, 0));
    s.host.view.dispatchEvent(finger("pointerup", 120, 0));
    expect(worn(), "the hand is off: a lit zone over an empty felt is a lie").toBe("");
    s.dispose();
  });

  it("drag.the-hand-is-measured-where-the-hand-is — pixels a second, and a pause is a stop", () => {
    // A finger's speed on a screen is a thing that is simply KNOWN: two points and the time between
    // them. What the desk used to get instead was three conversions deep — the finger's pixels
    // divided by the scale to become units, fed to a chase spring, the SPRING'S velocity read
    // instead of the hand's, and multiplied back out through the camera. Every one of those is a
    // place to be wrong by a factor nobody can see on the glass.
    const root = desk();
    const s = scene(root, { animate: true });
    document.body.appendChild(s.el);
    measure(s.el);
    const swings: (Vec | undefined)[] = [];
    wireDrag(s, { onRelease: (v) => { swings.push(v); return true; } });

    // A HAND THAT KEEPS GOING: 75 glass pixels every 50ms is 1500 a second, and the number handed
    // over says so — in PIXELS, not in units of somebody's desk.
    //
    // Within a hair rather than exactly: half of each new sample is taken (`FLING.smoothing`), so a
    // steady hand is approached and never quite reached — which is the point of it. One jittery
    // frame must not become the throw.
    s.host.view.dispatchEvent(finger("pointerdown", 0, 0, 0));
    for (let i = 1; i <= 8; i++) s.host.view.dispatchEvent(finger("pointermove", i * 75, 0, i * 50));
    s.host.view.dispatchEvent(finger("pointerup", 600, 0, 400));
    expect(swings[0]!.x, "the finger's own speed, in pixels a second").toBeGreaterThan(1500 * 0.99);
    expect(swings[0]!.x).toBeLessThanOrEqual(1500);

    // ...AND A HAND THAT STOPPED. Carry a card, pause over the spot, let go: that is a putting-down,
    // and it must not inherit the speed the hand had on the way there. Past the kit's own gap a
    // finger is at rest, not moving slowly.
    s.host.view.dispatchEvent(finger("pointerdown", 0, 0, 1000));
    for (let i = 1; i <= 8; i++) s.host.view.dispatchEvent(finger("pointermove", i * 75, 0, 1000 + i * 50));
    s.host.view.dispatchEvent(finger("pointerup", 600, 0, 1400 + FLING.maxGap * 1000 + 20));
    expect(Math.hypot(swings[1]!.x, swings[1]!.y), "a pause before letting go is a putting-down").toBe(0);
    s.dispose();
  });

  it("drag.the-sitter-goes-where-the-plan-says — a capture is a thing the runtime DOES", () => {
    // The plan has carried this since the kit had places at all, and its own comment calls it
    // "opaque plan data for the RUNTIME": the seam decides it, and something has to DO it. Nothing
    // did. A board declaring that a man landing on an occupied square takes the sitter got two men
    // on one square instead — which is not a capture, and not even a bug you can see until the
    // second one moves.
    const root = desk();
    installStockGrabs();
    installStockOccupied();
    registerLayout("drag.cell", freeLayout);
    registerOccupied("drag.taken", capture("tray"));
    // A CONTAINER SAYS WHAT A TOUCH TAKES OUT OF IT, or the move is denied before any zone is asked:
    // the plan starts by asking the SOURCE for its load, and a container with no `Grabber` hands
    // back nothing at all.
    compose(root, Grabber({ grab: "one" }));
    const cell = node(
      "cell",
      Bounded({ bounds: rect(1, 1) }),
      Container({ layout: "drag.cell" }),
      Transformable({ at: { x: 2, y: 0 } }),
      Acceptor({}),
      Grabber({ grab: "one" }),
      Displacer({ occupied: "drag.taken" }),
    );
    const tray = node(
      "tray",
      Bounded({ bounds: rect(2, 2) }),
      Container({ layout: "drag.cell" }),
      Transformable({ at: { x: 5, y: 0 } }),
      Acceptor({}),
    );
    const sitter = node("sitter", Bounded({ bounds: rect(1, 1) }), Surfaced(), Transformable({ at: { x: 0, y: 0 } }), Draggable());
    add(cell, sitter);
    add(root, cell);
    add(root, tray);
    const s = scene(root, { animate: true });
    document.body.appendChild(s.el);
    measure(s.el);
    wireDrag(s, { zoneAt: () => cell });
    // The card is dragged onto the occupied cell.
    s.host.view.dispatchEvent(finger("pointerdown", 0, 0, 0));
    s.host.view.dispatchEvent(finger("pointermove", 60, 0, 50));
    s.host.view.dispatchEvent(finger("pointerup", 60, 0, 60));
    expect(byId(root, "card")?.parent?.id, "the man who arrived takes the square").toBe("cell");
    expect(sitter.parent?.id, "and the man who was there goes where the plan said").toBe("tray");
    // ...AND HE IS PUT DOWN IN IT, not left standing on the square he was taken from. A free zone
    // lays nothing out, so a sitter who kept his own seat would still be on the board.
    // The first man taken stands in the tray's first place — not at the seat he had on the square,
    // which a free zone would have left him holding, and which is a seat on the BOARD.
    const at = fieldsOf<TransformableFields>(sitter, "Transformable")!.at!;
    expect(at.x, "put down IN the tray, in its first place").toBeCloseTo(-0.75, 9);
    expect(at.y).toBeCloseTo(-0.75, 9);
    s.dispose();
  });

});
