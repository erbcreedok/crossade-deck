# game-kit — план тестов

Покрытие. Спецификация ПОВЕДЕНИЯ — `docs/scenarios/*.md`, законы — `CANONS.md`; здесь то, что
именно проверяется и на каком слое. Каждый закон обязан иметь тут строку: правило без сторожа
живёт до первой пересборки контекста (§0 канонов).

Идентификатор — `scope.scenario.condition`, стабильный: по упавшему id сразу видно сценарий и
состояние. Строка — Дано / Когда / Тогда.

**22 слоя · 479 кейсов заявлено · 268 расписано поимённо.**
Разница — однотипные варианты внутри кейса (значения перечислений, темы, вьюпорты); слой не
закрыт, пока не расписаны все, а пропущенное называется явно (`matrix.dropped`).

> Данные плана и таблица в сторибуке — ОДИН массив: этот файл из него выгружен, а когда появится
> настоящий Storybook, стори будет читать этот файл. Двух источников нет по построению.

## UNIT · Node and composition

`vitest (headless, no WebGL)` · 33 кейсов, расписано 29

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `node.compose.empty` | a bare `Node` | `caps(node)` is read | empty set; no capability methods on the object. A bare node is VALID |
| `node.no-element-predicate` | the whole src tree | scanned for `isElement` / an Element type | zero hits: systems ask for the atom they need, never for a category (source-scan) |
| `node.canvas-has-no-box` | the canvas root: Surfaced + Container, no Bounded | composed | legal — the surface takes its AREA from the content extent. A Surfaced→Bounded requirement would outlaw the tabletop |
| `node.no-inheritance` | the whole src tree | scanned for `extends`/`instanceof` on nodes | zero hits — composition only (source-scan) |
| `node.not-everything-is-a-node` | slot · layout phantom · shadow · camera | asked for an id | none of them has one; they are not nodes |
| `node.transaction-is-not-a-node` | a Transaction | asked for `z` / a shadow | a type error, not a value — it is ABOVE nodes, not one of them |
| `bounded.minimal` | a node with only `Bounded` | `caps` read | exactly [Bounded]: a place that occupies room and draws nothing |
| `compose.add-atom` | atom X is composed in | `caps(el).has(X)` | true; X's methods and events are present |
| `compose.remove-atom` | atom X is composed out | the method is called | it is **undefined** (absent), not a thrown 'disabled' error |
| `compose.assoc` | atoms a,b,c | `compose(a,compose(b,c))` vs `compose(a,b,c)` | identical caps set — composition is associative |
| `compose.commut` | the same atoms in any order | two compositions compared | equal — order does not change the node |
| `compose.dedupe` | the same atom twice | composed | present once; second is a no-op, not a duplicate |
| `node.id.opaque` | any id (hash, binary, compound) | the engine derives a property | it never parses the id: no split/startsWith/literal compare (source-scan) |
| `node.id.given` | a node built with an authored name | its id is read | it is the name that was given — a node is NAMED, it does not name itself |
| `node.id.local-allocator` | `localIds()` in an instance answering to nobody | two ids minted | they differ; the allocator is explicit, never ambient |
| `node.id.allocators-are-independent` | two `localIds()` | first id of each | equal — which is why a module-level counter may never come back: the collision is real, and silent |
| `guard.no-ambient-id-source` | the whole src tree | scanned | no module counter in `node.ts`, no `resetIds` anywhere (source-scan) |
| `tree.duplicate-id-is-loud` | a tree already holding `hand` | a second `hand` is added | it throws; the rejected node gains no owner. Never a silent replace |
| `tree.duplicate-deep` | an incoming SUBTREE holding a taken id | added | it throws — the check covers the whole subtree, not its top node |
| `tree.same-id-in-another-tree` | two separate trees | each given a `hand` | both legal: uniqueness is per tree, not global |
| `guard.layering` | every source file | its imports read | they point DOWN the ladder only: core→core, render→core (source-scan) |
| `guard.catalog-through-the-door` | every catalog file | its imports into the kit read | only `src/index.js` — the catalog enters like a standalone, or the door is a suggestion |
| `guard.public-api` | `src/index.ts` | scanned for the names a consumer needs | all present: a standalone imports "game-kit", never a path into src (source-scan) |
| `source.imports` | a Show-code snippet using node/add | rendered | it carries `import { node, add } from "game-kit"` — and nothing the snippet does not use |
| `source.scene-is-not-the-kit` | a snippet calling `scene()` | rendered | named as the CATALOG's shell, not imported from the kit: an app calls `mount` |
| `locales.complete` | every catalog locale | compared to the reference bundle | no key missing — the switch is only honest with nothing left to fall back on |
| `locales.plurals` | each locale, counts 0..100 | resolved through `Intl.PluralRules` | every count lands on a form; none falls through to a raw key |
| `locales.russian-plurals` | ru, n = 1/2/5/21 | resolved | узел / узла / узлов / узел — the two-form helper that printed "узлов: 2" cannot come back |
| `locales.stops-at-the-catalog` | a resolved caption | followed | it never crosses into the kit: the scene is handed text, not a key |

## UNIT · Root, host and the inspector

`vitest + a DOM fake` · 20 кейсов, расписано 16

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `root.is-just-a-node` | a root | its type inspected | an ordinary node with Container — there is no separate storage entity above it |
| `root.nobody-places-it` | a root | `Placeable` asked for | absent, and it cannot be added: Placeable requires Bounded, which a root has no business having |
| `root.cannot-be-a-child` | a root added to a container | the operation | rejected — it would stop being a root |
| `root.two-and-one-difference` | CanvasRoot and HudRoot | the camera applied | it transforms the first and does not touch the second; there is no `anchor` field anywhere (source-scan) |
| `root.byid-derived` | a node removed from the tree | `byId` asked | undefined — the index is derived from the tree, never a second store |
| `root.render-follows-tree` | a node with and without Surfaced under a mounted root | the frame | drawn / not drawn; both still exist and both appear in the inspector |
| `host.owns-pixels` | a node | asked for its pixel size | it does not know: a node lives in units. The host owns the view and its size |
| `host.hud-unit-from-viewport` | the viewport resized | the HUD etalon | recomputed by the host and put into the ResolveContext; table sizes do not move |
| `host.single-pixi-import` | the whole src tree | scanned for `from "pixi.js"` | exactly one file — everything else is headless data and maths (source-scan) |
| `host.mount-unmount` | mount then unmount | the view inspected | nothing left behind: no display objects, listeners or timers |
| `inspector.one-door` | the panel's source | scanned for engine internals / its own tree walk | zero — it only calls `inspect(root, ctx)` |
| `inspector.reflects-model` | a random tree | panel output vs the model | everything shown exists in caps/fields, and no field of the model is missing |
| `inspector.no-invented-fields` | the panel output | every key cross-checked against the field table | zero keys outside it |
| `inspector.shows-absent` | an atom toggled on with its requirement off | the panel | names it as ABSENT with what it lacks — the one place a starved atom is visible |
| `inspector.three-planes` | any node | the panel sections | own fields · resolved (with class and arrow) · state — kept apart, same law as the tabs |
| `inspector.selection-two-way` | a row clicked, then a node clicked on canvas | selection | stays in sync both directions |

## UNIT · requirement chains

`vitest` · 10 кейсов, расписано 6

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `req.direct` | `Flippable` with `Surfaced` off | composed | Flippable is ABSENT with its fields — not disabled, not inert |
| `req.transitive` | Flippable → Surfaced → Bounded, Bounded removed | caps read | the whole branch is gone in one step; no half-composed atom survives |
| `req.alternative` | `Surfaced` with Bounded off but Container on | composed | present: a requirement names what is LACKING, and an area may come from an own size OR from the content |
| `req.alternative-none` | `Surfaced` with neither Bounded nor Container | composed | absent — there is no area to paint on |
| `req.closure` | any declared atom | its requirement chain walked | terminates, has no cycle, every named requirement exists, and alternatives are followed as OR (source-scan) |
| `req.no-disabled-path` | the removal path | the absent atom's method called | `undefined`; nothing anywhere reports 'disabled' |

## UNIT · four classes of inheritance

`vitest + a fake tree` · 26 кейсов, расписано 10

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `inherit.own.not-inherited` | owner has `size`, child does not | the child's size resolved | undefined — an 'own' field never travels down |
| `inherit.owner.nearest` | a child without `orientation`, a grandparent that has it | resolved | the NEAREST set value up the chain wins |
| `inherit.owner.override` | child sets its own `orientation` | resolved | the child's value wins over the owner's |
| `inherit.sum.adds` | own z=2, owner z=1, root z=1 | resolved | 4 — sums the whole chain, not just the parent |
| `inherit.sum.cannot-cancel` | child tries to zero the inherited angle | resolved | impossible by construction: only its own term is authored |
| `inherit.sum.skips-the-silent` | an owner with no `Transformable` at all | a child's z resolved | only the child's own term — a node that never spoke contributes nothing |
| `inherit.root-only.absent` | a child asked for `light` / `camera` | the field read | it does not EXIST on a child — a validator error, not undefined |
| `inherit.class-declared` | every field in the model | its class looked up | all four classes covered; a field with no class fails the scan (source-scan) |
| `inherit.billboard-terminates` | child `orientation: viewer`, owner rotated 45° | angle resolved | own − camera.rotation; the owners' 45° is NOT added — viewer terminates the chain |
| `inherit.shadow-ignores-angle` | the node rotated | the shadow inspected | the silhouette turns, the offset does not: the shadow never inherits the rotation matrix |

## UNIT · ResolveContext

`vitest + a fake clock` · 12 кейсов, расписано 4

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `ctx.not-stored` | a resolved value | the node's own fields inspected | nothing inherited is stored on it |
| `ctx.not-serialized` | the node serialized | the payload inspected | resolved values are absent from the wire — only own fields travel |
| `ctx.read-at-apply` | an animation started, then the OWNER changed mid-flight | the applied value | the NEW value is used — this is the exact client1 fan-z regression, frozen bases are forbidden |
| `ctx.chain-depth` | a chain 5 deep | resolve run | correct at every level; no O(n²) walk |

## UNIT · per-atom contract

`vitest` · 48 кейсов, расписано 35

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `atom.bounded.default-square` | `Bounded()` with no arguments | footprint read | `rect 1×1` — a SQUARE, said out loud: read as a claim about cards it would say "elements are square" |
| `atom.bounded.absent-is-not-zero` | a node with no `Bounded` | footprint read | `undefined`, never a zero box — "occupies nothing" and "is not in the layout" are different answers |
| `atom.bounded.needs-nothing` | `Bounded` on a bare node | `caps` read | present: a box stands on nothing |
| `atom.bounded.extent-circle` | `circle{r:1.5}` | extent read | `3×3` — every shape answers with a box, including a round one |
| `atom.bounded.extent-poly` | a triangle | extent read | the axis-aligned span of the points |
| `atom.bounded.extent-empty` | `poly` with no points | extent read | zero, not a crash |
| `atom.bounded.own-field` | a node with `size` | footprint requested | it equals the node's OWN size field; the set record only stamped it at birth |
| `atom.bounded.bounds-overrides` | `size` 1×1.4 and `bounds` 0.8× | footprint requested | bounds wins — this is the only way an instance differs from its record |
| `atom.bounded.per-record` | a king and a pawn from the SAME set | both footprints read | they differ — size is declared per record, never per set |
| `atom.bounded.shapes` | `circle{r}` and `poly[]` | hit-test · shadow · layout | hit and shadow follow the real shape; layout reserves the bounding box |
| `atom.bounded.no-pixels-in-spec` | the whole src tree | scanned for px literals on a node spec | zero hits — sizes are in units (source-scan) |
| `atom.bounded.draws-nothing` | Bounded on, Surfaced off | the frame rendered | not a single pixel; the box is visible only through a debug layer |
| `atom.bounded.clamp-not-here` | a node without children | `clampChildren` looked up | absent: clamping belongs to Container, `bounds` is only about itself |
| `atom.hit.derived` | a 1×1 unit chip on a touch input | the hit area measured | max(box, the input theme's touch minimum); no `hit*` field exists in the spec |
| `atom.hit.nearest-center` | two neighbours whose expanded hit areas overlap | a press in the overlap | the nearer CENTRE wins — deterministic on a dense chess grid |
| `atom.surfaced.registry` | Surfaced{surface:"cardFace"} | the face drawn | the registry record draws it; no borderRadius/fill/colour field exists on the spec (source-scan) |
| `atom.surfaced.area-from-box` | Bounded + Surfaced | area read | the own footprint |
| `atom.surfaced.area-from-content` | Container + Surfaced, no Bounded | area read | the content's extent — the tabletop, and the reason the requirement is an ALTERNATIVE |
| `atom.surfaced.starved` | Surfaced with neither box nor content | `caps` and area read | absent from caps, listed in `starved`, area `undefined` — nothing to paint on |
| `atom.surfaced.fit-not-baked` | a fresh `Surfaced()` | its `fit` field read | `undefined`, not `contain`: a fromOwner field pre-filled on every node is a field always set, and then nothing is ever inherited |
| `atom.surfaced.fit-from-owner` | owner `fit: cover`, child silent | child resolved | `cover` — the nearest set value up the chain |
| `atom.surfaced.fit-override` | owner `cover`, child `original` | child resolved | `original`: an override is just a value of one's own |
| `atom.surfaced.fit` | art whose proportion differs from the box | each of the six fits applied | contain letterboxes (the DEFAULT: the author's mistake stays visible), cover crops, repeat tiles, fitX/fitY pin one axis |
| `atom.transformable.needs-no-box` | `Transformable` on a bare node | `caps` read | present — a node can be somewhere without occupying anything |
| `atom.transformable.two-classes` | the atom's two fields | their classes looked up | `at` own, `z` addsUp — this is the atom where the two classes meet |
| `atom.transformable.z-consequences` | z raised 0→2 | lift, scale and shadow measured | all three change; none can be set independently of z. Zoom changes neither |
| `atom.layout.never-writes-z` | every layout in the registry | scanned and run | none of them writes `z` — a stack expresses thickness through `at` (source-scan) |
| `atom.z.container-lifts-children` | a stack with z=1 | children resolved | every child is +1: lifting the pile lifts the pile. Lying in it does not lift anything |
| `atom.flippable.reverse` | Flippable{reverse} | flip() | back→face hidden, same→identical, mirror→mirrored, alt→other visible face |
| `atom.private.exclusion` | Private + a viewer ≠ owner | the scene is projected | the node is ABSENT from that viewer's picture, not merely face-down |
| `atom.private.vs-back` | a face-down card next to a Private one | both projected to another viewer | back: present, face hidden. Private: not in the payload at all. Two different hidings |
| `atom.private.subtree` | a Private CONTAINER with children | projected to another viewer | the whole subtree is cut — children never appear ownerless |
| `atom.owned.recall` | two boxes of the SAME set on one table | `{eq:[el.box,target.box]}` evaluated | only one's own are recalled; identical cards from different boxes are different nodes |
| `atom.valued.paths` | Valued{rank,suit} | a rule reads `el.values.rank` | legal; `el.values.race` in a set without race → validator error |
| `atom.actionable.press` | Actionable | press() | emits the bound command; nothing when the atom is absent |

## UNIT · Container — slot, layout, spreading

`vitest` · 49 кейсов, расписано 42

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `atom.container.is-the-arrangement` | корень с детьми и БЕЗ атома | `caps` прочитан | `Container` отсутствует: связь родитель-ребёнок это БАЗА, и атом, несущий только её, не нёс бы ничего |
| `atom.container.free-places-nobody` | раскладка `free`, ребёнок с собственной позой | позиции посчитаны | поза ребёнка выстояла — «холст, куда кладёшь куда угодно» это самая дешёвая запись, а не режим |
| `atom.container.row-places-everyone` | раскладка `row`, ребёнок с собственной позой | позиции посчитаны | поза переписана: раскладка, которая ставит, ставит |
| `atom.container.row-measures-footprints` | дети шириной 2 и 1 | позиции посчитаны | каждый занял своё, ряд не сетка равных клеток |
| `atom.container.gap-is-the-record` | тот же ряд с зазором 1 | позиции посчитаны | зазор пришёл из ЗАПИСИ; поля на контейнере нет |
| `atom.container.boxless-child` | ребёнок без коробки в ряду | позиции посчитаны | ширины не занял и всё равно поставлен — снятие коробки не сдвигает соседей |
| `atom.container.unknown-layout` | `layout: "carousel"` | позиции посчитаны | не ставит никого и не бросает: ошибка содержимого не уносит сцену |
| `atom.container.no-atom-still-children` | узел без `Container` с детьми | позиции посчитаны | дети стоят там, куда их положили |
| `atom.container.content-extent` | два ребёнка 1×2 в ряду | протяжённость посчитана | `2×2` — второй источник площади |
| `atom.container.content-extent-empty` | пустой контейнер | протяжённость посчитана | ноль, а не бесконечность |
| `atom.container.content-extent-boxless` | ребёнок без коробки | протяжённость посчитана | ноль: мерить нечего |
| `slot.is-an-address` | an 8×8 board | the node count read | ONE node with a grid layout — not 64. An empty cell has no id and is not in the state |
| `slot.address-form` | grid · ordered · heap | the address asked for | grid → a coordinate (e4) · ordered → a NEIGHBOUR (after: id, survives someone else's reorder) · heap → none |
| `slot.cell-needs-a-life` | a cell that must hold its own state | modelled | a container is nested as a CHILD — recursion is already legal, no new entity |
| `layout.both-directions` | every layout in the registry | `place(i,n,ctx)` and `indexAt(point,n,ctx)` | both exist; indexAt(place(i)) === i for every i — the inverse is required, not a convenience |
| `layout.fan-answers-differently` | the same point over fan vs row | indexAt asked | different indices: only the layout knows its own geometry |
| `layout.cast-lives-here` | every layout entry | `cast` read | deckStack → group, fan/row/grid → each. It is a field of the LAYOUT, never of the container |
| `layout.detached-child-casts` | a child dragged out of a group-cast pile | the shadow | it casts on its own automatically — it is outside the container now |
| `layout.thickness-not-z` | a card added to a deckStack | the shadow measured | not one pixel moved: thickness is expressed through `at`. A layout writing z fails the scan |
| `layout.swap-is-a-reference` | layout switched deckStack → fan | children and sprites inspected | children untouched, sprites keyed by identity, springs really play. No state-diff, no state machine |
| `layout.free-clamps-itself` | a free layout with kept poses | a child pushed past the edge | the clamp is a parameter of THIS layout entry; grid/fan/row have nothing to clamp |
| `spread.phantoms` | a payload of m over a container of n | laid out | n+m with phantoms at indexAt(finger); neighbours are moved by springs — a consequence, not a feature |
| `spread.payload-is-a-list` | a payload of 1 and of 4 | both hovered | identical code path: the load is always a LIST, so there is no single-card special case |
| `spread.gap-holds-while-pending` | a request still in flight | the gap | stays open — the phantom is pinned to `after` from the PendingRequest |
| `hot.registry` | phantom · lift · arm · none | each applied | phantom spreads, lift raises and grows the target, arm outlines only, none is silent |
| `hot.absent-is-silent` | `hot` field missing | a load hovered | the container says NOTHING — absence is the off switch, there is no `hot: none` flag needed |
| `hot.maxgaps-is-show` | maxGaps 3, payload 7 | rendered | three honest gaps then a `+4` badge; the limit is a parameter, not a constant |
| `hot.capacity-vs-maxgaps` | a zone that accepts 20 and draws 3 | both asked | capacity is a RULE (`{lt:[target.count,20]}`, refuses); maxGaps is a SHOW. Different questions |
| `grab.three-entries` | one · top · above | each grabbed | exactly what the entry names leaves; there is no separate `split` |
| `grab.absent` | `grab` field missing | a child pressed | nothing can be taken, and the gesture is not eaten |
| `grab.draught-follows` | a child with no grab | hit-test run | it walks UP the tree and the owner gets the gesture — a draught FOLLOWS, it is never declared |
| `grab.carry-inherits-source` | a sub-pile pulled from a deck, a fan card pulled from a hand | the load in flight | carry inherits the SOURCE layout: a pack flies as a pack, a fan as a fan. Nothing to declare |
| `grab.two-levels` | Container.grab vs Placeable+Draggable on the container itself | both exercised | one takes the CONTENT out, the other takes the CONTAINER out of its own owner — different levels, not two values of one field |
| `grip.route-visible` | a container with a Grip child | the layout run | the grip is given room (ear, spine, tray edge) and is NOT under the pile — otherwise it cannot be pressed |
| `grip.escalation-never-alone` | hold→whole configured as the only route | validated | rejected: an invisible affordance may only be an ADDITION to a grip or a draught |
| `occupied.four-entries` | capture · merge · swap · reject | a drop onto an occupied slot | each does what it names |
| `occupied.not-the-rule` | AcceptRule allows, occupied says swap | evaluated | the rule answers WHO may enter and is silent about the sitter; mixing the two is a client2 smell |
| `keeps.narrows` | `keeps: ["drag"]` on a discard | a child flipped in place | refused; carrying it out is allowed. No field = everything allowed |
| `keeps.no-negation` | the whole src tree | scanned for `allow_manual_flip: false`-shaped flags | zero — restriction is by absence, never by a negative flag |
| `container.children-are-state` | the spec serialized | the payload inspected | `children` is state and is absent from the spec; the config is spec and is sent once |
| `container.is-a-figure` | a container | drag / flip / selection / shadow applied to the whole | all work — it is a full figure, not a special case |
| `container.no-state-diffs` | the whole src tree | scanned for state-diff / mechanics registries | zero — 'deck ↔ fan' is a layout reference swap |

## UNIT · the scene plan

`vitest (headless, no WebGL)` · 20 кейсов, расписано 20

Геометрия — чистая функция, рендерер только превращает ответ в объекты. Настоящий Pixi в jsdom не
живёт, поэтому всё, что решено ВНУТРИ рендерера, непроверяемо по построению: правило, проскочившее
мимо этой секции, не сторожит никто.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `marks.off-by-default` | узел с коробкой, отладка выключена | отметки посчитаны | пусто: инструментальный слой появляется потому, что его попросили, а не сам |
| `marks.a-box-becomes-visible` | тот же узел, отладка включена | отметки посчитаны | одна отметка. Ради этого слой и заведён: `Bounded` не рисует ничего, и до кнопки коробку приходится принимать на веру |
| `marks.no-box-no-mark` | узел без `Bounded` | отметки посчитаны | не обведён — обводить нечего |
| `marks.a-rect-is-four-corners` | `rect 2×1`, юнит 100 | отметка посчитана | четыре угла в пикселях вокруг места, где узел стоит |
| `marks.a-circle-is-a-polygon` | `circle{r:0.5}` | отметка посчитана | многоугольник, все точки на радиусе. Форма разрешается в ТОЧКИ здесь, поэтому рендерер не читает сорт — `guard.no-kind` переживает появление второго рисующего |
| `marks.a-poly-keeps-its-points` | треугольник | отметка посчитана | его собственный контур, а не описанный прямоугольник |
| `marks.follow-the-layout` | два ребёнка под `row` | отметки посчитаны | обводки стоят там, куда РАСКЛАДКА поставила узлы |
| `marks.bounds-override-is-what-is-drawn` | `size 1×1`, `bounds 3×1` | отметка посчитана | ширина 3: обводка говорит правду о коробке, а не о том, что автор написал первым |
| `plan.a-box-alone-draws-nothing` | Bounded без Surfaced | план построен | пусто: ни бледной рамки, ни отладочного прямоугольника. Коробка настоящая и невидимая |
| `plan.surfaced-draws-one-quad` | Bounded + Surfaced | план построен | ровно одна фигура |
| `plan.the-root-sits-in-the-middle` | один узел, вьюпорт 800×600 | план построен | центр `400,300` — на это опирается каждая страница каталога |
| `plan.units-become-pixels-once` | `plate` (0.03 бордер, 0.08 радиус), юнит 100px | план построен | `3` и `8` пикселей: конвертируется КАЖДАЯ длина, а не только размер |
| `plan.an-unregistered-record-is-skipped` | ссылка на незарегистрированную поверхность рядом с исправным узлом | план построен | пропущена только висящая ссылка; исправный узел нарисован |
| `plan.a-record-without-a-border-still-fills` | `plate` и `bare` | оба построены | у второго нет бордера, габариты те же |
| `plan.restyle-reaches-every-node-at-once` | три узла на `plate` | запись перерегистрирована без бордера | бордер исчез у всех троих, и ни одна коробка не сдвинулась |
| `plan.z-orders-the-paint` | дети с z=5 и z=1 | план построен | порядок по высоте, равные — в порядке дерева |
| `plan.a-lifted-container-lifts-its-children` | контейнер z=10, ребёнок z=1 | ребёнок в плане | 11 — подняли пачку, поднялась вся пачка |
| `origins.child-is-owner-plus-layout` | владелец в `2,0`, ребёнок в `1,1`, раскладка `free` | позиции посчитаны | `3,1` — смещения складываются |
| `origins.a-placing-layout-wins` | ребёнок с `at 50,50` под `row` | позиции посчитаны | раскладка переписала позу, а не сложилась с ней |
| `origins.deep-chain` | три уровня со своими смещениями | позиции посчитаны | каждый уровень добавил своё |

## UNIT · оболочка каталога

`vitest + jsdom` · 30 кейсов, расписано 26

Сцена, инспектор-шина, сниппет и слова — это КАТАЛОГ, а не кит: он живёт в `.storybook/` и
документирует то, что уезжает в игру. Строки были в коде без строк здесь — долг, закрытый задним
числом.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `scene.toolbar-drives-this-canvas` | сцена | эталон выбран в строке над видом | хост получил его: настройка канваса стоит на канвасе |
| `scene.toolbar-auto-releases` | выбран `auto` | вьюер прочитан | оверрайд УБРАН, а не выставлен числом, которое лишь похоже на отсутствие |
| `scene.two-canvases-differ` | две сцены на странице | эталоны выбраны разные | у каждой свой; ни одна не говорит за соседку |
| `scene.catalog-cannot-overrule` | эталон выбран руками | переключён язык каталога | эталон не сброшен: каталог не перебивает настройку канваса |
| `scene.paints-what-the-tree-holds` | узел с коробкой и поверхностью | сцена смонтирована | рендереру отдан план дерева; оболочка своего не придумывает |
| `scene.note-earns-its-words` | пустая сцена и нарисованная | заметка прочитана | «ничего не нарисовано» стоит только под пустым планом — под квадратом она учила бы обратному |
| `scene.repaints-on-a-viewer-change` | эталон 34 → 60 | план перерисован | фигура выросла: эталон это размер |
| `scene.bounds-toggle` | коробка и ничего красящего | кнопка нажата и отжата | отметки появились и ушли; НАРИСОВАНО по-прежнему ничего — инструмент не поверхность |
| `scene.bounds-is-this-canvas-only` | две сцены | отладка включена у одной | вторая не изменилась |
| `scene.bounds-survives-a-catalog-change` | отладка включена | переключён язык | осталась включённой, и кнопка это показывает |
| `scene.select-is-capped-not-truncated` | тулбар | ширина селекта и подписи опций | контрол капнут с многоточием, подписи ЦЕЛЫЕ: список рисует платформа, и он по-прежнему по контенту |
| `scene.toolbar-follows-language` | строка тулбара | переключён язык | подписи перечитаны, а не вшиты |
| `inspector.bus-late-subscriber` | сцена уже построена | панель подписалась после | получила отчёт: сцена ПУБЛИКУЕТ, а рисует кто хочет |
| `inspector.bus-gone-scene` | сцена уничтожена | отчёты прочитаны | её больше нет: мёртвая сцена не говорит за дерево |
| `inspector.markup-is-pure` | список узлов | разметка построена | без сцены и без документа — та же разметка идёт и в панель менеджера, и под канвас доков |
| `inspector.markup-empty` | ни одной сцены | разметка построена | пустое дерево, а не падение |
| `inspector.scene-named-after-story` | страница доков | сцены построены | каждая названа своей стори, и блок находит свой канвас |
| `inspector.two-scenes` | две стори на странице | обе опубликовали | не перезаписали друг друга |
| `inspector.open-persists` | блок свёрнут | открыта другая стори | свёрнутость запомнена |
| `source.is-the-story` | стори | сниппет построен | это ИСХОДНИК, а не отрендеренный DOM |
| `source.imports` | сниппет | прочитан | сказано, откуда имена, иначе читается как магия |
| `source.scene-is-not-the-kit` | сниппет со `scene(...)` | прочитан | оболочка названа оболочкой КАТАЛОГА, чтобы её не приняли за API кита |
| `source.mount-line` | сниппет | прочитан | единственная строка, трогающая страницу, выписана явно |
| `source.no-orphan-hint` | стори, из которой нечего извлечь | сниппет | пусто, а не одинокая строка `mount` |
| `source.no-catalog-bookkeeping` | стори с `gkDoc` | сниппет | ключи доков вырезаны: они не часть сборки сцены |
| `source.keeps-a-story-without-parameters` | стори без параметров | сниппет | не тронут: «нечего вырезать» не повод переписывать |

## UNIT · the two measures

`vitest` · 8 кейсов, расписано 4

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `unit.table-has-none` | the whole src tree | scanned for screen fractions outside HUD | zero hits — table sizes are world numbers, the camera fits them |
| `unit.hud-etalon` | the HUD etalon changed 46→60 | HUD and table measured | HUD sizes change, table sizes do NOT — two different mechanisms, no interference |
| `unit.override-local` | a user lowers the etalon | the state inspected | nothing travels: sizes in units are the truth, pixels are per viewer |
| `unit.boxfit-ported` | a labelled box | preset vs content fit, min/max clamps | matches client2 `ui/boxFit` exactly — one arithmetic for button, drop zone and badge |

## PROPERTY-BASED

`fast-check` · 14 кейсов, расписано 5

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `prop.compose.closure` | a random subset of all 19 atoms, CLOSED over requirements | composed and mounted | never throws; caps equals the closure exactly |
| `prop.compose.starved` | a random subset NOT closed | composed | every atom whose requirement is missing is absent — never half-present |
| `prop.caps.reflect` | a random closed subset | `caps(el)` compared to it | exactly equal for every generated case |
| `prop.conflict.stable` | a random subset | conflict resolution run twice | same verdict both times — resolution is deterministic |
| `prop.resolve.assoc` | a random tree of depth ≤6 | resolve run at every node | summed fields equal the path sum; inherited equal the nearest ancestor |

## ARCHITECTURAL GUARDS · source-scan

`vitest + fs scan (like argNames.test.ts)` · 16 кейсов, расписано 16

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `order.every-title-is-placed` | все стори каталога | сегменты титулов сверены со списком `storySort` | каждый назван. Неназванный не падает, а СОРТИРУЕТСЯ — каталог с неверным порядком неотличим от верного до первого читателя |
| `order.basics-before-atoms` | список порядка | прочитан из исходника `preview.ts` | `Basics` раньше `Atoms`: вопросы прежде ответов |
| `order.atoms-follow-the-dependencies` | тот же список | позиции ступеней сверены | `Bounded → Surfaced → Transformable → Container`. По алфавиту вышло бы `Container` раньше того, что он раскладывает |
| `order.no-stale-levels` | тот же список | имена сверены с существующими уровнями | ни одного имени с уровня, которого больше нет — прошлый список был плоским, и внутри `Start` дерево молча вернулось к алфавиту |
| `guard.every-field-declares-a-class` | все зарегистрированные атомы | классы полей прочитаны из реестра | у каждого поля объявлен один из четырёх классов. НЕ скан: атом, собранный в рантайме, скану не виден |
| `guard.layout-writes-only-at` | все поставляемые раскладки | позы прочитаны | ключи ровно `x,y` — раскладка двигает, но не поднимает |
| `guard.catalog-through-the-door` | каталог | импорты в `src/` просканированы, включая динамические | только две двери: модель (`index.ts`) и рендерер (`render/pixi.ts`) |
| `guard.no-kind` | the whole src tree | scanned for `def.kind ===` / kind switches | zero hits outside the visual registry |
| `guard.no-negation` | the whole src tree | scanned for `disabled` / `interactive:"none"` / `transparent` | zero hits — capability is by presence, restriction by absence |
| `guard.caps-only-door` | systems code | scanned for direct `def.flip/def.drag/...` | zero — only `elementCaps` may read them |
| `guard.no-parent-namespace` | the whole src tree | scanned for `parent.` as a field path | zero — an owner's fields are ordinary fields of another node |
| `guard.field-has-class` | every field in the model | cross-checked against the class table | every field declares one of the four; an undeclared field fails |
| `guard.three-planes` | every story in the catalog | its controls classified | Controls holds only fields; State holds nothing serializable as spec; Viewer writes no state |
| `guard.english-only` | identifiers & comments | scanned for Cyrillic | zero outside `locales/` — the bundles and the test asserting what they say |
| `guard.kit-knows-no-localization` | the kit tree | scanned for locale/i18n/TextSource/translate and json imports | zero: not the words, and not the notion either — a caption arrives already written |
| `guard.no-language-list` | the kit tree | scanned for "en"/"ru" literals | zero — a game adding a language must never have to edit the kit |

## INTERACTION · play functions

`@storybook/test + userEvent, Vitest browser mode` · 28 кейсов, расписано 8

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `play.drag.commit` | a Draggable element on a board | userEvent drags it to a slot and releases | it lands in the pointed slot; `dragStarted`/`dropAccepted` fired in order |
| `play.drag.reject-home` | a drop the zone rule denies | released over the zone | flies home; ends at origin; `dropRejected` fired |
| `play.flip.by-echo` | a face-down card | flip requested | stays old-side until the server echo, then flips (never blinks the face) |
| `play.keyboard.actionable` | a Button (Actionable+Focusable) | Tab then Enter/Space | focuses, then fires the command — operable without a pointer |
| `play.toggle-atom.live` | the Element scene | Bounded toggled off in Controls | not just the shadow: Surfaced, Draggable and ShadowCaster VANISH with their fields, and the scene is no longer an Element |
| `play.state-plane` | the State tab | drag / flying picked | they apply, and they are absent from the spec payload — you cannot author them |
| `play.viewer-plane` | viewer switched owner → other on a Private node | the canvas | the node is gone from the picture; the spec is untouched and nothing was sent |
| `play.debug-layer` | Bounded on, Surfaced off, hit layer enabled | the canvas | an invisible node becomes inspectable — the only way to see a box |

## STATE MATRIX · combinatorics

`generated table, vitest` · 24 кейсов, расписано 5

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `matrix.pairs` | every declared atom × every other (curated interacting pairs, not the full 2^19) | each pair evaluated | the conflict table below is the oracle; each row is one assertion |
| `matrix.transitions` | atom sets swapped in sequence (Bounded→+Surfaced→+Container) | switched | caps change fully; the id is preserved across every transition |
| `matrix.starved` | every atom with a requirement, requirement removed | evaluated | absent, with its fields; never inert-but-present |
| `matrix.state-x-spec` | each State value × a few atom sets | evaluated | state never changes which atoms exist; the two planes do not leak into each other |
| `matrix.dropped` | the combinations NOT enumerated | logged explicitly | the report names what was skipped — no silent 'we covered everything' |

## STATE PLANE · what happens vs what is authored

`vitest` · 12 кейсов, расписано 4

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `state.pose-authorable` | rest · lifted · held | assigned from a spec | accepted — these three are a pose |
| `state.happens-not-authorable` | drag · flying · settling | assigned from a spec | rejected by the validator: they happen to the node, they are not written |
| `state.idle-not-z` | idle breathing on | z and the shadow measured | z unchanged, shadow unchanged in size — breathing is decoration (client2 elevation.ts:21) |
| `state.flags-independent` | selected · focused · concealed · frozen | toggled in every order | independent; none of them adds or removes an atom |

## VISUAL REGRESSION

`Chromatic — pixel diff per story` · 40 кейсов, расписано 4

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `visual.states` | each meaningful atom combination | snapshotted | diffed against baseline; a pixel change fails the build until approved |
| `visual.themes` | light and dark | both captured per state | the accent works on both grounds; contrast stays legible |
| `visual.viewports` | 375 / 768 / 1280 px | captured | no horizontal body scroll; wide content scrolls inside its own box |
| `visual.locales` | en and ru | captured | the ru caption does not clip the button; layout survives longer strings |

## ACCESSIBILITY

`axe-core via the a11y addon` · 14 кейсов, расписано 4

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `a11y.roles` | interactive elements (Button, Toggle, Input) | axe scans the DOM | correct role/name/state; WCAG violations fail the run |
| `a11y.focus-order` | a form-like scene | tabbed through | focus order is logical; every focusable has a visible ring |
| `a11y.contrast` | text on every surface + both themes | measured | meets AA; the muted grey is not below threshold |
| `a11y.motion` | prefers-reduced-motion on | the settle animation | is reduced/instant, not forced |

## NETWORKING · truth vs pretty

`vitest + a fake Colyseus room + a fake clock` · 24 кейсов, расписано 6

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `net.predict.position` | a local drop | position applied | optimistic and immediate — reversible, so flying home reads as the answer |
| `net.echo.facing` | a flip | side change | waits for the echo — never predicted, so it cannot blink and hide |
| `net.keep.travels` | a free-table pose (angle 15°) | state serialized | the kept angle is on the wire; derive-facets (grid/fan) are not |
| `net.late-joiner` | player C joins after a move | C's projected scene | matches A and B exactly — truth is state, never a trajectory C never saw |
| `net.revision.stale` | an old echo arrives after a newer local rev | the incoming patch | is ignored (revision guard) — the picture does not jitter back |
| `net.contenders` | two players grab the same top card | messages processed one at a time | first gets the top, second the next — no extra logic, no double-take |

## LIFECYCLE & PERFORMANCE

`vitest + a headless Pixi fake` · 16 кейсов, расписано 5

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `life.mount-unmount` | mount then destroy | the scene inspected | nothing left behind: no sprites, listeners, or timers leak |
| `life.idle-gate.sleep` | no animation running | the render loop | goes to sleep — no draws while nothing moves |
| `life.idle-gate.wake` | a spin/settle starts | the loop | wakes; and every continuous animation is registered so it cannot fall asleep under one |
| `perf.compose-budget` | composing 500 elements | time measured | under the frame budget; no O(n²) in caps resolution |
| `perf.no-leak-repeat` | 1000 mount/unmount cycles | heap watched | flat — no growth across cycles |

## SERIALIZATION / SCHEMA CONTRACT

`vitest` · 11 кейсов, расписано 4

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `schema.no-functions` | an element spec | serialized to JSON and back | round-trips — the spec is data, holds no functions |
| `schema.spec-vs-state` | spec vs state | classified | truth (deck order, facing) travels the schema; the spec is static, sent once |
| `schema.set-array-write` | writing a full set | done via clear()+push loop | length is exact; setAt-past-length appends — that trap is guarded |
| `schema.permutation` | a client-sent reorder | validated | `isPermutationOf` passes only if the card set is unchanged |

## REGRESSION GUARDS · known traps

`vitest — one test per historical bug` · 10 кейсов, расписано 6

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `trap.index-missing-but-build-green` | `options.storySort` задан ИМПОРТИРОВАННЫМ именем | `storybook build` | индексатор читает `preview.ts` статически, имя не резолвит: WARN, индекс пропущен, **выход 0**. Каталог собран и пуст. Литерал обязан быть на месте |
| `regress.deck-bloat` | the setAt-past-length append bug | a full-deck write | never grows the array to 60 — the exact 'deck bloated' bug stays dead |
| `regress.kind-ignored-caps` | the client2 bug where the board read kind, not caps | behavior driven | reads caps only; a source-scan makes a relapse fail |
| `regress.shadow-double` | the 'shadow larger than the card' math bug | elevation computed | z (source) and screen-position stay separate; height counted once |
| `regress.frozen-base` | the client1 fan-z bug | a base read once at animation start | forbidden: resolve is read at APPLY time, and the fan may collapse mid-flight |
| `regress.viewable-vs-surfaced` | the atom whose toggle had no parameters | the model inspected | Surfaced draws, Viewable is the camera atom; no element carries Viewable |

## E2E

`Playwright against the built Storybook` · 14 кейсов, расписано 9

Слой отвечает на ОДИН вопрос, недоступный всем остальным: попало ли что-нибудь на стекло. Всё выше
идёт headless против фейка или чистой функции, а в jsdom нет WebGL вовсе — «квадрат запланирован» и
«квадрат на экране» это два разных утверждения, и второе делает только этот файл.

Сравниваются КАРТИНКИ ДРУГ С ДРУГОМ, никогда с эталонным снимком: эталон чего-то стоит, только если
на него посмотрел человек, а снимок, на который не смотрели, благословляют при каждом падении.

Ловушка, которая уже стоила времени: снимать WebGL-канвас ЧЕРЕЗ навигацию нельзя — кадр нового
документа не обязан быть на стекле в момент захвата, и набор обвиняет рендерер в том, чего тот не
делал. Ключевые сравнения живут внутри ОДНОГО кадра одной страницы; сдвиг соседнего выреза кратен
шагу фоновой сетки (22px), иначе картинки разошлись бы по точкам фона, а не по нарисованному.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `e2e.pixi-actually-paints` | сцена `Surfaced/Plate` | центр канваса сравнён с равным пустым вырезом рядом, в том же кадре | различаются: квадрат ДЕЙСТВИТЕЛЬНО на стекле, а не только в плане |
| `e2e.a-box-alone-draws-nothing` | сцена `Bounded/Box` | то же сравнение | пиксель в пиксель: коробка настоящая и невидимая |
| `e2e.hud-unit-drives-the-picture` | `Surfaced/Plate` | эталон переключён 34 → 60 в тулбаре сцены | картинка изменилась: эталон это размер, и он виден |
| `e2e.layout-decides-the-picture` | `Container/Free` и `Container/Row` | обе открыты | различаются — деревья одинаковы вплоть до поз детей, различается одно слово `layout` |
| `e2e.theme-reaches-the-canvas` | `Surfaced/Plate` в тёмной и светлой | обе открыты | различаются: у канваса нет каскада, токен палитры резолвит сам рендерер |
| `e2e.bounds-layer-reveals-the-box` | `Bounded/Box` — сцена, где не нарисовано ничего | кнопка отладки нажата | на стекле появился контур там, где модель всё это время утверждала коробку. Выше этого слоя показать это нечем: выше никто не рисует |
| `e2e.toolbar-fits-a-phone` | ширина 390px | правые края контролов сверены с панелью | всё внутри, и панель не прячет переполнение прокруткой. Селект по самой длинной опции выталкивал соседа за экран — это ответ РАСКЛАДКИ, headless его не видит |
| `e2e.sidebar-is-the-ladder` | собранный каталог | боковая панель раскрыта и прочитана | `Basics` раньше `Atoms`, атомы по зависимости. Сортировка живёт в МЕНЕДЖЕРЕ: `index.json` несёт стори в порядке обнаружения и о показе не знает — headless этого не видит вовсе |
| `e2e.story-smoke` | все стори каталога | открыты по очереди в настоящем браузере | ни одной ошибки в консоли и ни одного `pageerror` |

