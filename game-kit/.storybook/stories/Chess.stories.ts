import type { Meta, StoryObj } from "@storybook/html";
import { installStockCarries, installStockCoats, installStockMarkIcons, installStockMarks, t, type Node, type Vec } from "../../src/index.js";
import { type Mirror, grabScene } from "./gestureScene.js";
import { follow, type Screen } from "./liveScreens.js";
import { chessMap, chessPlaces, chessRoom, CHESS_SEATS, CHESS_UNIT, squareAt } from "@game-presets/desks";
import { STACK_ARGS, STACK_KNOBS, type StackArgs } from "./gestureKnobs.js";
import { documented } from "./surfaceControls.js";
import { withAvatars } from "./avatars.js";

// LIVE / CHESS — a board is a desk made of PLACES, and this is the page that says what that changes.
//
// Its own page and not a variation of the cards page — both tables are shared desks, and they answer
// the question differently. A felt asks WHERE and a board asks WHICH: a card lies wherever it was let go of and a
// knight is on e4, never between e4 and d4. Everything else on this page is imported unchanged —
// the carry, the picture of the landing, the light on the place that would take it, the mirroring —
// which is the claim being made: a board is not new machinery, it is sixty-four small places with no
// forgiveness.

installStockCarries();
installStockCoats();
// The marks a live desk writes, and their glyphs: without the glyphs the badge is a blank disc.
installStockMarks();
installStockMarkIcons();

const meta: Meta = {
  title: "Live/Chess",
  parameters: { gkDoc: "chess.component" },
};
export default meta;

/** How big another hand's cursor is drawn, in screen pixels. */
const DOT = 18;

interface ChessArgs extends StackArgs {
  /** How far past its own edge a square still takes a piece, in units. `0` is a board. */
  reach: number;
  /** Whether the two people are drawn on the felt beside their own board.  */
  avatars: boolean;
  /** Whether a view left idle glides back to this reader's own seat. Only means anything with `avatars` on. */
  idleReturn: boolean;
  /** How long a view may sit idle before it glides back, in ms. */
  idleMs: number;
}

/**
 * WHERE A PERSON OPENS, in units off the middle — just inside the felt, past the board's own edge.
 *
 * A board is not a felt and there is no patch of it that is anybody's, so a disc standing ON the
 * squares would be a piece the game has no word for. It stands on the border instead, on the side
 * that player is looking from.
 */
const SIDE = 6;

/**
 * THE DIFFERENCE BETWEEN A BOARD AND A FELT, AS ONE NUMBER — and it is worth moving.
 *
 * At `0` a piece is on the square it is over and there is no other answer, which is what a board IS.
 * Raise it and the squares start forgiving a near miss, exactly as the magnetism page's area does,
 * and the board turns into a felt with lines drawn on it: a piece let go of between two squares is
 * taken by whichever is nearer rather than by the one it is standing in.
 */
const REACH = documented("arg.cellReach", { control: { type: "number", min: 0, step: 0.05 } }, "chess");


const AVATARS = documented("arg.avatars", { control: { type: "boolean" } }, "chess");
const IDLE_RETURN = documented("arg.idleReturn", { control: { type: "boolean" } }, "chess");
const IDLE_MS = documented("arg.idleMs", { control: { type: "number", min: 500, step: 500 } }, "chess");

/**
 * THE ONE SCENE BOTH STORIES STAND ON — they differ by whether anybody is sitting at the board.
 *
 * One render and not two, because the board is the same board: sixty-four squares do not change
 * when a person walks up to them. What arrives with the people is the permanent half of the message
 * the cursor only ever gives while a hand is moving.
 */
function liveChess(a: ChessArgs): HTMLElement {
    const wall = document.createElement("div");
    // TALLER THAN THE SHARED DESK'S WALL, because a board has to be seen WHOLE and there are two of
    // them stacked: where a piece is means nothing except against the other sixty-three squares, so a
    // pane showing seven ranks of eight is showing something that is not chess.
    wall.style.cssText = "display:grid;grid-template-rows:1fr 1fr;gap:8px;height:100%;min-height:720px";
    // ONE BOARD. Not a copy each: the tree IS the board, and two screens reading two trees would be
    // two boards that happened to agree at the start.
    const board = chessMap(a.reach);
    const screens: Screen[] = [];
    const held = a.lifted ? a.lift : 1;
    const inks = Object.fromEntries(CHESS_SEATS.map(({ seat, ink }) => [seat, ink]));
    // NO HANDS ON A BOARD — the people and nothing else. A hand is a patch of felt a player owns,
    // and on a board every place belongs to the game rather than to anybody sitting at it.
    const places = chessPlaces(2);
    const people = a.avatars
      ? withAvatars({ desk: board, seats: CHESS_SEATS, screens, page: "chess", at: (i) => ({ x: 0, y: i === 0 ? SIDE : -SIDE }), wall, places })
      : undefined;
    // A SIMPLE HEARTBEAT FOR THE IDLE GLIDE — see `Cards.stories.ts` for why this is a plain
    // interval rather than a clock of the page's own.
    const idleTimers: (() => void)[] = [];
    const idleObserver = new MutationObserver(() => {
      if (wall.isConnected) return;
      for (const stop of idleTimers.splice(0)) stop();
      idleObserver.disconnect();
    });
    idleObserver.observe(document.body, { childList: true, subtree: true });

    CHESS_SEATS.forEach(({ seat, ink }, i) => {
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
          a.dropping ? (a.throwing ? "throw" : "drop") : undefined,
          // NO STACKING. A board has no heaps: pieces do not pile up on a square, they take each
          // other's place — so there are no handles to draw and nothing for one to lift.
          false,
          { w: a.gripWidth, min: a.gripMin, max: a.gripMax, miss: a.gripMiss },
          { card: a.cardDrop, chip: a.chipDrop, die: a.dieDrop },
          () => board,
          false,
          0,
          undefined,
          undefined,
          // THE ONE THING THE BOARD ANSWERS DIFFERENTLY, handed in at the same seam every zoned desk
          // on the shelf uses. The light, the picture and the drop all ask this and cannot disagree.
          (root: Node, at: Vec) => squareAt(root, at),
          mirror,
          CHESS_UNIT,
          a.landing,
          chessRoom(),
          seat,
          // NEVER ONE'S OWN. A mark is for the player who looked away; the hand that made the
          // move watched it. Showing it to its own author left the top screen wearing every mark
          // it ever earned, with nothing to ever take one off. The two screens differ only in
          // how long somebody ELSE'S mark lives: forever, until overwritten — or five seconds.
          i === 0
            ? { marks: { inks, showOwn: false, me: seat } }
            : { marks: { inks, ttlMs: 5000, showOwn: false, me: seat } },
          // NO DESK-SPECIFIC PIECE LAW — a board answers `zones` alone, same as the seam above.
          undefined,
          // BLACK LOOKS AT THE SAME BOARD FROM THE OTHER SIDE OF IT — the camera opens turned 180°
          // so his own back rank sits nearest him, exactly as it does at a real table. Every man
          // stays upright on his screen regardless (`Oriented: "viewer"` on every piece,
          // `chessMap.ts`): only the ROOM turns, never the pictures standing in it.
          seat === "black" ? 180 : undefined,
          // WHERE SOMEBODY IS LOOKING IS PART OF THIS DESK, so a view that moved is news.
          people ? () => people.publish() : undefined,
          undefined,
          undefined,
          undefined,
          a.avatars
            ? {
                places,
                mine: CHESS_SEATS.findIndex((s) => s.seat === seat),
                idleReturn: a.idleReturn ? { afterMs: a.idleMs ?? 6000, glideMs: 600 } : false,
              }
            : undefined,
          a.avatars
            ? (live) => {
                const id = setInterval(() => live.idle?.step(200), 200);
                const stop = () => clearInterval(id);
                idleTimers.push(stop);
                return stop;
              }
            : undefined,
        ),
      );
      pane.appendChild(dot);
      wall.appendChild(pane);
    });
  return wall;
}

/**
 * CHESS — one board, two people, and no rules at all.
 *
 * Pick a piece up on either screen and it comes up on both. The square under the anchor lights, and
 * the dashed picture of where the piece will stand moves into that square — so where it is going is
 * answered before the hand lets go, which on a board is the only question there is. Drop it on an
 * occupied square and the piece standing there goes to its owner's tray beside the board.
 *
 * WHICH ONE, NOT WHERE. Every other place on this shelf forgives a near miss, because a hand aiming
 * at an area is aiming at somewhere with a size. A square has a size too and forgives NOTHING: the
 * cells touch, so "the nearest" is meaningless — every one of them is nought away from a piece lying
 * across four — and the answer is the square the anchor is standing IN. That is the whole of what a
 * board adds, and it is one function (`squareAt`).
 *
 * NO RULES, and that is deliberate. Whose turn it is, what a knight may do, whether that was check:
 * those are a game's, and this shelf holds mechanics. A board with rules is a chess program; a board
 * without them is the thing every chess program is built on, and it is the part a kit has to get
 * right first. Move a rook diagonally and nothing objects — the desk has no opinion, which is
 * exactly what makes it a desk rather than an opponent.
 */
export const Chess: StoryObj<ChessArgs> = {
  render: liveChess,
  // NO LANDING PICTURE, so no hover either. On a board the lit square IS the picture of where the
  // man lands, and a man held clear of the finger means the finger is over one square while the man
  // is drawn over the next — the light and the man on two different cells, which reads as the light
  // being wrong. Held ON the square, man and light say one thing.
  args: { ...STACK_ARGS, lifted: true, dropping: true, throwing: false, stacking: false, landing: false, reach: 0, avatars: false, idleReturn: false, idleMs: 6000 },
  argTypes: { ...STACK_KNOBS, reach: REACH },
  parameters: { gkDocStory: "chess.scene" },
};

/**
 * CHESS · WITH AVATARS — the same board with the two players drawn beside it.
 *
 * The cursor says what a hand is DOING and says nothing while it is still: a board with a quiet
 * opponent is a board with one player at it. The disc is the other half of the message, and where it
 * stands is read out of that player's own camera — pan the top screen and their disc travels the
 * felt on the bottom one, which is exactly what "I am looking over here now" is.
 *
 * The state is on the disc. Switch to another tab and both go quiet with a muted mark; pick a piece
 * up and the holder's disc takes a ring, which is the one thing everybody else is waiting on. Drag
 * your own disc and it goes where the finger left it.
 *
 * Turn `avatars` off and the board is the scene above.
 */
export const ChessWithAvatars: StoryObj<ChessArgs> = {
  name: "Chess · with avatars",
  render: liveChess,
  args: { ...STACK_ARGS, lifted: true, dropping: true, throwing: false, stacking: false, landing: false, reach: 0, avatars: true, idleReturn: false, idleMs: 6000 },
  argTypes: { ...STACK_KNOBS, reach: REACH, avatars: AVATARS, idleReturn: IDLE_RETURN, idleMs: IDLE_MS },
  parameters: { gkDocStory: "chess.avatars" },
};
