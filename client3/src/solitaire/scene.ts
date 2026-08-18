// THE SOLITAIRE HOST — the interactive layer over the engine's model. It turns pointer gestures
// into moves: lift a face-up card (and the ordered run above it), drop it where Klondike allows,
// reveal what it uncovered, deal the stock, and notice the win. Legality is `rules.ts`; grabbing a
// run, holding the tree and rendering are the engine's.

import {
  add,
  apply,
  attachMotion,
  caps,
  compose,
  DEFAULT_VIEWER,
  facing,
  fieldsOf,
  glassOf,
  IDENTITY,
  installStockCarries,
  installStockEasings,
  installStockFlips,
  installStockGrabs,
  installStockLayouts,
  installStockSurfaces,
  installTheme,
  mount,
  pick,
  registerSurface,
  remove,
  setFacing,
  toUnits,
  Transformable,
  transformsOf,
  wearInvite,
  type CarryItem,
  type Node,
  type Point,
  type TuningPatch,
  type ValuedFields,
} from "game-kit";
import { pixiPainter } from "game-kit/pixi";
import { buildBoard, COLUMN_STEP, dealKlondike, installSolitaireLayouts, winKlondike, type SolitaireBoard } from "./board.ts";
import { canOnFoundation, canOnTableau, isRunOrdered, valueOf, type CardValue } from "./rules.ts";

// THE FEEL OF THIS GAME, in one literal — the designer's patch over the engine's tuning. Everything
// not named here is the engine's default (the `rigid` carry that keeps a column one plank, the lift
// pop, the whip lean); what solitaire wants differently is a slower settle, so a dealt card can be
// followed by the eye. The player's own speed sits above this on the viewer plane
// (`host.setViewer({ ...host.viewer(), motionSpeed })`) and multiplies everything, this included.
const FEEL: TuningPatch = { settleMs: 240 };

// THE CELEBRATION — the old Windows solitaire's cascade, as this game's own data: how the cards
// leave the foundations once the last one lands. Written here and not in the engine, because it is
// solitaire's ceremony; written in ten lines, because the engine already knows how to throw a body
// down the screen and keep the glass (`launch` + `retain`). The player's speed applies to it as to
// everything else — at 0 the desk simply clears.
const CASCADE = { speed: 3.5, spread: 3, angles: [200, 250, 290, 340] } as const;

function fitUnit(v: { width: number; height: number }): number {
  return Math.max(20, Math.min(v.width / 8.6, v.height / 8.4));
}

export function startSolitaire(container: HTMLElement): () => void {
  installTheme(document, DEFAULT_VIEWER.theme);
  installStockLayouts();
  installStockSurfaces();
  installStockGrabs();
  installStockFlips();
  installStockEasings();
  installStockCarries();
  installSolitaireLayouts();
  registerSurface("sol/slot", {
    layers: [{ paint: "panelBg", opacity: 0.28 }],
    radius: 0.09,
    stroke: { color: "panelBorder", width: 0.025, dash: { on: 0.14, off: 0.1 } },
  });

  let board: SolitaireBoard = buildBoard();
  // The dev door: `?won` seats the whole deck on the foundations BEFORE the table is mounted — a
  // table already won, resting there from its first frame (no deal, no settle off the stock) — and
  // the first tap is the ceremony. The one way to see it without fifty-two moves.
  const wonAtOnce = new URLSearchParams(globalThis.location?.search ?? "").has("won");
  if (wonAtOnce) winKlondike(board);
  const host = mount(container, board.desk, { ...DEFAULT_VIEWER, hudUnit: fitUnit({ width: 400, height: 400 }) });
  const first = host.viewport();
  const painter = pixiPainter(host.view, { width: first.width, height: first.height, resolution: first.dpr });
  const motion = attachMotion(host, painter, FEEL);
  const view = host.view;
  // A touch surface would otherwise spend a double-tap on the browser's own zoom, and a drag on a
  // pan — so the canvas claims every pointer gesture for itself.
  view.style.touchAction = "none";
  const redraw = (): void => host.setRoot(board.desk);

  let lastUnit = -1;
  const applyFit = (): void => {
    const u = fitUnit(host.viewport());
    if (u === lastUnit) return;
    lastUnit = u;
    host.setViewer({ ...host.viewer(), hudUnit: u });
  };
  host.onChange(applyFit);
  applyFit();

  // The board mounted with the whole deck stacked in the stock; dealing NOW — after the motion
  // runtime is watching — moves each card's rest pose from the stock to its seat, so the deal flies
  // in on the one clock instead of appearing already laid out.
  if (!wonAtOnce) dealKlondike(board);
  redraw();

  // ---- reading the model ------------------------------------------------------------------

  const isCard = (n: Node): boolean => caps(n).has("Valued");
  const cardValue = (n: Node): CardValue | undefined => valueOf(fieldsOf<ValuedFields>(n, "Valued")?.values);
  const topOf = (pile: Node, exclude: ReadonlySet<string> = EMPTY): CardValue | undefined => {
    for (let i = pile.children.length - 1; i >= 0; i--) {
      const c = pile.children[i]!;
      if (!exclude.has(c.id)) return cardValue(c);
    }
    return undefined;
  };
  const pileById = (id: string): Node | undefined =>
    [board.stock, board.waste, ...board.foundations, ...board.tableau].find((p) => p.id === id);
  const kindOf = (pile: Node): "stock" | "waste" | "foundation" | "tableau" | "none" =>
    pile.id === "stock" ? "stock" : pile.id === "waste" ? "waste" : pile.id.startsWith("foundation") ? "foundation" : pile.id.startsWith("tableau") ? "tableau" : "none";

  // ---- the drag ---------------------------------------------------------------------------

  let run: Node[] = []; // the cards being carried, bottom-first
  let source: Node | undefined; // the pile they left
  let grab: Point = { x: 0, y: 0 };
  let undoInvites: Array<() => void> = []; // undresses every pile the grab invited
  // A press is a candidate until the pointer moves past the threshold — only then is it a drag. A
  // press that never moves is a TAP (which does nothing) or half of a double-click (which auto-moves).
  // Without this a double-click would reparent the card twice mid-gesture and fight its own auto-move.
  let pending: { hit: Node; startG: Point; pointerId: number } | undefined;
  const DRAG_SLOP = 5; // px
  // A tap that lifted nothing may be one half of a double-tap. `dblclick` is a MOUSE event a touch
  // screen never fires, so the two taps are counted here, off the same pointer stream the drag uses.
  let lastTap: { id: string; ms: number; g: Point } | undefined;
  const DOUBLE_MS = 320; // between the two taps
  const DOUBLE_SLOP = 28; // px the second tap may sit from the first

  const setAt = (n: Node, at: Point): void => {
    compose(n, Transformable({ at }));
  };

  /** The carried run as engine items — each card's offset DOWN the column from the grab pivot. */
  const carryItems = (): CarryItem[] => run.map((c, i) => ({ id: c.id, offset: { x: 0, y: i * COLUMN_STEP } }));

  /** The ordered, all-face-up run a card leads, or null if it cannot be lifted from where it sits. */
  const runFrom = (card: Node): Node[] | null => {
    const pile = card.parent;
    if (!pile) return null;
    const above = pile.children.slice(pile.children.indexOf(card));
    if (above.some((c) => facing(c) === "down")) return null;
    const values = above.map(cardValue).filter((v): v is CardValue => !!v);
    return values.length === above.length && isRunOrdered(values) ? above : null;
  };

  /** Reparent a run onto its destination, uncover what it left, and let the clock ease it into place. */
  const landRun = (cards: Node[], src: Node, dest: Node): void => {
    for (const c of cards) remove(c.parent ?? src, c);
    for (const c of cards) add(dest, c);
    for (const c of cards) motion.release(c.id); // in case a gesture held them — a no-op otherwise
    if (kindOf(src) === "tableau") {
      const top = src.children[src.children.length - 1];
      // Uncovered a face-down card: turn it over on the clock — it flips as the run slides away.
      if (top && facing(top) === "down") motion.flip(top.id, () => setFacing(top, "up"));
    }
    redraw();
    checkWin();
  };

  const beginDrag = (hit: Node, startG: Point, pointerId: number): void => {
    const above = runFrom(hit);
    if (!above) return;
    const anchorAt = originOf(board.desk, hit.id);
    run = above;
    source = hit.parent!;
    // Reparent onto the desk — a tree write, once. Riding ABOVE everything is not: the runtime
    // reports every finger-owned and flying node to the plan (`raised`), so no z is written and
    // nothing stale survives the landing. Writing `LIFT_Z` here is exactly how every once-dragged
    // card ended up covering its later pile-mates forever.
    for (const c of above) remove(source, c);
    for (const c of above) add(board.desk, c);
    for (const c of above) setAt(c, anchorAt);
    const p = toUnits(host, startG);
    grab = { x: anchorAt.x - p.x, y: anchorAt.y - p.y };
    // Every pile that would TAKE this run puts its invite on — Klondike's legality picks them,
    // the atom dresses them. Before the grab draws, so its first frame already shows the rings.
    undoInvites = willingPiles().map(wearInvite);
    // The finger owns the run: a spring carry (lag + whip + pop), never a tree write. Rigid style, so
    // the column tilts as one plank about the pivot.
    motion.grab(carryItems(), { anchor: anchorAt });
    view.setPointerCapture(pointerId);
  };

  /** The piles Klondike would let the carried run land on — the scene's own rules, not an Acceptor. */
  const willingPiles = (): Node[] => {
    const bottom = cardValue(run[0]!);
    if (!bottom) return [];
    const carried = new Set(run.map((c) => c.id));
    const takers: Node[] = [];
    if (run.length === 1) {
      for (const f of board.foundations) if (f !== source && canOnFoundation(bottom, topOf(f, carried))) takers.push(f);
    }
    for (const t of board.tableau) if (t !== source && canOnTableau(bottom, topOf(t, carried))) takers.push(t);
    return takers;
  };

  const onDown = (e: PointerEvent): void => {
    // The ceremony is the player's to run: once it has begun, every press launches the NEXT card at
    // once — no waiting on the one before to land. This is caught before anything else, so a tap on
    // the glass mid-cascade never reaches a pile, the stock, or a drag.
    if (celebrated) {
      launchNext();
      return;
    }
    // The dev door's table is already won: the first tap anywhere is the ceremony (by then the
    // renderer has presented the table and its pictures — a glass kept from before that is blank).
    if (wonAtOnce) {
      celebrate();
      return;
    }
    const g = glassOf(view, e);
    const hit = pick(host, board.desk, g, (n) => isCard(n) || caps(n).has("Container"));
    if (!hit) return;
    // A press on the stock deals, it does not drag — resolve that first.
    const pileHit = isCard(hit) ? hit.parent : hit;
    if (pileHit && kindOf(pileHit) === "stock") {
      dealFromStock();
      return;
    }
    if (!isCard(hit) || facing(hit) === "down") return; // a face-down card is not liftable
    pending = { hit, startG: g, pointerId: e.pointerId }; // a candidate — a move past the slop makes it a drag
  };

  const onMove = (e: PointerEvent): void => {
    const g = glassOf(view, e);
    if (run.length > 0) {
      const p = toUnits(host, g);
      motion.dragTo({ x: p.x + grab.x, y: p.y + grab.y }); // retarget the chase spring, one paint, no tree write
      return;
    }
    if (!pending) return;
    if (Math.hypot(g.x - pending.startG.x, g.y - pending.startG.y) < DRAG_SLOP) return;
    beginDrag(pending.hit, pending.startG, pending.pointerId);
    pending = undefined;
    if (run.length > 0) {
      const p = toUnits(host, g);
      motion.dragTo({ x: p.x + grab.x, y: p.y + grab.y });
    }
  };

  const onUp = (e: PointerEvent): void => {
    // A press that never crossed the slop lifted nothing — but it is a tap, and two of them auto-move.
    const tapped = pending?.hit;
    pending = undefined;
    if (run.length === 0) {
      if (tapped) registerTap(tapped, e);
      return;
    }
    lastTap = undefined; // a drag is not a tap — do not let it pair with a later one
    view.releasePointerCapture?.(e.pointerId);
    // The invitation ends with the gesture: undress every pile before the landing redraw.
    for (const undo of undoInvites) undo();
    undoInvites = [];
    const g = glassOf(view, e);
    const carried = new Set(run.map((c) => c.id));
    const targetPile = dropTarget(g, carried);
    const bottom = cardValue(run[0]!);

    let landed: Node | undefined;
    if (targetPile && bottom) {
      const kind = kindOf(targetPile);
      const top = topOf(targetPile, carried);
      if (kind === "foundation" && run.length === 1 && canOnFoundation(bottom, top)) landed = targetPile;
      else if (kind === "tableau" && canOnTableau(bottom, top)) landed = targetPile;
    }

    landRun(run, source!, landed ?? source!);
    run = [];
    source = undefined;
  };

  // Two taps on the same card, close in time and place, auto-move it without a drag — the way to WATCH
  // the settle animation on its own. Works for a mouse double-click and a finger double-tap alike,
  // because both arrive as the same pointerup taps; the mouse-only `dblclick` never reached the phone.
  const registerTap = (card: Node, e: PointerEvent): void => {
    const g = glassOf(view, e);
    const prev = lastTap;
    if (prev && prev.id === card.id && e.timeStamp - prev.ms < DOUBLE_MS && Math.hypot(g.x - prev.g.x, g.y - prev.g.y) < DOUBLE_SLOP) {
      lastTap = undefined;
      autoMove(card);
      return;
    }
    lastTap = { id: card.id, ms: e.timeStamp, g };
  };

  // Auto-move a card and the run it leads. Destination priority (owner's rule): up to a foundation
  // first, else a tableau column to the RIGHT, else one to the left.
  const autoMove = (hit: Node): void => {
    if (facing(hit) === "down") return;
    const cards = runFrom(hit);
    if (!cards) return;
    const bottom = cardValue(cards[0]!);
    if (!bottom) return;
    const src = hit.parent!;
    const dest = autoDestination(src, bottom, cards.length);
    if (dest) landRun(cards, src, dest);
  };

  /** Where a double-clicked run should go: foundation (up) first, then columns rightward, then leftward. */
  const autoDestination = (src: Node, bottom: CardValue, len: number): Node | undefined => {
    if (len === 1) {
      for (const f of board.foundations) if (canOnFoundation(bottom, topOf(f))) return f;
    }
    const srcIdx = board.tableau.indexOf(src);
    const order: number[] = [];
    if (srcIdx < 0) {
      for (let i = 0; i < board.tableau.length; i++) order.push(i);
    } else {
      for (let i = srcIdx + 1; i < board.tableau.length; i++) order.push(i); // to the right first
      for (let i = 0; i < srcIdx; i++) order.push(i); // then to the left
    }
    for (const i of order) {
      const t = board.tableau[i]!;
      if (t !== src && canOnTableau(bottom, topOf(t))) return t;
    }
    return undefined;
  };

  /** The pile under a released run: a bare slot, or the pile a covered card belongs to. */
  const dropTarget = (g: Point, carried: ReadonlySet<string>): Node | undefined => {
    const hit = pick(host, board.desk, g, (n) => (isCard(n) && !carried.has(n.id)) || caps(n).has("Container"));
    if (!hit) return undefined;
    const pile = isCard(hit) ? hit.parent ?? undefined : hit;
    return pile && kindOf(pile) !== "none" ? pile : undefined;
  };

  // ---- the stock ---------------------------------------------------------------------------

  const dealFromStock = (): void => {
    if (board.stock.children.length > 0) {
      const top = board.stock.children[board.stock.children.length - 1]!;
      remove(board.stock, top);
      setFacing(top, "up");
      add(board.waste, top);
    } else {
      // Recycle: the waste returns to the stock, face-down, its order reversed.
      const back = [...board.waste.children].reverse();
      for (const c of back) {
        remove(board.waste, c);
        setFacing(c, "down");
        add(board.stock, c);
      }
    }
    redraw();
  };

  const checkWin = (): void => {
    const done = board.foundations.reduce((n, f) => n + f.children.length, 0);
    if (done === 52) celebrate();
  };

  /**
   * The cards leave the foundations IN ORDER — the four kings, one after another, then the four
   * queens, and so on down to the aces. The show runs on its OWN — each card hands the baton to the
   * next at its first touch of the floor (`onBounce`), or when it is gone if it never touched down.
   * A press only HURRIES it: every tap throws the next card at once, ahead of the baton, so a
   * fast-tapping player empties the desk faster than the timer would (the button is acceleration,
   * not a replacement). Every card is thrown up and sideways, pulled down by gravity, bounces off
   * the bottom of the glass, and is gone off the side; the glass KEEPS every frame, so each leaves
   * its trail. When the last card is gone the desk repaints, bare foundations and all.
   */
  let celebrated = false;
  let cascade: Node[] = []; // the foundations' cards, king-first down to the aces
  let launched = 0; // how many have been thrown so far
  let finished = 0; // how many have flown off and been removed

  /**
   * Throw the next card in the cascade, if any is left. The first waits one settle; the rest are
   * instant. Both the auto-baton and a player's tap call this — `launched` bumps before the throw,
   * so the same card never goes twice; a tap simply advances the index earlier than the baton would.
   */
  const launchNext = (): void => {
    if (launched >= cascade.length) return;
    const c = cascade[launched]!;
    // The winning move is still landing on its foundation when the first card goes: it waits one
    // settle out, so it leaves from its seat and not from mid-air. Every later card goes at once.
    const delayMs = launched === 0 ? motion.tuning().settleMs : 0;
    launched++;
    let handed = false;
    const hand = (): void => { if (handed) return; handed = true; launchNext(); };
    const [a0, a1] = Math.random() < 0.5 ? [CASCADE.angles[0], CASCADE.angles[1]] : [CASCADE.angles[2], CASCADE.angles[3]];
    motion.launch(c.id, {
      delayMs,
      speed: CASCADE.speed + Math.random() * CASCADE.spread,
      angle: a0 + Math.random() * (a1 - a0),
      onBounce: hand, // the baton: the next card goes at this one's first floor touch
      onDone: () => {
        hand(); // a flat throw that never bounced still passes the baton on its way out
        if (c.parent) remove(c.parent, c);
        // Once every card that was launched is gone — and none is left to launch — the desk repaints
        // bare. (While cards remain unlaunched, the last landing does not end the show.)
        if (++finished === cascade.length) {
          motion.retain(false);
          redraw();
        }
      },
    });
  };

  const celebrate = (): void => {
    if (celebrated) return;
    const layers = Math.max(0, ...board.foundations.map((f) => f.children.length));
    cascade = [];
    for (let j = 0; j < layers; j++) {
      for (const f of board.foundations) {
        const c = f.children[f.children.length - 1 - j];
        if (c) cascade.push(c);
      }
    }
    if (cascade.length === 0) return;
    celebrated = true;
    launched = 0;
    finished = 0;
    motion.retain(true);
    launchNext(); // the first card leaves on the press that began the ceremony
  };

  view.addEventListener("pointerdown", onDown);
  view.addEventListener("pointermove", onMove);
  view.addEventListener("pointerup", onUp);
  view.addEventListener("pointercancel", onUp);

  return () => {
    view.removeEventListener("pointerdown", onDown);
    view.removeEventListener("pointermove", onMove);
    view.removeEventListener("pointerup", onUp);
    view.removeEventListener("pointercancel", onUp);
    motion.stop();
    painter.destroy();
    host.unmount();
  };
}

const EMPTY: ReadonlySet<string> = new Set();

/** Where a node's own origin lands, in root units — used to lift a run without a jump. */
function originOf(root: Node, id: string): Point {
  const t = transformsOf(root).get(id) ?? IDENTITY;
  return apply(t, { x: 0, y: 0 });
}
