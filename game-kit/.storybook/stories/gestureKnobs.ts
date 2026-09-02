// THE PANEL EVERY CARRYING PAGE SHARES — the switches, their defaults and the words behind them.
//
// Split out for the same reason the scene was (`gestureScene.ts`): more than one shelf now stands on
// it. A second copy of these would be a second set of defaults, and a reader comparing two pages
// would be comparing two accidents.
//
// EVERY PAGE HAS THE SWITCH FOR ITS OWN FEATURE, and turning it off leaves the page BEFORE it. That
// is what makes a shelf readable end to end: each page adds exactly one thing, its switch takes that
// one thing away, and what is left is the neighbour a reader has already understood.

import { GRIP, GRIP_HOLD, GRIP_MISS, type LetGo } from "./gestureMap.js";
import { documented } from "./surfaceControls.js";

export interface GrabArgs {
  physics: boolean;
}

export const PHYSICS = documented("arg.physics", {}, "carry");
export const LIFT = documented("arg.lift", { control: { type: "number", min: 1, step: 0.05 }, if: { arg: "lifted" } }, "carry");

export interface LiftArgs extends GrabArgs {
  /** The page's own switch: off, and the hand holds the piece flat — the page before this one. */
  lifted: boolean;
  lift: number;
}

export interface DropArgs extends LiftArgs {
  /** Off, and a release is an ordinary putting-down again — the page before this one. */
  dropping: boolean;
  /** How a CARD leaves the hand: eased to its seat, or dropped from the hand's height. */
  cardDrop: LetGo;
  /** The same for a chip — and the default is the other one, which is the point of having both. */
  chipDrop: LetGo;
  /** And for the die, which has a third way open to it: it can ROLL, being the only thing with faces. */
  dieDrop: LetGo;
}

export interface ThrowArgs extends DropArgs {
  /** Off, and the hand's speed is not handed on: the piece drops where it stood. */
  throwing: boolean;
}

export interface StackArgs extends ThrowArgs {
  /** Off, and touching pieces are just pieces that happen to overlap — no handles, no heaps. */
  stacking: boolean;
  /** The tab's width in units; its height follows, because the shape is what makes it read as a tab. */
  gripWidth: number;
  /** How far the view may take it down and up before it is held — see `Screened`. */
  gripMin: number;
  gripMax: number;
  /** How far a finger may MISS the tab and still take it, in units. The picture does not change. */
  gripMiss: number;
}

// A CONTROL IS AIMED AT WITH A FINGERTIP AND DRAWN FOR AN EYE. The tab is a few pixels tall on
// purpose — one drawn as a slab would be a slab — and a fingertip covers forty-odd pixels of glass
// while hiding the target on the way down. `0` and the tab is hit exactly as it is drawn, which is
// the page before this number existed and is worth trying once to feel what it was.
export const GRIP_MISS_KNOB = documented("arg.gripMiss", { control: { type: "number", min: 0, step: 0.05 }, if: { arg: "stacking" } }, "grip");

export const GRIP_W = documented("arg.gripWidth", { control: { type: "number", min: 0.1, step: 0.05 }, if: { arg: "stacking" } }, "grip");
export const GRIP_MIN = documented("arg.gripMin", { control: { type: "number", min: 0.1, step: 0.05 }, if: { arg: "stacking" } }, "grip");
// The ceiling is ONE and goes no higher: a handle has a size that suits the finger, and there is
// nothing above it to want.
export const GRIP_MAX = documented("arg.gripMax", { control: { type: "number", min: 0.1, max: 1, step: 0.05 }, if: { arg: "stacking" } }, "grip");

/**
 * EVERY PAGE HAS THE SWITCH FOR ITS OWN FEATURE, and turning it off leaves the page BEFORE it.
 *
 * That is what makes the shelf readable end to end: each page adds exactly one thing, its switch
 * takes that one thing away, and what is left is the neighbour a reader has already understood. A
 * page whose feature could not be turned off would be asking to be believed rather than compared.
 */
export const LIFTED = documented("arg.lifted", {}, "carry");
export const DROPPING = documented("arg.dropping", {}, "release");
export const THROWING = documented("arg.throwing", {}, "release");
export const STACKING = documented("arg.stacking", {}, "stack");
/**
 * HOW EACH KIND LEAVES THE HAND. Two selects and not one switch, because the answer is not the same
 * for every thing on a desk: a card put down on a felt IS a putting-down, while a chip dropped on
 * one is a thing landing. The defaults say so; the panel lets a reader disagree.
 */
export const WAYS: readonly LetGo[] = ["settle", "fall"];
export const CARD_WAY = documented("arg.cardDrop", { control: "select", options: WAYS, if: { arg: "dropping" } }, "release");
export const CHIP_WAY = documented("arg.chipDrop", { control: "select", options: WAYS, if: { arg: "dropping" } }, "release");
// The die gets a third: `roll` is a way of leaving a hand that only a thing with faces HAS, so it is
// on the one control where it means something and on neither of the others.
export const DIE_WAY = documented("arg.dieDrop", { control: "select", options: [...WAYS, "roll"], if: { arg: "dropping" } }, "release");

export const STACK_ARGS: StackArgs = {
  physics: true,
  lifted: false,
  lift: 1.3,
  dropping: false,
  throwing: false,
  stacking: true,
  gripWidth: GRIP.w,
  gripMin: GRIP_HOLD.min,
  gripMax: GRIP_HOLD.max,
  gripMiss: GRIP_MISS,
  cardDrop: "settle",
  chipDrop: "fall",
  dieDrop: "roll",
};

export const STACK_KNOBS = {
  physics: PHYSICS,
  lifted: LIFTED,
  lift: LIFT,
  dropping: DROPPING,
  throwing: THROWING,
  stacking: STACKING,
  gripWidth: GRIP_W,
  gripMin: GRIP_MIN,
  gripMax: GRIP_MAX,
  gripMiss: GRIP_MISS_KNOB,
  cardDrop: CARD_WAY,
  chipDrop: CHIP_WAY,
  dieDrop: DIE_WAY,
};

export interface FlipArgs extends StackArgs {
  /** Off, and a tap is just a gesture that went nowhere — the cards stay as they lie. */
  flipping: boolean;
  /** How much of itself a card must SHOW to take the finger, as a fraction of its own footprint. */
  showsEnough: number;
}

export const FLIPPING = documented("arg.flipping", {}, "flip");
export const SHOWS = documented("arg.showsEnough", { control: { type: "number", min: 0, max: 1, step: 0.05 } }, "flip");

/**
 * A quarter of a card. Below it what is showing is an edge rather than a card — on this pile the
 * step is a hundredth of a card, so everything buried shows a few percent and none of it answers,
 * which is exactly the ladder: every touch on the deck lands on the deck's top.
 */
export const SHOWS_DEFAULT = 0.25;
