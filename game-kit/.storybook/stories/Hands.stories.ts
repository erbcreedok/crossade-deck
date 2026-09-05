import type { Meta, StoryObj } from "@storybook/html";
import {
  avatarId,
  byId,
  grippableBy,
  installStockCarries,
  installStockCoats,
  installStockFlips,
  installStockMarkIcons,
  installStockMarks,
  placeAvatars,
  registerTextStyle,
  t,
  watchPresence,
  zoneNear,
  PRESENCE_TEXT,
  type Node,
  type Presence,
  type PresenceState,
  type PresenceView,
  type Vec,
} from "../../src/index.js";
import { type Mirror, grabScene } from "./gestureScene.js";
import { follow, type Screen } from "./liveScreens.js";
import {
  growHand,
  handId,
  handTakes,
  isHand,
  LIVE_UNIT,
  placeHand,
  ROUND_R,
  roundMap,
  roundRoom,
  SEATS,
  setHandLock,
} from "@game-presets/desks";
import { STACK_ARGS, STACK_KNOBS, type StackArgs } from "./gestureKnobs.js";
import { documented } from "./surfaceControls.js";
import { currentSettings, onSettingsChange } from "../devtools/catalogSettings.js";
import { loadPage, type PageText } from "../locales/pages.js";

// LIVE / HANDS — every player's own patch of felt, standing where the player is.
//
// The areas on the live desk are places the DESK decided on: two boxes at two fixed points, and a
// player is whoever happens to be nearest one. On a round table there is nothing to be near — where
// somebody sits is read out of their own camera (`Live/Avatars`) and can be anywhere on the rim — so
// the hand is fastened to the AVATAR. Drag your own disc and your hand goes with it, and it goes to
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
// a hand that is not theirs, and the answer is the owner's to give: tap your own disc and your hand
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

/** The name under a disc: small, quiet and the desk's own face. */
const NAME_STYLE = { family: "ui-sans-serif, system-ui, sans-serif", size: 0.14, weight: 600, lineHeight: 1.2, fill: "text" };

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
    registerTextStyle(PRESENCE_TEXT, NAME_STYLE);
    const wall = document.createElement("div");
    wall.style.cssText = "display:grid;grid-template-rows:1fr 1fr;gap:8px;height:100%;min-height:640px";
    // ONE DESK. Not a copy each: the tree IS the desk, and two screens reading two trees would be
    // two desks that happened to agree at the start.
    const desk = roundMap();
    const screens: Screen[] = [];
    const held = a.lifted ? a.lift : 1;
    const states = new Map<string, PresenceState>(SEATS.map(({ seat }) => [seat, "online"]));
    const holding = new Set<string>();
    /** Whose hand is shut. The bottom seat's opens from the knob; either is turned by its own tap. */
    const shut = new Map<string, boolean>(SEATS.map(({ seat }, i) => [seat, i === 1 ? a.lock : false]));
    /** Whose finger came down last — the stand-in for "mine" on a page where one tree serves two. */
    let mine: string = SEATS[0]!.seat;

    /** The page's own words, fetched by the page — see `Live/Avatars` on why they are not chrome. */
    let said: PageText | undefined;
    const words = (key: string): string => (said ? said.text(key as Parameters<PageText["text"]>[0]) : key);
    const readNames = (): void => {
      const locale = currentSettings().text.locale;
      void loadPage("hands", locale).then((text) => {
        if (currentSettings().text.locale !== locale) return;
        said = text;
        publish();
      });
    };

    const viewOf = (one: Screen): PresenceView | undefined => {
      const camera = one.scene?.camera;
      if (!camera) return undefined;
      return { target: camera.target, zoom: camera.pixelsPerUnit, rotation: camera.rotation, glass: camera.glass };
    };

    const presences = (): Presence[] =>
      screens.flatMap((one) => {
        const view = viewOf(one);
        if (!view) return [];
        return [
          {
            seat: one.seat,
            name: words(`docs.hands.name.${one.seat}`),
            ink: one.ink,
            state: states.get(one.seat)!,
            holding: holding.has(one.seat),
            view,
          },
        ];
      });

    /** Whose hand this node is, or `undefined` — read off what it SAYS (`guard.id-is-opaque`). */
    const handOf = (seat: string): Node | undefined => byId(desk, handId(seat));

    /**
     * EVERY HAND, RE-DERIVED — its size from what is in it, its place from its own person.
     *
     * In this order and never the other: the side with the most room is measured with the patch at
     * the size it is about to be drawn at, and a hand placed before it grew would be placed as the
     * smaller thing it no longer is — half of it off the rim the moment the card lands.
     */
    const layHands = (): void => {
      for (const { seat } of SEATS) {
        const hand = handOf(seat);
        const avatar = byId(desk, avatarId(seat));
        if (!hand) continue;
        setHandLock(hand, shut.get(seat) === true);
        growHand(hand);
        if (avatar) placeHand(desk, avatar, hand, ROUND_R);
      }
    };

    /** One publication at a time, and only when something is different — see `Live/Avatars`. */
    let placing = false;
    let last = "";
    const publish = (): void => {
      if (placing) return;
      const all = presences();
      if (all.length === 0) return;
      const now = JSON.stringify([all, [...shut]]);
      if (now === last) return;
      last = now;
      placing = true;
      try {
        placeAvatars(desk, all);
        layHands();
        for (const one of screens) one.scene?.setRoot(desk);
      } finally {
        placing = false;
      }
    };

    /**
     * THE DESK CAME TO REST — the one moment a hand can have changed size without anybody moving.
     *
     * Published without the latch above, because nothing about the PEOPLE changed and the latch
     * compares people: a card landing in a hand is a change to the furniture alone.
     */
    const settled = (): void => {
      layHands();
      for (const one of screens) one.scene?.setRoot(desk);
    };

    const stopWatching = watchPresence(document, (state) => {
      for (const { seat } of SEATS) states.set(seat, state);
      publish();
    });
    const stopFollowing = onSettingsChange(() => readNames());
    readNames();

    SEATS.forEach(({ seat, ink }, i) => {
      const pane = document.createElement("div");
      pane.style.cssText = "position:relative;min-height:300px;overflow:hidden";
      pane.addEventListener(
        "pointerdown",
        () => {
          if (mine === seat) return;
          mine = seat;
          publish();
        },
        true,
      );
      const dot = document.createElement("div");
      dot.style.cssText =
        `position:absolute;z-index:4;width:${DOT}px;height:${DOT}px;border-radius:50%;pointer-events:none;` +
        `display:none;transform:translate(-50%,-50%);background:${t(ink)};box-shadow:0 0 0 2px ${t("sunkBg")}`;
      const mineScreen: Screen = { seat, ink, dot };
      screens.push(mineScreen);
      const others = (): Screen[] => screens.filter((one) => one !== mineScreen);
      const mirror: Mirror = {
        ready: (s, grasp) => {
          mineScreen.scene = s;
          mineScreen.grasp = grasp;
          publish();
        },
        changed: () => {
          settled();
          for (const one of others()) one.grasp?.();
        },
        hand: (items, at, done, feel) => {
          for (const one of others()) follow(one, items, at, done, held, feel, mineScreen.seat);
          const carryingSelf = items.some((it) => it.id === avatarId(seat));
          if (done) holding.delete(seat);
          else if (!carryingSelf) holding.add(seat);
          if (carryingSelf || done) publish();
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
            ? { marks: { inks: Object.fromEntries(SEATS.map((s) => [s.seat, s.ink])), showOwn: false, me: seat } }
            : { marks: { inks: Object.fromEntries(SEATS.map((s) => [s.seat, s.ink])), ttlMs: 5000, showOwn: false, me: seat } },
          undefined,
          // THE TWO SEATS LOOK AT THE DESK FROM OPPOSITE SIDES, which is what makes a hand beside a
          // person worth drawing: each reader's own patch is the one nearest them.
          seat === SEATS[1]!.seat ? 180 : undefined,
          () => publish(),
          // A SHUT HAND CANNOT BE REACHED INTO. Refused at the PICK and not at the drop, because
          // what a shut hand refuses is the gesture ever starting — a card that lifted out and flew
          // back would read as the desk having dropped it.
          (n: Node) => grippableBy(n, seat),
          // ...AND THE OWNER IS THE ONE WHO SHUTS IT. On the disc, because the disc is already the
          // thing on this desk that means "you": it is the only node a reader may pick up that is
          // theirs, so it is the only one a tap can be about without asking whose it is.
          (piece: Node) => {
            if (piece.id !== avatarId(seat)) return false;
            shut.set(seat, shut.get(seat) !== true);
            publish();
            return true;
          },
          () => settled(),
        ),
      );
      pane.appendChild(dot);
      wall.appendChild(pane);
    });

    const observer = new MutationObserver(() => {
      if (wall.isConnected) return;
      stopWatching();
      stopFollowing();
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return wall;
  },
  args: { ...STACK_ARGS, lifted: true, dropping: true, throwing: false, stacking: false, landing: false, lock: false },
  argTypes: { ...STACK_KNOBS, lock: LOCK },
  parameters: { gkDocStory: "hands.scene" },
};
