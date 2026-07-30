# HANDOFF — client2 (передача состояния новому агенту)

Живой документ «где мы сейчас». Обновляй при существенных изменениях. Незаконченные дела и
планы — ОТДЕЛЬНО, в [`open-tasks.md`](./open-tasks.md). Рычаги анимации (дизайн) —
[`animation-levers.md`](./animation-levers.md). Общая архитектура — корневой `CLAUDE.md`.
Отдельный пасьянсный (Solitaire/Косынка) трек — своя карта состояния в
[`SOLITAIRE-HANDOFF.md`](./SOLITAIRE-HANDOFF.md), читать перед тем как брать эпики E1–E8 с борда.

## 0. Как войти в проект

```bash
cd client2
npm test            # vitest — 283 теста (юниты)
npx tsc --noEmit    # типы
npx vite build      # прод-сборка
npx vite            # dev-сервер
npx playwright test # e2e/визрегрессия (нужен запущенный dev или свой baseURL)
```

Роуты (`src/main.tsx`, в проде под `/v2/`): `playground` — песочница/UI-kit, `table` — стол,
`motion` — стенд анимаций, иначе меню. Весь client2 — ЦЕЛИКОМ на канвасе (Pixi v8);
DOM только для навигации-топбара и скроллбаров/зума (одинаково в песочнице и на `/motion`).

**Git:** ветка `main`, всё ЗАПУШЕНО на `origin/main`, дерево чистое. CI на пуше гоняет гейт
(server/client/client2 + e2e) и деплоит зелёный `main` на `/v2/`. Коммитим по-русски, префиксами
(feat/fix/refactor/chore), с `Co-Authored-By`.

## Последнее — сессия 2026-07-27 (рефакторная линия ЗАКРЫТА)

Рефакторный план **E1–E7 (`REFACTOR.md`) закрыт или сделан по факту**. За сессию:
- **Host `engine/canvasApp.ts`** (E1): все 3 движка (Playground/Table/Censor) на общей базе —
  жизненный цикл + цикл кадра, хуки `onLayout/build/onBooted/onTeardown/frame(dt):moving`.
- **Модель карты (E5)** клиентски: `id` = опаковый КЛЮЧ; значение (`card`) отделено и может быть
  ПРИДЕРЖАНО (`""` → маска); способности `Concealable`/`Valued` (element.ts) — скрытость это РЕЖИМ,
  снимаемый извне. Хардкод `joker` убран → реестр `CUSTOM_FACES`.
- **BoardFactory v1 (E6):** grid-борд = `BoardConfig` + `mountBoard`; реестр фигур `ui/pieceKinds.ts`;
  единый `spawnElement` для ВСЕХ бордов. Пресеты (`BOARD_PRESETS`) — свой путь, свод (v2) отложен.
- **Командный порт `PlaygroundEngine.dispatch(cmd)`** (СВЕРХ плана): единая дверь драйверов
  (палец/консоль/сервер/AI). `flipCard/moveCard/setConcealed/setCardValue` — обёртки над ним.
- **Фикс swap-бага:** `refreshZoneHomes` теперь зовёт `setTarget` (вытесненная фигура едет в слот).

**Источники правды (читать ПЕРЕД работой):** `REFACTOR.md` (статус E1–E7 + что осталось = оверкил /
после-геймплея) · **`CONTROL-DESIGN.md`** (видение управления/конфликтов/сети: 5 каналов
Правда/Команды/Политика/FX/Presence + Ports&Adapters + «действия=команды, вид=f(state)» — читать
перед дропом/анимациями/сетью/undo) · `GRID-DESIGN.md`, `ENGINE-UPGRADE.md` (борды/BoardFactory).

**Что дальше:** ГЕЙМПЛЕЙ (правила поверх готовой механики) и под него — серверная линия из
`CONTROL-DESIGN.md` (командная шина / политика / presence / undo; E5-серверная секретность:
токен-ключ + протокол). Оставшийся рефактор — только оверкил (камера Playground→`attachPanZoom`,
BoardFactory v2, дальнейшее «ужать Playground» — он ~1880 строк storybook-контента, механика уже вынесена).

## 1. Текущее состояние (evergreen)

### Линия «анимации / цензура скрытой карты»
- **Лицо скрытой карты**: обычная карта, номинал «?», амбер-«фак» вместо масти
  (`fingerContent.ts` + `engine/cardTextures.ts`). Не блюр, не жёлтый фон.
- **Масти** ♠♥♦♣ — SVG из единого источника (`symbols.ts`), одинаково в HTML и в канвасе
  (Pixi `Graphics.svg`). Эмодзи из client2 убраны (кроме текстовых кейсов).
- **ДЕФОЛТ цензуры = «TG-пыль» (частицы).** Выбрано владельцем. Живёт на реальной скрытой
  карте (`ui/Card`): скрытая карта = чистый фон (`hiddenBg`) + оверлей `ParticleField`,
  крутится в `Card.step`, держит цикл бодрым (`resting=false`), прячется при перевороте.
  Дефолт-рычаги и `dustParams` — в `censorConfig.ts` (один источник для стенда И доски).
  Значения: частица 5 / свапы 25 / дрожание 1 / частота 1, мерцание ВЫКЛ, пыль замедлена ×3
  (`DUST_TIME_SCALE`, «как было на 0.3x» — множитель времени в частицах, а не глобальный
  ползунок). Видно на `/playground` («скрытая (пыль)»). `/table` пока БЕЗ hidden — см. open-tasks §B.4.
- **Стенд `/motion`** — dev-витрина, целиком в канвасе, сравнивает варианты «цензуры»
  (остальные 3 = «фигуры для других кейсов»):
  - **CPU-мозаика** (настраиваемая рычагами) — `censorMotion.ts` + `engine/censorField.ts`;
  - **GPU-ремап** (стейтлесс шейдер, «моргает») и **GPU ping-pong** (ограниченное поле
    смещений, не расплывается) — `engine/censorGpu.ts`;
  - **частицы «TG-пыль»** (стиль Telegram-спойлера) — `engine/censorParticles.ts`;
  - секция **«Тряска рядов»** (пресеты row-shear).
- Рычаги на `/motion`: частица / свапы / дрожание / частота, скорость, тумблеры
  «уменьшить движение» (reduce-motion, замораживает время), «мерцание», «двигать».
- Шрифт: **Handjet** (кириллица + казахский), не VT323.

### Прочее client2 (высокоуровнево, вне этой линии — детали в `CLAUDE.md`/памяти)
- **Песочница `/playground`** — UI-kit/сторибук на канвасе (drag-and-drop, пан/зум,
  скроллбары). Движок `engine/playgroundEngine.ts`.
- **UI-kit** `src/game/ui/`: `Button`, `Toggle`, `Stepper`, `controls` (декларативные
  контроллеры), `Card`, `DropZone`, `Piece`, `ShadowLayer`.

## 2. Модульные решения (атомарные элементы — что переиспользовать, не изобретать)

| Модуль | Что это | Ключевое |
|---|---|---|
| `symbols.ts` | SVG-масти + фак, единый источник | `symbolCanvasSvg` (для Pixi, без viewBox) vs `suitSvg` (HTML) |
| `fingerContent.ts` | контент лица скрытой карты | `buildContent()`, `drawFinger()`, `AMBER` |
| `censorMotion.ts` | ЧИСТАЯ математика цензуры | swap-dance / row-shear / combo, `CENSOR_PRESETS`, jitter |
| **`censorConfig.ts`** | **ЧИСТЫЙ конфиг цензуры — источник правды для стенда И доски** | `DANCE_DEFAULT` (5/25/1/1), `DUST_FLICKER=false`, `DUST_TIME_SCALE=1/3`, `dustParams()`, `dustPoints()`; есть тест |
| `engine/censorSource.ts` | Pixi-извлечение силуэта фака | `buildFingerGrid(app,block)` (сетка) + `buildFingerDustPoints(app,step,cx,cy)` (облако точек) |
| `engine/censorField.ts` | императивный CPU-рендер по любой пиксель-сетке | держит рабочую сетку свапов; `update(t)` |
| `engine/censorGpu.ts` | GPU-цензура (кастомный Pixi-фильтр) | «remap» стейтлесс; «pingpong» = поле смещений с возвратом (ограничено) |
| `engine/censorParticles.ts` | Telegram-пыль | позиция/alpha частицы = чистая функция возраста; флаги `flicker`, `timeScale` |
| `ui/Card.ts` (скрытая карта) | живая пыль на реальной карте | `hiddenBg` + `ParticleField`-оверлей; крутит в `step`, `resting=false`, прячет при флипе |
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
