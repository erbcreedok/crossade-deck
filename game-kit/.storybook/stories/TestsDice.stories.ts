import type { Meta, StoryObj } from "@storybook/html";
import { expect } from "@storybook/test";
import { add, apply, byId, Container, faceOf, freeLayout, node, registerLayout, Transformable, viewTransform, type Node, type Point } from "../../src/index.js";
import { die, throwDie } from "@game-presets/dice";
import { scene, type Scene } from "../devtools/scene.js";
import { checks, differs, imagesDiffer, painted, pixelAt, snapshot, standing, waitFor, type CheckContext } from "../devtools/checks.js";

// DICE ON THE GLASS. The add-on's unit suite proves a throw's arithmetic on a fake clock; this rung
// proves the desk shows it: a die thrown by script leaves its seat, comes to rest somewhere else,
// and shows the GIVEN face (the truth is read back off the node — the picture is the skin's); and
// two throws from the same seed land the same face, which is the whole promise of a seed.

const SEAT = { x: -2, y: 0 };

const meta: Meta = {
  title: "Tests/Dice",
  parameters: { gkDoc: "tests.dice" },
};
export default meta;

function desk(): Node {
  registerLayout("tests.dice.free", freeLayout);
  const d = node("desk", Container({ layout: "tests.dice.free" }));
  add(d, die("die", { kind: "d6", at: SEAT, face: 1 }));
  return d;
}

function spot(live: Scene, u: Point): { fx: number; fy: number } {
  const v = live.host.viewport();
  const g = apply(viewTransform(live.host.unit(), v.width, v.height), u);
  return { fx: g.x / v.width, fy: g.y / v.height };
}

async function calm(glass: HTMLCanvasElement): Promise<void> {
  let prev = snapshot(glass);
  let streak = 0;
  await waitFor(() => {
    const current = snapshot(glass);
    streak = imagesDiffer(prev, current) ? 0 : streak + 1;
    prev = current;
    return streak >= 4 ? true : null;
  }, "the glass never went quiet");
}

const view = async (ctx: CheckContext): Promise<HTMLCanvasElement> => painted(ctx);

export const Throw: StoryObj = {
  parameters: { gkDocStory: "tests.dice.throw" },
  render: () => scene(desk(), { animate: true, motion: { friction: 8 } }).el,
  play: checks([
    {
      name: "play.dice.script-throw-shows-the-given-face — the die leaves its seat, rests elsewhere, and reads the face the script gave",
      async run(ctx) {
        const glass = await view(ctx);
        const live = await standing(ctx);
        const bg = pixelAt(glass, 0.02, 0.02);
        const seat = spot(live, SEAT);
        await expect(differs(pixelAt(glass, seat.fx, seat.fy), bg), "the die rests at its seat").toBe(true);
        let rested: number | undefined;
        const d = byId(live.host.root, "die")!;
        const face = throwDie(live.motions!, live.host.root, d, { speed: 5, angle: 0, spin: 540, outcome: 4, onRest: (f) => { rested = f; } });
        await expect(face).toBe(4);
        await waitFor(() => (rested !== undefined ? true : null), "the die never came to rest", 6000);
        await calm(glass);
        // The truth is the given number, on the node itself; the seat it left is bare desk.
        await expect(faceOf(byId(live.host.root, "die")!)).toBe(4);
        await expect(differs(pixelAt(glass, seat.fx, seat.fy), bg), "the die is still at its seat").toBe(false);
        // And it stayed where it stopped: the tree holds the landing, no settle followed.
        const at = (byId(live.host.root, "die")!.atoms.get("Transformable")!.fields as { at: Point }).at;
        await expect(at.x).toBeGreaterThan(SEAT.x + 0.5);
        const there = spot(live, at);
        await expect(differs(pixelAt(glass, there.fx, there.fy), bg), "the die is where the tree says").toBe(true);
      },
    },
    {
      name: "play.dice.rng-throw-is-seeded — two throws from one seed land one face",
      async run(ctx) {
        const live = await standing(ctx);
        const d = byId(live.host.root, "die")!;
        // The face is decided the moment the throw is asked — the same seed, the same face, before
        // any tumble plays; that is the agreement a shared desk stands on.
        const first = throwDie(live.motions!, live.host.root, d, { speed: 1, angle: 90, outcome: { seed: 2024 } });
        await calm(await view(ctx));
        const second = throwDie(live.motions!, live.host.root, d, { speed: 1, angle: 90, outcome: { seed: 2024 } });
        await expect(second).toBe(first);
        await calm(await view(ctx));
        await expect(faceOf(byId(live.host.root, "die")!)).toBe(first);
        // A different seed is allowed to differ — and does, for this one.
        const third = throwDie(live.motions!, live.host.root, d, { speed: 1, angle: 90, outcome: { seed: 7 } });
        await calm(await view(ctx));
        await expect([1, 2, 3, 4, 5, 6]).toContain(third);
      },
    },
  ]),
};
