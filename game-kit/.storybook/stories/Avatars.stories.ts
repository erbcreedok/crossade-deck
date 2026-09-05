import type { Meta, StoryObj } from "@storybook/html";
import {
  avatarId,
  installStockCarries,
  installStockCoats,
  installStockMarkIcons,
  installStockMarks,
  leash,
  placeAvatars,
  registerTextStyle,
  repin,
  t,
  watchPresence,
  PRESENCE_TEXT,
  presenceTransform,
  type Presence,
  type PresenceState,
  type PresenceView,
  type Vec,
} from "../../src/index.js";
import { type Mirror, grabScene } from "./gestureScene.js";
import { follow, type Screen } from "./liveScreens.js";
import { liveMap, LIVE_UNIT, SEATS } from "@game-presets/desks";
import { STACK_ARGS, STACK_KNOBS, type StackArgs } from "./gestureKnobs.js";
import { documented } from "./surfaceControls.js";
import { currentSettings, onSettingsChange } from "../devtools/catalogSettings.js";
import { loadPage, type PageText } from "../locales/pages.js";

// LIVE / AVATARS — the people at the desk, drawn ON it.
//
// Every other live page shows what somebody's hand is DOING and nothing about the person doing it:
// the cursor appears when they move and is gone the moment they stop, so a desk with a quiet second
// player is a desk with one player at it. This page adds the permanent half of that message.
//
// AND WHERE THEY SIT IS THEIR OWN CAMERA. Nothing else on a shared desk answers it — a seat number
// is something the game invented — so the avatar's place on the felt is read out of the view that
// person is looking through, and the SAME arithmetic gives the same answer on every screen.
//
// The pictures are discs on purpose. What is coming is a walking crocodile and a knight, and both
// of those are things standing on the felt; a badge painted over the glass could never become one.

installStockCarries();
installStockCoats();
installStockMarks();
installStockMarkIcons();

const meta: Meta = {
  title: "Live/Avatars",
  parameters: { gkDoc: "avatars.component" },
};
export default meta;

/** How big another hand's cursor is drawn, in screen pixels. */
const DOT = 18;

/** The name under a disc: small, quiet and the desk's own face. */
const NAME_STYLE = { family: "ui-sans-serif, system-ui, sans-serif", size: 0.14, weight: 600, lineHeight: 1.2, fill: "text" };

/** Where a screen-pinned avatar opens: the reader's own lower left, with a margin off both edges. */
const CORNER: Vec = { x: 0.14, y: 0.84 };

/** How far off the middle of the felt a desk-pinned reader opens — one a side, in units. */
const SIDE = 2.2;

interface AvatarArgs extends StackArgs {
  /** Whether one's own picture is fastened to the glass or to a spot of the felt. */
  pin: string;
  /** What a desk-pinned avatar does when the view walks off it. */
  leash: string;
  /** Draw the outline of the far player's view on this one. */
  showBounds: boolean;
}

const PIN = documented("arg.avatarPin", { control: { type: "inline-radio" }, options: ["screen", "desk"] }, "avatars");
const LEASH = documented("arg.avatarLeash", { control: { type: "inline-radio" }, options: ["lock", "chase"] }, "avatars");
const BOUNDS = documented("arg.avatarBounds", { control: { type: "boolean" } }, "avatars");

/**
 * AVATARS — one desk, two people, and each of them visible to the other.
 *
 * Pan the top screen and its own disc travels the felt: pinned to the SCREEN the picture rides that
 * reader's glass, so on the bottom screen it moves — which is exactly the message being sent, "I am
 * looking over here now". Pinned to the DESK it stands on a spot of the felt instead, and then the
 * leash decides what happens when the view walks away from it: `lock` will not let the view go, and
 * `chase` presses the picture against the border it went out through.
 *
 * The state is on the disc. Switch to another tab and both discs go quiet with a muted mark — the
 * tab is the person, and a tab nobody is looking at is a person who is not looking. Pick anything
 * up and the holder's disc takes a ring, which is the one thing everybody else is waiting on.
 *
 * NO SERVER. The two screens are two views of one tree, exactly as on the pages before this one, and
 * the presence travels the same seam a hand does.
 */
export const Avatars: StoryObj<AvatarArgs> = {
  render: (a) => {
    registerTextStyle(PRESENCE_TEXT, NAME_STYLE);
    const wall = document.createElement("div");
    wall.style.cssText = "display:grid;grid-template-rows:1fr 1fr;gap:8px;height:100%;min-height:640px";
    // ONE DESK. Not a copy each: the tree IS the desk, and two screens reading two trees would be
    // two desks that happened to agree at the start.
    const desk = liveMap(0);
    const screens: Screen[] = [];
    const held = a.lifted ? a.lift : 1;
    const frames = new Map<string, HTMLElement>();
    /** Where each person's own picture is fastened right now — moved by dragging it. */
    // A DESK PIN OPENS ON A SPOT OF ITS OWN, one a side. Both on the middle of the felt is two
    // people standing in the same place — the later disc simply covers the earlier one, and the page
    // shows one person where it means to show two.
    const pinned = new Map<string, Vec>(
      SEATS.map(({ seat }, i) => [seat, a.pin === "screen" ? CORNER : { x: 0, y: i === 0 ? SIDE : -SIDE }]),
    );
    const states = new Map<string, PresenceState>(SEATS.map(({ seat }) => [seat, "online"]));
    const holding = new Set<string>();
    /**
     * WHOSE HAND IS ON THE GLASS. On a real desk each client has a tree of its own and "mine" is
     * simply who is running it; here two screens share one tree, so the honest stand-in is the pane
     * the finger last came down on — and the picture that may be dragged is that reader's own.
     */
    let mine: string = SEATS[0]!.seat;

    /**
     * THE PAGE'S OWN WORDS, FETCHED BY THE PAGE. The catalog hands a story the CHROME's bundle; a
     * page's prose is loaded when somebody opens it, and two player names are that page's prose —
     * put in the chrome they would be downloaded by every reader of every other page.
     *
     * Until they arrive the key itself stands in, which is what the catalog does everywhere else: a
     * name a moment late is better than a disc that waits for a network round trip to exist.
     */
    let said: PageText | undefined;
    const words = (key: string): string =>
      said ? said.text(key as Parameters<PageText["text"]>[0]) : key;
    const readNames = (): void => {
      const locale = currentSettings().text.locale;
      void loadPage("avatars", locale).then((text) => {
        if (currentSettings().text.locale !== locale) return;
        said = text;
        publish();
      });
    };

    /** What a screen's camera is worth as a message — see `PresenceView` on why the scale is total. */
    const viewOf = (one: Screen): PresenceView | undefined => {
      const camera = one.scene?.camera;
      if (!camera) return undefined;
      return { target: camera.target, zoom: camera.pixelsPerUnit, rotation: camera.rotation, glass: camera.glass };
    };

    const presences = (): Presence[] =>
      screens.flatMap((one) => {
        const view = viewOf(one);
        if (!view) return [];
        const at = pinned.get(one.seat)!;
        return [
          {
            seat: one.seat,
            name: words(`docs.avatars.name.${one.seat}`),
            ink: one.ink,
            state: states.get(one.seat)!,
            holding: holding.has(one.seat),
            view,
            pin: a.pin === "screen" ? { mode: "screen", at } : { mode: "desk", at, leash: a.leash },
          },
        ];
      });

    /**
     * THE FAR VIEW'S OWN RECTANGLE, drawn over this pane — four corners of their glass taken to the
     * desk through THEIR camera and back to the glass through MINE. Off by default: it is a debug
     * picture of the thing the avatar already says more quietly.
     */
    const outline = (one: Screen): void => {
      const frame = frames.get(one.seat);
      const camera = one.scene?.camera;
      if (!frame || !camera) return;
      const far = screens.find((other) => other !== one);
      const view = far ? viewOf(far) : undefined;
      if (!a.showBounds || !view) {
        frame.style.display = "none";
        return;
      }
      const inv = presenceTransform(view);
      const near = camera.transform();
      const corners = [
        { x: 0, y: 0 },
        { x: view.glass.w, y: 0 },
        { x: view.glass.w, y: view.glass.h },
        { x: 0, y: view.glass.h },
      ]
        .map((g) => {
          const d = deskOf(inv, g);
          return { x: near.a * d.x + near.c * d.y + near.e, y: near.b * d.x + near.d * d.y + near.f };
        });
      const xs = corners.map((p) => p.x);
      const ys = corners.map((p) => p.y);
      frame.style.display = "block";
      frame.style.left = `${Math.min(...xs)}px`;
      frame.style.top = `${Math.min(...ys)}px`;
      frame.style.width = `${Math.max(...xs) - Math.min(...xs)}px`;
      frame.style.height = `${Math.max(...ys) - Math.min(...ys)}px`;
      frame.style.borderColor = t(far!.ink as Parameters<typeof t>[0]);
    };

    /**
     * ONE PUBLICATION AT A TIME, and only when something is actually different.
     *
     * Placing the people writes the tree, writing the tree wakes every screen, and a woken screen
     * reports that its view was touched — which is another publication. Without the latch that is
     * a loop with no floor, and it hangs the page before the first frame; without the comparison it
     * is a whole tree rebuilt per pointer event for a desk where nobody moved.
     */
    let placing = false;
    let last = "";
    const publish = (): void => {
      if (placing) return;
      const all = presences();
      if (all.length === 0) return;
      const now = JSON.stringify(all);
      if (now === last) return;
      last = now;
      placing = true;
      try {
        place(all);
      } finally {
        placing = false;
      }
    };

    /**
     * EVERYBODY, PLACED — and then every screen told, because a host is only ever told by being told.
     *
     * Rebuilt rather than patched: a state repaints the disc, a view moves it and a drag re-pins it,
     * and all three can happen between two frames.
     */
    const place = (all: readonly Presence[]): void => {
      // THE OWN CAMERA IS HELD TO THE OWN PICTURE FIRST, or the leash would be a frame behind: `lock`
      // moves the camera, and a placement read before that move is a placement of the old view.
      if (a.pin === "desk") {
        for (const one of screens) {
          const camera = one.scene?.camera;
          if (camera) leash(camera, pinned.get(one.seat)!, a.leash);
        }
      }
      placeAvatars(desk, all, mine);
      for (const one of screens) {
        one.scene?.setRoot(desk);
        outline(one);
      }
    };

    /** A hidden tab is nobody's screen, so everybody sitting in it goes quiet at once. */
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
      const frame = document.createElement("div");
      frame.style.cssText = "position:absolute;z-index:3;pointer-events:none;display:none;border:2px dashed";
      frames.set(seat, frame);
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
          for (const one of others()) one.grasp?.();
        },
        hand: (items, at, done, feel) => {
          for (const one of others()) follow(one, items, at, done, held, feel, mineScreen.seat);
          // A HAND WITH SOMETHING IN IT IS A STATE, and one's own picture is not "something".
          const carryingSelf = items.some((it) => it.id === avatarId(seat));
          // WHERE THE FINGER PUT IT, IN THE PIN'S OWN UNITS — `repin`, never the carry's point as it
          // stands. A carry speaks the DESK's units and a screen pin is written in fractions of the
          // glass: written in raw, two units of felt were read back as two glass-widths on the very
          // next frame, and the picture left the desk the instant it was touched.
          const moved = carryingSelf ? presences().find((one) => one.seat === seat) : undefined;
          if (moved && at) pinned.set(seat, repin(moved, at).at);
          if (done) holding.delete(seat);
          else if (!carryingSelf) holding.add(seat);
          if (carryingSelf || done) publish();
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
          false,
          0,
          undefined,
          undefined,
          undefined,
          mirror,
          LIVE_UNIT,
          a.landing,
          undefined,
          seat,
          i === 0
            ? { marks: { inks: Object.fromEntries(SEATS.map((s) => [s.seat, s.ink])), showOwn: false, me: seat } }
            : { marks: { inks: Object.fromEntries(SEATS.map((s) => [s.seat, s.ink])), ttlMs: 5000, showOwn: false, me: seat } },
          undefined,
          // THE TWO SEATS LOOK AT THE DESK FROM OPPOSITE SIDES, which is what makes the avatars worth
          // drawing: the same lower-left corner of two turned views is two different places on the felt.
          seat === SEATS[1]!.seat ? 180 : undefined,
          // WHERE SOMEBODY IS LOOKING IS PART OF THIS DESK, so a view that moved is news.
          () => publish(),
        ),
      );
      pane.appendChild(frame);
      pane.appendChild(dot);
      wall.appendChild(pane);
    });

    // The story's element is thrown away whole on a re-render; the two listeners above are not, and
    // an unremoved one goes on placing avatars into a tree nobody is drawing.
    const observer = new MutationObserver(() => {
      if (wall.isConnected) return;
      stopWatching();
      stopFollowing();
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return wall;
  },
  args: { ...STACK_ARGS, lifted: true, dropping: true, throwing: false, stacking: false, landing: false, pin: "screen", leash: "chase", showBounds: false },
  argTypes: { ...STACK_KNOBS, pin: PIN, leash: LEASH, showBounds: BOUNDS },
  parameters: { gkDocStory: "avatars.scene" },
};

/** A point of somebody's glass, in the desk's units — the inverse of their own view. */
function deskOf(view: { a: number; b: number; c: number; d: number; e: number; f: number }, g: Vec): Vec {
  const det = view.a * view.d - view.b * view.c;
  if (det === 0) return g;
  const x = g.x - view.e;
  const y = g.y - view.f;
  return { x: (x * view.d - y * view.c) / det, y: (y * view.a - x * view.b) / det };
}
