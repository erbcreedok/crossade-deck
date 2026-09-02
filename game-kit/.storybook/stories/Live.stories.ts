import type { Meta, StoryObj } from "@storybook/html";
import { installStockCarries, installStockCoats, installStockFlips, t, type CarryItem, type Vec } from "../../src/index.js";
import { type Mirror } from "./gestureScene.js";
import { liveMap, liveTune, LIVE_UNIT, SEATS } from "./liveMap.js";
import { type Scene } from "../devtools/scene.js";
import { MAGNET_ARGS, MAGNET_KNOBS, magnetScene, zoneSpread, type MagnetArgs } from "./magnetScene.js";

// LIVE — the same desk in front of two people, which is the one thing a mechanic cannot be tried
// against on a single screen.
//
// Its own section and not a scene under `Mechanics`, because it is not a mechanic. Everything here
// is the magnetism page's, unchanged and imported rather than restated: what this page adds is a
// second pair of eyes, and every seam it needs (`Mirror`) exists so that adding them changes nothing
// about the mechanic itself.

installStockCarries();
installStockCoats();
installStockFlips();

const meta: Meta = {
  title: "Live/Shared desk",
  parameters: { gkDoc: "live.component" },
};
export default meta;

/** How big another hand's cursor is drawn, in screen pixels. */
const DOT = 18;

/** One screen of the live desk: its seat, its colour, its scene once it exists, and its cursor. */
interface Screen {
  readonly seat: string;
  readonly ink: string;
  readonly dot: HTMLElement;
  scene?: Scene;
  /** Re-read the handles this screen did not draw — see `regrasp`. */
  grasp?: () => void;
  /** What this screen is currently mirroring for somebody else — started ONCE, then only steered. */
  mirroring?: readonly string[] | undefined;
}

/**
 * SHOW A HAND THAT IS NOT THIS SCREEN'S. Two things, and they are two because a cursor is a picture
 * of a PERSON and a carry is what their hand is doing to the desk.
 *
 * The carry is mirrored with the same three calls the local wiring makes, so what this screen draws
 * is a carry and not a picture of one: the card moves, leans and pops exactly as it does over there.
 * Without it the far screen shows a cursor gliding about and the card standing perfectly still.
 *
 * The cursor is drawn over the GLASS and never on the desk: a piece is what anything on the felt
 * would be — touchable, heapable, and in everybody's way.
 */
function follow(screen: Screen, items: readonly CarryItem[], at: Vec | undefined, done: boolean, lift: number): void {
  const s = screen.scene;
  if (!s) return;
  const ids = items.map((it) => it.id);
  if (done || !at) {
    for (const id of screen.mirroring ?? ids) s.motions?.release(id);
    screen.mirroring = undefined;
    screen.dot.style.display = "none";
    return;
  }
  const view = s.camera?.transform();
  if (view) {
    screen.dot.style.display = "block";
    screen.dot.style.left = `${view.a * at.x + view.c * at.y + view.e}px`;
    screen.dot.style.top = `${view.b * at.x + view.d * at.y + view.f}px`;
  }
  // STARTED ONCE, THEN ONLY STEERED. A carry begun again on every pointer-move is a carry that
  // never gets past its own first frame: the springs are re-seeded at the anchor each time, so the
  // run stops trailing, stops leaning, and — with a heap of thirty-six under one handle — spends
  // every frame building thirty-six records to throw away. That is what made carrying the deck hang.
  if (screen.mirroring?.length !== ids.length || screen.mirroring.some((id, i) => id !== ids[i])) {
    for (const id of screen.mirroring ?? []) s.motions?.release(id);
    screen.mirroring = [...ids];
    // THE SAME SHAPE, not the same names: laid out by the offsets the other hand is holding it at,
    // or a deck of thirty-six arrives here as one card sitting on the anchor.
    s.motions?.grab(items, { anchor: at, lift });
  }
  s.motions?.dragTo(at);
}

/**
 * LIVE — one desk, two screens, and everything the page above does.
 *
 * The same magnetism, the same handles, the same fan: it is not a second mechanic, it is the first
 * one with somebody else looking at it. Drag a card on the top screen and it moves on the bottom one
 * WHILE YOU ARE STILL HOLDING IT; take the hand by its handle and both screens see it come up as a
 * fan; let go near an area and both see it line up.
 *
 * TWO HOSTS OVER ONE TREE is what two people at one board ARE, and it needs exactly two things said.
 * A host is only ever told by being TOLD, so a change made here is announced to the other. And a
 * carry is an OVERRIDE and never a tree write, so a hand moving here would be invisible over there
 * unless it is reported and mirrored.
 *
 * NO MAGNET HERE, and that is the point of having both pages. A magnet decides where a release
 * BELONGS; this desk lets a piece stay exactly where it was let go of, and an area only gathers what
 * is lying in it when somebody picks it up by its handle. Which is what a real table does: cards go
 * where you put them, and a hand is squared up when a hand is taken.
 *
 * NO VISIBILITY RULES either. Hiding is real and the kit does it, but it is a second subject: with
 * cards hidden, a reader watching one screen cannot tell "they have not moved" from "they moved
 * something I may not see".
 */
export const Live: StoryObj<MagnetArgs> = {
  render: (a) => {
    const wall = document.createElement("div");
    wall.style.cssText = "display:grid;grid-template-rows:1fr 1fr;gap:8px;height:100%;min-height:520px";
    // ONE DESK. Not a copy each: the tree IS the board, and two screens reading two trees would be
    // two boards that happened to agree at the start.
    const desk = liveMap(a.pull, zoneSpread(a));
    const screens: Screen[] = [];
    const held = a.lifted ? a.lift : 1;

    for (const { seat, ink } of SEATS) {
      const pane = document.createElement("div");
      pane.style.cssText = "position:relative;min-height:240px;overflow:hidden";
      const dot = document.createElement("div");
      dot.style.cssText =
        `position:absolute;z-index:4;width:${DOT}px;height:${DOT}px;border-radius:50%;pointer-events:none;` +
        `display:none;transform:translate(-50%,-50%);background:${t(ink)};box-shadow:0 0 0 2px ${t("sunkBg")}`;
      const mine: Screen = { seat, ink, dot };
      screens.push(mine);
      const others = (): Screen[] => screens.filter((one) => one !== mine);
      pane.appendChild(
        magnetScene(a, () => desk, liveTune(a.pull, zoneSpread(a)), {
          ready: (s, grasp) => {
            mine.scene = s;
            mine.grasp = grasp;
          },
          // EVERY OTHER SCREEN, told. A host is only ever told by being told.
          // EVERY OTHER SCREEN, told — and told to re-READ the handles rather than redraw them.
          // Two screens both redrawing the tabs destroy each other's: the map each kept then points
          // at ids no longer in the tree, and a handle sails off across the desk carrying nothing.
          changed: () => {
            for (const one of others()) one.grasp?.();
          },
          hand: (items, at, done) => {
            for (const one of others()) follow(one, items, at, done, held);
          },
        }, LIVE_UNIT),
      );
      pane.appendChild(dot);
      wall.appendChild(pane);
    }
    return wall;
  },
  // NO PULL, AND THAT IS WHAT "no magnetism here" MEANS — not that the areas are scenery.
  //
  // An area takes what is put ON it and nothing that merely lands near it: a card let go of over
  // your own patch goes in, a card let go of beside it stays on the felt. The reach is what turns
  // that into magnetism, and this page sets it to nothing — raise the knob and the magnetism page's
  // behaviour is back, which is the honest way for a switch to be off.
  //
  // Zones OFF entirely was the previous answer, and it went too far: with nothing to ask, no card
  // could enter an area at all, and the areas were two boxes that could not be used or lit.
  args: { ...MAGNET_ARGS, pull: 0 },
  argTypes: { ...MAGNET_KNOBS },
  parameters: { gkDocStory: "live.scene" },
};
