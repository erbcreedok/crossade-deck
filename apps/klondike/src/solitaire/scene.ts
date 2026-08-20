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
  installStockCoats,
  installStockEasings,
  installStockFlips,
  installStockGrabs,
  installStockLayouts,
  installStockSurfaces,
  installTheme,
  mount,
  Container,
  node,
  pick,
  pickTop,
  rect,
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
import {
  button,
  hud,
  wireButtons,
} from "game-kit";
import { pixiPainter } from "game-kit/pixi";
import { klondikeRuler } from "../look/fonts.js";
import { RING_U } from "../look/palette.js";
import { BAR, CONTROL_H, CONTROL_W, FACE, installKlondikeLook, LABEL, LABEL_QUIET, PLATE } from "../look/surfaces.js";
import {
  buildBoard,
  dealPlan,
  installSolitaireLayouts,
  densityName,
  densityNamed,
  layoutFor,
  nextLayout,
  relayBoard,
  winKlondike,
  type SolitaireBoard,
  type TableLayout,
} from "./board.js";
import {
  applySnapshot,
  browserStore,
  clearSave,
  loadLayout,
  loadSave,
  MAX_PAST,
  snapshot,
  storeLayout,
  storeSave,
  type Snapshot,
} from "./save.js";
import { canOnFoundation, canOnTableau, isRunOrdered, valueOf, type CardValue } from "./rules.js";

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

// THE DEAL — how the gathered deck lays itself out once the player clicks the stock. The table opens
// with all fifty-two stacked in the stock and seven empty columns; the first click deals the classic
// triangle, one card after another (`dealPlan`'s row-major order). `stepMs` is the gap between cards;
// the player's speed divides it, so the whole deal quickens or slows with everything else (at speed 0
// it lands at once). Each card still FLIES from the stock to its seat on the settle.
const DEAL = { stepMs: 80 } as const;

function fitUnit(v: { width: number; height: number }, layout: TableLayout): number {
  return Math.max(20, Math.min(v.width / layout.fit.w, v.height / layout.fit.h));
}

/** The screen the table is opened on, before the host exists to be asked. */
const firstScreen = (): { width: number; height: number } => ({
  width: globalThis.innerWidth || 400,
  height: globalThis.innerHeight || 400,
});

export function startSolitaire(container: HTMLElement): () => void {
  installTheme(document, DEFAULT_VIEWER.theme);
  installStockLayouts();
  installStockSurfaces();
  // THE COATS, without which every runtime dressing on this table is a silent no-op: a control that
  // declines to act wears `wash`, a willing pile wears `ring`, and a recipe nobody registered draws
  // nothing at all — no warning, just a control that looks awake and a pile that says nothing.
  installStockCoats();
  installStockGrabs();
  installStockFlips();
  installStockEasings();
  installStockCarries();
  // THE SPACING THE PLAYER LEFT, read before the table is built with it: the columns are seated at
  // build time, so a table built roomy and re-spaced a frame later would jump in front of the player.
  const store = browserStore();
  // THE DENSITY is the player's and is remembered; the FAMILY is the screen's and is measured every
  // time it changes. A phone turned on its side re-lays the table without touching what was chosen.
  let tight = densityNamed(loadLayout(store) ?? "");
  let layout = layoutFor(firstScreen(), tight);
  installSolitaireLayouts(layout);
  installKlondikeLook();
  registerSurface("sol/slot", {
    layers: [{ paint: "panelBg", opacity: 0.28 }],
    radius: 0.09,
    stroke: { color: "panelBorder", width: 0.025, dash: { on: 0.14, off: 0.1 } },
  });

  const board: SolitaireBoard = buildBoard(layout);
  // The dev door: `?won` seats the whole deck on the foundations BEFORE the table is mounted — a
  // table already won, resting there from its first frame (no deal, no settle off the stock) — and
  // the first tap is the ceremony. The one way to see it without fifty-two moves.
  const wonAtOnce = new URLSearchParams(globalThis.location?.search ?? "").has("won");
  if (wonAtOnce) winKlondike(board);

  // THE TABLE THE PLAYER LEFT. Read before the first frame, so the game opens where it stood rather
  // than dealing a new one and replacing it a moment later. A save that does not fit this deck is
  // simply not there — `applySnapshot` refuses whole, and the fresh shuffle already in `board` is
  // what the player gets. The dev door does not read it: `?won` asks for a specific table.
  let past: Snapshot[] = [];
  // The opening deal is a one-time thing: `dealt` latches when it begins, `dealDone` when the last
  // card has seated. Between the two, the stock is deaf (a press mid-deal does nothing). The timer
  // paces the cards; the teardown clears it so no card seats after the table is gone. They live up
  // here beside the save because a restored table is already dealt and must not deal itself again.
  let dealt = false;
  let dealDone = false;
  let dealTimer: ReturnType<typeof setTimeout> | undefined;
  const host = mount(container, board.desk, { ...DEFAULT_VIEWER, hudUnit: fitUnit(firstScreen(), layout) });
  const first = host.viewport();
  const painter = pixiPainter(host.view, { width: first.width, height: first.height, resolution: first.dpr });
  // THE RULER. Without it a caption has nothing to be measured against, so every control on the
  // table came out as a bare plate — the text layer needs a port, and a game must hand it one.
  const ruler = klondikeRuler();
  const motion = attachMotion(host, painter, { ...FEEL, measure: ruler });
  const view = host.view;
  // A touch surface would otherwise spend a double-tap on the browser's own zoom, and a drag on a
  // pan — so the canvas claims every pointer gesture for itself.
  view.style.touchAction = "none";
  const redraw = (): void => host.setRoot(board.desk);

  let lastUnit = -1;
  /**
   * WHAT TO DO WHEN THE SCREEN CHANGED FAMILY — put back, from below, once there is a bar to put.
   *
   * The fit runs before the first frame and the bar is built after it, so this cannot simply call
   * `dressDesk`: reaching a `const` declared further down is exactly the crash this file shipped
   * once already. A hook filled in later is the seam, and until it is filled the fit still fits.
   */
  let relaid: (() => void) | undefined;
  /**
   * FIT THE TABLE TO THE SCREEN IT IS ON — and re-lay it when the screen changed family.
   *
   * A phone turned on its side is not a resize, it is a different table: the bar moves from under
   * the thumb to over the cards and the columns change depth. The density is untouched, so what the
   * player chose survives the turn.
   */
  const applyFit = (): void => {
    const seen = host.viewport();
    const want = layoutFor(seen, tight);
    if (want !== layout) {
      layout = want;
      relayBoard(board, layout);
      lastUnit = -1;
      relaid?.();
    }
    const u = fitUnit(seen, layout);
    if (u === lastUnit) return;
    lastUnit = u;
    host.setViewer({ ...host.viewer(), hudUnit: u });
  };
  host.onChange(applyFit);
  applyFit();

  /**
   * Take the table down before changing it. Called BEFORE a move, never after: what the player wants
   * back is the table as it stood, and after the move it is gone. The near past is what undo walks,
   * so the far end is what gets dropped when the stack is full.
   */
  const remember = (): void => {
    past.push(snapshot(board, dealt));
    if (past.length > MAX_PAST) past.shift();
  };

  /** Write the table down. Every committed change ends here; nothing else touches the storage. */
  const keep = (): void => storeSave(store, { now: snapshot(board, dealt), past });

  // THE TABLE THE PLAYER LEFT, seated before the first frame — so the game opens where it stood
  // instead of dealing a new one and replacing it a blink later. A save that does not fit this deck
  // is simply not there: `applySnapshot` refuses whole and the fresh shuffle already in `board`
  // stands. The dev door skips it — `?won` asked for one particular table.
  if (!wonAtOnce) {
    const saved = loadSave(store);
    if (saved && applySnapshot(board, saved.now)) {
      past = [...saved.past];
      dealt = saved.now.dealt;
      dealDone = dealt;
    }
  }

  // The board opens UNDEALT: the whole deck stacked in the stock, seven empty columns. The deal is
  // the player's first move — a click on the stock lays the triangle out (`dealTableau`), each card
  // flying from the stock to its seat on the motion clock. (The `?won` dev door skips all of this.)
  redraw();

  // ---- the controls -------------------------------------------------------------------------

  // THE HINT — shown first, played on the second press. The owner's rule: it never takes the move
  // out of the player's hands, and a hint they did not want costs one press to ignore. The state
  // stands HERE because the bar reads it: a control is drawn from what is true, so what is true has
  // to exist before the first bar is built.
  let hinted: { card: Node; dest: Node } | undefined;
  let undoHint: Array<() => void> = [];

  // THE BAR IS REBUILT, NEVER MUTATED. Whether undo has anywhere to go is the game's state, and the
  // control is drawn FROM it — so the tree cannot disagree with the history about what is possible.
  //
  // WHERE IT STANDS is the SPACING's answer, not this file's: the roomy table is fitted at 8.6 × 8.4
  // units and the tight one at 7.9 × 7.8, so the strip of air above the top row is at a different
  // height on each. `barY` is that height, and the bar is put back there whenever the spacing changes.

  /** client1's plate, written once: the gold ring, the brown face inside it, the pixel caption. */
  const plate = (id: string, label: string, does: string, awake: boolean): Node =>
    button(id, {
      label,
      bounds: rect(CONTROL_W, CONTROL_H),
      surface: PLATE,
      face: FACE,
      inset: RING_U,
      style: awake ? LABEL : LABEL_QUIET,
      shadow: "silhouette",
      means: { does },
      asleep: !awake,
    });

  const barTree = (): Node =>
    // The kit's own bar: it measures itself from what it holds, so nothing here adds up four widths
    // and three gaps to say how big the row is — and a row that reported nothing would be laid
    // through by whatever placed it.
    hud("hud", {
      layout: BAR,
      at: { x: 0, y: layout.barY },
      controls: [
        // A control with nothing behind it is dressed as asleep rather than removed: a row that
        // changes WIDTH as a game goes on makes the player re-aim at every move.
        plate("hud/undo", "Отменить", "undo", past.length > 0),
        plate("hud/again", "Заново", "restart", true),
        plate("hud/hint", hinted ? "Сыграть" : "Подсказка", "hint", dealt),
        // The spacing control says what the PRESS DOES, not which spacing is on — the table itself
        // already shows which one is on, and a control that names the state reads as a claim about
        // the wrong thing. Awake always: how much air the cards get is never illegal to ask for.
        plate("hud/space", nextLayout(layout).tight ? "Плотно" : "Просторно", "space", true),
      ],
    });

  /**
   * Put the bar back after any change — ON THE SECOND ROOT, which is what a bar is for.
   *
   * The desk is what a camera moves; the HUD is what it does not, and that is the entire difference
   * between the two roots. This table has no camera today and the picture is identical either way —
   * which is exactly why the move is worth making NOW: the day it gets one, a bar sitting among the
   * cards would pan away with them, and the fix would be needed under a player's finger rather than
   * in a quiet refactor.
   */
  const dressDesk = (): void => {
    const screen = node("screen", Container({ layout: "free" }));
    add(screen, barTree());
    host.setHudRoot(screen);
  };

  /**
   * SWITCH THE SPACING — the slots move, the game stays exactly where it was.
   *
   * NOT A MOVE, so it is not remembered and undo cannot walk back over it: nothing about which card
   * lies where changes, only how much air stands between them. The preference is written down on its
   * own key, so the table opens the way the player left it and "start again" does not undo the choice.
   *
   * The unit is forced to be recomputed (`lastUnit`), because the fit box itself just changed under a
   * viewport that did not — and without that the table would keep the old spacing's size.
   */
  const respace = (): void => {
    layout = nextLayout(layout);
    tight = layout.tight;
    storeLayout(store, densityName(layout));
    relayBoard(board, layout);
    lastUnit = -1;
    applyFit();
    dressDesk();
    redraw();
  };

  /**
   * THE BAR ANSWERS THE FINGER — and it took the kit's own wiring to do it, which was imported into
   * this file and never called: every control on this table lit nothing, sank nowhere and fired on
   * the way DOWN. A press is down and up on the SAME control, and a finger taken back is no press.
   *
   * Nothing is registered per control, so the bar may be rebuilt as often as it likes: who is under
   * the pointer is asked at the moment there is one.
   */
  const stopButtons = wireButtons({
    host,
    onPress: (meaning) => {
      const does = meaning["does"];
      if (does === "undo") undo();
      else if (does === "restart") restart();
      else if (does === "hint") hint();
      else if (does === "space") respace();
    },
  });

  dressDesk();
  redraw();
  // The bar stands at the SPACING's own height, so a screen that changed family has to rebuild it —
  // on a phone it sits under the thumb, on a wide screen above the cards.
  relaid = (): void => {
    dressDesk();
    redraw();
  };

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
  const DRAG_SLOP = 6; // px — the previous client's own grab threshold
  // A tap that lifted nothing may be one half of a double-tap. `dblclick` is a MOUSE event a touch
  // screen never fires, so the two taps are counted here, off the same pointer stream the drag uses.
  let lastTap: { id: string; ms: number; g: Point } | undefined;
  const DOUBLE_MS = 320; // between the two taps
  const DOUBLE_SLOP = 28; // px the second tap may sit from the first

  const setAt = (n: Node, at: Point): void => {
    compose(n, Transformable({ at }));
  };

  /** The carried run as engine items — each card's offset DOWN the column from the grab pivot. */
  const carryItems = (): CarryItem[] => run.map((c, i) => ({ id: c.id, offset: { x: 0, y: i * layout.step } }));

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
    // A run dropped back where it came from is not a move: nothing changed, so nothing is written
    // down and undo does not gain a step that undoes nothing.
    if (dest !== src) remember();
    for (const c of cards) remove(c.parent ?? src, c);
    for (const c of cards) add(dest, c);
    for (const c of cards) motion.release(c.id); // in case a gesture held them — a no-op otherwise
    if (kindOf(src) === "tableau") {
      const top = src.children[src.children.length - 1];
      // Uncovered a face-down card: turn it over on the clock — it flips as the run slides away.
      if (top && facing(top) === "down") motion.flip(top.id, () => setFacing(top, "up"));
    }
    // The bar is drawn FROM the history, so it is put back wherever the history moves — a move that
    // gave undo somewhere to go must leave undo looking as though it has somewhere to go.
    dressDesk();
    redraw();
    if (dest !== src) keep();
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
    // THE BAR IS ASKED FIRST. A control sits over the desk, and a press that reached a pile through
    // it would move a card the player never aimed at.
    // THE BAR IS ASKED FIRST, and then LET GO OF: a control's gesture is `wireButtons`' business
    // from here on — it lights it, sinks it and fires the press on the way UP. All that is left for
    // this handler is to keep its hands off, or a press on a control would also move a card under it.
    if (pickTop(host, g, (n) => caps(n).has("Pressable"))) return;
    const hit = pick(host, board.desk, g, (n) => isCard(n) || caps(n).has("Container"));
    if (!hit) return;
    // A press on the stock deals, it does not drag — resolve that first. The FIRST press lays the
    // tableau out; once that is done, presses draw to the waste as usual; a press mid-deal is inert.
    const pileHit = isCard(hit) ? hit.parent : hit;
    if (pileHit && kindOf(pileHit) === "stock") {
      if (!dealt) dealTableau();
      else if (dealDone) dealFromStock();
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

  /**
   * Lay the classic triangle out from the stock, one card after another in `dealPlan`'s row-major
   * order — each reparented card's rest pose moves from the stock to its column seat, and the settle
   * flies it there on the motion clock. The player's speed divides the gap between cards; at speed 0
   * the whole tableau lands in one frame (each settle snaps).
   */
  const dealTableau = (): void => {
    if (dealt) return;
    remember();
    dealt = true;
    const steps = dealPlan(board);
    if (steps.length === 0) {
      dealDone = true;
      return;
    }
    const speed = host.viewer().motionSpeed ?? 1;
    const gap = speed > 0 ? DEAL.stepMs / speed : 0;
    let k = 0;
    const step = (): void => {
      // At speed 0 (gap 0) the loop empties the plan at once; otherwise one card seats per tick.
      do {
        const s = steps[k++]!;
        remove(board.stock, s.card);
        setFacing(s.card, s.faceUp ? "up" : "down");
        add(board.tableau[s.col]!, s.card);
      } while (gap === 0 && k < steps.length);
      redraw();
      if (k < steps.length) dealTimer = setTimeout(step, gap);
      else {
        dealDone = true;
        // The table is dealt: the hint has something to look at and undo has somewhere to go, so
        // the bar is put back before the last frame of the deal.
        dressDesk();
        redraw();
        // Written down when the LAST card has seated, not at the first: a save taken mid-deal would
        // restore a table frozen halfway through its own opening.
        keep();
      }
    };
    step();
  };

  const dealFromStock = (): void => {
    remember();
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
    dressDesk();
    redraw();
    keep();
  };

  /** Walk one step back: the table as it stood before the last move. */
  const undo = (): void => {
    const was = past.pop();
    if (!was) return;
    clearHint();
    if (!applySnapshot(board, was)) return;
    dealt = was.dealt;
    dealDone = dealt;
    dressDesk();
    redraw();
    keep();
  };

  /** A new deal. The old table is not kept — nothing to walk back to, and the save goes with it. */
  const restart = (): void => {
    clearHint();
    if (dealTimer) clearTimeout(dealTimer);
    // A FRESH SHUFFLE APPLIED TO THE CARDS ALREADY ON THE DESK: building a second board would mean a
    // second tree and a re-mount, and the cards are the same fifty-two either way.
    applySnapshot(board, snapshot(buildBoard(), false));
    past = [];
    dealt = false;
    dealDone = false;
    celebrated = false;
    clearSave(store);
    dressDesk();
    redraw();
  };

  const clearHint = (): void => {
    for (const off of undoHint) off();
    undoHint = [];
    hinted = undefined;
  };

  /** The first legal move found, read the same way the double-tap reads one. */
  const findMove = (): { card: Node; dest: Node } | undefined => {
    for (const pile of [board.waste, ...board.tableau]) {
      for (const card of pile.children) {
        if (facing(card) !== "up") continue;
        const cards = runFrom(card);
        if (!cards) continue;
        const bottom = cardValue(cards[0]!);
        if (!bottom) continue;
        const dest = autoDestination(pile, bottom, cards.length);
        if (dest) return { card, dest };
      }
    }
    return undefined;
  };

  const hint = (): void => {
    if (hinted) {
      const { card, dest } = hinted;
      clearHint();
      const cards = runFrom(card);
      if (cards) landRun(cards, card.parent!, dest);
      dressDesk();
      redraw();
      return;
    }
    const found = findMove();
    if (!found) return;
    hinted = found;
    // The same ring a willing pile wears under a drag — the player already knows what it means.
    undoHint = [wearInvite(found.dest), wearInvite(found.card)];
    dressDesk();
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
  let baton = -1; // the index of the card that currently carries the baton (the last one launched)

  /**
   * Throw the next card in the cascade, if any is left. The first waits one settle; the rest are
   * instant. ONE card carries the baton at a time — the last one launched — and only its own bounce
   * hands it on. A tap also calls this, moving the baton forward at once; the cards it overtook have
   * already lost the baton, so their later bounces launch nothing. That is why a tap ADDS one card,
   * never a whole new self-firing chain (the runaway that dumped seven at once). `launched` bumps
   * before the throw, so the same card never goes twice.
   */
  const launchNext = (): void => {
    if (launched >= cascade.length) return;
    const i = launched;
    const c = cascade[i]!;
    // The winning move is still landing on its foundation when the first card goes: it waits one
    // settle out, so it leaves from its seat and not from mid-air. Every later card goes at once.
    const delayMs = launched === 0 ? motion.tuning().settleMs : 0;
    launched++;
    baton = i; // this newest card now holds the baton; whoever held it before has lost it
    const advance = (): void => {
      if (baton !== i) return; // a tap (or this card's own onDone after a bounce) already moved it on
      launchNext();
    };
    const [a0, a1] = Math.random() < 0.5 ? [CASCADE.angles[0], CASCADE.angles[1]] : [CASCADE.angles[2], CASCADE.angles[3]];
    motion.launch(c.id, {
      delayMs,
      speed: CASCADE.speed + Math.random() * CASCADE.spread,
      angle: a0 + Math.random() * (a1 - a0),
      onBounce: advance, // the baton passes at this card's first floor touch — if it still holds it
      onDone: () => {
        advance(); // a flat throw that never bounced still hands the baton on its way out
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
    // The game is over, so the table is not kept. Saving the cascade would restore a desk half
    // emptied of cards that were already thrown, with no way to finish and nothing to undo to.
    past = [];
    clearSave(store);
    launched = 0;
    finished = 0;
    baton = -1;
    motion.retain(true);
    launchNext(); // the first card leaves on the press that began the ceremony
  };

  // The faces are not measurable until the font arrives, and a caption laid out against the
  // fallback stays that way — so the first frame with real metrics is asked for once, here.
  void ruler.ready.then(() => redraw());

  view.addEventListener("pointerdown", onDown);
  view.addEventListener("pointermove", onMove);
  view.addEventListener("pointerup", onUp);
  view.addEventListener("pointercancel", onUp);

  return () => {
    view.removeEventListener("pointerdown", onDown);
    view.removeEventListener("pointermove", onMove);
    view.removeEventListener("pointerup", onUp);
    view.removeEventListener("pointercancel", onUp);
    stopButtons();
    if (dealTimer) clearTimeout(dealTimer);
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
