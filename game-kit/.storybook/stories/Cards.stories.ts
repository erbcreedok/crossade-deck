import type { Meta, StoryObj } from "@storybook/html";
import {
  grippableBy,
  installStockCarries,
  installStockCoats,
  installStockFlips,
  installStockMarkIcons,
  installStockMarks,
  t,
  type Node,
  type Vec,
} from "../../src/index.js";
import { type Mirror, grabScene } from "./gestureScene.js";
import { zoneNear } from "./magnetMap.js";
import { follow, type Screen } from "./liveScreens.js";
import { handTakes, isHand, LIVE_UNIT, ROUND_R, roundMap, roundRoom, SEATS } from "@game-presets/desks";
import { STACK_ARGS, STACK_KNOBS, type StackArgs } from "./gestureKnobs.js";
import { documented } from "./surfaceControls.js";
import { withAvatars } from "./avatars.js";

// LIVE — the same desk in front of two people, which is the one thing a mechanic cannot be tried
// against on a single screen.
//
// Its own section and not a scene under `Mechanics`, because it is not a mechanic. Everything here
// is the pages above's, unchanged and imported rather than restated: what this page adds is a
// second pair of eyes, and every seam it needs (`Mirror`) exists so that adding them changes nothing
// about the mechanic itself.
//
// A ROUND TABLE AND NO ANONYMOUS AREAS. Two boxes at two fixed points were places the DESK decided
// on, and a player was whoever happened to be nearest one — which is backwards: where somebody sits
// is read out of their own camera, and can be anywhere on the rim. So the felt has no zones at all
// (`roundMap`), and the second scene gives every PERSON a hand instead (`handZone`), standing where
// that person stands.

installStockCarries();
installStockCoats();
installStockFlips();
// The marks a live desk writes, and their glyphs: without the glyphs the badge is a blank disc.
installStockMarks();
installStockMarkIcons();

const meta: Meta = {
  title: "Live/Cards",
  parameters: { gkDoc: "liveCards.component" },
};
export default meta;

/** How big another hand's cursor is drawn, in screen pixels. */
const DOT = 18;

/** How far off the middle each reader's own disc opens, in units — one a side, on the rim. */
const SIDE = ROUND_R - 1;

interface CardsArgs extends StackArgs {
  /** Whether the people are at this desk at all — and with them, their hands. */
  avatars: boolean;
}

const AVATARS = documented("arg.avatars", { control: { type: "boolean" } }, "liveCards");

/**
 * THE ONE SCENE BOTH STORIES STAND ON — they differ by whether anybody is sitting at the desk.
 *
 * One render and not two, because the desk is the same desk: the felt, the deck and the carry do
 * not change when a person walks up to the table. What arrives with the people is the hand each of
 * them has (`roundMap` seats one per place) and the wiring that keeps it beside them.
 */
function liveCards(a: CardsArgs): HTMLElement {
  const wall = document.createElement("div");
  wall.style.cssText = "display:grid;grid-template-rows:1fr 1fr;gap:8px;height:100%;min-height:640px";
  // ONE DESK. Not a copy each: the tree IS the desk, and two screens reading two trees would be
  // two desks that happened to agree at the start.
  //
  // NO SEATS WITHOUT PEOPLE. A hand is a place a PLAYER has, so a desk nobody is sitting at is the
  // felt and the deck and nothing else — an empty patch belonging to somebody who is not here would
  // be the fixed box this page was built to be rid of.
  const desk = roundMap(a.avatars ? SEATS : []);
  const screens: Screen[] = [];
  const held = a.lifted ? a.lift : 1;
  const inks = Object.fromEntries(SEATS.map(({ seat, ink }) => [seat, ink]));
  const people = a.avatars
    ? withAvatars({ desk, seats: SEATS, screens, page: "liveCards", at: (i) => ({ x: 0, y: i === 0 ? SIDE : -SIDE }), hands: ROUND_R, wall })
    : undefined;

  SEATS.forEach(({ seat, ink }, i) => {
    const pane = document.createElement("div");
    pane.style.cssText = "position:relative;min-height:300px;overflow:hidden";
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
      // EVERY OTHER SCREEN, told — and told to re-READ the handles rather than redraw them.
      // Two screens both redrawing the tabs destroy each other's: the map each kept then points
      // at ids no longer in the tree, and a handle sails off across the desk carrying nothing.
      changed: () => {
        people?.settled();
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
        a.dropping ? (a.throwing ? "throw" : "drop") : undefined,
        false,
        { w: a.gripWidth, min: a.gripMin, max: a.gripMax, miss: a.gripMiss },
        { card: a.cardDrop, chip: a.chipDrop, die: a.dieDrop },
        () => desk,
        // A TAP HAS TO REACH THIS PAGE AT ALL, and it only does on a desk that answers one. What
        // it does with a card is turn it over, which is the right thing at a card table anyway.
        true,
        0,
        undefined,
        undefined,
        // THE ZONE A RELEASE BELONGS TO — the nearest hand within reach, AND ONLY IF IT WOULD TAKE
        // IT FROM THIS SEAT. One question asked once: a zone the drop is going to refuse must not
        // light up inviting the card first, and both the light and the drop read this line. With
        // nobody at the desk there are no hands, and no release belongs to anywhere.
        a.avatars
          ? (root: Node, at: Vec, lead: Node) => {
              const zone = zoneNear(root, at, lead);
              return zone && isHand(zone) && handTakes(zone, lead, seat) ? zone : undefined;
            }
          : undefined,
        mirror,
        LIVE_UNIT,
        a.landing,
        roundRoom(),
        seat,
        // NEVER ONE'S OWN. A mark is for the player who looked away; the hand that made the
        // move watched it. Showing it to its own author left the top screen wearing every mark
        // it ever earned, with nothing to ever take one off. The two screens differ only in
        // how long somebody ELSE'S mark lives: forever, until overwritten — or five seconds.
        i === 0
          ? { marks: { inks, showOwn: false, me: seat } }
          : { marks: { inks, ttlMs: 5000, showOwn: false, me: seat } },
        undefined,
        // THE TWO SEATS LOOK AT THE DESK FROM OPPOSITE SIDES, which is what makes a hand beside a
        // person worth drawing: each reader's own patch is the one nearest them.
        seat === SEATS[1]!.seat ? 180 : undefined,
        // WHERE SOMEBODY IS LOOKING IS PART OF THIS DESK, so a view that moved is news.
        people ? () => people.publish() : undefined,
        // A SHUT HAND CANNOT BE REACHED INTO. Refused at the PICK and not at the drop, because
        // what a shut hand refuses is the gesture ever starting — a card that lifted out and flew
        // back would read as the desk having dropped it.
        (n: Node) => grippableBy(n, seat),
        (piece: Node) => people?.tapped(seat, piece) === true,
        people ? () => people.settled() : undefined,
      ),
    );
    pane.appendChild(dot);
    wall.appendChild(pane);
  });
  return wall;
}

/**
 * CARDS — one round table, two screens, and everything the pages above do.
 *
 * The same handles, the same fan, the same carry: it is not a second mechanic, it is the first one
 * with somebody else looking at it. Drag a card on the top screen and it moves on the bottom one
 * WHILE YOU ARE STILL HOLDING IT; take a heap by its handle and both screens see it come up.
 *
 * TWO HOSTS OVER ONE TREE is what two people at one board ARE, and it needs exactly two things said.
 * A host is only ever told by being TOLD, so a change made here is announced to the other. And a
 * carry is an OVERRIDE and never a tree write, so a hand moving here would be invisible over there
 * unless it is reported and mirrored.
 *
 * NOBODY AT THE TABLE, and that is the whole of what this scene is. A card goes where it was let go
 * of and stays there — there is no area to fall into, because an area on a felt is a place the desk
 * invented and this desk has none. The scene below adds the people, and with them the only places
 * this table has: their hands.
 *
 * NO VISIBILITY RULES either. Hiding is real and the kit does it, but it is a second subject: with
 * cards hidden, a reader watching one screen cannot tell "they have not moved" from "they moved
 * something I may not see".
 */
export const Cards: StoryObj<CardsArgs> = {
  render: liveCards,
  args: { ...STACK_ARGS, lifted: true, dropping: true, throwing: false, stacking: false, landing: false, avatars: false },
  argTypes: { ...STACK_KNOBS },
  parameters: { gkDocStory: "liveCards.scene" },
};

/**
 * CARDS · WITH AVATARS — the same table with the two people drawn ON it, and a hand each.
 *
 * Every other live page shows what somebody's hand is DOING and nothing about the person doing it:
 * the cursor appears when they move and is gone the moment they stop. The disc is the permanent
 * half of that message, and where it stands is read out of that reader's own camera.
 *
 * AND THE HAND FOLLOWS THE PERSON. Deal to yourself and to the other player — take a card off the
 * deck and let it go over either patch: it goes in, on both screens, and the patch grows to hold it.
 * Drag your own disc and your hand travels with it, changing sides when the side it was on runs out
 * of table. Tap your own disc and the hand shuts: washed in your colour, it takes nothing from
 * anybody else and gives nothing up to them, and from its OWN screen nothing has changed.
 *
 * Turn `avatars` off and the desk is the scene above — no people, and therefore no hands.
 */
export const CardsWithAvatars: StoryObj<CardsArgs> = {
  name: "Cards · with avatars",
  render: liveCards,
  args: { ...STACK_ARGS, lifted: true, dropping: true, throwing: false, stacking: false, landing: false, avatars: true },
  argTypes: { ...STACK_KNOBS, avatars: AVATARS },
  parameters: { gkDocStory: "liveCards.avatars" },
};
