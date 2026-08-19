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
  type TransformableFields,
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

/**
 * HOW SPACIOUS THE TABLE IS — every number a Klondike table is spaced by, as one literal.
 *
 * Two of them ship, and they differ only in how much air stands between the cards. The tight one
 * packs the columns closer and steps a column down in smaller bites, so the whole table asks for
 * LESS of the screen — and what the viewer does with the room it saves is draw every card bigger.
 * That is the whole trick: nothing here says "bigger", the fit box says "smaller", and the card
 * grows into it. A third spacing is a third literal, never a branch in this file.
 */
export interface TableLayout {
  /** Its name — what the save writes down and what the control switches between. */
  readonly id: string;
  /** Between neighbouring columns, in units. A card is 1 wide, so the air between two is this less 1. */
  readonly pitch: number;
  /** How far each further card in a column steps down, in units. */
  readonly step: number;
  /** Where the top row stands — stock, waste and the four foundations. */
  readonly topY: number;
  /** Where the tableau columns begin. */
  readonly tableauY: number;
  /** Where the control bar stands. */
  readonly barY: number;
  /** The box the whole table is fitted into, in units. The screen is divided by THIS. */
  readonly fit: { readonly w: number; readonly h: number };
}

/** THE SPACIOUS TABLE — what the game has always opened with, and what it opens with still. */
export const ROOMY: TableLayout = {
  id: "roomy",
  pitch: 1.2,
  step: 0.32,
  topY: -2.7,
  tableauY: -1.1,
  barY: -3.82,
  fit: { w: 8.6, h: 8.4 },
};

/**
 * THE TIGHT TABLE — a tenth of a unit of air between columns instead of a fifth, and a shorter
 * step down a column. Nine per cent less table, therefore nine per cent more card.
 */
export const TIGHT: TableLayout = {
  id: "tight",
  pitch: 1.08,
  step: 0.28,
  topY: -2.5,
  tableauY: -1,
  barY: -3.52,
  fit: { w: 7.9, h: 7.8 },
};

/** Both spacings, in the order the control walks them. */
export const TABLE_LAYOUTS: readonly TableLayout[] = [ROOMY, TIGHT];

/** The spacing after this one, wrapping — what one press of the control lands on. */
export const nextLayout = (layout: TableLayout): TableLayout =>
  TABLE_LAYOUTS[(TABLE_LAYOUTS.indexOf(layout) + 1) % TABLE_LAYOUTS.length]!;

/** A spacing by name. A name nobody ships is the spacious one — an old save is never a crash. */
export const layoutNamed = (id: string): TableLayout => TABLE_LAYOUTS.find((l) => l.id === id) ?? ROOMY;

/** The seven column centres, in units: six pitches wide, centred on the desk. */
export const columnsOf = (layout: TableLayout): number[] => [-3, -2, -1, 0, 1, 2, 3].map((i) => i * layout.pitch);

/**
 * Register the two arrangements a Klondike table needs: a tight pile and a downward column.
 *
 * The column's step is the SPACING's, so switching spacing re-registers it — a layout is a record
 * under a name, and the name is what the piles hold. Nothing on the table has to be told.
 */
export function installSolitaireLayouts(layout: TableLayout = ROOMY): void {
  registerLayout("sol/pile", { place: (children) => children.map(() => ({ x: 0, y: 0 })) });
  registerLayout("sol/column", { place: (children) => children.map((_c, i) => ({ x: 0, y: i * layout.step })) });
}

/** Seat a node, keeping the rest of its pose — a slot may be lifted or turned by something else. */
function seat(n: Node, x: number, y: number): void {
  compose(n, Transformable({ ...fieldsOf<TransformableFields>(n, "Transformable"), at: { x, y } }));
}

/**
 * RE-SPACE A TABLE THAT IS ALREADY BEING PLAYED — the slots move, the cards stay in them.
 *
 * Not a rebuild: a rebuild would deal a new deck, which is the one thing a player changing the
 * spacing mid-game does not want. Every card is a child of a slot, so moving the slots carries the
 * whole game with them, and the column's own step comes back from the registry.
 */
export function relayBoard(board: SolitaireBoard, layout: TableLayout): void {
  installSolitaireLayouts(layout);
  const cols = columnsOf(layout);
  seat(board.stock, cols[0]!, layout.topY);
  seat(board.waste, cols[1]!, layout.topY);
  board.foundations.forEach((p, i) => seat(p, cols[3 + i]!, layout.topY));
  board.tableau.forEach((p, i) => seat(p, cols[i]!, layout.tableauY));
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
 * The deal is a separate step (`dealPlan`, played by the scene) so a mounted table can animate it —
 * every card slides from the stock to its seat on the motion runtime's clock instead of appearing there.
 */
export function buildBoard(layout: TableLayout = ROOMY): SolitaireBoard {
  // The desk wears the one lamp: the stock light, top-right of the frame, shadows down-left.
  const desk = node("desk", Transformable({ at: { x: 0, y: 0 } }), Container({ layout: "free" }), Lit());

  const cols = columnsOf(layout);
  const stock = slot("stock", cols[0]!, layout.topY, "sol/pile");
  const waste = slot("waste", cols[1]!, layout.topY, "sol/pile", "top");
  const foundations = [0, 1, 2, 3].map((i) => slot(`foundation:${i}`, cols[3 + i]!, layout.topY, "sol/pile", "top"));
  const tableau = cols.map((x, i) => slot(`tableau:${i}`, x, layout.tableauY, "sol/column", "above"));

  for (const p of [stock, waste, ...foundations, ...tableau]) add(desk, p);

  for (const card of shuffledPips()) {
    setFacing(card, "down");
    compose(card, ShadowCaster({ from: "silhouette" })); // casts only once lifted out of a pile
    add(stock, card);
  }

  return { desk, stock, waste, foundations, tableau };
}

/** One dealt card: which column it seats in, and whether it lands face-up (a column's deepest card). */
export interface DealStep {
  readonly card: Node;
  readonly col: number;
  readonly faceUp: boolean;
}

/**
 * The classic Klondike deal, planned in ROW-major order for the eye: row 0 lands a card in every
 * column, row 1 in columns 1…6, row 2 in 2…6, and so on — so the cards go out one after another
 * across the table, not column by column. Column i ends with i+1 cards, only its deepest (the row-i
 * card) face-up. Cards are taken off the TOP of the stock. The plan does NOT touch the tree — it only
 * reads the order; the scene reparents each step as it animates the deal, so every card FLIES from
 * the stock to its seat on the motion clock.
 */
export function dealPlan(board: SolitaireBoard): DealStep[] {
  const cols = board.tableau.length;
  const top = board.stock.children;
  let k = top.length - 1; // peel off the top of the stock, downward
  const steps: DealStep[] = [];
  for (let row = 0; row < cols; row++) {
    for (let col = row; col < cols; col++) {
      const card = top[k--];
      if (card) steps.push({ card, col, faceUp: row === col });
    }
  }
  return steps;
}

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
