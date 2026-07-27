# SOLITAIRE MVP — Documentation Index

**Все документы готовы к использованию. Начни с OVERVIEW.**

---

## 📚 ДОКУМЕНТЫ (по порядку чтения)

### 🎯 НАЧНИ ОТСЮДА

| Документ | Назначение | Читать когда | Время |
|----------|-----------|-------------|-------|
| **SOLITAIRE-OVERVIEW.md** | Краткий overview + ссылки | Первым делом | 10 мин |

### 📋 ГЛАВНЫЕ ДОКУМЕНТЫ

| Документ | Раздел | Что в нём | Читай для |
|----------|--------|----------|-----------|
| **SOLITAIRE-MVP-PLAN.md** | Game Design Doc | Правила, экраны, UI, эпики | Понимания как играть & выглядит |
| **SOLITAIRE-ARCHITECTURE.md** | Архитектура | Диаграммы, flow, data | Понимания как устроено |
| **SOLITAIRE-TECHNICAL-SPEC.md** | Техническое задание | Код, интеграция, фазы | Как реализовывать |

---

## 🗺 QUICK MAP (что где искать)

### GAME DESIGN & RULES
- **Правила пасьянса:** PLAN.md §II (2 страницы)
- **Game flow:** PLAN.md §III (state machine diagram)
- **Board layout:** PLAN.md §IV (slot geometry)
- **Win/Loss conditions:** PLAN.md §II.4–2.5

### ВИЗУАЛЬНЫЙ ДИЗАЙН
- **Цветовая схема:** PLAN.md §V.1
- **UI элементы:** PLAN.md §V.2–V.3
- **Анимации:** PLAN.md §V.3 (таблица анимаций)
- **Жесты:** PLAN.md §V.4 (tap, drag, double-tap)

### АРХИТЕКТУРА & КОМПОНЕНТЫ
- **Иерархия компонентов:** ARCHITECTURE.md §I
- **Input flow:** ARCHITECTURE.md §II
- **Render flow:** ARCHITECTURE.md §III
- **State machine:** ARCHITECTURE.md §IV
- **Board model:** ARCHITECTURE.md §V
- **Action dispatch:** ARCHITECTURE.md §VI

### РЕАЛИЗАЦИЯ (КОДИРОВАНИЕ)
- **Новые модули:** TECHNICAL-SPEC.md Part 1 (6 файлов с pseudo-code)
- **Интеграция:** TECHNICAL-SPEC.md Part 2 (что изменить)
- **Фазы & timeline:** TECHNICAL-SPEC.md Part 3 (14 дней, 5 фаз)
- **Build & deploy:** TECHNICAL-SPEC.md Part 4

### ТЕСТИРОВАНИЕ
- **Unit tests:** TECHNICAL-SPEC.md §1.1–1.5 (в каждом модуле)
- **Что тестировать:** TECHNICAL-SPEC.md Part 5
- **E2E сценарии:** PLAN.md §X (happy & sad path)

### PLANNING & ROADMAP
- **Epic breakdown:** PLAN.md §XI (8 эпиков)
- **Success criteria:** PLAN.md §XIII
- **Risks & mitigation:** PLAN.md §XII

---

## 📖 ТЕМАТИЧЕСКИЕ РАЗДЕЛЫ

### Если ты... DESIGNER/PM

**Читай в этом порядке:**
1. OVERVIEW.md (quick intro)
2. PLAN.md §I–IV (game concept, rules, board)
3. PLAN.md §V–VII (visuals, flow, user scenarios)
4. ARCHITECTURE.md §IV (state machine)

**Время:** 1–2 часа

---

### Если ты... DEVELOPER (Backend)

**Читай в этом порядке:**
1. OVERVIEW.md (architecture section)
2. TECHNICAL-SPEC.md Part 1 §1.1–1.2 (state + logic)
3. TECHNICAL-SPEC.md Part 1 §1.3 (engine)
4. ARCHITECTURE.md §V–VI (board model, action dispatch)

**Время:** 1–2 часа

---

### Если ты... FRONTEND/UI

**Читай в этом порядке:**
1. OVERVIEW.md (quick intro)
2. PLAN.md §V (visuals, animations, UI)
3. TECHNICAL-SPEC.md Part 1 §1.4–1.6 (ui.ts, React host)
4. ARCHITECTURE.md §III (render flow)

**Время:** 2–3 часа

---

### Если ты... FULL-STACK (Один разработчик)

**Читай в этом порядке:**
1. OVERVIEW.md (весь документ)
2. PLAN.md (весь документ, особенно §I–VII, §XI)
3. TECHNICAL-SPEC.md (весь документ)
4. ARCHITECTURE.md (для уточнений)

**Время:** 4–6 часов

---

## 🎯 ДЛЯ РАЗНЫХ ФАЗ

### Фаза 1: State & Logic (Дни 1–3)

**Читай:**
- TECHNICAL-SPEC.md Part 1 §1.1–1.2 (state + layout)
- PLAN.md §II (rules)

**Файлы для создания:**
- `board/solitaireState.ts`
- `board/solitaireLayout.ts`

---

### Фаза 2: UI & Input (Дни 4–6)

**Читай:**
- TECHNICAL-SPEC.md Part 1 §1.3–1.6 (engine + ui)
- TECHNICAL-SPEC.md Part 2 (интеграция)
- PLAN.md §V.4 (жесты)
- ARCHITECTURE.md §II (input flow)

**Файлы для создания:**
- `solitaire/engine.ts`
- `solitaire/ui.ts`
- `solitaire/preset.ts`
- `SolitaireGame.tsx`

---

### Фаза 3: Animations (Дни 7–9)

**Читай:**
- PLAN.md §V.3 (animation table)
- ARCHITECTURE.md §VII (animation pipeline)
- PLAN.md §VII.2 (user flow с animations)

**Модули для обновления:**
- `solitaire/ui.ts` (добавить FX)
- `SolitaireGame.tsx` (интегрировать с engine)

---

### Фаза 4: Screens & Flow (Дни 10–11)

**Читай:**
- PLAN.md §VII (full user flow)
- ARCHITECTURE.md §IV (state machine)

**Модули для обновления:**
- `SolitaireGame.tsx` (render different screens)

---

### Фаза 5: Testing (Дни 12–14)

**Читай:**
- TECHNICAL-SPEC.md Part 1 (тесты для каждого модуля)
- TECHNICAL-SPEC.md Part 5 (tests structure)
- PLAN.md §X (E2E scenarios)

**Файлы для создания:**
- `board/solitaireState.test.ts`
- `board/solitaireLayout.test.ts`
- `solitaire/engine.test.ts`
- `e2e/solitaire.spec.ts`

---

## 🔗 ПЕРЕКРЁСТНЫЕ ССЫЛКИ

### "Как считаются допустимые ходы?"
- **Правила:** PLAN.md §II.3
- **Код:** TECHNICAL-SPEC.md Part 1 §1.1 (`foundationAccepts`, `tableauAccepts`)
- **Тесты:** TECHNICAL-SPEC.md Part 1 §1.1 (test examples)

### "Как работает drag-and-drop?"
- **Дизайн:** PLAN.md §V.4
- **Flow:** ARCHITECTURE.md §II (input flow)
- **Код:** TECHNICAL-SPEC.md Part 1 §1.3 (`moveCard` method)

### "Как выглядит экран win?"
- **Макет:** PLAN.md §VII.4 (step 4)
- **Flow:** ARCHITECTURE.md §IV (state machine)
- **Код:** TECHNICAL-SPEC.md Part 1 §1.6 (React host)

### "Что тестировать?"
- **Что:** PLAN.md §X (unit + E2E checklist)
- **Как:** TECHNICAL-SPEC.md Part 1 (1.1–1.5 test examples)
- **Где:** TECHNICAL-SPEC.md Part 5 (tests structure)

---

## 📊 ФАЙЛОВАЯ СТРУКТУРА (для создания)

```
client2/src/game/
├── board/
│   ├── solitaireRules.ts          ✅ СУЩЕСТВУЕТ
│   ├── solitaireRules.test.ts     ✅ СУЩЕСТВУЕТ
│   ├── solitaireState.ts          🆕 CREATE (PHASE 1)
│   ├── solitaireState.test.ts     🆕 CREATE (PHASE 5)
│   ├── solitaireLayout.ts         🆕 CREATE (PHASE 1)
│   └── solitaireLayout.test.ts    🆕 CREATE (PHASE 5)
│
├── solitaire/                     🆕 CREATE FOLDER
│   ├── engine.ts                  🆕 CREATE (PHASE 2)
│   ├── engine.test.ts             🆕 CREATE (PHASE 5)
│   ├── ui.ts                      🆕 CREATE (PHASE 2)
│   ├── preset.ts                  🆕 CREATE (PHASE 2)
│   └── preset.test.ts             🆕 CREATE (PHASE 5)
│
├── SolitaireGame.tsx              🆕 CREATE (PHASE 2)
└── [rest unchanged]               ✅ REUSE

e2e/
└── solitaire.spec.ts              🆕 CREATE (PHASE 5)

main.tsx                           🔄 MODIFY (add route)
Menu.tsx                           🔄 MODIFY (add button)
nav.ts                             🔄 MODIFY (add goSolitaire)
```

---

## ⏱ ВРЕМЯ НА ЧТЕНИЕ

| Документ | Быстрое | Полное |
|----------|---------|--------|
| OVERVIEW.md | 10 мин | 20 мин |
| PLAN.md | 30 мин | 2 часа |
| ARCHITECTURE.md | 30 мин | 1.5 часа |
| TECHNICAL-SPEC.md | 45 мин | 2 часа |
| **ВСЕГО** | **2 часа** | **5.5 часов** |

---

## 🚀 QUICK START (в одной команде)

```bash
# Прочитай OVERVIEW (10 мин)
cat client2/SOLITAIRE-OVERVIEW.md

# Потом выбери что реализовывать
# Фаза 1? → читай TECHNICAL-SPEC.md Part 1 §1.1–1.2
# Фаза 2? → читай TECHNICAL-SPEC.md Part 1 §1.3–1.6
# Фаза 5? → читай TECHNICAL-SPEC.md Part 1 (тесты в каждом §)
```

---

## 📝 GIT & COMMITS

Все документы уже в repo:
```bash
git log --oneline client2/SOLITAIRE-*
```

Коммитить код в ветке: `claude/solitaire-mvp-design-jo2akg`

---

## ❓ FAQ

**Q: Начать с какого документа?**
A: SOLITAIRE-OVERVIEW.md (этот).

**Q: Сколько времени на реализацию?**
A: 14 дней (2 недели) один разработчик, 5 фаз (TECHNICAL-SPEC Part 3).

**Q: Что тестировать?**
A: PLAN.md §X (E2E scenarios) + TECHNICAL-SPEC Part 5 (test structure).

**Q: Нужен ли сервер?**
A: Нет, MVP полностью локальный. Server-sync готово к future (CONTROL-DESIGN pattern).

**Q: Какие модули переиспользовать?**
A: OVERVIEW.md "Integration with Crusade" + TECHNICAL-SPEC Part 2.

**Q: Как интегрировать?**
A: TECHNICAL-SPEC Part 2 (route setup, navigation, reuse list).

---

**Last Updated:** 2026-07-27  
**Status:** ✅ Complete Documentation Suite Ready

