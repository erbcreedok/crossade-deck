import type { Meta, StoryObj } from "@storybook/html";
import { installStockCarries, installStockCoats, t, type Node, type Vec } from "../../src/index.js";
import { type Mirror, grabScene } from "./gestureScene.js";
import { follow, type Screen } from "./liveScreens.js";
import { chessMap, chessRoom, CHESS_SEATS, CHESS_UNIT, squareAt } from "./chessMap.js";
import { STACK_ARGS, STACK_KNOBS, type StackArgs } from "./gestureKnobs.js";
import { documented } from "./surfaceControls.js";

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
}

/**
 * THE DIFFERENCE BETWEEN A BOARD AND A FELT, AS ONE NUMBER — and it is worth moving.
 *
 * At `0` a piece is on the square it is over and there is no other answer, which is what a board IS.
 * Raise it and the squares start forgiving a near miss, exactly as the magnetism page's area does,
 * and the board turns into a felt with lines drawn on it: a piece let go of between two squares is
 * taken by whichever is nearer rather than by the one it is standing in.
 */
const REACH = documented("arg.cellReach", { control: { type: "number", min: 0, step: 0.05 } }, "chess");


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
  render: (a) => {
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

    for (const { seat, ink } of CHESS_SEATS) {
      const pane = document.createElement("div");
      pane.style.cssText = "position:relative;min-height:340px;overflow:hidden";
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
        },
        changed: () => {
          for (const one of others()) one.grasp?.();
        },
        hand: (items, at, done, feel) => {
          for (const one of others()) follow(one, items, at, done, held, feel, mine.seat);
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
        ),
      );
      pane.appendChild(dot);
      wall.appendChild(pane);
    }
    return wall;
  },
  // NO LANDING PICTURE, so no hover either. On a board the lit square IS the picture of where the
  // man lands, and a man held clear of the finger means the finger is over one square while the man
  // is drawn over the next — the light and the man on two different cells, which reads as the light
  // being wrong. Held ON the square, man and light say one thing.
  args: { ...STACK_ARGS, lifted: true, dropping: true, throwing: false, stacking: false, landing: false, reach: 0 },
  argTypes: { ...STACK_KNOBS, reach: REACH },
  parameters: { gkDocStory: "chess.scene" },
};
