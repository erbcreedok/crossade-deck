# client2 — Мультиселект: Сборка · Идентичность · Дроп (SELECTION-DESIGN)

Статус: **ВИДЕНИЕ / дизайн-контракт** (согласовано в обсуждении, реализуется поэтапно).
Родня: `CONTROL-DESIGN.md` (каналы, правила-как-данные, ports&adapters), `GRID-DESIGN.md`
(борды/слоты), `board/containerConfig.ts` («данные, не код»), `engine/element.ts` (ISP-способности),
`board/selection.ts` (чистая правда набора), `engine/drag.ts` (GroupDrag — прообраз Pile).

## 0. Зачем
Мультиселект и последующая «стопка из выбранных» должны быть НАСТОЛЬКО гибкими, чтобы в песочнице
любую деталь переключать рычагом, а игры конфигурировали поведение данными — без правок движка.
Движок держит МЕХАНИЗМ (слоты рычагов, момент вызова, вычисление предикатов); ВОКАБУЛЯР (что за
элементы, что можно выбрать, куда собирать, как сортировать, что при дропе) — данные конфига.

## 1. Жизненный цикл набора
`Отбор → Сборка → Pile → Дроп`. Каждая стадия — набор ОРТОГОНАЛЬНЫХ рычагов; пресет = именованный
набор их значений. Каждый рычаг ДЕЛЕГИРУЕТ существующему атому (fan/playStack/deckStack/handRow/
AcceptRule), а не заводит свою геометрию/политику.

## 2. Идентичность = ТЕГИ (открытый словарь), НЕ enum движка
Ошибка, которой избегаем: зашить `kind: cards|chips|mixed` в движок. Тогда «green elements» или «в
этом раунде только буби» потребовали бы правки движка. Правильно:

- Элемент несёт **`tags: ReadonlySet<string>`** — открытый словарь ДАННЫХ. Примеры: карта →
  `card, suit:♦, rank:7, color:red`; фишка → `chip, color:green`; игра добавляет свои →
  `role:trump, team:blue`. Задаются при спавне (ElementDef), мутируются правилами.
- **Предикаты над тегами приходят из конфига** (реестр/маленький DSL): `hasTag('card')`,
  `hasAllTags(['card','suit:♦'])` (только буби), `hasTag('color:green')`. Движок их ВЫЧИСЛЯЕТ, не
  перечисляет. Новый словарь = новые теги + предикат в конфиге, движок не трогаем.
- **Способности (`Peekable/Flippable/Burnable/Concealable/Valued`) — это НЕ теги**, а структурные
  интерфейсы (`element.ts`, ISP). Идентичность (теги, данные) и поведение (способности, код) — две
  разные оси. Не смешивать.

`kind` («cards/chips/mixed») больше не примитив, а ПРОИЗВОДНОЕ: «однородна ли по тегу `card`» —
частный предикат. Никто в движке его не пишет по имени.

## 3. Pile — явный агрегат, который ЗНАЕТ, чем является
Собранный/board-набор становится **Pile** (обобщение нынешнего анонимного `GroupDrag` и board-pile
`play:N`/дека/сброс — единый концепт, закладываем сразу):

- `members: TableElement[]` — состав.
- `tagsAll` / `tagsAny` — теги, что есть у ВСЕХ / у хотя бы одного (для предикатов зон/правил).
- `facing` (для карт) — open/closed, faceUp/faceDown; из `card.state`. Однородная или смешанная.
- `capabilities` — **пересечение способностей**: Pile Peekable/Flippable/Burnable, только если ВСЕ
  члены такие. Это УЖЕ логика `drag.ts` (`els.every(asPeekable)`), просто поднятая на уровень Pile.

## 4. Каталог рычагов
Формат: `ключ` · значения · дефолт · переиспользуемый атом.

### A. Отбор и обратная связь
- `eligible` · предикат над тегами (`card` / `chip` / `any` / `tag(...)`) · `hasTag('card')` · предикат-правило
- `hintEligible` · off / on (подсветка выбираемых при ≥1 выбранном) · off · seatPaint-подсветка
- `mark` · lift / outline / both · both (floating + контур акцентом) · card.state + контур-атом

### B. Когда собираем — `gatherOn`
`drag-start` · `select-each` · `select-first` · `never` → дефолт **`drag-start`**

### C. Куда якорь — `anchor`
`finger` · `first` · `latest` · `zone(id)` → дефолт **`finger`**
(валидность: `finger` только при `gatherOn=drag-start`; при `select-*` якорь ∈ {first, latest, zone})

### D. Форма — `form`
`stack-tight` · `stack-open` · `row` · `fan` → дефолт **`stack-tight`** · геометрия из
`playStack.ts`/`deckStack.ts`/`fan.ts`/`handRow.ts`

### E. Порядок — два слоя
- `order` (естественный) · `proximity(anchor)` / `selection(new-top|new-bottom)` / `append` · дефолт **`proximity`**
- `sortOverride` (принудительный ПОВЕРХ) · `none` / `rank` / `suit` / `center` / `custom` · дефолт **`none`**
  (ранг — равный критерий override, НЕ привилегированная ось)

### F. Дроп-резолюция
- `onDropOutside` · `return-home` / `dissolve` / `stay` · дефолт **`return-home`**
- `dropRules` · цепочка приоритета **элемент(нельзя нарушить) → зона → engine** · reuse `AcceptRule`/`onOccupied`

## 5. Пресеты (нормализованные, не копирка flow)
| пресет | gatherOn | anchor | form | order / override | родословная |
|---|---|---|---|---|---|
| `grab-to-hand` | drag-start | finger | stack-tight | proximity | Flow 1 (дефолт) |
| `build-on-first` | select-each | first | stack-tight | selection(new-top) | Flow 2 |
| `magnet-latest` | select-each | latest | stack-tight | selection(new-top) | Flow 2-альт |
| `tray-zone` | select-first | zone | stack-open | append | Flow 3 |
| `sorted-row` | drag-start | finger | row | override=rank | новое (демо override) |
| `fan-review` | select-first | zone | fan | selection | новое (та же зона, веер) |
| `inspect-open` | drag-start | finger | stack-open | proximity | новое (под подглядеть) |

Песочница: выбрал пресет → крутишь отдельные рычаги → гибрид (напр. `grab-to-hand` + `form=fan` +
`anchor=zone`). Старое поведение — тоже пресет (косметические рычаги; баги не переносим).

## 6. Слепые зоны — разрешены через существующие механизмы
- **Гибрид карты+фишки в «подглядеть»**: фишка не Peekable → Pile.capabilities без Peekable → зона
  НЕ принимает (armed «зачем?», дроп → `onDropOutside`). Согласуется с текущим `GroupDrag.peek=undefined`.
- **Стопка скрытых+видимых карт в «подглядеть»**: все Peekable → принимает; скрытые раскрывает,
  видимые no-op — логика `startPeek/needsPeek` (`canPeek`).
- **Стопка знает, чем является**: да — `tagsAll/tagsAny/facing/capabilities`. Это даёт ветвиться
  зонам, будущей отдельной анимации подглядеть и open/closed-флипу стопки карт.

## 7. Переиспользование атомов
- `form` → `fan.ts` / `playStack.ts` / `deckStack.ts` / `handRow.ts` (не своя геометрия)
- `capabilities` → правило «все-члены» из `drag.ts`, поднятое в Pile
- `dropRules` → `AcceptRule` / `onOccupied`
- `facing` → `card.state`; скрытость → `Concealable/Peekable`
- Pile → обобщение board-pile (`play:N`, дека, сброс) — единый концепт, а не параллельная структура

## 8. Этапы (не оверкилл)
- **v1 — РЕАЛИЗОВАНО** (2026-07-29): теги + Pile-идентичность (#59, `board/elementTags.ts`/
  `tagQuery.ts`/`pileIdentity.ts`/`engine/capabilities.ts`) → рычаги сборки B/C/D/E + пресеты
  (#56, `board/assembly.ts`, дефолт `grab-to-hand`) → отбор-визуал eligible/mark/hint (#60,
  `board/selectVisual.ts`/`engine/selectOutline.ts`) → дроп-политика onDropOutside + цепочка
  элемент→зона→engine + слепые зоны через Pile (#61, `board/dropPolicy.ts`). Всё крутится в
  песочнице `/playground` (секция «Выделение»); покрытие: юнит на каждый чистый модуль + e2e
  `selection.spec.ts`.
- **Тест-обвязка #61** (#62): демо-борд «Выделение» анкламплен (набор вытаскивается наружу), рядом
  лог-дропбокс «называю масть» — чисто лог мастей набора (`board/suitNames.ts`: дедуп + `???` для
  карт без масти, поверх `tagQuery.tagValues`), ничего не хранит; в демо добавлен джокер (кастом без
  масти) для живого `???`. Хук `lastNamedSuits`.
- **v2 — хвост**: форма `fan` (сейчас раскладывается как `row`), `sortOverride` `center`, рычаги
  `gatherOn`/`anchor` отдельными тумблерами (пока живут в конфиге пресетов), применение цепочки
  `dropRules` в КАЖДОЙ зоне (ядро `resolveDropChain`/`capabilityZoneRule` готово). Прим.:
  `A.hintEligible` вынесен в v1 вместе с #60.
- Прежние `collectOrder`/`rowAssembly` смигрированы в `assembly.ts`: press→`order=selection`,
  rank/suit→`sortOverride`, ряд→`form=row`; отдельной привилегии у ранга нет.

## 9. Журнал решений
- Идентичность — теги (открытый словарь), не enum движка. «green»/«только буби» = конфиг-предикат.
- Способности ≠ теги (ISP-интерфейсы vs данные).
- Pile — единый агрегат для селект-набора и board-pile, закладываем сразу.
- override-сорт — отдельный слой поверх естественного порядка, не общий список.
- v1-срез: сборка + пресеты; отбор-визуал и дроп-политика — отдельными тикетами.
