## UNIT · Container — slot, layout, spreading

`vitest` · 93 кейсов, расписано 83

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `atom.container.is-the-arrangement` | корень с детьми и БЕЗ атома | `caps` прочитан | `Container` отсутствует: связь родитель-ребёнок это БАЗА, и атом, несущий только её, не нёс бы ничего |
| `atom.container.free-places-nobody` | раскладка `free`, ребёнок с собственной позой | позиции посчитаны | поза ребёнка выстояла — «холст, куда кладёшь куда угодно» это самая дешёвая запись, а не режим |
| `atom.container.row-places-everyone` | раскладка `row`, ребёнок с собственной позой | позиции посчитаны | поза переписана: раскладка, которая ставит, ставит |
| `atom.container.row-measures-footprints` | дети шириной 2 и 1 | позиции посчитаны | каждый занял своё, ряд не сетка равных клеток |
| `atom.container.gap-is-the-record` | тот же ряд с зазором 1 | позиции посчитаны | зазор пришёл из ЗАПИСИ; поля на контейнере нет |
| `atom.container.padding-is-the-record` | ряд с `padding: 0.5`, два ребёнка 1×2 | протяжённость и позиции посчитаны | площадь `3×3` — тесная обёртка `2×2` плюс отступ с каждой стороны; дети не сдвинулись, выросла только область |
| `atom.container.padding-is-optional` | незарегистрированная раскладка, ребёнок 1×2 | протяжённость посчитана | `1×2`: нет записи — нет отступа, а не падение |
| `atom.container.boxless-child` | ребёнок без коробки в ряду | позиции посчитаны | ширины не занял и всё равно поставлен — снятие коробки не сдвигает соседей |
| `atom.container.unknown-layout` | `layout: "carousel"` | позиции посчитаны | не ставит никого и не бросает: ошибка содержимого не уносит сцену |
| `atom.container.no-atom-still-children` | узел без `Container` с детьми | позиции посчитаны | дети стоят там, куда их положили |
| `atom.container.content-extent` | два ребёнка 1×2 в ряду | протяжённость посчитана | `2×2` — второй источник площади |
| `atom.container.content-extent-empty` | пустой контейнер | протяжённость посчитана | ноль, а не бесконечность |
| `atom.container.content-extent-boxless` | ребёнок без коробки | протяжённость посчитана | ноль: мерить нечего |
| `layout.reserves-room-for-the-scaled-child` | ряд, первый ребёнок с масштабом 2 | раскладка посчитана | шаг 1.5 — половина большого плюс половина малого. Раскладка держит место под то, что БУДЕТ видно, иначе карта наезжает на соседа |
| `atom.container.gap-stands-between` | один ребёнок в ряду с зазором 1 | позиции посчитаны | стоит в нуле: зазоров N−1, краям воздуха не положено |
| `atom.container.neighbours-adjoin` | ряд ширин 2 · 1 · 0.5, зазор 0.25 | позиции посчитаны | каждый шов попарно точен: правый край плюс зазор — левый край следующего |
| `atom.container.order-is-the-tree` | те же две карты, вставленные в оба порядка | позиции посчитаны | зеркальные картинки: место следует за порядком вставки, не за id и не за шириной |
| `atom.container.placing-is-pure` | ребёнок с позой 7·7 в ряду | позиции посчитаны | ответ — карта, дерево не тронуто: собственный `at` ребёнка остался 7·7 |
| `atom.container.placing-twice-is-the-same-place` | тот же ряд | посчитано дважды | карты равны: обратной связи через собственный ответ нет |
| `atom.container.removal-closes-the-aisle` | трое в ряду с зазором 0.5 | средний удалён | размах сжался ровно на ширину плюс ОДИН зазор, выжившие снова смежны |
| `atom.container.content-extent-spans-negatives` | ребёнок целиком в минусе | протяжённость посчитана | обёртка — объединение, не размер от нуля: минус тянет её ровно настолько, насколько сидит |
| `atom.container.spreading-does-not-recurse` | внутри — контейнер без коробки с большой картой | протяжённость внешнего | ноль: обёртка объединяет КОРОБКИ, выведенная площадь вложенного — дело его поверхности |
| `atom.container.an-empty-row-is-a-no-op` | ряд без детей, зазор и отступ заданы | позиции и протяжённость | пусто и ноль — не деление на N−1 и не отступ×2 |
| `atom.container.align-is-the-record` | ряд из карт 1×1 и 1×2, `align` из записи | позиции посчитаны | `start` поднимает середину короткой до верхушек в уровень, `end` зеркально, `center` — ноль; ход ВДОЛЬ линии не тронут ни в одном ответе |
| `atom.container.column-is-the-row-turned` | `direction: "column"`, высоты 2 и 1, зазор 0.5, `align: "start"` | позиции посчитаны | обход читает ВЫСОТЫ, `start` стал левыми краями: тот же пресет, ось — параметр записи |
| `preset.grid.reading-order` | четыре единичных карты, `columns: 2` | позиции посчитаны | слева направо, потом следующий ряд вниз |
| `preset.grid.tracks-fit-their-largest` | карта 2×1 в первой колонке, соседи единичные | позиции посчитаны | вся колонка стала шире — и в ряду, где широкой нет; узкая в ней центрируется |
| `preset.grid.a-cell-is-an-address` | три карты на двух колонках | позиции посчитаны | третья стоит под ПЕРВОЙ колонкой: неполный последний ряд не перецентровывается |
| `preset.grid.gap-stands-between-tracks` | сетка 2×2 единичных, зазор 0.5 | позиции посчитаны | шаг соседей 1.5 по обеим осям: зазоров N−1 на каждую ось |
| `preset.grid.items-move-within-their-cell` | малая карта в дорожках, раздвинутых крупной соседкой | позиции посчитаны | `start`/`end` двигают её внутри клетки на ±1 по свободной оси; дорожки не сдвинулись ни на юнит |
| `preset.slots.taken-in-tree-order` | два слота, два ребёнка | позиции посчитаны | место один — первому ребёнку, порядок дерева и есть рассадка |
| `preset.slots.overflow-keeps-its-own-pose` | один слот, второй гость с позой 5·5 | позиции посчитаны | гостю за последним местом отвечают `undefined`: его поза стоит, севшие не пересаживаются |
| `preset.radial.the-full-circle-shares-evenly` | четверо на радиусе 1 | позиции посчитаны | верх, право, низ, лево — по четвертям, без сдвоенного места на шве |
| `preset.radial.an-arc-is-walked-end-to-end` | трое, `sweep: 180` от −90° | позиции посчитаны | оба конца ЗАНЯТЫ — лево, верх, право: частокол веера, не круга |
| `preset.radial.a-seat-is-a-point` | одинокий гость, `start: 90`, своя поза 9·9 | позиции посчитаны | стоит справа, куда сказал `start`; угла в ответе нет по типу — куда смотреть, решает собственный `angle` |
| `atom.container.negative-gap-overlaps` | ряд из двух карт 1×1, зазор −0.5 | позиции посчитаны | середины на ∓0.25 — карты наезжают на 0.5; отрицательный зазор не зажат в ноль, это арифметика |
| `atom.container.negative-padding-shrinks-the-wrap` | ряд, `padding: -0.25`, две карты 1×1 | протяжённость посчитана | `1.5×0.5` — площадь ушла ВНУТРЬ тесной обёртки; пола под ней нет |
| `atom.container.unknown-align-reads-as-end` | `align: "middle"` (тип запрещает), короткая и высокая | позиции посчитаны | читается как `end` — последняя ветвь тернарника; не бросок и не no-op, тихо |
| `atom.container.unknown-direction-reads-as-column` | `direction: "diagonal"`, высоты 2 и 1 | позиции посчитаны | всё, что не ровно `"row"`, идёт колонкой: обход читает высоты, не ошибка — боковая раскладка |
| `atom.container.nan-gap-poisons-the-line` | ряд из двух карт, `gap: NaN` | позиции посчитаны | вдоль оси NaN у всех, поперёк чисто; не бросает — мусор на входе, NaN на выходе, гварда нет |
| `atom.container.zero-box-takes-no-room` | коробка 0×0 между двумя 1×1 | позиции посчитаны | стоит на шве в нуле, ширины не занял; реальные соседи смежны — как у ребёнка без коробки |
| `atom.container.layout-under-answers-keeps-poses` | запись вернула ОДНУ точку на двух детей | позиции посчитаны | первому — точка, второму — своя поза; недоответ не размазывает точку на соседа |
| `atom.container.layout-over-answers-ignores-extra` | запись вернула ТРИ точки на одного ребёнка | позиции посчитаны | лишние точки отброшены, размер карты 1; обход по детям, не по массиву — не бросок |
| `preset.grid.columns-below-one-clamp-to-one` | `columns` 0 и −3 | позиции посчитаны | `Math.max(1, floor)` зажимает в одну колонку: честный вертикальный столбец, не деление на ноль |
| `preset.grid.fractional-columns-floor-to-whole` | `columns: 2.7`, четыре карты | позиции посчитаны | как 2: floor роняет дробь, тот же порядок чтения и швы, не округление и не ошибка |
| `preset.grid.empty-is-a-no-op` | сетка без детей | позиции посчитаны | пусто, без броска: циклы по дорожкам крутятся ноль раз |
| `preset.slots.empty-slots-keep-every-pose` | пустой список слотов, дети со своими позами | позиции посчитаны | всем отвечают `undefined` — раскладка вырождается в `free`, а не в кучу в нуле |
| `preset.slots.spare-slots-go-unused` | три слота, один гость | позиции посчитаны | гость на первом месте, два запасных ничего не ставят; размер карты 1 — место предлагают, не навязывают |
| `preset.radial.zero-radius-stacks-at-the-origin` | четверо, `radius: 0` | позиции посчитаны | все в `{0,0}`: вырожденный круг-стопка, углы считаются, но ложатся в точку — не NaN |
| `preset.radial.zero-sweep-stacks-on-one-seat` | трое, `sweep: 0` | позиции посчитаны | шаг `0/(n−1)=0`, все на `start`: места слиплись на одной точке круга, детерминированно |
| `preset.radial.negative-radius-mirrors` | одинокий гость, `radius: -1` | позиции посчитаны | точка зеркалится через центр: кто был бы сверху, встал снизу (+y) |
| `preset.radial.nan-radius-poisons-the-seat` | одинокий гость, `radius: NaN` | позиции посчитаны | обе координаты NaN, но возврат есть — как в ядре, `Number.isFinite`-проверки нет нигде |
| `slot.is-an-address` ⏳ | an 8×8 board | the node count read | ONE node with a grid layout — not 64. An empty cell has no id and is not in the state |
| `slot.address-form` ⏳ | grid · ordered · heap | the address asked for | grid → a coordinate (e4) · ordered → a NEIGHBOUR (after: id, survives someone else's reorder) · heap → none |
| `slot.cell-needs-a-life` ⏳ | a cell that must hold its own state | modelled | a container is nested as a CHILD — recursion is already legal, no new entity |
| `layout.both-directions` ⏳ | every layout in the registry | `place(i,n,ctx)` and `indexAt(point,n,ctx)` | both exist; indexAt(place(i)) === i for every i — the inverse is required, not a convenience |
| `layout.fan-answers-differently` ⏳ | the same point over fan vs row | indexAt asked | different indices: only the layout knows its own geometry |
| `layout.cast-lives-here` ⏳ | every layout entry | `cast` read | deckStack → group, fan/row/grid → each. It is a field of the LAYOUT, never of the container |
| `layout.detached-child-casts` ⏳ | a child dragged out of a group-cast pile | the shadow | it casts on its own automatically — it is outside the container now |
| `layout.thickness-not-z` ⏳ | a card added to a deckStack | the shadow measured | not one pixel moved: thickness is expressed through `at`. A layout writing z fails the scan |
| `layout.swap-is-a-reference` ⏳ | layout switched deckStack → fan | children and sprites inspected | children untouched, sprites keyed by identity, springs really play. No state-diff, no state machine |
| `layout.free-clamps-itself` ⏳ | a free layout with kept poses | a child pushed past the edge | the clamp is a parameter of THIS layout entry; grid/fan/row have nothing to clamp |
| `spread.phantoms` ⏳ | a payload of m over a container of n | laid out | n+m with phantoms at indexAt(finger); neighbours are moved by springs — a consequence, not a feature |
| `spread.payload-is-a-list` ⏳ | a payload of 1 and of 4 | both hovered | identical code path: the load is always a LIST, so there is no single-card special case |
| `spread.gap-holds-while-pending` ⏳ | a request still in flight | the gap | stays open — the phantom is pinned to `after` from the PendingRequest |
| `hot.registry` ⏳ | phantom · lift · arm · none | each applied | phantom spreads, lift raises and grows the target, arm outlines only, none is silent |
| `hot.absent-is-silent` ⏳ | `hot` field missing | a load hovered | the container says NOTHING — absence is the off switch, there is no `hot: none` flag needed |
| `hot.maxgaps-is-show` ⏳ | maxGaps 3, payload 7 | rendered | three honest gaps then a `+4` badge; the limit is a parameter, not a constant |
| `hot.capacity-vs-maxgaps` ⏳ | a zone that accepts 20 and draws 3 | both asked | capacity is a RULE (`{lt:[target.count,20]}`, refuses); maxGaps is a SHOW. Different questions |
| `grab.three-entries` ⏳ | one · top · above | each grabbed | exactly what the entry names leaves; there is no separate `split` |
| `grab.absent` ⏳ | `grab` field missing | a child pressed | nothing can be taken, and the gesture is not eaten |
| `grab.draught-follows` ⏳ | a child with no grab | hit-test run | it walks UP the tree and the owner gets the gesture — a draught FOLLOWS, it is never declared |
| `grab.carry-inherits-source` ⏳ | a sub-pile pulled from a deck, a fan card pulled from a hand | the load in flight | carry inherits the SOURCE layout: a pack flies as a pack, a fan as a fan. Nothing to declare |
| `grab.two-levels` ⏳ | Container.grab vs Placeable+Draggable on the container itself | both exercised | one takes the CONTENT out, the other takes the CONTAINER out of its own owner — different levels, not two values of one field |
| `grip.route-visible` ⏳ | a container with a Grip child | the layout run | the grip is given room (ear, spine, tray edge) and is NOT under the pile — otherwise it cannot be pressed |
| `grip.escalation-never-alone` ⏳ | hold→whole configured as the only route | validated | rejected: an invisible affordance may only be an ADDITION to a grip or a draught |
| `occupied.four-entries` ⏳ | capture · merge · swap · reject | a drop onto an occupied slot | each does what it names |
| `occupied.not-the-rule` ⏳ | AcceptRule allows, occupied says swap | evaluated | the rule answers WHO may enter and is silent about the sitter; mixing the two is a client2 smell |
| `keeps.narrows` ⏳ | `keeps: ["drag"]` on a discard | a child flipped in place | refused; carrying it out is allowed. No field = everything allowed |
| `keeps.no-negation` ⏳ | the whole src tree | scanned for `allow_manual_flip: false`-shaped flags | zero — restriction is by absence, never by a negative flag |
| `container.children-are-state` ⏳ | the spec serialized | the payload inspected | `children` is state and is absent from the spec; the config is spec and is sent once |
| `container.is-a-figure` ⏳ | a container | drag / flip / selection / shadow applied to the whole | all work — it is a full figure, not a special case |
| `container.no-state-diffs` | the whole src tree | scanned for state-diff / mechanics registries | zero — 'deck ↔ fan' is a layout reference swap |
