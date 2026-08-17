// THE BOARD — a Klondike table built entirely from engine primitives: containers with layouts,
// grab policies, and the crossade deck. Stock · waste · four foundations · seven tableau columns.
// Nothing here is bespoke rendering; the piles are `Container`s, the cards are `deck()` nodes, and
// the deal is `add()` into them with a face-down flip where the rules want one.

import {
  add,
  compose,
  Container,
  fieldsOf,
  Lit,
  node,
  pile,
  rect,
  registerLayout,
  remove,
  setFacing,
  ShadowCaster,
  Transformable,
  type Node,
  type ValuedFields,
} from "game-kit";
import { deckByCardId, shuffled } from "@game-presets/cards";

/** What a willing pile wears while a legal run hovers the desk — the accent ring, data like any look. */
export const INVITE = { recipe: "ring", level: 0.7, tint: "accent" } as const;

export interface SolitaireBoard {
  readonly desk: Node;
  readonly stock: Node;
  readonly waste: Node;
  readonly foundations: readonly Node[];
  readonly tableau: readonly Node[];
}

/** How far each further card in a column steps down, in units. */
export const COLUMN_STEP = 0.32;

const COL_X = [-3.6, -2.4, -1.2, 0, 1.2, 2.4, 3.6];
const TOP_Y = -2.7;
const TABLEAU_Y = -1.1;

/** Register the two arrangements a Klondike table needs: a tight pile and a downward column. */
export function installSolitaireLayouts(): void {
  registerLayout("sol/pile", { place: (children) => children.map(() => ({ x: 0, y: 0 })) });
  registerLayout("sol/column", { place: (children) => children.map((_c, i) => ({ x: 0, y: i * COLUMN_STEP })) });
}

/** The 52 standard pips (jokers and the brand card left out), shuffled. */
function shuffledPips(): Node[] {
  const byId = deckByCardId();
  const pips: Node[] = [];
  for (const [id, n] of byId) {
    if (id.includes("joker") || id === "brand") continue;
    pips.push(n);
  }
  return shuffled(pips);
}

/**
 * One Klondike slot as a literal for the kit's `pile()` preset. The shadow: a resting pile casts
 * ONCE for everything it holds — the wrap of the dealt column, not a slot under floating cards;
 * the cards carry their own caster and yield to it. The invite: Klondike's legality lives in
 * `rules.ts`, so the scene picks the willing piles itself and dresses them through `wearInvite`.
 */
function slot(id: string, x: number, y: number, layout: string, grab?: string): Node {
  return pile(id, {
    at: { x, y },
    bounds: rect(1, 1.4),
    surface: "sol/slot",
    layout,
    ...(grab ? { grab } : {}),
    shadow: "silhouette",
    invite: INVITE,
  });
}

/**
 * Build a fresh Klondike table with the WHOLE deck stacked, undealt and face-down, in the stock.
 * The deal is a separate step (`dealKlondike`) so a mounted table can animate it — every card slides
 * from the stock to its seat on the motion runtime's clock instead of appearing there.
 */
export function buildBoard(): SolitaireBoard {
  // The desk wears the one lamp: the stock light, top-right of the frame, shadows down-left.
  const desk = node("desk", Transformable({ at: { x: 0, y: 0 } }), Container({ layout: "free" }), Lit());

  const stock = slot("stock", COL_X[0]!, TOP_Y, "sol/pile");
  const waste = slot("waste", COL_X[1]!, TOP_Y, "sol/pile", "top");
  const foundations = [0, 1, 2, 3].map((i) => slot(`foundation:${i}`, COL_X[3 + i]!, TOP_Y, "sol/pile", "top"));
  const tableau = COL_X.map((x, i) => slot(`tableau:${i}`, x, TABLEAU_Y, "sol/column", "above"));

  for (const p of [stock, waste, ...foundations, ...tableau]) add(desk, p);

  for (const card of shuffledPips()) {
    setFacing(card, "down");
    compose(card, ShadowCaster({ from: "silhouette" })); // casts only once lifted out of a pile
    add(stock, card);
  }

  return { desk, stock, waste, foundations, tableau };
}

/**
 * Deal the classic layout OFF the stock: column i takes i+1 cards, only its last face-up; the rest
 * stay in the stock, face-down. Reparenting cards a mounted board already holds is what lets the deal
 * FLY — each moved card's rest pose changes from the stock to its seat, and the settle glides it.
 */
/**
 * A table already WON — every card on its foundation, aces first, by suit — for the one thing a
 * finished game does that a fresh one cannot show: the celebration. A dev door (`?won`), not a
 * game state a player reaches this way; the rules are untouched, this only seats the cards.
 */
export function winKlondike(board: SolitaireBoard): void {
  const cards = [...board.stock.children];
  for (const c of cards) remove(board.stock, c);
  const bySuit = new Map<string, Node[]>();
  for (const c of cards) {
    const v = fieldsOf<ValuedFields>(c, "Valued")?.values;
    const suit = typeof v?.["suit"] === "string" ? (v["suit"] as string) : "?";
    (bySuit.get(suit) ?? bySuit.set(suit, []).get(suit)!).push(c);
  }
  [...bySuit.values()].forEach((suited, i) => {
    suited.sort((a, b) => rankOf(a) - rankOf(b));
    for (const c of suited) {
      setFacing(c, "up");
      add(board.foundations[i % board.foundations.length]!, c);
    }
  });
}

/** 1 (Ace) … 13 (King) off a card's `rank` value, for seating a won foundation in order. */
function rankOf(c: Node): number {
  const rank = fieldsOf<ValuedFields>(c, "Valued")?.values["rank"];
  const order = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  return typeof rank === "string" ? order.indexOf(rank) : -1;
}

export function dealKlondike(board: SolitaireBoard): void {
  for (let i = 0; i < board.tableau.length; i++) {
    for (let j = 0; j <= i; j++) {
      const card = board.stock.children[board.stock.children.length - 1]!; // off the top of the stock
      remove(board.stock, card);
      setFacing(card, j < i ? "down" : "up");
      add(board.tableau[i]!, card);
    }
  }
}
