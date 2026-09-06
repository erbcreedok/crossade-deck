import type { Meta, StoryObj } from "@storybook/html";
import {
  grippableBy,
  installStockCarries,
  installStockCoats,
  installStockFlips,
  installStockMarkIcons,
  installStockMarks,
  t,
  zoneNear,
  type Node,
  type Vec,
} from "../../src/index.js";
import { type Mirror, grabScene } from "./gestureScene.js";
import { follow, type Screen } from "./liveScreens.js";
import { handTakes, isHand, LIVE_UNIT, ROUND_R, roundMap, roundPlaces, roundRoom, SEATS } from "@game-presets/desks";
import { STACK_ARGS, STACK_KNOBS, type StackArgs } from "./gestureKnobs.js";
import { documented } from "./surfaceControls.js";
import { withAvatars } from "./avatars.js";

// LIVE / HANDS — every player's own patch of felt, standing where the player is.
//
// The areas on the live desk are places the DESK decided on: two boxes at two fixed points, and a
// player is whoever happens to be nearest one. On a round table there is nothing to be near — where
// somebody sits is read out of their own camera (`Live/Avatars`) and can be anywhere on the rim — so
// the hand is fastened to the PLACE. Drag your own chair and your hand goes with it, and it goes to
// whichever side of you has felt left before the edge.
//
// AND IT IS THE SIZE OF WHAT IS IN IT. Empty it is a mark; dealt to, it grows; past the width the
// desk can spare it stops growing and the cards close up instead. A fixed box would be a permanent
// hole in the middle of the table for a player holding nothing, which at a round desk is most
// players most of the time.
//
// EVERYBODY SEES EVERY HAND, face and all. Hiding is real and the kit does it, and it is a SECOND
// subject: with the cards hidden a reader watching one screen could not tell "they did nothing" from
// "they did something I may not see". What this page is about is the other half — who may REACH into
// a hand that is not theirs, and the answer is the owner's to give: tap your own chair and your hand
// shuts. Shut, it takes nothing from anybody else and gives nothing up to them, and it says so by
// being washed in your own colour.

installStockCarries();
installStockCoats();
installStockFlips();
installStockMarks();
installStockMarkIcons();

const meta: Meta = {
  title: "Live/Hands",
  parameters: { gkDoc: "hands.component" },
};
export default meta;

/** How big another hand's cursor is drawn, in screen pixels. */
const DOT = 18;

interface HandArgs extends StackArgs {
  /** Whether the bottom reader has shut their own hand. */
  lock: boolean;
}

const LOCK = documented("arg.handLock", { control: { type: "boolean" } }, "hands");

/**
 * HANDS — two people at a round table, each with a patch of felt of their own.
 *
 * Deal to yourself and to the other player: pick a card off the deck in the middle and let it go
 * over either hand. It goes in, on both screens, and the patch grows to hold it — including the
 * patch that is not yours, because a card put into somebody's hand is the ordinary thing a player at
 * a table does and there is no rule on this desk saying otherwise.
 *
 * Then turn the lock on. The bottom player's hand goes washed in their own colour, and from the top
 * screen it stops answering: a card let go of over it is not taken and comes back, and a card lying
 * in it cannot be picked up at all — the finger drives the camera instead. From the BOTTOM screen
 * nothing has changed, because the lock is about everybody else.
 *
 * NO SERVER. The two screens are two views of one tree, and the lock is a number on the zone rather
 * than a state in either screen — which is why they cannot disagree about whether it is on.
 */
export const Hands: StoryObj<HandArgs> = {
  render: (a) => {
    const wall = document.createElement("div");
    wall.style.cssText = "display:grid;grid-template-rows:1fr 1fr;gap:8px;height:100%;min-height:640px";
    // ONE DESK. Not a copy each: the tree IS the desk, and two screens reading two trees would be
    // two desks that happened to agree at the start.
    const desk = roundMap();
    const screens: Screen[] = [];
    const held = a.lifted ? a.lift : 1;
    const inks = Object.fromEntries(SEATS.map(({ seat, ink }) => [seat, ink]));
    const places = roundPlaces(SEATS.length);
    // THE PEOPLE, WIRED THE ONE WAY EVERY LIVE PAGE WIRES THEM (`avatars.ts`). A hand of one's own
    // is what this page is about, and where it stands is not: the ring is the place, the hand
    // stands beside the ring, and the disc is a reading of a camera that no finger reaches.
    const people = withAvatars({
      desk,
      seats: SEATS,
      screens,
      page: "hands",
      hands: ROUND_R,
      wall,
      places,
      // The bottom seat's lock opens from the knob; either is turned from then on by its own tap.
      locked: SEATS.map((_, i) => i === 1 && a.lock),
    });

    SEATS.forEach(({ seat, ink }, i) => {
      const pane = document.createElement("div");
      pane.style.cssText = "position:relative;min-height:300px;overflow:hidden";
      pane.addEventListener("pointerdown", () => people.claim(seat), true);
      const dot = document.createElement("div");
      dot.style.cssText =
        `position:absolute;z-index:4;width:${DOT}px;height:${DOT}px;border-radius:50%;pointer-events:none;` +
        `display:none;transform:translate(-50%,-50%);box-shadow:0 0 0 2px ${t("sunkBg")}`;
      const mineScreen: Screen = { seat, ink, dot };
      screens.push(mineScreen);
      const others = (): Screen[] => screens.filter((one) => one !== mineScreen);
      const mirror: Mirror = {
        ready: (s, grasp) => {
          mineScreen.scene = s;
          mineScreen.grasp = grasp;
          people.publish();
        },
        changed: () => {
          people.settled();
          for (const one of others()) one.grasp?.();
        },
        hand: (items, at, done, feel) => {
          // A CURSOR IS DRAWN IN THE INK OF WHOSE FINGER IT IS, and not of the pane it appears in:
          // the dot lives in the other screen's corner, but the person it is a picture of is this
          // one. Painted at its owner's end, so every mark of a seat is the one colour everywhere.
          for (const one of others()) {
            one.dot.style.background = t(ink);
            follow(one, items, at, done, held, feel, mineScreen.seat);
          }
          people.handed(seat, items, at, done);
        },
      };
      pane.appendChild(
        grabScene(
          a.physics,
          a.lifted ? a.lift : undefined,
          "drop",
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
          // light up inviting the card first, and both the light and the drop read this line.
          (root: Node, at: Vec, lead: Node) => {
            const zone = zoneNear(root, at, lead);
            return zone && isHand(zone) && handTakes(zone, lead, seat) ? zone : undefined;
          },
          mirror,
          LIVE_UNIT,
          a.landing,
          roundRoom(),
          seat,
          i === 0
            ? { marks: { inks, showOwn: false, me: seat } }
            : { marks: { inks, ttlMs: 5000, showOwn: false, me: seat } },
          undefined,
          // THE TWO SEATS LOOK AT THE DESK FROM OPPOSITE SIDES, which is what makes a hand beside a
          // person worth drawing: each reader's own patch is the one nearest them.
          seat === SEATS[1]!.seat ? 180 : undefined,
          () => people.publish(),
          // A SHUT HAND CANNOT BE REACHED INTO. Refused at the PICK and not at the drop, because
          // what a shut hand refuses is the gesture ever starting — a card that lifted out and flew
          // back would read as the desk having dropped it.
          (n: Node) => grippableBy(n, seat),
          // ...AND THE OWNER IS THE ONE WHO SHUTS IT. On the CHAIR, because the chair is the thing
          // on this desk that means "you": it is the only node a reader may pick up that is theirs,
          // so it is the only one a tap can be about without asking whose it is. Not on the disc —
          // nothing a finger does reaches the disc at all.
          (piece: Node) => people.tapped(seat, piece),
          () => people.settled(),
        ),
      );
      pane.appendChild(dot);
      wall.appendChild(pane);
    });

    return wall;
  },
  args: { ...STACK_ARGS, lifted: true, dropping: true, throwing: false, stacking: false, landing: false, lock: false },
  argTypes: { ...STACK_KNOBS, lock: LOCK },
  parameters: { gkDocStory: "hands.scene" },
};
