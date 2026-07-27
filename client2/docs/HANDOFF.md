# HANDOFF — client2 (передача состояния новому агенту)

Живой документ «где мы сейчас». Обновляй при существенных изменениях. Незаконченные дела и
планы — ОТДЕЛЬНО, в [`open-tasks.md`](./open-tasks.md). Рычаги анимации (дизайн) —
[`animation-levers.md`](./animation-levers.md). Общая архитектура — корневой `CLAUDE.md`.

## 0. Как войти в проект

```bash
cd client2
npm test            # vitest — 270 тестов (юниты)
npx tsc --noEmit    # типы
npx vite build      # прод-сборка
npx vite            # dev-сервер
npx playwright test # e2e/визрегрессия (нужен запущенный dev или свой baseURL)
```

Роуты (`src/main.tsx`, в проде под `/v2/`): `free-desk` — песочница/UI-kit, `table` — стол,
`motion` — стенд анимаций, иначе меню. Весь client2 — ЦЕЛИКОМ на канвасе (Pixi v8);
DOM только для навигации-топбара и скроллбаров/зума (одинаково в песочнице и на `/motion`).

**Git:** ветка `main`, ~49 коммитов ВПЕРЕДИ `origin/main`, НЕ запушено. Дерево чистое.
Коммитим по-русски, префиксами (feat/fix/refactor/chore), с `Co-Authored-By`.

## 1. Текущее состояние (evergreen)

### Линия «анимации / цензура скрытой карты»
- **Лицо скрытой карты**: обычная карта, номинал «?», амбер-«фак» вместо масти
  (`fingerContent.ts` + `engine/cardTextures.ts`). Не блюр, не жёлтый фон.
- **Масти** ♠♥♦♣ — SVG из единого источника (`symbols.ts`), одинаково в HTML и в канвасе
  (Pixi `Graphics.svg`). Эмодзи из client2 убраны (кроме текстовых кейсов).
- **Стенд `/motion`** — dev-витрина, целиком в канвасе, сравнивает варианты «цензуры»:
  - **CPU-мозаика** (настраиваемая рычагами) — `censorMotion.ts` + `engine/censorField.ts`;
  - **GPU-ремап** (стейтлесс шейдер, «моргает») и **GPU ping-pong** (ограниченное поле
    смещений, не расплывается) — `engine/censorGpu.ts`;
  - **частицы «TG-пыль»** (стиль Telegram-спойлера) — `engine/censorParticles.ts`;
  - секция **«Тряска рядов»** (пресеты row-shear).
- Рычаги на `/motion`: частица / свапы / дрожание / частота, скорость, тумблеры
  «уменьшить движение» (reduce-motion, замораживает время), «мерцание», «двигать».
- Шрифт: **Handjet** (кириллица + казахский), не VT323.

### Прочее client2 (высокоуровнево, вне этой линии — детали в `CLAUDE.md`/памяти)
- **Песочница `/free-desk`** — UI-kit/сторибук на канвасе (drag-and-drop, пан/зум,
  скроллбары). Движок `engine/freeDeskEngine.ts`.
- **UI-kit** `src/game/ui/`: `Button`, `Toggle`, `Stepper`, `controls` (декларативные
  контроллеры), `Card`, `DropZone`, `Piece`, `ShadowLayer`.

## 2. Модульные решения (атомарные элементы — что переиспользовать, не изобретать)

| Модуль | Что это | Ключевое |
|---|---|---|
| `symbols.ts` | SVG-масти + фак, единый источник | `symbolCanvasSvg` (для Pixi, без viewBox) vs `suitSvg` (HTML) |
| `fingerContent.ts` | контент лица скрытой карты | `buildContent()`, `drawFinger()`, `AMBER` |
| `censorMotion.ts` | ЧИСТАЯ математика цензуры | swap-dance / row-shear / combo, `CENSOR_PRESETS`, jitter |
| `engine/censorField.ts` | императивный CPU-рендер по любой пиксель-сетке | держит рабочую сетку свапов; `update(t)` |
| `engine/censorGpu.ts` | GPU-цензура (кастомный Pixi-фильтр) | «remap» стейтлесс; «pingpong» = поле смещений с возвратом (ограничено) |
| `engine/censorParticles.ts` | Telegram-пыль | позиция/alpha частицы = чистая функция возраста; флаг `flicker` |
| **`engine/panZoom.ts`** | **АТОМАРНЫЙ приклеиваемый пан/зум** | `attachPanZoom(app, content, opts)`; переиспользует `Viewport`+`InputRouter`; кнопки через `opts.buttons` |
| `engine/viewport.ts` | чистая математика камеры | x/y/zoom, clamp, инерция (fling), `state()` для скроллбаров |
| `engine/inputRouter.ts` | стейт-машина жестов | none/drag/pan/pinch/button/hover; домен — в колбэках |
| `ui/controls.ts` | декларативные контролы | `Configurable.params()` → `Stepper`(number)/`Toggle`(bool); `attachControls` |
| `censorDemo.ts` + `CensorDemo.tsx` | стенд `/motion` | всё в канвасе; секции = заголовок+контролы+карты; DOM = топбар+скроллбары |
| `docs/animation-levers.md` | дизайн-референс рычагов | уровни (движок/геймдизайнер/юзер), назначения, что забыли/перегибаем |

**Принцип, который держим:** контролы в канвасе сами ввод не слушают — их клики роутит
`InputRouter` (через `attachPanZoom` → `opts.buttons`), чтобы кнопки не спорили за pointer с паном.

## 3. Незаконченное и планы

Вынесено ОТДЕЛЬНО: см. [`open-tasks.md`](./open-tasks.md). Зафиксировано «как есть», без отсева.
