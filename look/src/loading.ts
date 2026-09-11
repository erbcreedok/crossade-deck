// WHAT A PLAYER LOOKS AT WHILE A GAME IS ARRIVING.
//
// There are three waits, and they used to be three different nothings: the chunk downloading (the
// shelf, with a tile quietly filling), the room answering (a felt-coloured rectangle), and the tree
// arriving (a table with no cards on it yet). One screen covers all three, because from the player's
// side they are one wait.
//
// IT IS PLAIN DOM, and that is the whole reason it works. A loading screen drawn by the engine could
// not be shown until the engine was up, which is most of what is being waited for; these are three
// `<img>` tags over a coloured div, and they are on the glass in the same frame the page is.
//
// THE CARDS ARE THE DECK'S OWN — `deckFaceImage` hands back the very file the table will draw with
// (`@game-presets/cards`), so the ace on the loading screen and the ace on the felt can never be two
// different aces. The same three the shelf's own tile shows: an ace, a king and a queen.

import { crossade, deckFaceImage, type DeckStyle } from "@game-presets/cards";
import { PALETTE } from "./palette.js";

/** The look the product shows its cards in — the shelf's own, so the tile and this agree. */
const DECK: DeckStyle = { layout: "classic", fourColour: false, cyrillic: false };

/** An ace, a king and a queen — the shelf's tile, face up. */
const FACES = ["spade-A", "heart-K", "diamond-Q"] as const;

/** How long one hop takes, and how long a card rests before the next one goes. */
const HOP_MS = 420;
const REST_MS = 140;

/** Card size on the glass, in CSS pixels — a card is 1 × 1.4. */
const CARD_W = 66;
const CARD_H = Math.round(CARD_W * 1.4);
/** How far apart the three slots stand, centre to centre. */
const SLOT_GAP = 44;
/** How high a hop goes. */
const LIFT = 54;

export interface Loading {
  /**
   * The wait is over. The screen fades out and takes itself off the page; calling twice is not an
   * error, because every way a game can finish arriving ends by calling it.
   */
  done(): void;
  /** Whether it is still up — read by tests, and by whoever wonders if they already finished. */
  showing(): boolean;
}

/**
 * Cover `over` with the loading screen until `done()`.
 *
 * `label` is what is being waited for, in the player's language. It is not a progress bar on
 * purpose: a chunk gives no bytes-so-far worth reporting and a room gives none at all, and a bar
 * that invents its own progress is a lie the player learns to distrust.
 */
export function loadingCards(over: HTMLElement, label = ""): Loading {
  const sheet = document.createElement("div");
  // ABOVE EVERYTHING THE STAGE HOLDS, including the desk's own cover (z-index 6) — the desk raises
  // that one as soon as it knows its seat, which is earlier than the table is worth looking at.
  sheet.style.cssText =
    `position:absolute;inset:0;z-index:7;display:flex;flex-direction:column;` +
    `align-items:center;justify-content:center;gap:22px;` +
    `background:${PALETTE.felt};transition:opacity 260ms ease;pointer-events:auto;touch-action:none;`;

  const table = document.createElement("div");
  table.style.cssText = `position:relative;width:${SLOT_GAP * 2 + CARD_W}px;height:${CARD_H + LIFT}px;`;
  sheet.appendChild(table);

  const specOf = (id: string) => crossade().find((c) => c.id === id)!;
  /** Where a slot stands, left to right, measured to the card's own left edge. */
  const slotX = (slot: number): number => slot * SLOT_GAP;

  const cards = FACES.map((id, i) => {
    const card = document.createElement("img");
    card.src = deckFaceImage(specOf(id), DECK);
    card.alt = "";
    card.draggable = false;
    card.style.cssText =
      `position:absolute;bottom:0;left:0;width:${CARD_W}px;height:${CARD_H}px;` +
      `border-radius:5px;box-shadow:0 6px 14px ${PALETTE.black}66;` +
      `transform:translate3d(${slotX(i)}px,0,0);` +
      // ONE TRANSITION FOR BOTH HALVES OF A HOP. The card goes up and across together, which is what
      // a hand doing this actually looks like — lifted straight up and then slid is a robot's move.
      `transition:transform ${HOP_MS}ms cubic-bezier(.34,.8,.3,1);will-change:transform;`;
    table.appendChild(card);
    return card;
  });

  if (label) {
    const caption = document.createElement("div");
    caption.textContent = label;
    caption.style.cssText =
      `font:600 13px/1.2 ui-sans-serif,system-ui,sans-serif;letter-spacing:.14em;` +
      `text-transform:uppercase;color:${PALETTE.inkDim};`;
    sheet.appendChild(caption);
  }

  over.appendChild(sheet);

  /** Which card sits in which slot, left to right. The animation is a rotation of this. */
  let order = cards.map((_, i) => i);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let up = true;

  // A PLAYER WHO ASKED FOR STILLNESS GETS IT. The screen is still shown — it is what says the game
  // is coming — but nothing hops.
  const still = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

  const place = (): void => {
    order.forEach((card, slot) => {
      cards[card]!.style.zIndex = `${slot}`;
      cards[card]!.style.transform = `translate3d(${slotX(slot)}px,0,0)`;
    });
  };

  /**
   * ONE HOP: the card at the front goes up and over to the back, and the other two slide down one
   * slot to meet it. Then the order is what it now looks like, and the next card goes.
   */
  const hop = (): void => {
    if (!up) return;
    const flying = order[0]!;
    const card = cards[flying]!;
    // OVER THE OTHERS WHILE IT TRAVELS, and not under them: a card sliding behind the pile reads as
    // going away rather than moving along.
    card.style.zIndex = "9";
    card.style.transform = `translate3d(${slotX(order.length - 1)}px,${-LIFT}px,0)`;
    for (let slot = 1; slot < order.length; slot++) {
      const other = cards[order[slot]!]!;
      other.style.zIndex = `${slot - 1}`;
      other.style.transform = `translate3d(${slotX(slot - 1)}px,0,0)`;
    }
    timer = setTimeout(() => {
      if (!up) return;
      // ...AND IT COMES DOWN INTO THE PLACE IT FLEW TO. Two steps and not one, because a card that
      // rose and fell in a single tween never leaves the ground at the moment the eye is looking.
      card.style.transform = `translate3d(${slotX(order.length - 1)}px,0,0)`;
      order = [...order.slice(1), flying];
      timer = setTimeout(hop, REST_MS + HOP_MS / 2);
    }, HOP_MS * 0.55);
  };

  place();
  if (!still) timer = setTimeout(hop, REST_MS);

  return {
    done() {
      if (!up) return;
      up = false;
      if (timer !== undefined) clearTimeout(timer);
      sheet.style.opacity = "0";
      // REMOVED AFTER THE FADE, not instead of it: taken off the page at once, the table appears
      // with a cut, and a cut reads as the page having reloaded rather than the game having opened.
      setTimeout(() => sheet.remove(), 280);
    },
    showing: () => up,
  };
}
