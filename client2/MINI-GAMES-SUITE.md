# MINI-GAMES SUITE — 5 Casual Solitaires для MVP

**Статус:** Game Design Plan (все 5 игр)  
**Целевая версия:** v0.3.0+mini-games (добавочный модуль к Solitaire)  
**Дата:** 2026-07-27

---

## 📋 ОБЗОР (5 игр за 1 sprint)

Все игры **переиспользуют архитектуру Косынки** (immutable state + reducer + Pixi):
- Одни и те же patterns (board, slots, cards, actions)
- Одни и те же UI компоненты
- Одни и те же animations
- Каждая на 3–5 дней (легче Косынки)

| # | Игра | Жанр | Сложность | Дни | Переиспользование |
|---|------|------|-----------|-----|-------------------|
| 1 | **Линии** | Puzzle | ⭐ | 3 | Board + slots + drop |
| 2 | **Пятнашки** | Puzzle | ⭐ | 4 | Board + drag/swap |
| 3 | **Паук** | Solitaire | ⭐⭐ | 4 | Косынка (90% кода) |
| 4 | **Маджонг** | Matching | ⭐ | 3 | Card matching |
| 5 | **Доминошки** | Placement | ⭐ | 4 | Grid + placement |
| **TOTAL** | | | | **18 дней** | **Все из одного движка** |

---

## 1️⃣ ЛИНИИ (Lines / 5-in-a-row Puzzle)

### Концепция
Классическая головоломка: разместить шары на доске 9×9, составляя ряды из 5+ одного цвета = удаление.

### Правила
- **Доска:** 9×9 сетка
- **Ходы:** 1 шар появляется каждый ход (случайный цвет из 5)
- **Цели:** Составить 5+ шаров одного цвета (горизонтально, вертикально, диагонально)
- **Удаление:** Ряд исчезает, счёт +10 за каждый шар
- **Падение:** Шары над пустотой падают вниз
- **Проигрыш:** Доска заполнена, нет пустых клеток

### MVP Scope
- ✅ Drag шара на свободную клетку
- ✅ Match-detection (5+ в ряд)
- ✅ Удаление совпадений
- ✅ Анимация падения
- ✅ Score counter
- ✅ Game over screen

### Архитектура
```
State:
{
  board: 9x9 grid (cell id → color | null)
  score: number
  nextBall: color
  phase: "playing" | "gameover"
}

Actions:
- dropBall(x, y, color)
- removeMatches()
- applyGravity()
- resetGame()
```

### Оценка реализации
- **State logic:** 100 строк (match detection)
- **Rendering:** Переиспользует Card + grid layout
- **Animations:** fly + pop (из client2)
- **Tests:** 10 unit tests
- **Дни:** 3

---

## 2️⃣ ПЯТНАШКИ (15-Puzzle / Sliding Puzzle)

### Концепция
Классическая логическая головоломка: переместить плитки в правильный порядок.

### Правила
- **Доска:** 4×4 сетка (15 плиток + 1 пусто)
- **Плитки:** Пронумерованы 1–15
- **Ход:** Tap плитку рядом с пустотой → она скользит туда
- **Цель:** Расставить плитки в порядке (1–15, пусто внизу справа)
- **Решение:** ~80 ходов в среднем
- **Чит:** Shuffle доска (minimum 80 ходов)

### MVP Scope
- ✅ 4×4 сетка с плитками
- ✅ Tap → slide анимация (200ms)
- ✅ Move counter
- ✅ Check winning condition
- ✅ Shuffle button
- ✅ Win screen + restart

### Архитектура
```
State:
{
  board: 4x4 grid (cell id → tile number | null)
  movesCount: number
  phase: "playing" | "won"
}

Actions:
- slideTile(tileId)
- shuffleBoard()
- resetGame()
```

### Оценка реализации
- **State logic:** 80 строк (slide validation + win detection)
- **Rendering:** Grid + number labels
- **Animations:** slide (easeOutQuad, 200ms)
- **Tests:** 8 unit tests
- **Дни:** 4

---

## 3️⃣ ПАУК ПАСЬЯНС (Spider Solitaire)

### Концепция
Вариант Косынки на одной масти (проще, быстрее).

### Правила
- **Колода:** 104 карты (2× 52, одна масть ♠)
- **Tableau:** 10 колонок (8 стопок по 6, 2 по 4)
- **Цель:** Собрать 8 последовательностей (A→K каждая) в Foundation
- **Разница от Косынки:** Не нужны 4 масти (одна ♠), нет Waste (только Stock)
- **Ходы:** Tableau↔Tableau (N-1 same suit), drag sequences
- **Win:** Все 8 в Foundation

### MVP Scope
- **Переиспользовать из Косынки:** 95% (isWinning, tableauAccepts, animations)
- **Новое:** 
  - Layout для 10 колонок
  - No Foundation по мастям (все ♠)
  - Double deck logic

### Архитектура
```
Переиспользовать:
- applyAction (то же)
- solitaireRules.ts (почти то же, но 1 масть)
- engine.ts (clone SolitaireGameEngine)
- ui.ts (clone, только layout изменить)

State:
{
  board: Board (10 tableau + 1 stock + 1 foundation)
  movesCount: number
  phase: "playing" | "won" | "lost"
}
```

### Оценка реализации
- **State logic:** 50 строк (копия + изменения)
- **Rendering:** 100 строк (clone SolitaireUI)
- **Animations:** переиспользование
- **Tests:** 5 unit tests (different deck size)
- **Дни:** 4 (копирование + адаптация)

---

## 4️⃣ МАДЖОНГ ПАРЫ (Mahjong Solitaire / Memory)

### Концепция
Найти пары одинаковых карт (как Memory game, но на доске).

### Правила
- **Доска:** 6×6 сетка (36 карт, 18 пар)
- **Карты:** Лицом вниз
- **Ход:** Tap 2 карты → если пара, удалить; иначе перевернуть обратно
- **Цель:** Найти все 18 пар
- **Бонус:** Меньше ходов = выше score (max за 18 ходов)

### MVP Scope
- ✅ 6×6 доска с лицом-вниз картами
- ✅ Flip анимация (180° rotate)
- ✅ Tap → flip (max 2 одновременно)
- ✅ Пара-detection (2 одинаковые → remove)
- ✅ Move counter
- ✅ Win screen

### Архитектура
```
State:
{
  board: 6x6 grid (cardId → card + faceUp flag)
  pairs: Set<cardId> (уже найденные)
  selected: [cardId, cardId] | null (текущая пара)
  movesCount: number
  phase: "playing" | "won"
}

Actions:
- flipCard(cardId)
- checkMatch()
- resetGame()
```

### Оценка реализации
- **State logic:** 120 строк (flip logic + match detection)
- **Rendering:** Карты face-down (спинка)
- **Animations:** flip (180° rotate, 300ms)
- **Tests:** 12 unit tests
- **Дни:** 3

---

## 5️⃣ ДОМИНОШКИ (Dominoes / Tile Placement)

### Концепция
Раскладывать доминошки (костяшки) на доску, как в реальной игре (но без противника).

### Правила
- **Доминошки:** 28 костей (0–6 точек на каждой половинке)
- **Доска:** Бесконечная лента (или max 30 слотов)
- **Цепь:** Начинается с первой костяшки
- **Ход:** Выбрать костяшку из руки, приложить к краю цепи (если числа совпадают)
- **Рука:** 7 доминошек видны
- **Цель:** Разложить все 28 костяшек или максимум (если stuck)

### MVP Scope
- ✅ 7 доминошек в руке (grid)
- ✅ Цепь на центре доски (горизонтальная лента)
- ✅ Drag костяшку в цепь
- ✅ Валидация (числа совпадают)
- ✅ Auto-draw из оставшихся костей
- ✅ Анимация slide
- ✅ Game over screen (stuck или выиграл)

### Архитектура
```
State:
{
  hand: [domino, domino, ...]  // 7 видимых
  chain: [domino, domino, ...]  // выложенные
  stock: [domino, ...]          // оставшиеся в колоде
  isStuck: boolean              // нет валидных ходов
  placesCount: number
  phase: "playing" | "won" | "stuck"
}

Actions:
- playDomino(handIndex, position)  // position: "left" | "right"
- drawFromStock()
- resetGame()
```

### Оценка реализации
- **State logic:** 150 строк (domino matching rules)
- **Rendering:** Доминошки + цепь (custom layout)
- **Animations:** slide + rotate
- **Tests:** 15 unit tests (matching logic)
- **Дни:** 4

---

## 🏗 АРХИТЕКТУРА (общая для всех 5)

### Переиспользование из Косынки
```
Solitaire/
├── engine.ts          → Clone → LinesEngine, PuzzleEngine, etc.
├── state.ts           → Copy pattern → LinesState, PuzzleState
├── ui.ts              → Copy pattern → LinesUI, PuzzleUI
├── layout.ts          → Adapt geometry
└── preset.ts          → Board config

Общие:
├── board/board.ts     (Board, slots, containers)
├── ui/Card.ts         (card rendering)
├── inputRouter        (tap, drag)
├── anim/easing.ts     (animations)
└── effects/           (particles, etc.)
```

### Структура папок
```
client2/src/game/
├── solitaire/         (Kosinka)
├── spider/            (Spider Solitaire)
├── lines/             (Lines puzzle)
├── puzzle15/          (15-Puzzle)
├── mahjong/           (Mahjong pairs)
├── dominoes/          (Dominoes)
└── mini-games/        (Menu + routing for all)
```

---

## 🎮 MENU ROUTING

```
Menu Screen:
  🂠 Косынка
  🕷️ Паук
  🔴 Линии
  🔢 Пятнашки
  🀄 Маджонг
  🀱 Доминошки
  
Routes:
  /v2/solitaire
  /v2/spider
  /v2/lines
  /v2/puzzle15
  /v2/mahjong
  /v2/dominoes
```

---

## 📊 IMPLEMENTATION PHASES

### Phase 1:架构 (Дни 1–2)
- Clone `SolitaireGameEngine` pattern → base class
- Create `MiniGameEngine` abstract
- Create folder structure
- Setup routing + menu

**Дни:** 2  
**Output:** Base infrastructure

---

### Phase 2–6: Per-game (Дни 3–20)

| Game | Дни | Порядок |
|------|-----|---------|
| **Линии** | 3 | 2–4 (simplest) |
| **Маджонг** | 3 | 5–7 |
| **Пятнашки** | 4 | 8–11 |
| **Доминошки** | 4 | 12–15 |
| **Паук** | 4 | 16–19 |

**Итого:** 18 дней (+ 2 на架構 = 20)

### Phase 21: Testing & Deploy (Дни 21–22)
- E2E for all games
- Playwright regression
- Deploy

---

## ✅ SUCCESS CRITERIA

### Per-game MVP
- ✅ Core mechanic working
- ✅ Win/loss detection
- ✅ Move counter
- ✅ Restart button
- ✅ Mobile responsive
- ✅ 80%+ test coverage

### Suite MVP
- ✅ All 5 games playable
- ✅ Menu works
- ✅ Routing works
- ✅ Shared architecture (no duplication)

---

## 📦 DELIVERABLES (Summary)

### Code
- 5× `engine.ts` (each 150–250 LOC)
- 5× `ui.ts` (each 100–150 LOC)
- 5× `state.ts` (each 100–200 LOC)
- 5× `layout.ts` (each 80–120 LOC)
- 1× `MiniGameEngine` base class
- 1× `menu.tsx` (updated)
- Tests for all (~600 LOC total)

**Total new code:** ~3500 LOC (including tests)

### Time
- **Kosinka:** 14 дней (из TECHNICAL-SPEC)
- **Mini-games:** 20 дней (5 games)
- **Total MVP suite:** 34 дня (один разработчик)

---

## 🎨 VISUAL CONSISTENCY

All 5 games use:
- Same pixel-casual theme (Kosinka)
- Same card texture cache
- Same animation curves
- Same input patterns (tap/drag)
- Same color palette
- Same fonts (Handjet)

Result: **Cohesive suite** (feels like one product)

---

## 🚀 DEPLOYMENT

```bash
# Build all at once
cd client2 && npm run build

# Deploy
scripts/deploy.sh

# Live
crossade-deck-client.fly.dev/v2/
  ├── solitaire
  ├── spider
  ├── lines
  ├── puzzle15
  ├── mahjong
  └── dominoes
```

---

## 🔮 FUTURE EXTENSIONS

### Per-game
- Leaderboards (local storage)
- Difficulty levels
- Hints / solve mode
- Undo per-move

### Cross-game
- Achievements (collected across all)
- Daily challenge (one puzzle per game)
- Multiplayer pass-and-play (async)
- Replay saved games

---

## 💡 WHY THIS SELECTION?

✅ **Diverse mechanics:** Matching, sliding, placement, removing, collecting  
✅ **Reuse-friendly:** All follow Kosinka architecture  
✅ **Casual-friendly:** No real-time, turn-based, no punishment  
✅ **Testable:** Clear win/loss conditions  
✅ **Portfolio-worthy:** Shows range (not just one game type)

---

**Status:** Ready for Design Review  
**Next:** Detailed game design docs for each (like SOLITAIRE-MVP-PLAN.md) if needed  
**Estimate:** 20 days to full MVP suite (after Kosinka)

