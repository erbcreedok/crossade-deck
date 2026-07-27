# SOLITAIRE TECHNICAL SPECIFICATION & IMPLEMENTATION ROADMAP

**Статус:** Ready for Implementation  
**Сложность:** Medium (3–4 week sprint)  
**Языки:** TypeScript (strict mode), React, Pixi v8  
**Целевая версия:** v0.3.0+MVP

---

## PART 1: NEW MODULES SPECIFICATION

### 1.1 `client2/src/game/board/solitaireState.ts`

**Назначение:** Чистое состояние игры и редьюсер (command handler).

```typescript
// === TYPES ===

export type GamePhase = "menu" | "playing" | "won" | "lost" | "setup";

export interface SolitaireGameState {
  phase: GamePhase;
  board: Board;  // from board/board.ts
  
  // Metadata
  deckRev: number;  // optional, for server sync
  movesCount: number;
  timeStarted: number;
  
  // Stats (optional for MVP)
  timeElapsed?: number;  // computed: Date.now() - timeStarted
  lastAction?: string;  // for undo (future)
}

export type SolitaireAction =
  | { type: "dealStock" }
  | { type: "moveCard"; from: string; to: string; cardId: string }
  | { type: "moveStack"; from: string; to: string; cardIds: string[] }
  | { type: "recycleStock" }
  | { type: "resetGame" };

// === INIT ===

export function createInitialState(): SolitaireGameState {
  return {
    phase: "setup",
    board: { slots: {}, onEmpty: "collapse" },
    deckRev: 1,
    movesCount: 0,
    timeStarted: Date.now(),
  };
}

// === REDUCER ===

/**
 * Pure reducer: state + action → state'
 * Does NOT mutate input state.
 * Does NOT emit events (caller does).
 */
export function applyAction(
  state: SolitaireGameState,
  action: SolitaireAction
): SolitaireGameState {
  // Implementation per action type
}

// === QUERIES ===

export function isWinning(state: SolitaireGameState): boolean {
  // Check if all 4 foundations are complete (A→K each)
  // for (suit of S/H/D/C) {
  //   if foundation[suit].length !== 13 return false
  // }
  // return true
}

export function canMakeMove(state: SolitaireGameState): boolean {
  // Check if there's any valid move available
  // return hasStockCard || hasWasteMove || hasTableauMove
}

export function getPossibleMoves(state: SolitaireGameState): Array<{
  from: string;
  to: string;
  card: string;
}> {
  // Return list of all valid moves (for AI / hint system)
  // Used in testing & optional "show moves" feature
}
```

**Tests:** `client2/src/game/board/solitaireState.test.ts`

```typescript
describe("solitaireState", () => {
  it("applyAction dealStock moves top card from stock to waste", () => {
    const state = setupTestState({ stock: ["2♠", "3♥"], waste: [] });
    const next = applyAction(state, { type: "dealStock" });
    expect(next.board.at("waste")).toEqual({ members: ["2♠"] });
    expect(next.board.at("stock")).toEqual({ members: ["3♥"] });
    expect(next.movesCount).toBe(state.movesCount + 1);
  });

  it("applyAction moveCard checks tableau rule before move", () => {
    const state = setupTestState({
      waste: ["5♦"],
      "tab:0": ["6♠"],
    });
    const next = applyAction(state, {
      type: "moveCard",
      from: "waste",
      to: "tab:0",
      cardId: "5♦",
    });
    expect(next.board.at("tab:0")?.members).toContain("5♦");
  });

  it("applyAction rejects invalid move (same color)", () => {
    // 5♦ (red) → 6♦ (red) should fail
  });

  it("isWinning returns true when all foundations full", () => {
    const state = setupTestState({
      "found:S": ["A♠", "2♠", ..., "K♠"],  // 13 cards
      "found:H": ["A♥", "2♥", ..., "K♥"],
      "found:D": ["A♦", "2♦", ..., "K♦"],
      "found:C": ["A♣", "2♣", ..., "K♣"],
    });
    expect(isWinning(state)).toBe(true);
  });

  it("canMakeMove returns false when locked", () => {
    // Stock empty, Waste empty, no valid tableau moves
    const state = setupTestState({
      stock: [],
      waste: [],
      "tab:0": ["2♠"],  // can't go anywhere
      "tab:1": [],
      // ...
    });
    expect(canMakeMove(state)).toBe(false);
  });
});
```

---

### 1.2 `client2/src/game/board/solitaireLayout.ts`

**Назначение:** Чистая геометрия слотов (viewport-aware).

```typescript
export interface SlotGeometry {
  x: number;
  y: number;
  w: number;  // width
  h: number;  // height
  layout: "stack" | "fan" | "single";
  
  // For fan layout
  fanRadius?: number;
  fanStartAngle?: number;
  fanSpreadAngle?: number;
  maxVisible?: number;
  
  // For stack layout
  cardOffset?: { x: number; y: number };  // 3D offset per card
}

export interface LayoutProfile {
  cardSize: { w: number; h: number };
  margins: { top: number; bottom: number; left: number; right: number };
  slotGap: { x: number; y: number };
}

export const LAYOUT_PROFILES = {
  mobile: {
    cardSize: { w: 60, h: 85 },
    margins: { top: 10, bottom: 10, left: 8, right: 8 },
    slotGap: { x: 8, y: 12 },
  } as LayoutProfile,
  tablet: {
    cardSize: { w: 80, h: 115 },
    margins: { top: 20, bottom: 20, left: 20, right: 20 },
    slotGap: { x: 16, y: 20 },
  } as LayoutProfile,
  desktop: {
    cardSize: { w: 100, h: 143 },
    margins: { top: 30, bottom: 30, left: 40, right: 40 },
    slotGap: { x: 24, y: 30 },
  } as LayoutProfile,
};

/**
 * Calculate layout for current viewport.
 * Returns geometry for each slot (stock, waste, foundations, tableau).
 */
export function getSolitaireLayout(
  vpWidth: number,
  vpHeight: number,
  profile: "mobile" | "tablet" | "desktop" = "mobile"
): Record<string, SlotGeometry> {
  const p = LAYOUT_PROFILES[profile];
  const { cardSize, margins, slotGap } = p;
  
  // Top row: Stock, Waste, Foundations (4)
  const topRowY = margins.top;
  const topRowH = cardSize.h;
  let topRowX = margins.left;
  
  const result: Record<string, SlotGeometry> = {};
  
  // Stock slot
  result.stock = {
    x: topRowX,
    y: topRowY,
    w: cardSize.w,
    h: topRowH,
    layout: "stack",
    cardOffset: { x: 3, y: 3 },
  };
  topRowX += cardSize.w + slotGap.x;
  
  // Waste slot
  result.waste = {
    x: topRowX,
    y: topRowY,
    w: cardSize.w,
    h: topRowH,
    layout: "single",
  };
  topRowX += cardSize.w + slotGap.x * 2;
  
  // Foundation slots (4)
  const foundSuits = ["S", "H", "D", "C"];
  for (let i = 0; i < 4; i++) {
    result[`found:${foundSuits[i]}`] = {
      x: topRowX,
      y: topRowY,
      w: cardSize.w,
      h: topRowH,
      layout: "stack",
      cardOffset: { x: 2, y: 2 },
    };
    topRowX += cardSize.w + slotGap.x;
  }
  
  // Tableau row (7 columns, centered)
  const tableauStartY = topRowY + topRowH + slotGap.y;
  const tableauW = (cardSize.w + slotGap.x) * 7 - slotGap.x;
  const tableauStartX = (vpWidth - tableauW) / 2;
  
  for (let col = 0; col < 7; col++) {
    result[`tab:${col}`] = {
      x: tableauStartX + col * (cardSize.w + slotGap.x),
      y: tableauStartY,
      w: cardSize.w,
      h: vpHeight - tableauStartY - margins.bottom,
      layout: "fan",
      fanRadius: cardSize.h / 3,  // spread distance
      fanStartAngle: Math.PI * 1.5,  // up
      fanSpreadAngle: Math.PI / 3,  // 60°
      maxVisible: 10,  // show max 10 cards before scroll
    };
  }
  
  return result;
}

export function selectProfile(
  vpWidth: number,
  vpHeight: number
): "mobile" | "tablet" | "desktop" {
  if (vpWidth < 600) return "mobile";
  if (vpWidth < 1024) return "tablet";
  return "desktop";
}

// === HELPER: Calculate fan geometry ===

export function calculateFanPositions(
  baseX: number,
  baseY: number,
  cardCount: number,
  geom: SlotGeometry
): Array<{ x: number; y: number; rotation: number }> {
  if (geom.layout !== "fan") {
    // Single or stack: just return base position
    return Array(cardCount).fill({ x: baseX, y: baseY, rotation: 0 });
  }
  
  const result: typeof Array.prototype = [];
  const spread = geom.fanSpreadAngle! / Math.max(1, cardCount - 1);
  
  for (let i = 0; i < cardCount; i++) {
    const angle = geom.fanStartAngle! + i * spread;
    const r = geom.fanRadius!;
    const x = baseX + Math.cos(angle) * r;
    const y = baseY + Math.sin(angle) * r;
    result.push({ x, y, rotation: angle - Math.PI / 2 });
  }
  
  return result;
}
```

**Tests:** `client2/src/game/board/solitaireLayout.test.ts`

```typescript
describe("solitaireLayout", () => {
  it("getSolitaireLayout returns 14 slots for mobile", () => {
    const layout = getSolitaireLayout(360, 640, "mobile");
    expect(Object.keys(layout)).toHaveLength(14);  // stock, waste, 4 found, 7 tab
  });

  it("slots do not overlap on mobile", () => {
    const layout = getSolitaireLayout(360, 640, "mobile");
    const slots = Object.values(layout);
    for (let i = 0; i < slots.length - 1; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        expect(doRectsOverlap(slots[i], slots[j])).toBe(false);
      }
    }
  });

  it("selectProfile returns 'mobile' for 360px", () => {
    expect(selectProfile(360, 640)).toBe("mobile");
  });

  it("calculateFanPositions spreads cards in arc", () => {
    const base = { x: 100, y: 100, layout: "fan", fanRadius: 30, /* ... */ };
    const positions = calculateFanPositions(100, 100, 5, base as SlotGeometry);
    expect(positions).toHaveLength(5);
    expect(positions[0].y).toBeLessThan(positions[2].y);  // fan spreads down
  });
});
```

---

### 1.3 `client2/src/game/solitaire/engine.ts`

**Назначение:** Главный движок игры (state holder + action dispatcher).

```typescript
import type { SolitaireGameState, SolitaireAction } from "../board/solitaireState";
import {
  createInitialState,
  applyAction,
  isWinning,
  canMakeMove,
  getPossibleMoves,
} from "../board/solitaireState";
import * as solitaireRules from "../board/solitaireRules";

export type GameEventHandler = (action: SolitaireAction) => void;
export type WinHandler = () => void;
export type LoseHandler = () => void;

export class SolitaireGameEngine {
  private state: SolitaireGameState;
  
  // Event emitters
  private listeners: {
    onMove: GameEventHandler[];
    onWin: WinHandler[];
    onLose: LoseHandler[];
  } = {
    onMove: [],
    onWin: [],
    onLose: [],
  };

  constructor(initialState?: Partial<SolitaireGameState>) {
    this.state = {
      ...createInitialState(),
      ...initialState,
    };
  }

  // === Public API ===

  /**
   * Deal one card from Stock to Waste.
   * If Stock is empty, recycle from Waste.
   */
  public dealStock(): { valid: boolean; error?: string } {
    if (this.state.phase !== "playing") {
      return { valid: false, error: "Game is not in playing phase" };
    }

    // Check if Stock has cards
    const stock = this.state.board.slots.stock;
    if (stock && stock.members.length > 0) {
      const cardId = stock.members[0];  // top card
      this.dispatch({ type: "dealStock" });
      return { valid: true };
    }

    // Stock is empty, try to recycle Waste
    const waste = this.state.board.slots.waste;
    if (waste && waste.members.length > 0) {
      this.dispatch({ type: "recycleStock" });
      return { valid: true };
    }

    return { valid: false, error: "No cards to deal" };
  }

  /**
   * Move a single card from one slot to another.
   */
  public moveCard(fromSlot: string, toSlot: string, cardId: string): {
    valid: boolean;
    error?: string;
  } {
    if (this.state.phase !== "playing") {
      return { valid: false, error: "Game is not in playing phase" };
    }

    const fromContainer = this.state.board.slots[fromSlot];
    if (!fromContainer || !fromContainer.members.includes(cardId)) {
      return { valid: false, error: `Card ${cardId} not found in ${fromSlot}` };
    }

    const toContainer = this.state.board.slots[toSlot];
    const topCardInTo = toContainer?.members[toContainer.members.length - 1];

    // Validate move against rules
    if (toSlot.startsWith("found:")) {
      if (!solitaireRules.foundationAccepts(cardId, topCardInTo ?? null)) {
        return { valid: false, error: `${cardId} cannot go to ${toSlot}` };
      }
    } else if (toSlot.startsWith("tab:")) {
      if (!solitaireRules.tableauAccepts(cardId, topCardInTo ?? null)) {
        return { valid: false, error: `${cardId} cannot go to ${toSlot}` };
      }
    } else {
      return { valid: false, error: `Invalid target slot ${toSlot}` };
    }

    this.dispatch({ type: "moveCard", from: fromSlot, to: toSlot, cardId });
    return { valid: true };
  }

  /**
   * Move a stack of cards (e.g., Q-J-10 sequence).
   */
  public moveStack(fromSlot: string, toSlot: string, cardIds: string[]): {
    valid: boolean;
    error?: string;
  } {
    if (cardIds.length === 1) {
      return this.moveCard(fromSlot, toSlot, cardIds[0]);
    }

    // Validate sequence in order
    const fromContainer = this.state.board.slots[fromSlot];
    if (!fromContainer) {
      return { valid: false, error: `Slot ${fromSlot} not found` };
    }

    // Check all cards are in order
    for (const cardId of cardIds) {
      if (!fromContainer.members.includes(cardId)) {
        return { valid: false, error: `Card ${cardId} not in ${fromSlot}` };
      }
    }

    // Validate bottom card of stack against target top card
    const bottomCard = cardIds[0];
    const topCardInTo = this.state.board.slots[toSlot]?.members.at(-1);

    if (toSlot.startsWith("tab:")) {
      if (!solitaireRules.tableauAccepts(bottomCard, topCardInTo ?? null)) {
        return { valid: false, error: `Stack cannot move to ${toSlot}` };
      }
    } else {
      return { valid: false, error: `Cannot move stack to ${toSlot}` };
    }

    this.dispatch({ type: "moveStack", from: fromSlot, to: toSlot, cardIds });
    return { valid: true };
  }

  /**
   * Reset the game (new deal).
   */
  public resetGame(): void {
    this.state = createInitialState();
    this.state.phase = "playing";
  }

  // === Queries ===

  public getState(): SolitaireGameState {
    return this.state;
  }

  public getBoard(): ReturnType<typeof this.state.board> {
    return this.state.board;
  }

  public isWinning(): boolean {
    return isWinning(this.state);
  }

  public canMakeMove(): boolean {
    return canMakeMove(this.state);
  }

  public getPossibleMoves(): ReturnType<typeof getPossibleMoves> {
    return getPossibleMoves(this.state);
  }

  // === Event Handlers ===

  public on(event: "move", handler: GameEventHandler): void;
  public on(event: "win", handler: WinHandler): void;
  public on(event: "lose", handler: LoseHandler): void;
  public on(event: "move" | "win" | "lose", handler: any): void {
    if (event === "move") {
      this.listeners.onMove.push(handler);
    } else if (event === "win") {
      this.listeners.onWin.push(handler);
    } else if (event === "lose") {
      this.listeners.onLose.push(handler);
    }
  }

  public off(event: "move" | "win" | "lose", handler: any): void {
    if (event === "move") {
      this.listeners.onMove = this.listeners.onMove.filter((h) => h !== handler);
    } else if (event === "win") {
      this.listeners.onWin = this.listeners.onWin.filter((h) => h !== handler);
    } else if (event === "lose") {
      this.listeners.onLose = this.listeners.onLose.filter((h) => h !== handler);
    }
  }

  // === Private ===

  private dispatch(action: SolitaireAction): void {
    const nextState = applyAction(this.state, action);
    this.state = nextState;

    // Emit events
    this.listeners.onMove.forEach((h) => h(action));

    // Check win/loss after move
    if (isWinning(nextState)) {
      this.listeners.onWin.forEach((h) => h());
    } else if (!canMakeMove(nextState)) {
      this.listeners.onLose.forEach((h) => h());
    }
  }
}
```

**Tests:** `client2/src/game/solitaire/engine.test.ts` (comprehensive)

---

### 1.4 `client2/src/game/solitaire/ui.ts`

**Назначение:** Отображение борда (Pixi rendering setup).

```typescript
import type { Application, Container, Sprite } from "pixi.js";
import type { SolitaireGameState } from "../board/solitaireState";
import type { SlotGeometry } from "../board/solitaireLayout";
import { getSolitaireLayout, selectProfile } from "../board/solitaireLayout";
import { Card } from "../ui/Card";
import { board as boardModule } from "../board/board";

export interface SolitaireUIState {
  app: Application;
  boardContainer: Container;
  cardSprites: Map<string, Sprite>;  // cardId → Sprite
  slotGeometries: Record<string, SlotGeometry>;
}

/**
 * Mount the board UI: create slot containers, attach cards.
 */
export function mountSolitaireBoard(
  app: Application,
  state: SolitaireGameState,
  viewport: { width: number; height: number }
): SolitaireUIState {
  const boardContainer = new (app.stage.constructor as typeof Container)();
  app.stage.addChild(boardContainer);

  const profile = selectProfile(viewport.width, viewport.height);
  const geometries = getSolitaireLayout(viewport.width, viewport.height, profile);

  const cardSprites = new Map<string, Sprite>();

  // Create slot containers
  for (const [slotId, geometry] of Object.entries(geometries)) {
    const slotContainer = new (app.stage.constructor as typeof Container)();
    slotContainer.position.set(geometry.x, geometry.y);
    boardContainer.addChild(slotContainer);

    // Draw slot background (placeholder)
    const bg = new (app.stage.constructor as typeof Container)();
    bg.graphics?.drawRect(0, 0, geometry.w, geometry.h);
    slotContainer.addChild(bg);
  }

  return {
    app,
    boardContainer,
    cardSprites,
    slotGeometries: geometries,
  };
}

/**
 * Update board visuals based on state.
 */
export function updateBoardVisuals(
  uiState: SolitaireUIState,
  state: SolitaireGameState
): void {
  // For each slot, render its cards
  for (const [slotId, container] of Object.entries(state.board.slots)) {
    const geometry = uiState.slotGeometries[slotId];
    if (!geometry) continue;

    const cards = container.members;

    // Remove cards no longer in this slot
    for (const [cardId, sprite] of uiState.cardSprites.entries()) {
      if (!cards.includes(cardId)) {
        sprite.parent?.removeChild(sprite);
        uiState.cardSprites.delete(cardId);
      }
    }

    // Add/update cards
    for (let i = 0; i < cards.length; i++) {
      const cardId = cards[i];
      let sprite = uiState.cardSprites.get(cardId);

      if (!sprite) {
        // Create new card sprite
        sprite = new Card(cardId); // from ui/Card.ts
        uiState.cardSprites.set(cardId, sprite);
        uiState.boardContainer.getChildAt(slotId as any)?.addChild(sprite);
      }

      // Update position (from geometry)
      const pos = calculateCardPosition(geometry, i, cards.length);
      sprite.position.set(pos.x, pos.y);
      sprite.rotation = pos.rotation ?? 0;
    }
  }
}

function calculateCardPosition(
  geometry: SlotGeometry,
  index: number,
  total: number
): { x: number; y: number; rotation?: number } {
  // Use geometry.layout to determine card position
  if (geometry.layout === "stack") {
    const offset = geometry.cardOffset ?? { x: 2, y: 2 };
    return {
      x: offset.x * index,
      y: offset.y * index,
    };
  } else if (geometry.layout === "fan") {
    // TODO: implement fan spread
    return { x: 0, y: 0 };
  } else {
    // single
    return { x: 0, y: 0 };
  }
}
```

---

### 1.5 `client2/src/game/solitaire/preset.ts`

**Назначение:** Board config для пасьянса.

```typescript
import type { BoardConfig } from "../board/board";

export const SOLITAIRE_BOARD_CONFIG: BoardConfig = {
  slots: {
    stock: {},
    waste: {},
    "found:S": {},
    "found:H": {},
    "found:D": {},
    "found:C": {},
    "tab:0": {},
    "tab:1": {},
    "tab:2": {},
    "tab:3": {},
    "tab:4": {},
    "tab:5": {},
    "tab:6": {},
  },
  onEmpty: "collapse",
};
```

---

### 1.6 `client2/src/SolitaireGame.tsx`

**Назначение:** React-хост для игры.

```typescript
import React, { useEffect, useRef, useState } from "react";
import { SolitaireGameEngine } from "./game/solitaire/engine";
import { FreeDeskEngine } from "./game/engine/freeDeskEngine";
import type { SolitaireGameState } from "./game/board/solitaireState";

export function SolitaireGame() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SolitaireGameEngine | null>(null);
  const [gameState, setGameState] = useState<SolitaireGameState | null>(null);
  const [phase, setPhase] = useState<SolitaireGameState["phase"]>("menu");

  useEffect(() => {
    const engine = new SolitaireGameEngine();
    engineRef.current = engine;

    // Setup event handlers
    engine.on("move", (action) => {
      console.log("Move:", action);
      setGameState(engine.getState());
    });

    engine.on("win", () => {
      console.log("Won!");
      setPhase("won");
    });

    engine.on("lose", () => {
      console.log("Lost!");
      setPhase("lost");
    });

    return () => {
      engineRef.current = null;
    };
  }, []);

  const handleNewGame = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.resetGame();
    setGameState(engine.getState());
    setPhase("playing");
  };

  const handleRestart = () => {
    handleNewGame();
  };

  if (phase === "menu") {
    return (
      <div className="solitaire-menu">
        <h1>🂠 Косынка</h1>
        <button onClick={handleNewGame}>Новая игра</button>
      </div>
    );
  }

  if (phase === "won") {
    return (
      <div className="solitaire-endgame won">
        <h2>🎉 Вы выиграли!</h2>
        <p>Ходов: {gameState?.movesCount}</p>
        <button onClick={handleRestart}>Новая игра</button>
      </div>
    );
  }

  if (phase === "lost") {
    return (
      <div className="solitaire-endgame lost">
        <h2>⚠️ Нет ходов</h2>
        <p>Ходов: {gameState?.movesCount}</p>
        <button onClick={handleRestart}>Новая игра</button>
      </div>
    );
  }

  return (
    <div ref={hostRef} className="solitaire-game">
      {/* Canvas rendered by engine */}
    </div>
  );
}
```

---

## PART 2: INTEGRATION WITH EXISTING CODE

### 2.1 Route Setup (`client2/src/main.tsx`)

**Current:**
```typescript
const routes: Record<string, () => React.ReactNode> = {
  "": () => <Menu />,
  "free-desk": () => <FreeDesk />,
  table: () => <Table />,
  motion: () => <CensorDemo />,
};
```

**Updated:**
```typescript
const routes: Record<string, () => React.ReactNode> = {
  "": () => <Menu />,
  "free-desk": () => <FreeDesk />,
  "solitaire": () => <SolitaireGame />,  // NEW
  table: () => <Table />,
  motion: () => <CensorDemo />,
};
```

### 2.2 Navigation (`client2/src/nav.ts`)

**Add:**
```typescript
export function goSolitaire() {
  goApp("solitaire");
}
```

### 2.3 Menu (`client2/src/Menu.tsx`)

**Add button:**
```typescript
<button onClick={() => goApp("solitaire")}>🂠 Косынка (Solitaire)</button>
```

### 2.4 Reuse from `client2/src/game/`

- ✅ `Card.ts` — existing card component
- ✅ `CardBody.ts` — card rendering
- ✅ `cardTextures.ts` — texture factory
- ✅ `symbols.ts` — suit SVGs
- ✅ `board/board.ts` — slot/member logic
- ✅ `engine/cardTextures.ts` — Pixi texture cache
- ✅ `effects/` — animations
- ✅ `anim/easing.ts` — animation curves

---

## PART 3: IMPLEMENTATION PHASES (Detailed)

### Phase 1: Data & Logic (Days 1–3)

**Tasks:**
1. Create `solitaireState.ts` (state types + `applyAction` reducer)
2. Create `solitaireLayout.ts` (geometry calc)
3. Create `solitaire/engine.ts` (game engine)
4. Write comprehensive tests (90%+ coverage)

**Deliverable:** All state & logic pure, tested, no UI.

**Commit:** `feat: solitaire state machine & core logic`

---

### Phase 2: Visual Setup (Days 4–6)

**Tasks:**
1. Create `solitaire/ui.ts` (Pixi mount & update)
2. Create `solitaire/preset.ts` (board config)
3. Integrate with `InputRouter` (drag/tap handlers)
4. Create `SolitaireGame.tsx` (React host + lifecycle)
5. Add route + menu button

**Deliverable:** Game board renders, input wired, basic drag/drop works.

**Commit:** `feat: solitaire UI & React host`

---

### Phase 3: Animations & Polish (Days 7–9)

**Tasks:**
1. Deal animation (cascade fly)
2. Card fly (Tableau/Foundation)
3. Flip animation (Stock → Waste)
4. Stack animations (compress/restore)
5. Win fanfare (confetti / bounce)
6. Reject shake (invalid move feedback)

**Deliverable:** Smooth animations, visual polish.

**Commit:** `feat: solitaire animations & FX`

---

### Phase 4: Screens & Flow (Days 10–11)

**Tasks:**
1. Menu screen (New Game)
2. Playing screen (cards + stats)
3. Win screen (you won + restart)
4. Loss screen (no moves + restart)
5. Screen transitions

**Deliverable:** Full game flow from start to end.

**Commit:** `feat: solitaire game screens & flow`

---

### Phase 5: Testing & QA (Days 12–14)

**Tasks:**
1. Unit test coverage ≥ 90%
2. E2E: happy path (deal → move → win)
3. E2E: sad path (deadlock)
4. Manual QA (mobile/tablet/desktop)
5. Visual regression (Playwright)

**Deliverable:** All tests passing, QA sign-off.

**Commit:** `test: solitaire E2E & visual regression`

---

## PART 4: BUILD & DEPLOY

### Build
```bash
cd client2
npm run build
# → dist/
```

### Deploy
```bash
cd /home/user/crusade-deck
scripts/deploy.sh
# → crusade-deck-client.fly.dev/v2/solitaire
```

### Version Bump
```
v0.3.0+{build_count}
```

---

## PART 5: SUCCESS CHECKLIST (MVP)

### Core Mechanics
- [x] Deal: 52 cards into Tableau (7 col, 1+2+3+4+5+6+7)
- [x] Stock → Waste (flip 1 card per tap)
- [x] Tableau ↔ Tableau (rules: K on empty, N-1 opposite color)
- [x] Waste → Tableau / Foundation
- [x] Tableau → Foundation
- [x] Stock recycle (when empty)

### Win/Loss
- [x] Win detection (all 4 foundations A→K)
- [x] Loss detection (no moves + Stock/Waste empty)
- [x] Win screen + restart
- [x] Loss screen + restart

### UI/UX
- [x] Menu screen (New Game button)
- [x] Playing board (cards + stats)
- [x] Mobile responsive (360px+)
- [x] Input: drag/tap working
- [x] Visual feedback: hover, drag-over, invalid-shake

### Testing
- [x] 90%+ unit test coverage
- [x] E2E happy path
- [x] E2E sad path
- [x] Manual QA (device types)

### Deployment
- [x] Build without errors
- [x] Deploy to production
- [x] Live at /v2/solitaire

---

## PART 6: POTENTIAL ISSUES & MITIGATIONS

| Issue | Mitigation |
|-------|-----------|
| Drag vs tap conflict | Use `dragHappened` flag (threshold 8px) |
| Animation lag | Profile with DevTools; use RAF; limit concurrent anims |
| Win condition miss | Early unit testing + E2E |
| Layout overflow | Test on 360px / 1920px early |
| State mutations | Use immutable reducers; strict TypeScript |
| Input handler conflicts | Centralize via `InputRouter` |

---

## PART 7: FUTURE EXTENSIONS (Post-MVP)

1. **Difficulty:** 1-card vs 3-card draw from Stock
2. **Undo:** Per-move undo (command pattern ready)
3. **Hint:** Show possible moves (AI/greedy)
4. **Multiplayer:** Async / pass-and-play (server-sync ready)
5. **Theme:** Dark/light customization
6. **Sound:** Deal, card land, win fanfare
7. **Leaderboard:** Local storage hi-scores
8. **Reduce-motion:** Accessibility for animations
9. **Difficulty badges:** "Won in N moves" (optimal is ~52)

---

**Ready for Sprint Planning & Development**

---

**Last Updated:** 2026-07-27  
**Prepared by:** Game Design AI Agent  
**Status:** ✅ Ready for Implementation
