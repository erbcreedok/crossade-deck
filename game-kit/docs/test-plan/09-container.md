## UNIT · Container — slot, layout, spreading

`vitest` · 60 кейсов, расписано 54

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
