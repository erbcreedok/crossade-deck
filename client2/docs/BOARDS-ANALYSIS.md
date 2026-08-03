# Разведка кода под борды/комнаты — полная карта (2026-08-03)

Спутник `BOARDS-DESIGN.md` (там — решения; здесь — сырьё: что реально есть в коде, паттерны и
швы). Собрано автономной разведкой по ветке `boards` (= main на 2026-08-03).

## 1. `src/game/board/*` — ТРИ подсистемы под одной папкой

### A. Ядро доски («BoardZone», витринная)
- `board.ts` — `Board = { slots: Record<key, Container>, onEmpty }`, чистые иммутабельные
  переходы: place/removeFrom/move/reorder. Геометрии нет.
- `container.ts` — атом слота: члены + accepts/maxSize/locked.
- `containerConfig.ts` — конфиг контейнера как данные (GrabMode top|any|run|whole и др.) —
  живёт ОТДЕЛЬНО от Container.
- `boardZone.ts` — главный контракт витрины: slots+board+bounds, `onOccupied:
  merge|swap|capture|reject`, `AcceptRule`, `requiresCapability`, `dropAt/commit`;
  цепочка приёма: элемент(rule) → зона(capability) → engine(onOccupied). Peek-сдвиг захардкожен.
- `layout/slots.ts` — `gridSlots/ringSlots/hexSlots` (`seats/points/free` из GRID-DESIGN — НЕ
  реализованы). `layout/grid.ts` — чистая геометрия сетки, ключи "r,c".
- `dynamicGrid.ts` — flow-грид (packGrid/flowLayout/flowIndexAt); потребитель — НЕ BoardZone,
  а `slot/layouts.ts#grid`.
- `boardPresets.ts` — 7 пресетов доски (merge/дурак/пятнашки/шахматы/монополия-ring/цвет/
  пасьянс). Пресет описывает ТОЛЬКО доску: ни мест, ни кнопок, ни ролей.
- `dropResolve.ts` — приоритет priority→depth→z, accepts=false=прозрачность.
- `boardRules.ts`/`boardModel.ts` — AcceptRule-данные (sameColorRule) + wrapRule.
- `bounds.ts`, `slotLayout.ts` — кламп рамкой, геометрия покоя в слоте.

### B. Набор/выделение (SELECTION-DESIGN; в играх не используется НИ РАЗУ)
`selection.ts`, `selectVisual.ts`, `collectOrder.ts`, `assembly.ts` (+row/fan),
`pileIdentity.ts` (способности набора = пересечение), `dropPolicy.ts` (resolveDropChain),
`elementTags.ts`/`tagQuery.ts` (теги+комбинаторы), `actionFold.ts` (Fold all|each|container|
block|fn). Единственный потребитель — playgroundEngine.

### C. Поле/стопка (обёртки над деревом слотов)
`field.ts`/`fieldPaint.ts` (механика/краска Поля; внутри — дерево `slot/`), `stack.ts`
(StackConfig; якорь — данными).

### Чужое в каталоге
`solitaireDeck/Rules/State.ts` — правила КОНКРЕТНОЙ игры в общем каталоге; `cardFace.rankOf`
(A=14) vs `solitaireRules.srank` (A=1) — ДВА ранга в одной папке, ловушка для пресетов.

## 2. `src/game/slot/*` — дерево слотов (боевая система)

Composite+Strategy: `Slot = Leaf|Group`, `Layout{place,indexAt}` (linear/grid/pile/absolute,
параметры живые), `Caps { drop, reorder }` (Entity-Component), `measure/figures/homeOf/
dropTarget`, мутации `reorderChildren/detach/dropInto`.

**Соотношение с board/*: ДВЕ разные системы, а не одна.**

| | BoardZone (`board/`) | Дерево слотов (`slot/`) |
|---|---|---|
| Модель | плоский Record + PositionedSlot | рекурсивное дерево Leaf/Group |
| Геометрия | извне (gridSlots/ringSlots/hex) | из дерева (homeOf/measure) |
| Дроп | dropAt → dropResolve по прямоугольникам | dropTarget → спуск по вложенным дропзонам |
| Правила | AcceptRule на ЗОНЕ + onOccupied | caps.drop.accept на КАЖДОМ слоте; onOccupied НЕТ |
| Кто юзает | песочница, kit/boardZoneScene, стори Board | field, stack, ВСЕ ТРИ реальные игры |

Зависимость одна: slot/layouts → board/dynamicGrid. Обратной нет.

## 3. Витрины (`kit/*`)
`context.ts` — SectionContext (общий контракт секций, внутри dispatch(Command));
`boardZoneScene.ts` — единственная витрина BoardZone; `dropzones.ts` — зоны-ДЕЙСТВИЯ
(по способностям; это ui/DropZone, не BoardZone); `stacks.ts`/`stackLayout.ts` (раскладка
стопки — функция, реестр STACK_LAYOUTS); `commandPort.ts` — витрина choke-point.

## 4. Сцены-игры
Все три — на SceneEngine, дерево slot/, «фикс-доска + камера», slotPaint rest/armed/hot.
- solitaire: ГИБРИД — состояние на board/board+container, геометрия на slot/-дереве.
- crossade: сетевой стол, CrossadePort/bindRoom, дерево с зонами deck/discard/play:N/hand/seat:ID.
- multiplayer: tree + отдельный liveTree (осознанный дубль), scene + liveScene (наследование),
  localTable (in-memory мастер, каналы state/hands/gesture).
Дублирование: 4 файла-дерева с копипастой CARD/SEAT/GAP/MARGIN; 2 slotPaint; 2 сцены ~580 строк.
BoardZone не использует ни одна игра.

## 5. Игрок/место/рука
Единственная модель — CrossadeSeat (sessionId/accountId/name/isDealer/isReady/isBot/connected/
handOpen/handCount/hand|null). Видимость решает клиент (hand!==null, boxFaceUp). Место в
деревьях — пустая group с pile() (костыль: dropTarget не спускается в листья). Ролей НЕТ:
только були isDealer/isReady/isBot. Права на драг — ветвления в canDrag сцены. Кнопки
действий — императивные new Button с ветвлением по isDealer/phase.

## 6. Команды/боты/моки
ТРИ несовместимых порта: engine/command.ts (Command flip/move/conceal/setValue — только стенд),
CrossadePort (имена серверных сообщений — только игры), SolitaireAction (внутри класса).
Ботов нет (isBot — мёртвый флаг). Смарт-мок есть один: multiplayer/localTable.ts.

## 7. Тринадцать швов (полный список — закрывать контрактом борды)

1. Две системы раскладки-соперницы (BoardZone vs slot/); у slot/ нет onOccupied/swap/capture/
   bounds, у BoardZone нет дерева/Reorderable/GapSpec.
2. Три модели состояния слота (+ четвёртая сетевая CrossadeState).
3. BoardPreset не покрывает борду: нет мест, ролей, кнопок, зон-действий, фона, словаря ключей
   зон (хардкод строк "deck"/"play:N"/"seat:ID"/"r,c").
4. «Дропзона» — два понятия: зона-ДЕЙСТВИЕ (ui/DropZone) и зона-МЕСТО (caps.drop/BoardZone).
5. Правила в трёх местах: BoardZone.rule / caps.drop.accept / SolitaireGameEngine.
6. Три командных порта; ни один не покрывает «кнопку борды», ни один не сериализуем.
7. Ролей нет; права = ветвления в сцене.
8. Видимость per-роль размазана (state.ts + tableSide.ts + slotPaint.ts).
9. Место игрока — группа, притворяющаяся прямоугольником (не первокласс).
10. Дублирование геометрии: 4 дерева, 2 slotPaint, 2 сцены.
11. playgroundEngine — единственный потребитель всей системы B (мёртвый вес для игр).
12. Разъезд рангов A=14 vs A=1.
13. Заявленное ≠ реализованное: GRID-DESIGN обещает points/seats/free и полный BoardPolicy,
    ENGINE-UPGRADE — BoardHost/Config/Factory; реально grid/ring/hex + приватный BoardConfig
    внутри playgroundEngine.

## Паттерны (опора)
Правила/рычаги как данные (BOARD_PRESETS, ASSEMBLY_PRESETS, STACK_LAYOUTS, BUTTON_ROWS…);
стратегия вместо подкласса; способности вместо типов; один источник геометрии на рендер и дроп;
механика ⟂ отрисовка (без Pixi в логике); общий слой вместо копии (SceneEngine, SectionContext);
choke-point действий; rest/armed/hot; фикс-доска + камера.

## Исключения (нарушения тех же паттернов)
BoardZone без боевого потребителя; правила пасьянса в общем каталоге; BoardConfig приватен;
containerConfig отдельно от Container; dynamicGrid в board/ при потребителе в slot/; liveTree —
осознанный дубль; кнопки и права — императив в сценах; STACK_STEP/peek-сдвиг захардкожены;
kit/dropIndicator зовёт «бордом» декоративную рамку.
