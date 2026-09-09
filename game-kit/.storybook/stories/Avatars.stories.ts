import type { Meta, StoryObj } from "@storybook/html";
import {
  installStockCarries,
  installStockCoats,
  installStockMarkIcons,
  installStockMarks,
  presenceTransform,
  t,
  type LiveTable,
  type Node,
  type PresenceView,
  type Vec,
} from "../../src/index.js";
import { type Mirror, grabScene } from "./gestureScene.js";
import { follow, type Screen } from "./liveScreens.js";
import { LIVE_UNIT, mayTake, roundMap, roundPlaces, roundRoom, SEATS } from "@game-presets/desks";
import { STACK_ARGS, STACK_KNOBS, type StackArgs } from "./gestureKnobs.js";
import { documented } from "./surfaceControls.js";
import { withAvatars } from "./avatars.js";

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
// THE FURNITURE IS THE SEAT DESIGN'S (`Live/Place`): a chair per place, and the disc in the arch
// while its owner looks at it. This page has no hands — a chair is the place alone, which is every
// board on the shelf — so what is left to watch is the one thing the page is about: the disc leaving
// the arch as the view leaves the place, and coming back into it as the view comes home.
//
// The people are wired the ONE way every live page wires them (`avatars.ts`): nothing here is a
// second answer to who sits where.

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

interface AvatarArgs extends StackArgs {
  /** Draw the outline of the far player's view on this one. */
  showBounds: boolean;
}

const BOUNDS = documented("arg.avatarBounds", { control: { type: "boolean" } }, "avatars");

/**
 * AVATARS — one desk, two people, and each of them visible to the other.
 *
 * Pan the top screen and its own disc leaves its chair and travels the felt with the view: the disc
 * stands under the LOW MIDDLE of that reader's glass, so on the bottom screen it moves exactly as
 * far as the view did — which is exactly the message being sent, "I am looking over here now". Tap
 * your own chair and the view glides home; the disc sits back down in the arch.
 *
 * The state is on the disc. Switch to another tab and both discs lose their cone — the tab is the
 * person, and a tab nobody is looking at is a person who is not looking. Pick anything up and the
 * holder's disc takes a ring, which is the one thing everybody else is waiting on.
 *
 * NO SERVER. The two screens are two views of one tree, exactly as on the pages before this one, and
 * the presence travels the same seam a hand does.
 */
export const Avatars: StoryObj<AvatarArgs> = {
  render: (a) => {
    const wall = document.createElement("div");
    wall.style.cssText = "display:grid;grid-template-rows:1fr 1fr;gap:8px;height:100%;min-height:640px";
    // ONE DESK. Not a copy each: the tree IS the desk, and two screens reading two trees would be
    // two desks that happened to agree at the start.
    const desk = roundMap(SEATS);
    const screens: Screen[] = [];
    const held = a.lifted ? a.lift : 1;
    const frames = new Map<string, HTMLElement>();
    const inks = Object.fromEntries(SEATS.map(({ seat, ink }) => [seat, ink]));
    const places = roundPlaces(SEATS.length);
    // EVERY PANE'S OWN LIVE DESK, by seat — the one way a tap on a chair can reach the camera that
    // has to move (`liveTable`'s `idle.goHome`). Filled in as each pane is built, below.
    const desks = new Map<string, LiveTable>();
    // THE PEOPLE, WIRED THE ONE WAY EVERY LIVE PAGE WIRES THEM (`avatars.ts`). No hands: a chair
    // here is the place alone, and the disc in it — or off it — is the whole of the page.
    const people = withAvatars({
      desk,
      seats: SEATS,
      screens,
      page: "avatars",
      wall,
      places,
      goHome: (seat) => desks.get(seat)?.idle?.goHome(),
    });
    // A SIMPLE HEARTBEAT FOR THE OPENING GLIDE — a plain interval per pane, torn down when the
    // story's own wall leaves the document (`Live/Cards` runs the same one).
    const idleTimers: (() => void)[] = [];
    const idleObserver = new MutationObserver(() => {
      if (wall.isConnected) return;
      for (const stop of idleTimers.splice(0)) stop();
      idleObserver.disconnect();
    });
    idleObserver.observe(document.body, { childList: true, subtree: true });

    /** What a screen's camera is worth as a message — see `PresenceView` on why the scale is total. */
    const viewOf = (one: Screen): PresenceView | undefined => {
      const camera = one.scene?.camera;
      if (!camera) return undefined;
      return { target: camera.target, zoom: camera.pixelsPerUnit, rotation: camera.rotation, glass: camera.glass };
    };

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
      ].map((g) => {
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
    const outlines = (): void => {
      for (const one of screens) outline(one);
    };

    SEATS.forEach(({ seat, ink }, i) => {
      const pane = document.createElement("div");
      pane.style.cssText = "position:relative;min-height:300px;overflow:hidden";
      pane.addEventListener("pointerdown", () => people.claim(seat), true);
      const dot = document.createElement("div");
      dot.style.cssText =
        `position:absolute;z-index:4;width:${DOT}px;height:${DOT}px;border-radius:50%;pointer-events:none;` +
        `display:none;transform:translate(-50%,-50%);box-shadow:0 0 0 2px ${t("sunkBg")}`;
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
          people.publish();
          outlines();
        },
        changed: () => {
          people.settled();
          for (const one of others()) one.grasp?.();
        },
        hand: (items, at, done, feel) => {
          // A CURSOR IS DRAWN IN THE INK OF WHOSE FINGER IT IS, and not of the pane it appears in.
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
          roundRoom(),
          seat,
          i === 0
            ? { marks: { inks, showOwn: false, me: seat } }
            : { marks: { inks, ttlMs: 5000, showOwn: false, me: seat } },
          undefined,
          // THE TWO SEATS LOOK AT THE DESK FROM OPPOSITE SIDES, which is what makes the avatars worth
          // drawing: the same lower-left corner of two turned views is two different places on the felt.
          seat === SEATS[1]!.seat ? 180 : undefined,
          // WHERE SOMEBODY IS LOOKING IS PART OF THIS DESK, so a view that moved is news.
          () => {
            people.publish();
            outlines();
          },
          // ONLY THE OWNER MOVES A CHAIR; nothing else on this desk is anybody's to lift.
          (n: Node) => mayTake(n, seat),
          // A TAP ON ONE'S OWN CHAIR TAKES THAT READER HOME.
          (piece: Node) => people.tapped(seat, piece),
          () => people.settled(),
          {
            places,
            mine: i,
            placeNow: () => people.placeOf(seat),
            idleReturn: false,
          },
          // A PANE OPENS AT ITS OWN PLACE: the disc is in the arch before anybody has touched
          // anything, which is the picture this page starts from (`Live/Cards` does the same).
          (live) => {
            desks.set(seat, live);
            requestAnimationFrame(() => live.idle?.goHome());
            const id = setInterval(() => {
              live.idle?.step(200);
              live.motions?.redraw();
              people.publish();
              outlines();
            }, 200);
            const stop = () => clearInterval(id);
            idleTimers.push(stop);
            return stop;
          },
        ),
      );
      pane.appendChild(frame);
      pane.appendChild(dot);
      wall.appendChild(pane);
    });
    return wall;
  },
  args: { ...STACK_ARGS, lifted: true, dropping: true, throwing: false, stacking: false, landing: false, showBounds: false },
  argTypes: { ...STACK_KNOBS, showBounds: BOUNDS },
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
