# SOLITAIRE ARCHITECTURE MAP — Компоненты & Потоки Данных

**Цель:** Visual + текстовая схема всех компонентов, их взаимодействия и потоков данных.

---

## I. COMPONENT HIERARCHY & DATA FLOW

```
┌─────────────────────────────────────────────────────────────────┐
│                    SolitaireGame (React)                        │
│  └─ Монтирует canvas + привязывает менеджер жизненного цикла   │
│  └─ Слушает: engine.onWin/onLose/onMove                        │
│  └─ Рендерит React UI (меню, счётчик, экраны)                  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ↓                               ↓
    ┌──────────────┐          ┌────────────────────┐
    │  Pixi Canvas │          │  React DOM (UI)    │
    │ (FreeDesk)   │          │                    │
    │              │          │ - Menu             │
    │ - Elements   │          │ - Screens          │
    │ - Animation  │          │ - Stats panel      │
    │ - FX         │          │ - Buttons          │
    └──────┬───────┘          └────────────────────┘
           │
           ↓
    ┌──────────────────────────────────┐
    │   SolitaireGameEngine            │
    │ ┌──────────────────────────────┐ │
    │ │ Private State                │ │
    │ │ - phase: GamePhase           │ │
    │ │ - board: Board               │ │
    │ │ - movesCount: number         │ │
    │ │ - timeStarted: number        │ │
    │ └──────────────────────────────┘ │
    │                                  │
    │ ┌──────────────────────────────┐ │
    │ │ Public Methods               │ │
    │ │ + dealStock()                │ │
    │ │ + moveCard(from, to, id)     │ │
    │ │ + moveStack(from, to, ids)   │ │
    │ │ + recycleStock()             │ │
    │ │ + resetGame()                │ │
    │ │ + getState()                 │ │
    │ │ + isWinning()                │ │
    │ │ + canMakeMove()              │ │
    │ └──────────────────────────────┘ │
    │                                  │
    │ ┌──────────────────────────────┐ │
    │ │ Event Emitters               │ │
    │ │ + onMove(action)             │ │
    │ │ + onWin()                    │ │
    │ │ + onLose()                   │ │
    │ └──────────────────────────────┘ │
    └──────────┬───────────────────────┘
               │
       ┌───────┴──────────┐
       ↓                  ↓
  ┌─────────────┐   ┌─────────────────┐
  │   applyAction   │   board/* modules
  │   (reducer)     │ ┌───────────────┐
  │                 │ │ solitaire     │
  │ - dealStock     │ │ Rules.ts      │
  │ - moveCard      │ │ + suitOf()    │
  │ - moveStack     │ │ + srank()     │
  │ - recycleStock  │ │ + accepts()   │
  │                 │ └───────────────┘
  │ (immutable)     │ ┌───────────────┐
  │ State → State   │ │ board.ts      │
  │                 │ │ + move()      │
  │                 │ │ + place()     │
  │                 │ │ + at()        │
  │                 │ └───────────────┘
  └─────────────┘   └─────────────────┘
```

---

## II. INPUT FLOW (User → Engine)

```
┌─────────────────────────────────────────┐
│         InputRouter (Pixi)              │
│ (жесты: tap, drag, pan, pinch)          │
└──────────────────┬──────────────────────┘
                   │
        ┌──────────┴──────────┐
        ↓                     ↓
   ┌─────────┐          ┌──────────┐
   │ Tap     │          │  Drag    │
   │ Event   │          │  Event   │
   └────┬────┘          └────┬─────┘
        │                    │
        ├─→ [hitTest]        └─→ [hitTest] → startPos
        │   ├─ Stock?            ├─ Card?
        │   │  → dealStock()      │  → recordDrag()
        │   │                     │
        │   ├─ Waste?             └─ [move] → endPos
        │   │  → select/hint          ├─ hitTestZone()
        │   │                         ├─ checkValidMove()
        │   └─ Tableau?               └─ [drop]
        │      → fanOpen (future)         ├─ moveCard() ✓
        │                                 └─ reject() ✗
        │                                    (shake FX)
        └─────────────────┬──────────────────┘
                          ↓
               ┌──────────────────────┐
               │ GameEngine.dispatch()│ (port команд)
               │                      │
               │ dealStock()          │
               │ moveCard(...)        │
               │ moveStack(...)       │
               │ recycleStock()       │
               └──────┬───────────────┘
                      │
                      ↓ (applyAction reducer)
                 ┌─────────────┐
                 │ New State   │
                 └──────┬──────┘
                        │
        ┌───────────────┴───────────────┐
        ↓                               ↓
   [onMove event]                  [check win/loss]
   (console.log, FX)               └─→ [onWin/onLose]
```

---

## III. RENDER FLOW (State → Canvas)

```
┌─────────────────────────────────────┐
│  SolitaireGameState                 │
│  {                                  │
│    phase: "playing",                │
│    board: {                         │
│      slots: {                       │
│        stock: { members: [...] },   │
│        waste: { members: [...] },   │
│        "tab:0": { members: [...] }, │
│        "found:S": { members: [...] }│
│        ...                          │
│      }                              │
│    },                               │
│    movesCount: 5,                   │
│    timeStarted: 1234567890          │
│  }                                  │
└──────────────────┬──────────────────┘
                   │ (onChange listener)
                   ↓
       ┌───────────────────────┐
       │ updateBoardVisuals()  │
       └───────┬───────────────┘
               │
        ┌──────┴──────┐
        ↓             ↓
   For each      For each
   slotId        cardId in slot
    │             │
    ↓             ↓
 getSlot      ┌──────────────────┐
 Geometry     │ Get or Create UI  │
    │         │ Element (Piece)   │
    │         └────────┬─────────┘
    │                  │
    ↓                  ↓
 Calculate      Set Position &
 Position       Rotation
    │           (using Geometry)
    │                │
    └────────┬───────┘
             ↓
      ┌─────────────────┐
      │ Pixi Sprite     │
      │ - position.x/y  │
      │ - rotation      │
      │ - visible       │
      │ - alpha         │
      │ - texture       │
      │ (card face/back)│
      └─────────────────┘
```

**Геометрия (layout):**

```
                    SlotGeometry
                    {
                      x, y,        // base position
                      w, h,        // dimensions
                      layout:      // "stack" | "fan" | "single"
                      maxVisible   // для fan
                    }

For Stack (Stock, Foundation):
  card[0] at (x, y)
  card[1] at (x+2, y+2)      // 3D offset
  card[n] at (x+n*2, y+n*2)

For Fan (Tableau):
  fan = calculateFan(layout, cards.length)
  card[i] at fan[i].pos
          with fan[i].angle

For Single (Waste):
  card at (x, y) only (visible one)
```

---

## IV. STATE MACHINE (Phases & Transitions)

```
                          ┌─────────────┐
                          │    MENU     │
                          │ (idle)      │
                          └──────┬──────┘
                                 │
                        clickNewGame()
                                 │
                                 ↓
                    ┌────────────────────┐
                    │      SETUP         │
                    │  (shuffle + deal)  │ → playDealAnimation()
                    └────────┬───────────┘
                             │
                     animDeal.complete()
                             │
                             ↓
                  ┌──────────────────────────┐
                  │     PLAYING (turn-based) │
                  │ - waitForInput()         │
                  │ - applyAction()          │
                  │ - checkWin()/checkLoss() │
                  └──────────┬───────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
     isWinning()        canMakeMove()       (no change)
          │                  │                  │
          ↓                  ↓                  ↓
     ┌─────────┐      ┌──────────┐        (continue)
     │ WON     │      │ LOST     │
     │ (game   │      │ (deadlock│
     │  over)  │      │  or      │
     └─────┬───┘      └────┬─────┘
           │               │
           └───────┬───────┘
                   │
            showEndScreen()
                   │
                   ↓
            ┌─────────────────┐
            │ restartGame()   │
            └────────┬────────┘
                     │
                back to MENU
```

---

## V. BOARD MODEL (Slots & Containment)

```
Board
{
  slots: {
    "stock": Container { members: ["2♠", "3♥", ...] },
    "waste": Container { members: ["5♦"] },
    "found:S": Container { members: ["A♠"] },
    "found:H": Container { members: [] },
    "found:D": Container { members: [] },
    "found:C": Container { members: [] },
    "tab:0": Container { members: ["K♠", "Q♦"] },
    "tab:1": Container { members: ["K♣", ...] },
    "tab:2": Container { members: ["K♥"] },
    "tab:3": Container { members: [] },
    "tab:4": Container { members: [] },
    "tab:5": Container { members: [] },
    "tab:6": Container { members: [] },
  },
  onEmpty: "collapse"  // или "keep"
}

Контейнер
{
  members: string[]  // card IDs: "2♠", "A♥", etc.
}
```

**Инварианты:**
- `board.slots[s].members.length <= maxCards[s]`
- Каждый card ID уникален на доске (не может быть в двух слотах одновременно)
- Пустой слот может оставаться в `slots` (зависит от `onEmpty`)

---

## VI. ACTION DISPATCH PIPELINE

```
User Action (UI Input)
    │
    ↓ [parseUserAction]
    │
User Gesture (parsed)
e.g., { type: "drag", from: "waste", to: "tab:0", cardId: "5♦" }
    │
    ↓ [validateAction]
    │
Validity Check:
  ├─ Is cardId in from-slot? ✓
  ├─ Is to-slot valid target? ✓
  ├─ Do rules allow move? ✓ (foundationAccepts / tableauAccepts)
    │
    ├─→ Valid: proceed
    │   ↓
    │  [playAnimation]
    │   ├─ Start drag FX
    │   └─ (optionally wait for anim finish)
    │   ↓
    │  [dispatchCommand]
    │   ├─ engine.moveCard(from, to, id)
    │   ↓
    │  [applyAction (reducer)]
    │   ├─ newBoard = board.move(board, from, to, [id])
    │   ├─ newState = { ...state, board: newBoard, movesCount+1 }
    │   ↓
    │  [setState & emitEvent]
    │   ├─ state = newState
    │   ├─ onMove(action)
    │   ↓
    │  [updateRender & checkWin]
    │   ├─ render(newState)
    │   ├─ if isWinning() → onWin()
    │
    └─→ Invalid: reject
        ├─ playShakeFX()
        ├─ (no state change)
        └─ (continue waiting for input)
```

---

## VII. ANIMATION PIPELINE

```
Action Accepted
    │
    ├─→ Type: dealStock (flip)
    │   ├─ Prepare: get card & slot coords
    │   └─ Animate:
    │       ├─ flipCard(card, 400ms)
    │       │  └─ rotate 180° + position change
    │       └─ onComplete → updateRender
    │
    ├─→ Type: moveCard (fly)
    │   ├─ Prepare: get from/to coords
    │   └─ Animate:
    │       ├─ flyCard(card, fromPos, toPos, 300ms)
    │       │  └─ bezier trajectory (easeOutCubic)
    │       └─ onComplete → updateRender
    │
    ├─→ Type: moveStack (multi-fly)
    │   ├─ Prepare: calculate fly for each card
    │   └─ Animate:
    │       ├─ For each card with delay(i * 30ms)
    │       │  └─ flyCard(...)
    │       └─ onComplete (all) → updateRender
    │
    ├─→ Type: recycleStock (fast reverse)
    │   ├─ Prepare: all cards back to Stock
    │   └─ Animate:
    │       ├─ (optional) quick fly back
    │       └─ onComplete → updateRender
    │
    └─→ Invalid Move (reject feedback)
        ├─ Prepare: card position
        └─ Animate:
            ├─ shakeFX(card, 100ms)
            │  └─ oscillate ±5px
            ├─ audioFX: "invalid.mp3" (if enabled)
            └─ onComplete (card returns to start)
```

---

## VIII. INPUT HANDLERS (Detailed Event Map)

### Tap Detection
```
onPointerDown(evt)
  ├─ hitCard = hitTest(evt.x, evt.y)
  │  ├─ if hitCard
  │  │  ├─ record { pressCard, pressTime, pressPos }
  │  │  └─ (wait for move or timeout)
  │  │
  │  └─ if !hitCard
  │     ├─ hitSlot = hitTestSlot(evt.x, evt.y)
  │     └─ if hitSlot === "stock"
  │        └─ onAction({ type: "dealStock" })
  │
  └─ record pressTime

onPointerMove(evt)
  ├─ delta = distance(evt.pos - pressPos)
  ├─ if delta > DRAG_THRESHOLD (8px)
  │  └─ transition from "tap" to "drag"
  │     ├─ startDrag(pressCard)
  │     └─ recordDragStart(evt.pos)
  │
  └─ if in drag mode
     ├─ dragCard.pos = evt.pos (visual follow)
     ├─ hitZone = hitTestZone(evt.pos)
     └─ showDropHint(hitZone, dragCard)

onPointerUp(evt)
  ├─ timeHeld = evt.time - pressTime
  ├─ delta = distance(evt.pos - pressPos)
  │
  ├─ if delta < DRAG_THRESHOLD && timeHeld < TAP_TIME
  │  └─ tap (if hitCard)
  │     └─ [handle below]
  │
  └─ if delta >= DRAG_THRESHOLD
     └─ drop (drag case)
        ├─ targetZone = hitTestZone(evt.pos)
        ├─ if canMove(dragCard, targetZone)
        │  └─ onAction({ type: "moveCard", ... })
        └─ else
           └─ playRejectFX()
```

### Tap Actions (on specific zones)
```
TAP_STOCK
├─ action = { type: "dealStock" }
└─ dispatch()

TAP_WASTE
├─ (select for potential move / hint)
└─ (future: quick-move to foundation)

TAP_TABLEAU_CARD
├─ (select for visual hint / future: fan open)
└─ (future: auto-move if valid)

TAP_FOUNDATION
├─ (select for hint / future: auto-move multi)
└─ (no direct action in MVP)
```

---

## IX. TESTS STRUCTURE

```
client2/src/game/
├── board/
│   ├── solitaireRules.test.ts        ✅ (exists)
│   │   ├─ suitOf()
│   │   ├─ srank()
│   │   └─ accepts() logic
│   │
│   └── solitaireState.test.ts        (NEW)
│       ├─ applyAction reducer
│       ├─ state transitions
│       └─ invariant checks
│
├── solitaire/
│   ├── engine.test.ts                (NEW)
│   │   ├─ dealStock(), moveCard()
│   │   ├─ recycleStock()
│   │   ├─ isWinning(), canMakeMove()
│   │   └─ event emitters
│   │
│   ├── actions.test.ts               (NEW)
│   │   ├─ applyAction reducer logic
│   │   ├─ board mutations
│   │   └─ state consistency
│   │
│   └── preset.test.ts                (NEW)
│       └─ board config validity
│
└── e2e/
    └── solitaire.spec.ts             (NEW - Playwright)
        ├─ Happy path: deal → move → win
        ├─ Sad path: deadlock → restart
        ├─ Mobile layout
        └─ Visual regression
```

---

## X. COMMUNICATION PROTOCOLS (Future: Server Sync)

### Command Format (idempotent)
```typescript
interface SolitaireCommand {
  type: "dealStock" | "moveCard" | "moveStack" | "recycleStock" | "reset";
  timestamp: number;
  clientId: string;  // for conflict resolution
  
  // Payload depends on type
  from?: string;
  to?: string;
  cardIds?: string[];
}

// Server responses
interface CommandResult {
  success: boolean;
  error?: string;
  newState?: SolitaireGameState;  // snapshot on success
  deckRev?: number;               // for reconciliation
}
```

### Event Stream (broadcast)
```typescript
interface GameEvent {
  type: "move" | "win" | "lose" | "reset";
  action?: SolitaireAction;
  timestamp: number;
  clientId?: string;  // who initiated
}

// Client → Server: room.send("command", cmd)
// Server → Client: room.state.onChange → rerender
//                  room.messages.subscribe("event", handleEvent)
```

---

## XI. PERFORMANCE NOTES

### Memory
- **Card objects:** 52 strings per game (negligible)
- **Board state:** ~500 bytes (slots + metadata)
- **Animation state:** ~1KB per active animation
- **Pixi elements:** 1 Sprite per card (always reused, not recreated)

### CPU
- **dealStock:** O(1)
- **moveCard:** O(n) where n = cards in tableau (max 52)
- **isWinning:** O(4) (check 4 foundations)
- **canMakeMove:** O(n) where n = cards on board
- **render:** O(52) per frame (update all visible cards)

**Profile targets:**
- 60 FPS on mobile (target 16.67ms/frame)
- Animations should not block input (use requestAnimationFrame)

---

## XII. ERROR HANDLING & EDGE CASES

```
┌─────────────────────────────────────┐
│ Error Scenarios                     │
└─────────────────────────────────────┘

├─ moveCard(from, to, cardId)
│  ├─ cardId not in from-slot
│  │  └─ Error: "Card not found" → no-op
│  │
│  ├─ to-slot doesn't exist
│  │  └─ Error: "Invalid target" → no-op
│  │
│  ├─ rules reject move
│  │  └─ Error: "Invalid move" → playShakeFX
│  │
│  └─ ✓ Valid: proceed
│
├─ dealStock()
│  ├─ Stock is empty && Waste exists
│  │  └─ Recycle: moveAll(waste → stock)
│  │
│  ├─ Stock is empty && Waste is empty
│  │  └─ Error: "No cards to deal" → no-op
│  │
│  └─ ✓ Stock has cards: take top 1
│
└─ recycleStock()
   ├─ Stock not empty
   │  └─ Error: "Stock not empty" → no-op
   │
   ├─ Waste is empty
   │  └─ Error: "Waste is empty" → no-op
   │
   └─ ✓ Recycle: moveAll(waste → stock)
```

---

## XIII. DEBUGGING HOOKS

### Development Console Access
```typescript
// In FreeDesk (SolitaireGame)
if (import.meta.env.DEV) {
  window.__solitaire = {
    engine,        // SolitaireGameEngine instance
    state,         // current state
    dispatch,      // manual action dispatch
    log: () => console.log(engine.getState()),
    win: () => engine.forceWin(),  // cheat for testing
    shuffle: () => engine.shuffleBoard(),
  };
}

// Usage in console:
// window.__solitaire.win()
// window.__solitaire.dispatch({ type: "moveCard", ... })
```

---

## XIV. DEPLOYMENT DIAGRAM

```
┌──────────────────────────┐
│   client2/ (local dev)   │
│  npm run dev             │
└───────────┬──────────────┘
            │ vite serve
            ↓
    http://localhost:5173
    /v2/solitaire

        │
        │ (npm run build)
        ↓
┌──────────────────────────┐
│   dist/ (optimized)      │
│   - main.js              │
│   - assets/              │
└───────────┬──────────────┘
            │ deploy scripts/deploy.sh
            ↓
┌──────────────────────────────┐
│   Fly.io (production)        │
│ crusade-deck-client.fly.dev  │
│ /v2/solitaire                │
└──────────────────────────────┘
```

---

## XV. REFERENCE: Modules Quick Map

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `solitaireRules.ts` | Card rules | `suitOf`, `srank`, `tableauAccepts`, `foundationAccepts` |
| `solitaireState.ts` | State shape & reducer | `GameState`, `applyAction`, `initialState` |
| `solitaireLayout.ts` | Geometry | `getSolitaireLayout`, `SlotGeometry` |
| `solitaire/engine.ts` | Game logic | `SolitaireGameEngine` class |
| `solitaire/actions.ts` | Command handlers | `dealStock`, `moveCard`, etc. |
| `solitaire/ui.ts` | Pixi rendering | `mountSolitaireBoard`, `updateBoard` |
| `solitaire/preset.ts` | Board config | `SOLITAIRE_BOARD_CONFIG` |
| `SolitaireGame.tsx` | React host | `SolitaireGame` component |

---

**Last Updated:** 2026-07-27  
**Status:** Architecture Finalized — Ready for Implementation
