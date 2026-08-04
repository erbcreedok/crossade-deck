# HANDOFF — Спрединг · Tap/Hold-свитч · Песочница

> **ОБНОВЛЕНИЕ 2026-08-05 (эпик #119, коммиты 51fe2dd…0f8cb05).** Раздел 3 ниже УСТАРЕЛ: песочница
> больше не «шаг 1». Теперь: `sandboxBoard(settings)` = круглый стол (`library/roundTable.ts`,
> настройки-как-данные `boards/settings.ts`, дефолт — всё круг и динамично); контекстное меню
> long-press/ПКМ (`ui/ContextMenu`, швы в `sceneEngine`: `hasContextAt`/`openContextMenu`, ПКМ не
> начинает жестов); фикс-дропзоны при драге (`ui/DropBar`); «шурух» (`boards/shuffleFx.ts`) и
> автораздача по 2 (`boards/dealPlan.ts`); тап-драг = верхняя карта, hold = колода блоком (#117);
> присутствие (`boards/presence.ts`: лок «кто первый», курсоры) и live: серверная комната
> `server/src/SandboxRoom.ts` (ретранслятор cmd+снимок, аноним «Красная панда», код комнаты,
> 12 max) + клиент `net/sandboxLive.ts` (те же BoardDriver/PresenceHub). Витрины:
> Mechanics/Boards → Round table / Sandbox live; Stack interactions → Deck actions.
> Отложенное — в комментариях issues #120–#125. Разделы 1–2 действительны.

Дата: 2026-08-04. `tsc` чист, **1031 тест** зелёный (`npx vitest run`), всё
закоммичено и запушено в `main`. Один файл на три темы — как просили. Средняя глубина:
даёт карту системы и точки правки, за глубоким разбором спреда отсылает к
`STACK-INTERACTIONS-HANDOFF.md` (#116), чтобы не дублировать.

Дальнейшая работа планируется на модели **Fable** — файл писан так, чтобы поднять контекст
с нуля без чтения всей истории.

---

## 1. Спрединг-система (spread стека)

Раскрытие/схлоп стопки скроллом. Живёт в движке витрины **KitScene** (`src/game/engine/kitScene.ts`)
поверх чистого ядра **`src/game/kit/stackInteraction.ts`**. Модель — «прогресс + шаблон формы»:

- **`amount` — это ПРОГРЕСС 0..1**, а не пиксельный зазор. 0 = стопка в покое, 1 = полностью раскрыта.
- **Spread-aware layouts.** Форму раскрытия задаёт САМ layout стопки: `StackLayout = (i,n,cell,strength?)=>StackOffset`,
  `strength` (по умолчанию 1 = покой) растит натуральный параметр раскладки. См. `src/game/kit/stackLayout.ts`:
  `linear` растит `step`, `fan` — `step`+`maxSpread`+`radiusMult`, `heap` — `spread`.
- **Библиотека шаблонов формы (`SpreadShape`).** Поверх layout можно навязать геометрию:
  `inherit` (по умолчанию — растит натуральный параметр layout), `radial`, `linear`, `circle`, `spiral`.
  Реестр `SPREAD_SHAPES` / `SPREAD_SHAPE_IDS`, выбираются в Storybook.
- **`gain`** — во сколько раз растянуть на пике (amplify-фактор).
- **`origin`** (`bottom|center|top|right`) — неподвижная точка/пивот; `recenterShift` держит её на месте,
  поэтому веер расширяется ВОКРУГ центра, а не уезжает от нулевого индекса.
- **`angleDeg`** — направление для override-шейпов (linear/circle/spiral).
- **Ввод отделён от геометрии** — под-конфиг `spread.input = { pointerTrigger, touchTrigger, axis?, invert?, sensitivity? }`.
  `axis:"auto"` = горизонталь в приоритете (доминирующая ось, горизонталь при ничьей). `spreadOnElement(cp, rawX, rawY, source)`
  получает СЫРЫЕ дельты устройства, kitScene сам маппит в прогресс. `DEFAULT_SPREAD_SENSITIVITY = 0.009`.
- **Направленный снэп (`snapStop`).** Стопы — доли 0..1; снэпит к ближайшему В НАПРАВЛЕНИИ движения
  (`state.dir`: закрываемся `dir<0` → floor, открываемся `dir>0` → ceil, стоим `dir=0` → геометрически).
  Это чинит «улетает обратно» при частичном скролле назад.
- **Режимы схлопа (`SpreadClose`):** `infinite` (висит, пока сам не вернёшь), `timer` (авто-схлоп через N сек простоя),
  `dribble` (простой → карты «танцуют» всё быстрее и на пике собираются), `snap` (липнет к стопам).
- **Trackpad back-nav фикс.** `.storybook/preview-head.html`: `html,body { overscroll-behavior: none; }` —
  убирает рывки от навигации-назад браузера на тачпаде. Инжектится на старте → **нужен рестарт Storybook**.

**Preset'ы** (`stackInteraction.ts`, низ файла): `deck` (gain 10, snap-стопы `[0,0.4,1]`), `discard`
(gain 13, timer 4с), `hand` (gain 12, dribble 1.4с). Помощник `spreadBase(over)`.

**Мост в Storybook:** `src/stories/kit/stackArgs.ts` — поля `spreadGain/spreadShape/spreadOrigin/spreadAngleDeg/
spreadPointerTrigger/spreadTouchTrigger/spreadClose/spreadAxis/spreadInvert/spreadSensitivity`, сборка через `interactionFrom`.
Стори-витрина форм: `src/stories/mechanics/StackInteractions.stories.tsx` → `Spreading`.

> Полный разбор шейпов/пивота/recenter/снэпа и «ловушки, на которых обожглись» — в
> **`STACK-INTERACTIONS-HANDOFF.md`**. Здесь только карта.

---

## 2. Tap/Hold-свитч-система (два независимых драг-интента)

У одного элемента ДВА независимых драг-интента, роутер выбирает по жесту. Ядро — `src/game/engine/inputRouter.ts`.

- **`DragMode = "tap" | "hold"`.** `dragOnTap` — быстрый драг (тащим сразу, как палец поехал; default true);
  `dragOnHold` — драг после `HOLD_SEC = 0.35s` неподвижности (default false).
- **Развилка жеста (`inputRouter`):**
  - ЕСТЬ оба интента → ждём в `press`: палец поехал ДО срока → tap-драг; достоял `HOLD_SEC` → hold-драг.
  - Только hold → ранний сдвиг уходит в **пан** (листаем стопку, тащить не хотели).
  - Только tap → как обычно.
  - Ни одного при `pieceDraggable` → быстрое отпускание = **тап по фигуре** (`onPieceTap`), а сдвиг по недрагабельной = `onPieceBlocked` («стоп»-кивок). Эти два намеренно разделены.
- **Выбор интента по жесту (`kitScene.ts`, `beginDrag`).** `grabMode` (какой жест сработал) приходит из
  `onPieceGrab`. `stackDrag` и `pieceDrag` — каждый со своим `trigger` (`tap`/`hold`):
  разные триггеры → тап делает одно, hold другое; **совпали → выигрывает стек**.
  `stackDrag` едет всей живой пачкой группой (**`GroupDrag`**, форма сохраняется), `pieceDrag` — одиночная карта.
- **`pieceDrag.pick`** — предикат, ЧТО из стопки хватается: `PICK_ANY` (любая), `PICK_FIRST` (только верх/`n-1`).
  0 — низ, `n-1` — верх.
- **Термины:** токен роутера везде называется **piece** (был `card`) — колбэки `pickPiece/onPieceGrab/pieceDraggable/
  onPieceMove/Drop/Cancel/Blocked/Tap`, конфиг `PieceDrag/PiecePick/pieceDragFrom`. `stackDrag`/`stackDragFrom` — драг всей стопки.

**Preset'ы триггеров** в `stackInteraction.ts`: `deck` — pieceDrag tap (PICK_FIRST); `discard`/`hand` — pieceDrag tap (PICK_ANY);
пресет только-стека — `stackDrag tap`; и т.д. Витрина: `StackInteractions.stories.tsx` (рычаги `pieceDrag/stackDrag/*Trigger`).

> `GroupDrag` (драг пачки с сохранением формы) — **тот же приём, что блок-драг песочницы** (`boards/scene.ts`).
> Это мост к разделу 3.

---

## 3. Песочница (Playground / sandboxBoard)

Отдельная **игровая борда**, НЕ каталог Storybook — «уже есть в client2, со Storybook напрямую не связана».
Собирается ПО ШАГАМ.

- **Файлы:** спека борды `src/game/boards/library/sandbox.ts` (`sandboxBoard(): BoardSpec`) → хост
  `src/PlaygroundBoard.tsx` → рендер общий `BoardScene` (`src/game/boards/scene.ts`).
- **Маршрут:** `Menu.tsx` `setOnOpenSandbox(() => goApp("playground"))` → `main.tsx` `rel.startsWith("playground")` → `<PlaygroundBoard/>`.
  E2e-хук в DEV: `window.__sandbox = scene`.
- **Текущее состояние — Шаг 1.** Одна зона — серый бокс (`cell 640×1000`, `layout free`), в центре закрытая колода 36 (`deck36`).
  Колода таскается ЦЕЛИКОМ как блок; бросить можно ТОЛЬКО в этот бокс — при дропе мимо летит назад, откуда подняли.
  Бокс не подсвечивается. Ниже — квадратный грид `table` (`layout flow`, cols 3, растёт вниз, `frame dashed`) как дроп-зона;
  **из колоды пока ничего не тянется, грид ещё не наполняется**. Оба бокса `focusable` (дабл-тап по пустому наводит камеру).
- **Важно про связь с 1–2.** `BoardScene` пока **НЕ подключает** kit-механику spread/pieceDrag/stackDrag —
  это движок витрины (KitScene), а песочница на `BoardScene`. Общий у них сейчас только приём блок/групп-драга
  с сохранением формы (`GroupDrag` ↔ блок-драг песочницы). Вероятный следующий крупный шаг — завести
  spread + tap/hold из kit в `BoardScene`/песочницу.

**Следующие шаги песочницы (из комментариев спеки):** тянуть карты из колоды в грид; наполнить грид-зону;
дальше — по мере сборки борды.

---

## Как запустить / проверить

```bash
cd client2
npm run storybook        # каталог на :6006 (spread/tap-hold витрина: Mechanics/Stack Interactions → Spreading)
npx tsc --noEmit         # чисто
npx vitest run           # 1031 тест
# песочница: npm run dev, затем ссылка меню «песочница» (route playground) — это НЕ Storybook
```

**Ловушка проверки движка:** KitScene ПУЛИТСЯ (`kitPool.ts`) и переживает HMR — правки движка проверять только
после ПОЛНОГО рестарта Storybook (свежий `page.goto`), иначе сцена стухшая. Движок спит в простое (`wake()/sleep()`) —
прямые тычки в state не рендерятся; гнать реальные Wheel/Pointer (они будят), давать RAF устояться, экранные
координаты делить на `viewport.zoom` при сравнении с контентом. Хук: `window.__kit.scene`.

## Каноны (соблюдать)
- Работать только в `client2/`. Одна стопка на стори. Английские имена аргументов (сторож `argNames.test.ts`).
  Описание аргументов не должно врать. Rules-as-data, preset'ы вместо подклассов, без stringly-typed публичных
  параметров (маленькие доменные union'ы — ок).
- «Готово» — только после прогона в браузере и С ЦИФРАМИ.
- Коммит/пуш — только по явному «ОК»/«мерж пуш» владельца. Пуш в `main` триггерит CI build+deploy (прод).
