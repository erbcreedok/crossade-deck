// THE BOARD — a Klondike table built entirely from engine primitives: containers with layouts,
// grab policies, and the crossade deck. Stock · waste · four foundations · seven tableau columns.
// Nothing here is bespoke rendering; the piles are `Container`s, the cards are `deck()` nodes, and
// the deal is `add()` into them with a face-down flip where the rules want one.

import {
  add,
  Bounded,
  Container,
  Grabber,
  node,
  rect,
  registerLayout,
  setFacing,
  Surfaced,
  Transformable,
  type Node,
} from "game-kit";
import { deckByCardId } from "@game-presets/cards";

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
  for (let i = pips.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pips[i], pips[j]] = [pips[j]!, pips[i]!];
  }
  return pips;
}

function pile(id: string, x: number, y: number, layout: string, grab?: string): Node {
  const atoms = [
    Transformable({ at: { x, y } }),
    Bounded({ bounds: rect(1, 1.4) }),
    Container({ layout }),
    Surfaced({ surface: "sol/slot" }),
  ];
  const n = node(id, ...atoms);
  if (grab) n.atoms.set("Grabber", Grabber({ grab }));
  return n;
}

/** Build a fresh, dealt Klondike table. */
export function buildBoard(): SolitaireBoard {
  const desk = node("desk", Transformable({ at: { x: 0, y: 0 } }), Container({ layout: "free" }));

  const stock = pile("stock", COL_X[0]!, TOP_Y, "sol/pile");
  const waste = pile("waste", COL_X[1]!, TOP_Y, "sol/pile", "top");
  const foundations = [0, 1, 2, 3].map((i) => pile(`foundation:${i}`, COL_X[3 + i]!, TOP_Y, "sol/pile", "top"));
  const tableau = COL_X.map((x, i) => pile(`tableau:${i}`, x, TABLEAU_Y, "sol/column", "above"));

  for (const p of [stock, waste, ...foundations, ...tableau]) add(desk, p);

  // THE DEAL: column i gets i+1 cards, only its last face-up; the rest go to the stock, face-down.
  const cards = shuffledPips();
  let k = 0;
  for (let i = 0; i < tableau.length; i++) {
    for (let j = 0; j <= i; j++) {
      const card = cards[k++]!;
      setFacing(card, j < i ? "down" : "up");
      add(tableau[i]!, card);
    }
  }
  for (; k < cards.length; k++) {
    setFacing(cards[k]!, "down");
    add(stock, cards[k]!);
  }

  return { desk, stock, waste, foundations, tableau };
}
