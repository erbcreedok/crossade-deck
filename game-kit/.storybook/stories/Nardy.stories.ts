// LIVE NARDY — one board, two people, and no rules: the chess page's twin, with a different law of
// the place. A chess square holds one man; a nardy point holds a column of one colour and squeezes
// when it is tall. A hand takes the checker it touched and the whole column above it, the column
// stands in the hand as it stood on the point, and the picture of where it lands stands on TOP of the
// pile that is already there — the next seat of the point, asked of the point's own layout.
//
// The dice are the page's second half. Thrown beside the board they stay beside it; thrown on the
// board they stay on the board; and while a hand carries one it goes anywhere — the wall is the
// throw's, not the hand's (`wallsOf`).
import type { Meta, StoryObj } from "@storybook/html";
import { installStockCarries, installStockCoats, installStockMarkIcons, installStockMarks, t, type Node, type Vec } from "../../src/index.js";
import { type Mirror, grabScene } from "./gestureScene.js";
import { follow, type Screen } from "./liveScreens.js";
import { mayThrow, nardyMap, NARDY_BUMP, nardyRoom, NARDY_SEATS, NARDY_UNIT, pointUnder, runOf, seatsOf, settled, wallsOf } from "@game-presets/desks";
import { STACK_ARGS, STACK_KNOBS, type StackArgs } from "./gestureKnobs.js";
import { documented } from "./surfaceControls.js";
import { withAvatars } from "./avatars.js";

installStockCarries();
installStockCoats();
installStockMarks();
installStockMarkIcons();

const meta: Meta = {
  title: "Live/Nardy",
  parameters: { gkDoc: "nardy.component" },
};
export default meta;

const DOT = 18;

interface NardyArgs extends StackArgs {
  /** How far past its own edge a point still takes a checker, in units. `0` is a board. */
  reach: number;
  /** Whether the two people are drawn on the felt beside their own board. */
  avatars: boolean;
}

/**
 * WHERE A PERSON OPENS, in units off the middle — on the felt past the board's own long edge.
 *
 * A board is not a felt and no part of it is anybody's, so a disc standing ON the points would be a
 * checker the game has no word for. It stands on the border instead, on the side that player looks
 * from — the same place the dice are thrown beside.
 */
const SIDE = 7.5;

const REACH = documented("arg.pointReach", { control: { type: "number", min: 0, step: 0.05 } }, "nardy");
const AVATARS = documented("arg.avatars", { control: { type: "boolean" } }, "nardy");

/**
 * THE ONE SCENE BOTH STORIES STAND ON — they differ by whether anybody is sitting at the board.
 *
 * One render and not two, because the board is the same board: twenty-four points and two dice do
 * not change when a person walks up to them. What arrives with the people is the permanent half of
 * the message the cursor only ever gives while a hand is moving.
 */
function liveNardy(a: NardyArgs): HTMLElement {
    const wall = document.createElement("div");
    wall.style.cssText = "display:grid;grid-template-rows:1fr 1fr;gap:8px;height:100%;min-height:720px";
    const board = nardyMap(a.reach);
    const screens: Screen[] = [];
    const held = a.lifted ? a.lift : 1;
    const inks = Object.fromEntries(NARDY_SEATS.map(({ seat, ink }) => [seat, ink]));
    // NO HANDS ON A BOARD — the people and nothing else. A hand is a patch of felt a player owns,
    // and on a board every place belongs to the game rather than to anybody sitting at it.
    const people = a.avatars
      ? withAvatars({ desk: board, seats: NARDY_SEATS, screens, page: "nardy", at: (i) => ({ x: 0, y: i === 0 ? SIDE : -SIDE }), wall })
      : undefined;

    NARDY_SEATS.forEach(({ seat, ink }, i) => {
      const pane = document.createElement("div");
      pane.style.cssText = "position:relative;min-height:340px;overflow:hidden";
      pane.addEventListener("pointerdown", () => people?.claim(seat), true);
      const dot = document.createElement("div");
      dot.style.cssText =
        `position:absolute;z-index:4;width:${DOT}px;height:${DOT}px;border-radius:50%;pointer-events:none;` +
        `display:none;transform:translate(-50%,-50%);background:${t(ink)};box-shadow:0 0 0 2px ${t("sunkBg")}`;
      const mine: Screen = { seat, ink, dot };
      screens.push(mine);
      const others = (): Screen[] => screens.filter((one) => one !== mine);
      const mirror: Mirror = {
        ready: (s, grasp) => {
          mine.scene = s;
          mine.grasp = grasp;
          people?.publish();
        },
        changed: () => {
          for (const one of others()) one.grasp?.();
        },
        hand: (items, at, done, feel) => {
          for (const one of others()) follow(one, items, at, done, held, feel, mine.seat);
          people?.handed(seat, items, at, done);
        },
      };
      pane.appendChild(
        grabScene(
          a.physics,
          a.lifted ? a.lift : undefined,
          // A THROW IS ON, always: the dice are the whole reason the desk has a second half. What a
          // checker does when flicked is the chip's own way (`chipDrop`), a knob like any other.
          "throw",
          false,
          { w: a.gripWidth, min: a.gripMin, max: a.gripMax, miss: a.gripMiss },
          { card: a.cardDrop, chip: a.chipDrop, die: a.dieDrop },
          () => board,
          false,
          0,
          undefined,
          NARDY_BUMP,
          (root: Node, at: Vec, lead: Node) => pointUnder(root, at, lead),
          mirror,
          NARDY_UNIT,
          a.landing,
          nardyRoom(),
          seat,
          i === 0
            ? { marks: { inks, showOwn: false, me: seat } }
            : { marks: { inks, ttlMs: 5000, showOwn: false, me: seat } },
          { runOf, offsetOf: seatsOf, wallsOf, mayThrow, settled },
          undefined,
          // WHERE SOMEBODY IS LOOKING IS PART OF THIS DESK, so a view that moved is news.
          people ? () => people.publish() : undefined,
        ),
      );
      pane.appendChild(dot);
      wall.appendChild(pane);
    });
  return wall;
}

export const Nardy: StoryObj<NardyArgs> = {
  render: liveNardy,
  // THE LANDING PICTURE IS ON, unlike chess: on a point the picture is not the lit place, it is the
  // seat on top of the pile — and that is news, because a pile five deep lands a checker somewhere
  // the eye has to be shown.
  // A DIE SET DOWN KEEPS ITS FACE (`toss`): only a throw changes the number, so a die moved out of
  // the way is not a roll — and a player who sees the landing picture knows the drop is a drop.
  args: { ...STACK_ARGS, lifted: true, dropping: true, throwing: true, stacking: false, landing: true, reach: 0, dieDrop: "toss", avatars: false },
  argTypes: { ...STACK_KNOBS, reach: REACH },
  parameters: { gkDocStory: "nardy.scene" },
};

/**
 * NARDY · WITH AVATARS — the same board with the two players drawn beside it.
 *
 * The cursor says what a hand is DOING and says nothing while it is still: a board with a quiet
 * opponent is a board with one player at it. The disc is the other half of the message, and where it
 * stands is read out of that player's own camera — pan the top screen and their disc travels the
 * felt on the bottom one, which is exactly what "I am looking over here now" is.
 *
 * The state is on the disc. Switch to another tab and both go quiet with a muted mark; lift a column
 * of checkers and the holder's disc takes a ring. Drag your own disc and it stays where you left it.
 *
 * Turn `avatars` off and the board is the scene above.
 */
export const NardyWithAvatars: StoryObj<NardyArgs> = {
  name: "Nardy · with avatars",
  render: liveNardy,
  args: { ...STACK_ARGS, lifted: true, dropping: true, throwing: true, stacking: false, landing: true, reach: 0, dieDrop: "toss", avatars: true },
  argTypes: { ...STACK_KNOBS, reach: REACH, avatars: AVATARS },
  parameters: { gkDocStory: "nardy.avatars" },
};
