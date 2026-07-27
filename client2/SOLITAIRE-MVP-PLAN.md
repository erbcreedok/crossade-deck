# SOLITAIRE MVP GAME DESIGN PLAN — Косынка / Klondike

**Статус:** Game Design Document (GDD) + Technical Specification  
**Версия:** 1.0  
**Скоп:** Минимальный MVP с полным циклом от старта до рестарта  
**Целевая платформа:** Мобильный браузер (360px+), Desktop, Tablet  
**Движок:** client2 + Pixi v8 (Crusade Deck board/card mechanics)

---

## I. GAME OVERVIEW

### 1.1 Концепция
Классический пасьянс Косынка (Klondike Solitaire) для одного игрока. Цель — переместить все 52 карты в 4 фундамента (по мастям, от туза до короля) за минимум ходов и времени.

**Нейм-стиль:** Pixel-casual (как основной Crusade Deck), монохромные иконки, мат-апокриф («Перетасуй!», «Ну и засада…»).

### 1.2 Структура типичной сессии
```
Entry → Новая игра → Setup-фаза → Игра (drag/drop/tap) → Winning/Losing → Рестарт
```

**Entry Point:** `crusade-deck.fly.dev/v2/solitaire` — прямой линк или через меню.

---

## II. GAME RULES (чистые данные из `solitaireRules.ts`)

### 2.1 Ранг карт для пасьянса
- **Туз = 1 (低)**, 2–10 по номиналу, J=11, Q=12, **K=13 (高)**
- Отличие: в обычной сорте A=14; в пасьянсе A=1 (внизу фундамента)

### 2.2 Три типа зон

#### **Фундамент (Foundation, 4 стопки)**
- Пусто → только Туз
- Есть карта → только на 1 выше рангом + ТА ЖЕ масть
- Цель: A→K каждой масти

#### **Стол (Tableau, 7 стопок)**
- Пусто → только Король
- Есть карта → на 1 ниже рангом + ДРУГОГО цвета (♠♣ чёрные, ♥♦ красные)
- Карты лежат лицом вверх (открытые)
- Сверху можно тащить как одну карту, так и стопку (последовательность)

#### **Колода (Deck/Stock)**
- Лицом вниз (закрытые)
- Тап → переворот верхней карты в колоду отбоя (Waste)
- Цикл: когда колода кончится, разрешить её переворот (на 3х картах за раз или на 1-й)

#### **Колода отбоя (Waste)**
- Лицом вверх (открытая верхняя карта)
- Можно тащить в Tableau или Foundation
- Когда Stock кончается, перелить Waste обратно в Stock

### 2.3 Движения (Actions)

| Действие | Откуда | Куда | Правило | Анимация |
|----------|--------|------|---------|----------|
| `takeStock` | Deck | Waste | Раз в 1 карту (MVP) | Flip-переворот |
| `moveCard` | Waste→Tableau | Card-target | check `tableauAccepts` | Fly-полёт |
| `moveCard` | Waste→Foundation | Card-target | check `foundationAccepts` | Fly-полёт (fast) |
| `moveCard` | Tableau→Tableau | Card-target | check `tableauAccepts` | Fly-полёт |
| `moveCard` | Tableau→Foundation | Card-target | check `foundationAccepts` | Fly-полёт (auto on valid) |
| `moveStack` | Tableau→Tableau | Sequence (K-Q-J...) | Каждая карта в seq должна check | Fly-многокартный |
| `recycleStock` | Waste | Stock | Когда Stock пуст | No-anim / fast-reverse |
| `autoMove` | Waste/Tableau→Foundation | Auto-suggest | AI-подсказка или авто | **Не в MVP** |

### 2.4 Условие выигрыша
Все 4 фундамента заполнены (A→K каждый) = **Победа** → экран "You Won!" → Рестарт

### 2.5 Условие проигрыша
- **Нет доступных ходов** (и Stock пуст) → **"No Moves Left"** → Рестарт
- Нет хард-лимита по времени/ходам в MVP (геймплей без наказания)

---

## III. GAME FLOW & STATE MACHINE

```
┌─────────────┐
│   ENTRY     │ User opens /v2/solitaire
└──────┬──────┘
       │ navigate
       ↓
┌─────────────────────┐
│   MENU / LOBBY      │ - New Game button
│ (+ Settings TBD)    │ - Hi-scores TBD (not MVP)
└──────┬──────────────┘
       │ clickNewGame()
       ↓
┌──────────────────────────┐
│   SETUP / INIT           │ - Create fresh 52-card deck
│                          │ - Shuffle (riffle/random)
│                          │ - Deal: Tableau (7 col, increasing)
└──────┬───────────────────┘
       │ onReady()
       ↓
┌─────────────────────────┐
│   PLAYING (turn-based)  │ - Finger/mouse input router
│                         │ - Drag & drop  
│   Phase: "solitaire"    │ - Tap → Stock or Waste
│                         │ - Win-check after every move
└──────┬──────────────────┘
       │
       ├─→ valid move + check autoWin
       │
       ├─→ invalid move → shake/reject
       │
       └─→ win condition OR noMovesLeft
            ↓
      ┌──────────────────────┐
      │   ENDGAME            │
      │ - Win: "You Won!"    │
      │ - Loss: "No Moves"   │
      └──────┬───────────────┘
             │ clickRestart()
             ↓
      ┌──────────────────────┐
      │   BACK TO MENU       │
      └──────────────────────┘
```

### 3.1 Phase enum
```typescript
type GamePhase = "menu" | "playing" | "won" | "lost";
```

---

## IV. BOARD LAYOUT (Canvas + Geomtry)

### 4.1 Слоты на доске

```
           ♠️  ♥️  ♦️  ♣️          (Foundation)
          [A] [A] [A] [A]

[Deck] [Waste]                    (Stock & Waste)

[K] [Q] [J] [10] [9] [8] [7]     (Tableau)
 0   1   2    3   4   5   6
```

### 4.2 Зоны (Slots)

| ID | Слот | Размер | Макс. карт | Геометрия | Примечание |
|----|------|--------|-----------|-----------|-----------|
| `stock` | Колода (Stock) | 1 card | 52 | Stack (3D offset) | Face-down, закрытая |
| `waste` | Отбой (Waste) | 1 card | 52 | Top card | Face-up, открытая |
| `found:S`, `found:H`, `found:D`, `found:C` | Фундамент 4x | 1 card | 13 | Stack | Face-up, иконка масти |
| `tab:0` - `tab:6` | Tableau 7x | 7 col | 52 | Fan (каскад) | Face-up, открытая |

### 4.3 Viewport & Scaling (мобильный 360px первый)

- **Целевой размер карты:** 60px × 85px (масштабируется на Desktop)
- **Макет:** Landscape-ready
  - Stock/Waste/Foundation — верх-ряд (40px margin)
  - Tableau — низ (7 колонок, equal width)
  - Вертикальный гэп между рядами: достаточно для scroll/pan

### 4.4 BoardPreset

```typescript
// solitaire-preset.ts
export const SOLITAIRE_PRESET: BoardConfig = {
  slots: {
    stock: { at: "stock" },
    waste: { at: "waste" },
    "found:S": { at: "found-0" },
    "found:H": { at: "found-1" },
    "found:D": { at: "found-2" },
    "found:C": { at: "found-3" },
    "tab:0": { at: "tab-0" },
    "tab:1": { at: "tab-1" },
    // ... tab 2-6
  },
};
```

---

## V. VISUALS & AESTHETICS

### 5.1 Цветовая схема (из client2/theme.css)
- **Фон:** Тёмно-зелёный (как казино/пасьянсы) или тёмно-серый (#1a1a1a)
- **Карты:** Стандартные масти (SVG из `symbols.ts`)
- **Текст:** Handjet шрифт (кириллица, как в client2)

### 5.2 Элементы UI

#### Карта (Card)
- **Лицом вверх:** Стандартная карта (номинал + масть)
- **Лицом вниз:** Спинка (паттерн из client)
- **Скрытая карта:** TG-пыль (из `censorParticles.ts`) — не нужна в MVP

#### Слоты (Slot Paint)
- **Фундамент:** Иконка масти внутри контура, яркая (gold/silver тема)
- **Tableau:** Контур пустого слота, аккуратный
- **Stock/Waste:** Скромный рамка

#### Стопки (Stack Layout)
- **Stock:** 3D-offset (как в `deckStack.ts`, передний край выше)
- **Waste:** Только верхняя карта видна
- **Tableau:** Веер-укладка (как в `fanGeometry.ts`) — каждая карта видна на ~20px
- **Foundation:** Плоская стопка

### 5.3 Анимации (из `anim/config.ts` + `effects/`)

| Движение | Тип | Длительность | Easing | Примечание |
|----------|-----|--------------|--------|-----------|
| Card fly | Bezier | 300ms | Ease-out-cubic | Стандартный полёт карты |
| Flip | Rotate 180° | 400ms | Ease-in-out | Stock → Waste |
| Stack shrink | Scale | 150ms | Ease-out | Tableau уходит вверх при хвате |
| Win fanfare | Particles | 1000ms+ | Loop | Confetti / bounce (ГДЕ БУДЕТ?) |
| Reject/shake | Vibrate | 100ms | Sine | Если move невалидна |
| Burn | Fade-out + particles | 500ms | Ease-out | На foundation accept (FX, не в MVP) |

### 5.4 Жесты (Input)

- **Tap на Stock** → `takeStock()` (flip верхней карты)
- **Drag card from Waste/Tableau** → hit-test Tableau + Foundation, drop-zone feedback
- **Tap на Waste** → выбрать карту (для мобильных, альтернатива драгу)
- **Tap на Tableau** → фан-открытие (если pile можно фанить, как в Crusade)
- **Double-tap на card** → quick-move to Foundation (AUTO MOVE LOGIC — **не в MVP**)

---

## VI. ARCHITECTURE & MODULES

### 6.1 Папки и модули

```
client2/src/
├── game/
│   ├── board/
│   │   ├── solitaireRules.ts          (✓ существует)
│   │   ├── solitaireRules.test.ts     (✓ существует)
│   │   ├── solitaireState.ts          (NEW)
│   │   ├── solitaireState.test.ts     (NEW)
│   │   └── solitaireLayout.ts         (NEW)
│   ├── solitaire/                     (NEW FOLDER)
│   │   ├── engine.ts                  (board + game state mgmt)
│   │   ├── engine.test.ts
│   │   ├── actions.ts                 (command handlers)
│   │   ├── actions.test.ts
│   │   ├── ui.ts                      (visual setup)
│   │   └── preset.ts                  (board config)
│   └── engine/
│       └── solitaireEngine.ts         (master game engine)
├── SolitaireGame.tsx                  (NEW - React host)
└── CensorDemo.tsx                     (existing - for storybook)
```

### 6.2 Модули (высокоуровнево)

#### **`solitaireRules.ts`** (уже есть)
- `suitOf(card)` → масть
- `srank(card)` → ранг (A=1, K=13)
- `tableauAccepts(card, topCard)` → bool
- `foundationAccepts(card, topCard)` → bool

#### **`solitaireState.ts`** (NEW)
Чистое состояние игры (immutable):
```typescript
interface SolitaireGameState {
  phase: GamePhase;
  
  board: Board;  // slots: stock, waste, found:[S,H,D,C], tab:[0-6]
  
  deckRev: number;  // оптимист. синк (как в Crusade)
  
  // Статистика (опционально в MVP)
  movesCount: number;
  timeStarted: number;
  timeElapsed: number;
}

// Actions / Commands (как в CONTROL-DESIGN)
type SolitaireAction = 
  | { type: "dealStock"; id: string }
  | { type: "moveCard"; from: string; to: string; cardId: string }
  | { type: "moveStack"; from: string; to: string; cardIds: string[] }
  | { type: "recycleStock" }
  | { type: "resetGame" };
```

#### **`solitaireLayout.ts`** (NEW)
Чистая геометрия (как `boardLayout.ts`):
```typescript
export interface SlotGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  layout: "stack" | "fan" | "single";  // как складывать карты
}

export function getSolitaireLayout(
  vpW: number,
  vpH: number,
  profile: "mobile" | "tablet" | "desktop"
): Record<string, SlotGeometry> { ... }
```

#### **`solitaire/engine.ts`** (NEW)
Клиентский движок (глав. автомат):
```typescript
export class SolitaireGameEngine {
  private state: SolitaireGameState;
  private board: Board;
  
  constructor(initialState?: Partial<SolitaireGameState>);
  
  // Actions (отправляют события)
  dealStock(): { valid: boolean; error?: string };
  moveCard(fromSlot: string, toSlot: string, cardId: string): { valid: boolean; error?: string };
  moveStack(fromSlot: string, toSlot: string, cardIds: string[]): { valid: boolean; error?: string };
  recycleStock(): void;
  resetGame(): void;
  
  // Queries
  getState(): SolitaireGameState;
  isWinning(): boolean;
  canMakeMove(): boolean;
  getPossibleMoves(): Array<{from: string; to: string; card: string}>;
  
  // Events
  onMove: (action: SolitaireAction) => void;
  onWin: () => void;
  onLose: () => void;
}
```

#### **`solitaire/actions.ts`** (NEW)
Чистые функции-редьюсеры:
```typescript
export function applyAction(
  state: SolitaireGameState,
  action: SolitaireAction
): SolitaireGameState {
  switch (action.type) {
    case "dealStock": {
      const card = state.board.slots.stock?.members[0];
      if (!card) return state; // нечего брать
      
      // переместить из stock в waste
      const next = board.move(state.board, "stock", "waste", [card]);
      return { ...state, board: next, movesCount: state.movesCount + 1 };
    }
    // ...
  }
}
```

#### **`solitaire/ui.ts`** (NEW)
Визуальная инициализация борда:
```typescript
export function mountSolitaireBoard(
  engine: SolitaireGameEngine,
  boardUI: Board,  // дисплей-борд (slots → Pixi elements)
  viewport: Viewport
): {
  update(state: SolitaireGameState): void;
  destroy(): void;
} { ... }
```

#### **`solitaire/preset.ts`** (NEW)
BoardConfig для пасьянса (как в `boardPresets.ts`):
```typescript
export const SOLITAIRE_BOARD_CONFIG: BoardConfig = { ... };
```

#### **`SolitaireGame.tsx`** (NEW)
React-хост (как `FreeDesk.tsx`):
- Монтирует движок
- Привязывает жесты (InputRouter)
- Рендерит React UI (меню, рестарт, счётчик ходов)

---

## VII. USER FLOW (детально)

### 7.1 Сценарий: новичок открывает приложение

#### **Шаг 1: Entry Screen**
```
┌──────────────────────────────┐
│     🂠 КОСЫНКА 🂡             │
│    (Klondike Solitaire)       │
│                              │
│   ┌──────────────────────┐   │
│   │   🎮 НОВАЯ ИГРА     │   │
│   └──────────────────────┘   │
│                              │
│   Ваш рекорд: нет (MVP)      │
│                              │
│   Settings [gear] (TBD)      │
└──────────────────────────────┘
```
**Пользователь:** Нажимает "НОВАЯ ИГРА"

#### **Шаг 2: Deal (анимированная раздача)**
1. Колода перемешивается (визуально: shuffle/riffle FX)
2. Раздача Tableau (одна в каждую колонку, loop): 
   - Карты летят из центра в слоты с delay (cascade FX)
   - Каждая карта лежит лицом вверх (кроме первой карты в слоте — ещё обсудить)
3. Stock заполняется оставшимися картами (52 - 28 = 24)
4. Экран готов к игре

#### **Шаг 3: Первый ход (example)**
```
Stock (face-down)      Waste (face-up, пусто)     Foundation (4 пусто)
┌──────────┐           ┌──────────┐               ┌──────┐ ┌──────┐
│🂠 (24)   │           │  —       │               │  ♠   │ │  ♥   │
└──────────┘           └──────────┘               └──────┘ └──────┘

Tableau:
┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐
│  K  │  │  Q  │  │  J  │  │ 10  │  │  9  │  │  8  │  │  7  │
└─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘
```

**Юзер тапает Stock:**
- Карта переворачивается (flip-анимация 400ms)
- Если это Туз ♠: может автоматически лететь в Foundation
- Иначе: лежит в Waste (лицом вверх)

**Юзер драгит Waste (например, 5 ♦) в Tableau (на 6 ♠):**
- Drag-feedback: Tableau стопка подсвечивается (оверлей)
- Release → `moveCard("waste", "tab:0", "5♦")`
- Анимация: 5♦ летит из Waste в Tableau
- Состояние обновляется

#### **Шаг 4: Win Screen (пример, быстрая победа)**
```
Все Foundation заполнены (A→K каждой масти)
→ onWinningCheck() возвращает true
→ Фейерверк / confetti
→ Экран:

   ╔════════════════════╗
   ║    🎉 ВЫ ВЫИГРАЛИ! │
   ║                    │
   ║  Ходов: 18         │
   ║  Время: 2:34       │
   ║                    │
   ║ ┌──────────────┐   │
   ║ │ НОВАЯ ИГРА   │   │
   ║ └──────────────┘   │
   ║ ┌──────────────┐   │
   ║ │ В МЕНЮ       │   │
   ║ └──────────────┘   │
   ╚════════════════════╝
```

#### **Шаг 5: Рестарт**
Юзер нажимает "НОВАЯ ИГРА" → back to Шаг 2 (deal)

---

### 7.2 Сценарий: потеря (deadlock)

**Условие:** Stock пуст, Waste пуст, нет доступных ходов в Tableau.

```
   ╔════════════════════╗
   ║   ⚠️ НЕТ ХОДОВ    │
   ║                    │
   ║  Ходов: 37         │
   ║  Время: 5:12       │
   ║                    │
   ║ ┌──────────────┐   │
   ║ │ НОВАЯ ИГРА   │   │
   ║ └──────────────┘   │
   ║ ┌──────────────┐   │
   ║ │ В МЕНЮ       │   │
   ║ └──────────────┘   │
   ╚════════════════════╝
```

Логика проверки (после каждого хода):
```typescript
function canMakeMove(state: SolitaireGameState): boolean {
  // Есть ли карты в Stock?
  if (board.at(state.board, "stock")?.members.length > 0) return true;
  
  // Есть ли карты в Waste?
  const waste = board.at(state.board, "waste")?.members;
  if (waste?.length > 0) {
    // Можно ли переместить верхнюю карту Waste?
    if (canMoveToTableau(waste[waste.length - 1]) || 
        canMoveToFoundation(waste[waste.length - 1])) return true;
  }
  
  // Есть ли ходы из Tableau?
  for (let i = 0; i < 7; i++) {
    const slot = board.at(state.board, `tab:${i}`)?.members;
    if (slot?.length > 0) {
      if (canMoveToTableau(slot[slot.length - 1]) || 
          canMoveToFoundation(slot[slot.length - 1])) return true;
    }
  }
  
  return false;
}
```

---

## VIII. NETWORKING & STATE SYNC (осторожно/планы)

### 8.1 Локальная игра (MVP)
- **Авторитет:** Клиент (локальный `SolitaireGameEngine`)
- **Синк:** Нет (single-player, no server)

### 8.2 Будущее: Multiplayer / Server
Если потом захочется:
1. Сервер: `GameRoom` (как `CardRoom` в server/)
2. Schema: `GameState` → `SolitaireGameState` (Colyseus)
3. Клиент: порт команд → `room.send("move", ...)`
4. FX: `deck_fx` как в основном Crusade

Но это **за пределами MVP**.

---

## IX. ASSET LIST & DEPENDENCIES

### 9.1 Что переиспользуем из client2

- ✅ `CardFace` (номинал + масть)
- ✅ `symbols.ts` (SVG масти)
- ✅ `ui/Card.ts` (рендер карты)
- ✅ `ui/Piece.ts` (контейнер карты)
- ✅ `engine/cardTextures.ts` (Pixi текстуры)
- ✅ `board/board.ts` (Board логика)
- ✅ `engine/panZoom.ts` (если захочется зум)
- ✅ `engine/inputRouter.ts` (жесты)
- ✅ `effects/burn.ts` (опционально на Foundation)
- ✅ `anim/config.ts`, `easing.ts` (анимации)

### 9.2 Новые ассеты (минимум)

- **Иконки UI:** "+" (новая игра), "⟲" (рестарт), "⚙" (меню) — текст Handjet
- **Sounds (TBD):** deal-flip, card-land, win-fanfare — **не в MVP**, но место в архитектуре

---

## X. TESTING STRATEGY

### 10.1 Юнит-тесты

```bash
client2 $ npm test -- solitaire
```

| Модуль | Тесты |
|--------|-------|
| `solitaireRules.test.ts` | ✅ exists — suitOf, srank, accepts logic |
| `solitaireState.test.ts` | NEW — applyAction, state transitions |
| `solitaire/actions.test.ts` | NEW — dealStock, moveCard, recycleStock logic |
| `solitaire/engine.test.ts` | NEW — game loop, isWinning, canMakeMove |
| `solitaireLayout.test.ts` | NEW — geometry calcs for different viewports |

### 10.2 E2E / Визуальная регрессия

```bash
client2 $ npx playwright test
```

- **Happy path:** Deal → valid move → win
- **Sad path:** Deal → deadlock → restart
- **Edge:** Stock recycle, tablet layout, mobile portrait

### 10.3 Manual QA Checklist

- [ ] Deal animation smooth (cascade)
- [ ] Drag feedback visible (hover state)
- [ ] Invalid move rejected (shake)
- [ ] Win screen triggers correctly
- [ ] Restart clears state
- [ ] Mobile: cards не обрезаны, tapable области достаточно (48px min)
- [ ] Desktop: зум не сломан

---

## XI. EPIC BREAKDOWN & TASK TREE

### Epic 1: Core Game State & Rules (**E1**)
- [ ] 1.1 Create `solitaireState.ts` with GameState type & action types
- [ ] 1.2 Implement `applyAction()` reducer
- [ ] 1.3 Add unit tests (100% coverage of `applyAction`)
- [ ] 1.4 Implement `isWinning()`, `canMakeMove()` checks
- **Owner:** Game Engine Lead  
- **Estimate:** 3 days  
- **Deps:** None

### Epic 2: Game Engine & Control (**E2**)
- [ ] 2.1 Create `SolitaireGameEngine` class (state + methods)
- [ ] 2.2 Implement `dealStock()`, `moveCard()`, `moveStack()`, `recycleStock()`
- [ ] 2.3 Wire event emitters (`onMove`, `onWin`, `onLose`)
- [ ] 2.4 Add comprehensive engine tests
- **Owner:** Game Engine Lead  
- **Estimate:** 3 days  
- **Deps:** E1

### Epic 3: Board Geometry & Layout (**E3**)
- [ ] 3.1 Create `solitaireLayout.ts` (slot geometry calc)
- [ ] 3.2 Generate layout for mobile/tablet/desktop profiles
- [ ] 3.3 Add layout tests (verify card positions fit viewport)
- [ ] 3.4 Integrate with `boardLayout.ts` (if shared)
- **Owner:** Layout Engineer  
- **Estimate:** 2 days  
- **Deps:** None (parallel to E1/E2)

### Epic 4: Visual Rendering & UI (**E4**)
- [ ] 4.1 Create `SolitaireGame.tsx` (React host)
- [ ] 4.2 Mount `SolitaireGameEngine` on canvas
- [ ] 4.3 Implement board preset (`solitaire/preset.ts`)
- [ ] 4.4 Render slots & cards (using existing `ui/Card.ts`, `ui/Piece.ts`)
- [ ] 4.5 Wire input: InputRouter → engine actions
- [ ] 4.6 Visual feedback: hover, drag-over, invalid-move shake
- **Owner:** UI/Rendering Lead  
- **Estimate:** 4 days  
- **Deps:** E1, E2, E3

### Epic 5: Animations & Polish (**E5**)
- [ ] 5.1 Deal animation (cascade flies from center)
- [ ] 5.2 Card fly animation (Tableau/Foundation)
- [ ] 5.3 Flip animation (Stock → Waste)
- [ ] 5.4 Stack animations (compress on drag, restore on drop)
- [ ] 5.5 Win fanfare (confetti / particles)
- [ ] 5.6 Reject feedback (shake on invalid move)
- **Owner:** Animation Lead  
- **Estimate:** 3 days  
- **Deps:** E4

### Epic 6: Game Flow & Screens (**E6**)
- [ ] 6.1 Menu screen (New Game button)
- [ ] 6.2 Playing screen (cards + stats: moves/time)
- [ ] 6.3 Win screen (you won! + restart buttons)
- [ ] 6.4 Loss screen (no moves left + restart buttons)
- [ ] 6.5 Screen transitions (fade/scale)
- **Owner:** UI/UX Lead  
- **Estimate:** 2 days  
- **Deps:** E4

### Epic 7: Testing & QA (**E7**)
- [ ] 7.1 Unit test coverage ≥ 90% (all game logic)
- [ ] 7.2 E2E happy-path: deal → move → win
- [ ] 7.3 E2E sad-path: deal → deadlock → restart
- [ ] 7.4 Manual QA on mobile/tablet/desktop
- [ ] 7.5 Visual regression (Playwright)
- **Owner:** QA Lead  
- **Estimate:** 2 days  
- **Deps:** E1–E6

### Epic 8: Navigation & Routing (**E8**)
- [ ] 8.1 Add route `/v2/solitaire` (in `main.tsx`, `nav.ts`)
- [ ] 8.2 Add "Solitaire" button in main menu
- [ ] 8.3 Ensure clean back-link to menu
- **Owner:** Frontend Lead  
- **Estimate:** 1 day  
- **Deps:** E6

**Total estimate:** ~20 days (6-8 weeks with overlapping teams)

---

## XII. RISK & MITIGATION

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Shuffle логика OOM на большом количестве рассчётов | Низка | Средне | Pre-shuffle validation + test on 100 shuffles |
| Mobile drag/tap конфликты (drag vs tap detection) | Средня | Высока | Используем `dragHappened` флаг (как в Crusade) |
| Win condition не срабатывает | Средня | Высока | Раннее unit-тестирование `isWinning()` |
| Rendering lag при множестве анимаций | Средня | Средне | Profile с React DevTools; оптимизировать FX |
| Layout breaksdown на экстремальных размерах | Низка | Средне | Test on 360px, 768px, 1920px |

---

## XIII. SUCCESS CRITERIA (MVP Definition)

### ✅ Must Have (Шаг 1)
1. **Deal:** 52 карты раздаются в Tableau (7 col, 1+2+3+4+5+6+7), остаток в Stock
2. **Moves:**
   - Tableau → Tableau (K on empty, N-1 opposite color)
   - Waste → Tableau / Foundation
   - Tableau → Foundation
   - Stock → Waste (flip 1 card per tap)
   - Waste recycle (when Stock empty)
3. **Win:** All 4 foundations filled (A→K each) → win screen
4. **Loss:** No moves available & Stock/Waste empty → loss screen
5. **Restart:** User can start new game from end screen
6. **UI:** Menu, playing field, win/loss screens, move counter

### 🎯 Should Have (Шаг 2, if time)
1. Time counter
2. Undo 1 last move (optional)
3. Auto-move suggestion (hint)
4. Sound effects (deal, card land, win)
5. Leaderboard / hi-score (local storage)

### 🚀 Nice to Have (Шаг 3, post-MVP)
1. Animation profiles (reduce-motion)
2. Difficulty: 1-card vs 3-card draw from Stock
3. Theme customization (dark/light)
4. Multiplayer (async / pass-and-play)
5. Replay saved games

---

## XIV. DEPLOYMENT & VERSIONING

### 14.1 Build & Deploy
```bash
cd client2
npm run build
# Output: dist/
# Deploy to Fly.io (via scripts/deploy.sh)
# Live at: crusade-deck-client.fly.dev/v2/solitaire
```

### 14.2 Version
- Client version in `src/version.ts` bumps on release
- Example: `v0.3.0+200` (version + build count)

### 14.3 Git
- Branch: `main` (all PRs to main)
- Commit prefix: `feat/`, `fix/`, `chore/`
- CI: GitHub Actions (test + deploy on push to main)

---

## XV. REFERENCES & READING LIST

### Внутренние
- `CLAUDE.md` — Crusade Deck архитектура
- `client2/HANDOFF.md` — текущее состояние client2
- `client2/CONTROL-DESIGN.md` — управление & порт команд
- `client2/GRID-DESIGN.md` — борды
- `client2/ENGINE-UPGRADE.md` — BoardFactory

### Классические
- Klondike Solitaire Wikipedia: https://en.wikipedia.org/wiki/Klondike_(solitaire)
- FreeCell vs Klondike: сложность / оптимизация
- Card.js / Solitaire.js reference implementations (вдохновение)

---

## XVI. GLOSSARY & TERMINOLOGY

| Термин | Значение |
|--------|----------|
| **Tableau** | 7 стопок карт внизу экрана (основная область игры) |
| **Foundation** | 4 стопки сверху (целевые, по мастям A→K) |
| **Stock** | Колода (face-down, источник карт) |
| **Waste** | Отбой (face-up, активная карта из Stock) |
| **Ранг** | Номинал карты (A=1, 2–10, J=11, Q=12, K=13) |
| **Масть** | Suit (♠♥♦♣) |
| **Последовательность** | Набор карт в убывающем порядке (K-Q-J...) |
| **Deadlock** | Состояние, когда нет доступных ходов (проигрыш) |
| **Flip** | Переворот карты (Stock → Waste) |
| **Drag** | Перетаскивание карты/стопки (input) |
| **FX** | Визуальные эффекты (анимации, частицы, звуки) |

---

## XVII. APPENDIX: Pseudo-code Flow

```typescript
// === GAME INIT ===
function initGame() {
  const deck = createDeck52(); // new deck
  shuffle(deck); // random order
  
  const state = createGameState();
  state.board = dealTableau(deck, 28);
  state.board.stock = deck.slice(28); // remaining 24
  
  return state;
}

// === GAME LOOP (per user input) ===
function onUserAction(action: UserAction) {
  const gameAction = parseUserAction(action); // drag → moveCard, tap → dealStock
  const nextState = applyAction(state, gameAction);
  state = nextState;
  
  render(state);
  
  // Check win/loss
  if (isWinning(state)) {
    phase = "won";
    showWinScreen(state.movesCount, state.timeElapsed);
  } else if (!canMakeMove(state)) {
    phase = "lost";
    showLossScreen(state.movesCount, state.timeElapsed);
  }
}

// === RENDER ===
function render(state: SolitaireGameState) {
  for (const [slotId, container] of Object.entries(state.board.slots)) {
    const geom = layout[slotId];
    const cards = container.members;
    
    // Lay out cards in slot using geom.layout (stack|fan|single)
    for (let i = 0; i < cards.length; i++) {
      updateCardVisual(cards[i], geom, i);
    }
  }
  
  // Update stats display
  updateMoveCounter(state.movesCount);
  updateTimer(state.timeElapsed);
}

// === INPUT HANDLER ===
function onPointerDown(evt: PointerEvent) {
  const hitCard = hitTest(evt.x, evt.y);
  if (hitCard) {
    startDrag(hitCard);
  } else {
    const hitSlot = hitTestSlot(evt.x, evt.y);
    if (hitSlot === "stock") {
      onUserAction({ type: "dealStock" });
    }
  }
}

function onPointerMove(evt: PointerEvent) {
  if (!dragging) return;
  updateDragViz(evt.x, evt.y);
  const hitZone = hitTestZone(evt.x, evt.y);
  showDropZoneHint(hitZone);
}

function onPointerUp(evt: PointerEvent) {
  if (!dragging) return;
  const targetZone = hitTestZone(evt.x, evt.y);
  
  if (targetZone && canMove(dragCard, targetZone)) {
    onUserAction({ type: "moveCard", from: dragCard.slot, to: targetZone.id });
  } else {
    // Reject: shake animation
    playRejectFX(dragCard);
  }
  
  endDrag();
}
```

---

**Document Version:** 1.0  
**Last Updated:** 2026-07-27  
**Status:** Ready for Design Review & Implementation Sprint
