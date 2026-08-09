# game-kit — план тестов

Покрытие. Спецификация ПОВЕДЕНИЯ — `docs/scenarios/*.md`, законы — `CANONS.md`; здесь то, что
именно проверяется и на каком слое. Каждый закон обязан иметь тут строку: правило без сторожа
живёт до первой пересборки контекста (§0 канонов).

Идентификатор — `scope.scenario.condition`, стабильный: по упавшему id сразу видно сценарий и
состояние. Строка — Дано / Когда / Тогда.

**25 слоя · 644 кейсов заявлено · 469 расписано поимённо.**
Разница — однотипные варианты внутри кейса (значения перечислений, темы, вьюпорты); слой не
закрыт, пока не расписаны все, а пропущенное называется явно (`matrix.dropped`).

> Данные плана и таблица в сторибуке — ОДИН массив: этот файл из него выгружен, а когда появится
> настоящий Storybook, стори будет читать этот файл. Двух источников нет по построению.

## UNIT · Fit and align

`vitest (headless, no WebGL)` · 12 кейсов, расписано 12

| id | дано | когда | тогда |
|---|---|---|---|
| `fit.contain-is-the-default` | площадь и картинка разных пропорций | вписано | поля, а не обрезка. `cover` выглядит опрятно и молча съедает края — неверные пропорции доезжают незамеченными; `contain` делает неверный результат видимо неверным |
| `fit.cover-fills-and-overflows` | то же | `cover` | заполняет площадь и вылезает — контур обрежет |
| `fit.matching-proportions-make-contain-and-cover-agree` | арт нарисован под форму | оба режима | совпадают; расхождение здесь значит, что ассет объявил не тот размер |
| `fit.fill-ignores-proportions` | те же | `fill` | ровно площадь: единственный режим, который искажает, и он говорит об этом именем |
| `fit.original-draws-the-declared-size` | ассет объявил размер | `original` | этот размер, в юнитах |
| `fit.repeat-is-original-over-and-over` | то же | `repeat` | тот же размер плюс флаг плитки: общий размер и есть вся разница между режимами |
| `fit.fitX-and-fitY-follow-one-axis-and-keep-the-proportions` | те же | по оси | ось выдержана, пропорции целы |
| `fit.a-picture-with-no-size-is-not-placed` | нулевая сторона | вписано | нулевая коробка, без деления на ноль |
| `align.centre-is-the-origin` | есть запас | `center` | ноль: то же начало координат, что и у всего остального |
| `align.corners-push-the-picture-into-them` | есть запас | `topLeft` | сдвиг ровно на половину разницы |
| `align.opposite-corners-are-opposite` | есть запас | `left`/`right` | симметрично |
| `align.does-nothing-when-there-is-no-slack` | `fill` | любой якорь | ноль, и без отрицательного нуля |

## UNIT · Contour and dashes

`vitest (headless, no WebGL)` · 20 кейсов, расписано 20

| id | дано | когда | тогда |
|---|---|---|---|
| `contour.a-square-is-four-points` | rect без радиуса | построен контур | четыре точки: ничего не добавлено там, где нечего скруглять |
| `contour.a-circle-arrives-as-a-polygon` | circle | построен контур | много точек — у рендерера нет второго примитива, и различать ему нечего |
| `contour.rounding-belongs-to-the-surface-not-the-box` | rect + радиус записи | построен контур | точек больше четырёх, и все внутри объявленной коробки: скругление отнимает площадь, не добавляет |
| `contour.a-radius-past-half-the-side-is-clamped` | радиус больше половины короткой стороны | построен контур | стадион, а не исключение: «как можно круглее» — законная просьба |
| `contour.a-polygon-rounds-like-anything-else` | poly + радиус записи | построен контур | углы срезаны фаской и ни один не остался острым, всё внутри исходного контура. Было «только rect» — на доводе «точки нарисовал автор»; спутаны два автора: точки от того, кто рисовал форму, радиус от того, кто писал поверхность |
| `contour.no-radius-no-rounding` | poly, радиус 0 | построен контур | точки ровно как нарисованы: дефолт — ноль, и никого не скругляют без спроса |
| `contour.a-shallow-bend-is-not-a-corner` | круг + радиус | построен контур | тот же, что и без радиуса. Круг приезжает многоугольником пологих изгибов, и скругление их подтачивало бы кривую на каждой перерисовке |
| `offset.inward-shrinks` | квадрат 2×2 | сдвинут внутрь на 0.25 | квадрат 1.5×1.5: сторона обводки решается арифметикой, а не знаком площади в рендерере |
| `offset.outward-grows` | тот же квадрат | отрицательное расстояние | наружу — одна функция на оба выравнивания |
| `offset.inside-is-the-contour-s-own` | тот же квадрат, намотанный в обратную сторону | сдвинут внутрь | тот же меньший квадрат. «Внутри» — свойство фигуры, а не вызывающего: вставленный контур, нарисованный против часовой, иначе носил бы бордюр снаружи |
| `offset.zero-changes-nothing` | любой контур | сдвиг 0 (обводка по центру) | те же точки, тем же объектом |
| `offset.a-round-corner-stays-round` | скругление радиуса 0.5 | сдвинуто на 0.2 | каждая точка дуги в 0.3 от того же центра. Угол, вышедший фаской или узлом, — это и есть «ломаный пунктир» |
| `offset.a-spike-is-cut-not-chased` | игла: два длинных ребра под острым углом | сдвинута внутрь | митра обрезана по лимиту. Без него один луч звезды съедает всю звезду |
| `dash.the-pattern-closes-on-itself` | замкнутый контур | нарезан пунктир | все штрихи одной длины: без подгонки первый и последний встречаются в старте и читаются как один двойной |
| `dash.a-whole-number-of-periods-fits` | `adjust: stretch` | нарезан пунктир | целое число периодов, и период рядом с запрошенным: подгонка корректирует, а не перепроектирует |
| `dash.width-is-independent-of-the-area` | 1×1 и 4×4, один узор | нарезан пунктир | штрихов вчетверо больше, размер штриха тот же |
| `dash.every-corner-carries-a-dash` | `corner: dash` | нарезан пунктир | каждый угол накрыт штрихом: зазор в углу — единственное место, где пунктир выглядит сломанным |
| `dash.corner-falls-back-when-there-are-no-corners` | круг, `corner: dash` | нарезан пунктир | тот же результат, что и у обычного обхода: честный ответ вместо тихо другого |
| `dash.no-pattern-no-dashes` | нулевая длина штриха или зазора | нарезан пунктир | пусто, а не бесконечный цикл |
| `dash.gaps-are-real` | штрих равен зазору | нарезан пунктир | закрашено заметно меньше периметра |

## UNIT · Node and composition

`vitest (headless, no WebGL)` · 35 кейсов, расписано 34

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `node.compose.empty` | a bare `Node` | `caps(node)` is read | empty set; no capability methods on the object. A bare node is VALID |
| `node.no-element-predicate` | the whole src tree | scanned for `isElement` / an Element type | zero hits: systems ask for the atom they need, never for a category (source-scan) |
| `node.canvas-has-no-box` | the canvas root: Surfaced + Container, no Bounded | composed | legal — the surface takes its AREA from the content extent. A Surfaced→Bounded requirement would outlaw the tabletop |
| `node.no-inheritance` | the whole src tree | scanned for `extends`/`instanceof` on nodes | zero hits — composition only (source-scan) |
| `node.not-everything-is-a-node` ⏳ | slot · layout phantom · shadow · camera | asked for an id | none of them has one; they are not nodes |
| `node.transaction-is-not-a-node` ⏳ | a Transaction | asked for `z` / a shadow | a type error, not a value — it is ABOVE nodes, not one of them |
| `bounded.minimal` | a node with only `Bounded` | `caps` read | exactly [Bounded]: a place that occupies room and draws nothing |
| `compose.add-atom` | atom X is composed in | `caps(el).has(X)` | true; X's methods and events are present |
| `compose.remove-atom` | atom X is composed out | the method is called | it is **undefined** (absent), not a thrown 'disabled' error |
| `compose.assoc` | atoms a,b,c | `compose(a,compose(b,c))` vs `compose(a,b,c)` | identical caps set — composition is associative |
| `compose.commut` | the same atoms in any order | two compositions compared | equal — order does not change the node |
| `compose.dedupe` | the same atom twice | composed | present once; second is a no-op, not a duplicate |
| `node.id.given` | a node built with an authored name | its id is read | it is the name that was given — a node is NAMED, it does not name itself |
| `node.id.local-allocator` | `localIds()` in an instance answering to nobody | two ids minted | they differ; the allocator is explicit, never ambient |
| `node.id.allocators-are-independent` | two `localIds()` | first id of each | equal — which is why a module-level counter may never come back: the collision is real, and silent |
| `tree.duplicate-id-is-loud` | a tree already holding `hand` | a second `hand` is added | it throws; the rejected node gains no owner. Never a silent replace |
| `tree.duplicate-deep` | an incoming SUBTREE holding a taken id | added | it throws — the check covers the whole subtree, not its top node |
| `tree.same-id-in-another-tree` | two separate trees | each given a `hand` | both legal: uniqueness is per tree, not global |
| `locales.complete` | every catalog locale | compared to the reference bundle | no key missing — the switch is only honest with nothing left to fall back on |
| `locales.plurals` | each locale, counts 0..100 | resolved through `Intl.PluralRules` | every count lands on a form; none falls through to a raw key |
| `locales.russian-plurals` | ru, n = 1/2/5/21 | resolved | узел / узла / узлов / узел — the two-form helper that printed "узлов: 2" cannot come back |
| `locales.stops-at-the-catalog` | a resolved caption | followed | it never crosses into the kit: the scene is handed text, not a key |
| `locales.chrome-carries-no-prose` | the statically imported bundle | its keys read | not one `docs.` key: what every reader downloads must not grow with the catalog |
| `locales.a-page-loads-its-own` | one docs page opened | the loaded set read | its bundle, and nobody else's |
| `locales.a-page-falls-back-to-the-chrome` | a page's text object | asked for a toolbar caption | it answers — one object per screen, so nothing is half-swapped |
| `locales.language-is-a-separate-load` | one page, both languages | resolved | different words, cached apart: a switch is a new bundle, never a merge |
| `locales.pages-are-complete` | every page bundle, every locale | compared to its reference | no key missing — the chrome's own check cannot see these files at all |
| `locales.key-names-its-page` | a prose key | routed | the second segment names the page; an unknown one routes nowhere instead of throwing |
| `locales.an-unknown-page-is-the-chrome` | a story naming prose nobody wrote | loaded | the chrome alone: prose missing, not a page that will not open |
| `locales.every-page-has-both-languages` | every declared page | loaded in each locale | it arrives, in that locale |
| `locales.every-bundle-has-a-loader` | the pages directory | compared to the loader list | both ways: no unreachable file, no loader without a file |
| `locales.a-bundle-holds-only-its-page` | every page bundle | its keys routed | each belongs to the page it is filed under — a stray key resolves only when another page is open |
| `locales.prose-is-never-imported-statically` | every catalog source file | its imports read | a page bundle is reached by `import()` or by `import type` — one value import undoes the split |
| `locales.a-story-names-prose-that-exists` | every `gkDoc` / `gkDocStory` | looked up in its bundle | present — a key that resolves to itself renders as `docs.foo.bar` on screen |

## UNIT · Root, host and the inspector

`vitest + a DOM fake` · 29 кейсов, расписано 28

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `root.is-just-a-node` | a root | its type inspected | an ordinary node with Container — there is no separate storage entity above it |
| `root.cannot-be-a-child-twice` | узел, уже стоящий в дереве | добавлен второму владельцу | бросок «already has an owner». Владелец ровно один, и молча переехать нельзя |
| `tree.no-cycles` | владелец и его ребёнок | ребёнку отдают владельца | бросок; и сам себе владельцем узел тоже не становится |
| `chain` | корень → середина → лист | спрошена цепочка листа | `[корень, середина, лист]` — сверху вниз и включая сам узел: это порядок, в котором считается наследование |
| `walk` | дерево в три уровня | обойдено | каждый узел ровно раз и со своей глубиной |
| `root.nobody-places-it` ⏳ | a root | `Placeable` asked for | absent, and it cannot be added: Placeable requires Bounded, which a root has no business having |
| `root.two-and-one-difference` ⏳ | CanvasRoot and HudRoot | the camera applied | it transforms the first and does not touch the second; there is no `anchor` field anywhere (source-scan) |
| `root.byid-derived` | a node removed from the tree | `byId` asked | undefined — the index is derived from the tree, never a second store |
| `root.render-follows-tree` | a node with and without Surfaced under a mounted root | the frame | drawn / not drawn; both still exist and both appear in the inspector |
| `host.owns-pixels` | a node | asked for its pixel size | it does not know: a node lives in units. The host owns the view and its size |
| `host.hud-unit-from-viewport` | the viewport resized | the HUD etalon | recomputed by the host and put into the ResolveContext; table sizes do not move |
| `host.view-not-called-canvas` | хост | прочитано имя поля | `view`: слово canvas в этом проекте значит холст сцены, и два смысла под одним словом уже стоили дорого |
| `host.context-carries-unit` | хост с юнитом | контекст разрешения прочитан | юнит внутри: наследование считается от него, и второго источника нет |
| `host.single-pixi-import` | the whole src tree | scanned for `from "pixi.js"` | exactly one file — everything else is headless data and maths (source-scan) |
| `host.new-data-replaces-the-tree` | a mounted host | `setRoot(another tree)` | it shows the new one and keeps the same view: new data is a different tree in the SAME canvas |
| `host.a-new-tree-is-an-onchange` | a change listener | the root is swapped | it is told, exactly as after a resize — everything downstream reads `host.root` when it draws |
| `host.viewer-survives-new-data` | a host with a theme, an etalon and bounds | the root is swapped | the viewer plane is untouched: two planes, and they do not meet |
| `host.mount-unmount` | mount then unmount | the view inspected | nothing left behind: no display objects, listeners or timers |
| `inspector.one-door` | the panel's source | scanned for engine internals / its own tree walk | zero — it only calls `inspect(root, ctx)` |
| `inspector.reflects-model` | a random tree | panel output vs the model | everything shown exists in caps/fields, and no field of the model is missing |
| `inspector.no-invented-fields` | the panel output | every key cross-checked against the field table | zero keys outside it |
| `inspector.shows-absent` | an atom toggled on with its requirement off | the panel | names it as ABSENT with what it lacks — the one place a starved atom is visible |
| `inspector.three-planes` | any node | the panel sections | own fields · resolved (with class and arrow) · state — kept apart, same law as the tabs |
| `inspector.selection-two-way` ⏳ | a row clicked, then a node clicked on canvas | selection | stays in sync both directions |
| `viewer.defaults` | настройки зрителя не заданы | прочитаны | значения по умолчанию, а не `undefined`: сцена рисуется до того, как кто-то что-то переключил |
| `viewer.reaches-context` | зритель переключён | контекст прочитан | настройка доехала: плоскость зрителя влияет на КАРТИНКУ, оставаясь вне состояния |
| `viewer.change-notifies` | сцена смонтирована | зритель изменён | слушатели вызваны — заметка, панель и дерево перечитывают себя сами |
| `viewer.never-state` | зритель изменён | состояние сравнено | не тронуто. Тема и отладочные слои не путешествуют по сети |

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
| `inherit.root-only.absent` ⏳ | a child asked for `light` / `camera` | the field read | it does not EXIST on a child — a validator error, not undefined |
| `inherit.class-declared` | every field in the model | its class looked up | all four classes covered; a field with no class fails the scan (source-scan) |
| `inherit.billboard-terminates` ⏳ | child `orientation: viewer`, owner rotated 45° | angle resolved | own − camera.rotation; the owners' 45° is NOT added — viewer terminates the chain |
| `inherit.shadow-ignores-angle` ⏳ | the node rotated | the shadow inspected | the silhouette turns, the offset does not: the shadow never inherits the rotation matrix |

## UNIT · ResolveContext

`vitest + a fake clock` · 12 кейсов, расписано 4

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `ctx.not-stored` | a resolved value | the node's own fields inspected | nothing inherited is stored on it |
| `ctx.not-serialized` | the node serialized | the payload inspected | resolved values are absent from the wire — only own fields travel |
| `ctx.read-at-apply` | an animation started, then the OWNER changed mid-flight | the applied value | the NEW value is used — this is the exact client1 fan-z regression, frozen bases are forbidden |
| `ctx.chain-depth` | a chain 5 deep | resolve run | correct at every level; no O(n²) walk |

## UNIT · per-atom contract

`vitest` · 81 кейсов, расписано 79

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `atom.bounded.default-square` | `Bounded()` with no arguments | footprint read | `rect 1×1` — a SQUARE, said out loud: read as a claim about cards it would say "elements are square" |
| `atom.bounded.absent-is-not-zero` | a node with no `Bounded` | footprint read | `undefined`, never a zero box — "occupies nothing" and "is not in the layout" are different answers |
| `atom.bounded.path-flattens-to-points` | путь из двух кубических | построен контур | точки, и много. Ниже модели кривой не видит никто — ровно то, что уже происходит с кругом |
| `atom.bounded.path-does-not-repeat-its-start` | тот же путь | прочитаны концы контура | не совпадают: дублированная точка это ребро нулевой длины, то есть угол без направления, а его не осилят ни скругление, ни обход пунктира |
| `atom.bounded.path-splits-where-it-turns` | крутая кривая и пологая | обе распрямлены | у крутой точек больше. Фиксированное число гранит там, куда смотрят, и мотает точки там, где не смотрят |
| `atom.bounded.path-extent-follows-the-curve-not-the-handles` | путь с далеко вынесенными ручками | прочитан габарит | по кривой, а не по ручкам: иначе раскладка резервирует место, которого форма не занимает |
| `path.absolute-cubics` | `d` с абсолютными `C` | разобран | путь; габарит совпадает с записанным |
| `path.relative-is-the-same-shape` | тот же контур строчными командами | разобран | та же форма: строчная буква это смещение, а не диалект |
| `path.a-quadratic-is-a-cubic` | `d` с `Q` | разобран | преобразован точно. Один вид сегмента в модели — один код распрямления |
| `path.shorthands-mirror-the-last-handle` | `S` против выписанного `C` | оба разобраны | совпадают. Ошибиться в отражении ручки значит согнуть кривую в другую сторону — и это выглядит как решение дизайнера, а не как баг |
| `path.h-and-v-are-lines` | `H`/`V` | разобран | прямоугольник |
| `path.a-missing-close-still-encloses` | `d` без `Z` | разобран | то же, что и с `Z`: `Z` — это как инструмент ГОВОРИТ «замкнуто», а область замкнута потому, что она область |
| `path.an-arc-fails-loudly` | `d` с `A` | разобран | ничего. Выбросить сегмент значило бы форму, тихо потерявшую скруглённый конец, и ни одного слова об этом на экране |
| `path.nonsense-is-nothing` | пустая строка, текст, один сегмент | разобран | ничего, а не полуразобранная форма |
| `stage.bake-asks-the-node` | узел с `Bakeable` и узел без него, опций не передано | сцена отрисована | первый запечён, второй жив. Дефолт не требует настройки вообще: факт о карте живёт НА карте |
| `stage.bake-all-or-none` | предикаты `() => true` и `() => false` | отрисованы | все матрицы единичны / все на месте. Перечисления тут нет: «всех» и «никого» — две функции среди многих |
| `stage.bake-the-predicate-wins` | предикат, обратный мнению дерева | отрисованы оба | сцена перебила каждый узел. Ради этого — «то, что сказали узлы, кроме той, что летит», без правки дерева на лету |
| `atom.bakeable.presence-is-the-whole-statement` | атом `Bakeable` | прочитаны поля | полей нет. Присутствие объявляет, отсутствие отказывается; `bake: false` был бы тем самым `disabled`, которого в модели нет |
| `atom.bakeable.needs-a-surface` | узел с `Bakeable` без `Surfaced` | спрошен `starved` | голодает. Запекание — операция над квадом, а узел, который не рисует, ни одного не даёт |
| `atom.bakeable.is-not-inherited` | стол с `Bakeable` и карта на нём | прочитана карта | атома у неё нет. `fromOwner` отобрал бы у летящей карты матрицу заодно со столом |
| `plan.a-zero-unit-is-not-a-division` | вьюпорт без размера, `unit: 0` | построен план | в матрице конечные числа. `1/0` пускает NaN по всей матрице, и всё ниже читает её как «повёрнутую» (NaN не равен и нулю), поэтому план тихо перестаёт запекаться |
| `plan.baked-and-live-are-the-same-picture` | один узел со сдвигом | план построен обоими способами | точка в точку одно и то же. Если бы режимы расходились, выбор был бы багом, ждущим того из них, на который никто не смотрит |
| `plan.a-live-quad-keeps-its-points-at-home` | узел, сдвинутый на два юнита | прочитаны точки живого квада | вокруг собственного нуля: точки не упоминают, где узел, — потому его и можно двигать, не отдавая новой геометрии |
| `plan.a-turned-picture-is-not-baked` | повёрнутый узел С картинкой, повёрнутый БЕЗ картинки, прямой с картинкой | запечены | матрица осталась только у первого. Отказ называет КАРТИНКУ, а не угол: точкам поворот безразличен, а прямоугольник картинки угла не вмещает |
| `plan.a-live-stroke-scales-with-the-node` | узел с масштабом 2 и обводкой | план ЖИВОЙ | обводка вдвое толще: матрица тянет всё, что под ней. Строка раньше утверждала это про ЗАПЕЧЁННЫЙ узел и спорила со следующей за ней — разница режимов ровно в этом |
| `transform.identity-changes-nothing` | единичное преобразование | применено к точке | та же точка |
| `transform.compose-is-outer-after-inner` | перенос и поворот | составлены в обе стороны | результаты разные, и порядок — тот, каким читается цепочка владельцев: наоборот карта в повёрнутой руке крутится вокруг центра стола |
| `transform.a-pose-scales-then-turns-then-moves` | поза с масштабом и поворотом | применена | масштаб, потом поворот, потом перенос: любой другой порядок превращает «вдвое больше» в «вдвое дальше» |
| `transform.rotation-is-clockwise-on-screen` | поворот на 90° | применён к оси x | попал на ось y: экранный `y` растёт вниз, и перепутанный знак невидим на симметричной фигуре |
| `transform.chain-applies-left-last` | цепочка из двух | применена | левое применено последним |
| `transform.invert-undoes` | поза с поворотом и масштабом, и вырожденный масштаб | обращены | точка возвращается; у вырожденного обратного нет, и ответ — ничего, а не матрица с бесконечностями |
| `atom.transformable.angle-adds-up` | стол на 30° и карта на 15° | прочитана цепочка | 45°: ребёнок не может отвернуть владельца |
| `atom.transformable.scale-multiplies` | рука 0.5 и карта 0.5 | прочитана цепочка | 0.25, а у узла без масштаба — 0.5. Нейтральное значение единица, и сумма прочитала бы отсутствие как «пропал» |
| `shapes.a-rect-is-four-runs` | `rect(2, 1)` | прочитаны габарит и точки | 2×1 вокруг нуля: хелпер строит форму на начале координат, как и все остальные |
| `shapes.a-circle-is-an-ellipse-with-equal-radii` | `circle(1)` и `ellipse(1, 1)` | сравнены | совпадают, и точки лежат на окружности с точностью, которую даёт любой редактор. Круг — не сорт и не масштабированное что-то |
| `shapes.an-ellipse-is-not-a-squashed-circle` | `ellipse(1.2, 0.8)` | прочитан габарит | 2.4×1.6 — это общий случай, а круг его частный |
| `shapes.a-polygon-puts-n-corners-on-a-circle` | `polygon(8, 1)` и `polygon(1, 1)` | распрямлены | восемь точек и три: меньше трёх — не форма, а опечатка |
| `shapes.a-star-alternates-two-radii` | `star(5, 1, 0.4)` | прочитаны радиусы точек | десять точек, максимум 1, минимум 0.4 — поэтому нового сорта звезде не нужно |
| `shapes.a-rounded-rect-stays-inside-its-box` | `roundedRect` с радиусом, с огромным радиусом и с нулём | распрямлены | внутри коробки; огромный кламплится в стадион; ноль — ровно обычный прямоугольник |
| `controls.every-preset-is-offered` | список пресетов панели | сверен с `PRESETS` | совпадает: хелпер, добавленный в кит и не предложенный здесь, — форма, которой каталог молча не признаёт |
| `controls.every-preset-builds-a-real-shape` | каждый пресет | построен | контур из трёх и более точек и ненулевой габарит |
| `controls.a-path-preset-is-the-raw-value` | пресет `path` | построен и напечатан | форма без хелпера: `{ start, segments }`. Открытая — две точки это линия, одна это точка, и площади у них нет. Единственный пресет, который печатается ЗНАЧЕНИЕМ, а не вызовом: у остальных имя хелпера говорит, что это, а координаты не сказали бы ничего |
| `controls.every-preset-has-its-own-parameters` | панель | посчитаны условия | у каждого пресета есть свои: вариант, который нечем задать, — не вариант |
| `controls.a-condition-uses-an-operator-storybook-has` | все `if` панели | прочитаны ключи | только `eq`/`neq`/`exists`/`truthy`. Условие, написанное списком, не отвергается, а ИГНОРИРУЕТСЯ — так ширина появилась на странице круга |
| `controls.a-preset-prints-as-its-call` | пресет `star` | построен сниппет | `star(5, 0.9, 0.42)` — каждое имя экспортирует кит. Напечатанный путь был бы честен и бесполезен |
| `controls.an-untouched-transform-is-not-printed` | пресет без правок и с поворотом | построены сниппеты | голый вызов и `transformShape(...)` — дефолт обязан быть невидимым |
| `atom.bounded.zero-is-a-box` | `rect{0,0}` and a node with no `Bounded` | both footprints read | a zero rect against `undefined` — an anchor a layout still places is not the same answer as not being in the layout at all |
| `atom.bounded.needs-nothing` | `Bounded` on a bare node | `caps` read | present: a box stands on nothing |
| `atom.bounded.extent-circle` | `circle{r:1.5}` | extent read | `3×3` — every shape answers with a box, including a round one |
| `atom.bounded.extent-poly` | a triangle | extent read | the axis-aligned span of the points |
| `atom.bounded.extent-empty` | `poly` with no points | extent read | zero, not a crash |
| `atom.bounded.own-field` | a node with `bounds` | footprint requested | it equals the node's OWN field; the set record only stamped it at birth |
| `atom.bounded.one-field` | a node with `bounds` | footprint requested, fields listed | the shape, and exactly one field. There were two — `size` and an overriding `bounds` — and nothing ever read `size`: this accessor was the only way in and always answered the override. Two fields, one observable meaning, and a catalog page teaching a distinction the code did not have |
| `atom.bounded.per-record` | a king and a pawn from the SAME set | both footprints read | they differ — the box is declared per record, never per set |
| `atom.bounded.shapes` ⏳ | `circle{r}` and `poly[]` | hit-test · shadow · layout | hit and shadow follow the real shape; layout reserves the bounding box |
| `atom.bounded.draws-nothing` | Bounded on, Surfaced off | the frame rendered | not a single pixel; the box is visible only through a debug layer |
| `atom.bounded.clamp-not-here` | a node without children | `clampChildren` looked up | absent: clamping belongs to Container, `bounds` is only about itself |
| `atom.hit.derived` ⏳ | a 1×1 unit chip on a touch input | the hit area measured | max(box, the input theme's touch minimum); no `hit*` field exists in the spec |
| `atom.hit.nearest-center` ⏳ | two neighbours whose expanded hit areas overlap | a press in the overlap | the nearer CENTRE wins — deterministic on a dense chess grid |
| `atom.surfaced.registry` | Surfaced{surface:"cardFace"} | the face drawn | the registry record draws it; no borderRadius/fill/colour field exists on the spec (source-scan) |
| `atom.surfaced.one-field` | узел с `Surfaced` | прочитаны поля атома | ровно `surface`. `fit` и `align` жили тут и не читались никем: их место — слой записи, где картинка встречается с площадью |
| `atom.surfaced.area-from-box` | Bounded + Surfaced | area read | the own footprint |
| `atom.surfaced.area-from-content` | Container + Surfaced, no Bounded | area read | the content's extent — the tabletop, and the reason the requirement is an ALTERNATIVE |
| `atom.surfaced.starved` | Surfaced with neither box nor content | `caps` and area read | absent from caps, listed in `starved`, area `undefined` — nothing to paint on |
| `atom.surfaced.fit-not-baked` ⏳ | a fresh `Surfaced()` | its `fit` field read | `undefined`, not `contain`: a fromOwner field pre-filled on every node is a field always set, and then nothing is ever inherited |
| `atom.surfaced.fit-from-owner` ⏳ | owner `fit: cover`, child silent | child resolved | `cover` — the nearest set value up the chain |
| `atom.surfaced.fit-override` ⏳ | owner `cover`, child `original` | child resolved | `original`: an override is just a value of one's own |
| `atom.surfaced.fit` ⏳ | art whose proportion differs from the box | each of the six fits applied | contain letterboxes (the DEFAULT: the author's mistake stays visible), cover crops, repeat tiles, fitX/fitY pin one axis |
| `atom.transformable.needs-no-box` | `Transformable` on a bare node | `caps` read | present — a node can be somewhere without occupying anything |
| `atom.transformable.two-classes` | the atom's two fields | their classes looked up | `at` own, `z` addsUp — this is the atom where the two classes meet |
| `atom.transformable.z-consequences` ⏳ | z raised 0→2 | lift, scale and shadow measured | all three change; none can be set independently of z. Zoom changes neither |
| `atom.z.container-lifts-children` | a stack with z=1 | children resolved | every child is +1: lifting the pile lifts the pile. Lying in it does not lift anything |
| `atom.flippable.reverse` ⏳ | Flippable{reverse} | flip() | back→face hidden, same→identical, mirror→mirrored, alt→other visible face |
| `atom.private.exclusion` ⏳ | Private + a viewer ≠ owner | the scene is projected | the node is ABSENT from that viewer's picture, not merely face-down |
| `atom.private.vs-back` ⏳ | a face-down card next to a Private one | both projected to another viewer | back: present, face hidden. Private: not in the payload at all. Two different hidings |
| `atom.private.subtree` ⏳ | a Private CONTAINER with children | projected to another viewer | the whole subtree is cut — children never appear ownerless |
| `atom.owned.recall` ⏳ | two boxes of the SAME set on one table | `{eq:[el.box,target.box]}` evaluated | only one's own are recalled; identical cards from different boxes are different nodes |
| `atom.valued.paths` ⏳ | Valued{rank,suit} | a rule reads `el.values.rank` | legal; `el.values.race` in a set without race → validator error |
| `atom.actionable.press` ⏳ | Actionable | press() | emits the bound command; nothing when the atom is absent |

## UNIT · Container — slot, layout, spreading

`vitest` · 49 кейсов, расписано 43

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
| `layout.reserves-room-for-the-scaled-child` | ряд, первый ребёнок с масштабом 2 | раскладка посчитана | шаг 1.5 — половина большого плюс половина малого. Раскладка держит место под то, что БУДЕТ видно, иначе карта наезжает на соседа |
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

## UNIT · the scene plan

`vitest (headless, no WebGL)` · 38 кейсов, расписано 37

Геометрия — чистая функция, рендерер только превращает ответ в объекты. Настоящий Pixi в jsdom не
живёт, поэтому всё, что решено ВНУТРИ рендерера, непроверяемо по построению: правило, проскочившее
мимо этой секции, не сторожит никто.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `grid.off-by-default` | сцена | слой не просили | пусто: линейка — то, за чем тянутся, а не то, с чего страница открывается |
| `grid.one-line-per-unit` | 800px при 100px на юнит | построена сетка | девять вертикалей с шагом ровно в юнит — всё утверждение слоя |
| `grid.is-ruled-from-the-origin` | то же | прочитаны координаты линий | линии пересекаются в центре вида: сетка от угла ставила бы ноль линейки туда, откуда никто не меряет |
| `grid.tenths-are-lines-too` | сетка при 100px на юнит | прочитаны линии десятых | они через весь вид, тоньше юнитовых, своим токеном и никогда поверх целой линии. Штрихами на осях это была шкала, которую глазом переносили к фигуре; линиями — сетка, по которой читают там, где фигура стоит |
| `grid.tenths-go-when-they-stop-being-readable` | эталон 50px | построена сетка | одни целые линии: десятая в 5px — чернила, а не сведения |
| `grid.follows-the-etalon` | эталон 50 против 100 | построены обе | у мелкого линий больше: сетка мерит юниты, значит движется вместе с ними |
| `grid.own-ink-and-never-the-box-outline` | сетка и контур коробки | прочитаны метки | у сетки свой токен. В чернилах контура линейка была бы того же цвета, что и предмет, который она мерит, и включать оба стало бы бессмысленно |
| `grid.too-fine-to-read-is-not-drawn` | эталон 3px и 0 | построена сетка | пусто: ниже нескольких пикселей это заливка, прячущая сцену, а не сетка |
| `scene.grid-toggle` | две сцены на странице | нажата сетка у одной | включилась у неё одной, и второй слой при этом не включился |
| `e2e.grid-reaches-the-glass` | `Bounded/Square` | сетка включена и выключена | картинка изменилась и вернулась. План вправе быть прав и не доехать до холста — решает только стекло |
| `marks.off-by-default` | узел с коробкой, отладка выключена | отметки посчитаны | пусто: инструментальный слой появляется потому, что его попросили, а не сам |
| `marks.a-box-becomes-visible` | тот же узел, отладка включена | отметки посчитаны | одна отметка. Ради этого слой и заведён: `Bounded` не рисует ничего, и до кнопки коробку приходится принимать на веру |
| `marks.the-origin-is-drawn` | узел с многоугольником, смещённым от нуля | включён отладочный слой | перекрестие стоит в НАЧАЛЕ, а не в середине коробки. `at` ставит именно эту точку, и поворот будет вокруг неё; пока её не рисовали, о смещении сообщал бы только объект, улетевший при первом повороте |
| `marks.no-box-no-mark` | узел без `Bounded` | отметки посчитаны | не обведён — обводить нечего |
| `marks.a-rect-is-four-corners` | `rect 2×1`, юнит 100 | отметка посчитана | четыре угла в пикселях вокруг места, где узел стоит |
| `marks.a-circle-is-a-polygon` | `circle{r:0.5}` | отметка посчитана | многоугольник, все точки на радиусе. Форма разрешается в ТОЧКИ здесь, поэтому рендерер не читает сорт — `guard.no-kind` переживает появление второго рисующего |
| `marks.a-poly-keeps-its-points` | треугольник | отметка посчитана | его собственный контур, а не описанный прямоугольник |
| `marks.follow-the-layout` | два ребёнка под `row` | отметки посчитаны | обводки стоят там, куда РАСКЛАДКА поставила узлы |
| `plan.a-box-alone-draws-nothing` | Bounded без Surfaced | план построен | пусто: ни бледной рамки, ни отладочного прямоугольника. Коробка настоящая и невидимая |
| `plan.surfaced-draws-one-quad` | Bounded + Surfaced | план построен | ровно одна фигура |
| `plan.the-root-sits-in-the-middle` | один узел, вьюпорт 800×600 | план построен | центр `400,300` — на это опирается каждая страница каталога |
| `plan.units-become-pixels-once` | `plate` (0.03 бордер, 0.08 радиус), юнит 100px | план построен | `3` и `8` пикселей: конвертируется КАЖДАЯ длина, а не только размер |
| `plan.an-unregistered-record-is-skipped` | ссылка на незарегистрированную поверхность рядом с исправным узлом | план построен | пропущена только висящая ссылка; исправный узел нарисован |
| `plan.a-record-without-a-stroke-still-fills` | `plate` и `bare` | оба построены | у второго нет бордера, габариты те же |
| `plan.restyle-reaches-every-node-at-once` | три узла на `plate` | запись перерегистрирована без бордера | бордер исчез у всех троих, и ни одна коробка не сдвинулась |
| `plan.z-orders-the-paint` | дети с z=5 и z=1 | план построен | порядок по высоте, равные — в порядке дерева |
| `plan.the-contour-comes-down-as-points` | узел с формой | план построен | контур приходит ТОЧКАМИ: рендереру не на что ветвиться, и `guard.no-kind` переживает второго рисующего |
| `plan.the-radius-rounds-the-contour-not-the-box` | запись с радиусом | план построен | скруглены точки контура, коробка цела: радиус — дело краски, а не занятого места |
| `plan.a-dashed-stroke-arrives-already-cut` | запись с пунктиром | план построен | список полилиний в пикселях. Резать в рендерере значило бы резать там, куда тест не дотянется |
| `plan.layers-come-down-in-order` | запись в несколько слоёв | план построен | снизу вверх, тем же порядком, каким записаны |
| `marks.follow-the-field` | узел с отметками | план построен | отметки идут за полем, а не за отдельной настройкой рядом |
| `plan.baking-keeps-the-stroke-the-width-it-was-authored` | запечённый узел с масштабом | обводка прочитана | ширина та, что объявлена: это `vector-effect: non-scaling-stroke` и вся разница между режимами |
| `plan.baking-cuts-the-dashes-again` | запечённый узел с пунктиром | штрихи прочитаны | нарезаны заново по сложенному контуру, а не отображены — иначе масштаб растянул бы узор, который по определению не тянется |
| `plan.a-lifted-container-lifts-its-children` | контейнер z=10, ребёнок z=1 | ребёнок в плане | 11 — подняли пачку, поднялась вся пачка |
| `origins.child-is-owner-plus-layout` | владелец в `2,0`, ребёнок в `1,1`, раскладка `free` | позиции посчитаны | `3,1` — смещения складываются |
| `origins.a-placing-layout-wins` | ребёнок с `at 50,50` под `row` | позиции посчитаны | раскладка переписала позу, а не сложилась с ней |
| `origins.deep-chain` | три уровня со своими смещениями | позиции посчитаны | каждый уровень добавил своё |

## UNIT · оболочка каталога

`vitest + jsdom` · 46 кейсов, расписано 46

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
| `scene.a-rerender-feeds-the-scene` | стори вызвана повторно с тем же id | построена сцена | вернулась ТА ЖЕ сцена с тем же `view`, в ней новое дерево: аргумент — это новые данные, а не новая сцена |
| `scene.settings-survive-new-data` | выбран эталон 34 и включены bounds | стори вызвана повторно | обе настройки на месте — зритель не менялся |
| `scene.a-tree-swap-redraws` | сцена с нарисованной плашкой | корень подменён на голый узел | план опустел: подмена объявляет себя, иначе новое дерево появилось бы на следующем постороннем событии |
| `scene.toolbar-follows-language` | строка тулбара | переключён язык | подписи перечитаны, а не вшиты |
| `textSize.pins-the-root` | документ каталога | стиль установлен | раздувание шрифта выключено, с префиксом, который слушают телефоны. `100%`, а не `none`: последний на iOS отбирал ещё и щипковый зум |
| `textSize.pins-once` | стиль уже стоит | установлен повторно | одно правило, а не второе такое же: превью ставит его при загрузке модуля, менеджер — на своём старте |
| `textSize.both-documents` | исходники менеджера и превью | просканированы | закрепляют оба. Каталог — два документа без общей таблицы стилей, и в первый раз менеджер был пропущен: панель «Код» приходила правильной и удваивалась на первом же переключении вкладки, пока проза рядом стояла на месте |
| `inspector.bus-late-subscriber` | сцена уже построена | панель подписалась после | получила отчёт: сцена ПУБЛИКУЕТ, а рисует кто хочет |
| `inspector.bus-gone-scene` | сцена уничтожена | отчёты прочитаны | её больше нет: мёртвая сцена не говорит за дерево |
| `inspector.markup-is-pure` | список узлов | разметка построена | без сцены и без документа — та же разметка идёт и в панель менеджера, и под канвас доков |
| `inspector.markup-empty` | ни одной сцены | разметка построена | пустое дерево, а не падение |
| `inspector.scene-named-after-story` | страница доков | сцены построены | каждая названа своей стори, и блок находит свой канвас |
| `inspector.two-scenes` | две стори на странице | обе опубликовали | не перезаписали друг друга |
| `inspector.open-persists` | блок свёрнут | открыта другая стори | свёрнутость запомнена |
| `inspector.tab-starts-on-the-tree` | карточка под сценой, выбора ещё не делали | открыта | показано дерево: в этом срезе это единственное, что у сцены есть показать |
| `inspector.tab-persists` | выбрана вкладка «controls» | открыта другая стори | выбор запомнен |
| `inspector.tab-forgets-a-name-that-is-gone` | в localStorage лежит вкладка, которой больше нет | прочитана | дерево, а не пустая карточка без объяснений |
| `source.is-the-story` | стори | сниппет построен | это ИСХОДНИК, а не отрендеренный DOM |
| `source.imports` | сниппет | прочитан | сказано, откуда имена, иначе читается как магия |
| `source.scene-becomes-mount` | сниппет со `scene(...)` | прочитан | переписан в `mount`: `scene` живёт только на этом сайте, читатель его не импортирует |
| `source.imports-follow-the-rewrite` | тот же сниппет | прочитана строка импорта | импортируется `mount`, потому что показан `mount` |
| `source.a-story-becomes-a-program` | стори с `render` и `parameters` | сниппет | обёртки нет: ни `render:`, ни ключей доков, тело с нулевой колонки |
| `source.args-become-constants` | стори с `args` | сниппет | каждая ручка — `const`, на который тело по-прежнему ссылается |
| `source.a-comma-in-a-name-is-text` | арг со значением `"hand, discard"` | сниппет | целый: сканер читает синтаксис, запятая внутри строки ничего не заканчивает |
| `source.plain-code-is-left-alone` | сниппет, уже являющийся программой | прочитан | не тронут: разворачивают стори, а не код |
| `source.no-orphan-hint` | стори, из которой нечего извлечь | сниппет | пусто, а не одинокая строка `mount` |
| `source.keeps-a-story-without-parameters` | стори без параметров | сниппет | не тронут: «нечего вырезать» не повод переписывать |
| `code.a-paint-option-is-part-of-the-program` | стори с настройкой отрисовки | сниппет | настройка в коде: она меняет то, что читатель видит, значит она часть программы |
| `code.a-scene-option-that-is-not-a-paint-option-stays-out` | стори с настройкой витрины | сниппет | её нет: читатель не может её импортировать, и в его программе ей не место |
| `scene.dispose-retires-only-itself` | сцена, вытесненная следующей | закрыта | общие ресурсы не тронуты: закрывшая за собой шину сцена гасит дерево той, что стоит на экране |
| `locales.prose-is-a-bundle-key` | текст страницы | прочитан | это ключ, а не строка: проза, впечённая в стори, не может пойти за переключателем языка |
| `locales.lines-join` | абзац из нескольких строк | собран | склеен так, как читается, а не как записан |
| `controls.a-transform-is-exact-on-the-handles` | вставленный путь и рычаги построителя | применены | точки И управляющие точки преобразованы одинаково: криво преобразованная кубика выглядит как чужая форма |
| `controls.a-literal-colour-beats-the-token` | и токен, и литерал | запись собрана | побеждает литерал. В этом и урок: токен идёт за темой, литерал — нет |
| `controls.a-type-badge-is-not-guessed` | контроль каждого вида | прочитан значок типа | взят С КОНТРОЛЯ: шестьдесят подписей — шестьдесят шансов написать `number` рядом с текстовым полем, и никто не заметит |

## UNIT · the two measures

`vitest` · 8 кейсов, расписано 5

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `unit.the-desk-has-none` | the whole src tree | scanned for screen fractions outside HUD | zero hits — desk sizes are world numbers, the camera fits them |
| `unit.hud-etalon` | the HUD etalon changed 46→60 | HUD and table measured | HUD sizes change, table sizes do NOT — two different mechanisms, no interference |
| `unit.override-local` | a user lowers the etalon | the state inspected | nothing travels: sizes in units are the truth, pixels are per viewer |
| `unit.boxfit-ported` ⏳ | a labelled box | preset vs content fit, min/max clamps | matches client2 `ui/boxFit` exactly — one arithmetic for button, drop zone and badge |
| `viewer.hud-unit-override` | зритель с заданным эталоном HUD | юнит посчитан | берётся заданный, а `auto` СНИМАЕТ переопределение, а не пишет число, похожее на его отсутствие |

## UNIT · границы по сетке

`vitest` · 15 кейсов, расписано 15

Слой заведён после разбора: остальные секции выросли ПРАВИЛО ЗА ПРАВИЛОМ — каждая строка отвечает
закону, который кто-то записал. Целый класс случаев так не появляется никогда, потому что «а если
их ноль» никто в законы не пишет. Здесь сетка: **ZOMBIES** (zero · one · many · boundary ·
interface · exception · simple) поперёк **CORRECT** (conformance · ordering · range · reference ·
existence · cardinality · time), пройденная по тому, что берёт каждая операция — ИМЯ и МЕСТО.

Сетка окупилась в первый заход: три дефекта, все три молчаливые.

| id | дано | когда | тогда |
|---|---|---|---|
| `node.id.empty-is-not-an-id` | пустая строка как идентификатор | узел создан | бросок. Существование: назвать нечем, `byId` двух таких не различит, а между клиентами такое имя не произнести |
| `node.id.any-shape-of-name` | хеш, путь, другой алфавит, пробел, десять тысяч знаков | узел создан | принято как есть. Кит идентификатор не разбирает, а ограничение длины было бы правилом не того слоя: id может прийти от сервера |
| `tree.duplicate-empty-ids` | два узла с одним именем | второй добавлен | бросок. ЭТО И НАШЛОСЬ: проверка была `if (clash)`, и для единственного ложного идентификатора — пустой строки — читалась как «нет столкновения». Дерево принимало два узла, отвечающих на одно имя |
| `tree.remove-what-is-not-there` | чужой ребёнок; свой, уже убранный | убран | не бросок ни разу: `remove` — утверждение о КОНЕЧНОМ состоянии, а оно одинаково |
| `tree.add-remove-repeats` | один узел | сто раз внутрь и наружу | индекс чист на каждом круге. Забытая запись или неснятый `parent` вылезли бы на втором проходе и больше нигде |
| `tree.a-deep-chain-does-not-blow-the-stack` | цепочка в 5000 | обход и цепочка владельцев | ровно 5000. Стопка в тысячу карт — это цепочка в тысячу, и рекурсивный обход умирает на ней стеком, а не неверным ответом |
| `compose.the-same-atom-twice-is-one` | атом составлен дважды | прочитан | один, и побеждает второй: атом — это набор полей, повторное составление их переобъявляет |
| `host.mount-twice-into-one-box` | один контейнер, два монтирования | первый закрыт | второй жив и рисует. Иначе второе закрытие вычищает коробку, в которой ещё работает первый |
| `host.mount-unmount-repeats` | пятьдесят кругов монтирования | коробка измерена | пуста каждый раз. Что этот слой увидеть НЕ может — память GPU; это `e2e.a-rebuild-does-not-leak-a-context` на настоящем стекле |
| `host.setRoot-after-unmount` | закрытый хост | накормлен новым деревом | не бросок и не воскрешение: так ведёт себя опоздавший кадр, и бросок превратил бы безобидную гонку в падение |
| `host.a-viewport-of-nothing` | контейнер 0×0 | эталон посчитан | не ноль. ЭТО И НАШЛОСЬ: четверть пикселя округлялась в ноль, план делить на ноль не станет — он выдаст нулевой масштаб, и сцена молча исчезает на скрытой вкладке |
| `offset.a-move-past-the-middle-draws-nothing` | коробка 1×1 | сдвинута внутрь на 2 | пусто. ЭТО И НАШЛОСЬ: выходил вывернутый квадрат 3×3, и пунктирный бордюр рисовался ВОКРУГ узла втрое больше него |
| `dash.longer-than-the-contour` | штрих длиннее периметра | нарезано | один штрих на весь контур, а не ноль и не бесконечный цикл |
| `dash.a-negative-pattern-draws-nothing` | отрицательная длина штриха | нарезано | пусто: узор, которого не бывает, рисует ничего |
| `scene.two-scenes-one-id` | две сцены под одним именем | вторая построена | это КОРМЛЕНИЕ первой, а не вторая витрина: один холст, один контекст WebGL. Браузер отдаёт около дюжины, и один протяг ползунка потратил бы их все |

## PROPERTY-BASED

`fast-check` · 14 кейсов, расписано 5

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `prop.compose.closure` ⏳ | a random subset of all 19 atoms, CLOSED over requirements | composed and mounted | never throws; caps equals the closure exactly |
| `prop.compose.starved` ⏳ | a random subset NOT closed | composed | every atom whose requirement is missing is absent — never half-present |
| `prop.caps.reflect` ⏳ | a random closed subset | `caps(el)` compared to it | exactly equal for every generated case |
| `prop.conflict.stable` ⏳ | a random subset | conflict resolution run twice | same verdict both times — resolution is deterministic |
| `prop.resolve.assoc` ⏳ | a random tree of depth ≤6 | resolve run at every node | summed fields equal the path sum; inherited equal the nearest ancestor |

## ARCHITECTURAL GUARDS · source-scan

`vitest + fs scan (like argNames.test.ts)` · 28 кейсов, расписано 28

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
| `guard.caps-only-door` ⏳ | systems code | scanned for direct `def.flip/def.drag/...` | zero — only `elementCaps` may read them |
| `guard.no-parent-namespace` ⏳ | the whole src tree | scanned for `parent.` as a field path | zero — an owner's fields are ordinary fields of another node |
| `guard.three-planes` ⏳ | every story in the catalog | its controls classified | Controls holds only fields; State holds nothing serializable as spec; Viewer writes no state |
| `guard.english-only` | identifiers & comments | scanned for Cyrillic | zero outside `locales/` — the bundles and the test asserting what they say |
| `guard.kit-knows-no-localization` | the kit tree | scanned for locale/i18n/TextSource/translate and json imports | zero: not the words, and not the notion either — a caption arrives already written |
| `guard.no-language-list` | the kit tree | scanned for "en"/"ru" literals | zero — a game adding a language must never have to edit the kit |
| `guard.view-not-canvas` | всё дерево исходников | скан | ни одного `HTMLCanvasElement` под именем canvas |
| `guard.id-is-opaque` | всё дерево | скан на `id ===` и разбор идентификатора | ноль. client1 умер от обратного: `id === "deck"` по всему движку |
| `guard.no-font-shorthand` | tsx каталога | скан на `font:` | ноль: собранное из токенов сокращение не применяется и НЕ сообщает об ошибке — элемент молча наследует шрифт страницы |
| `guard.docs-prose-is-translated` | стори каталога | скан на `description: {` | ноль: встроенная проза попадает в индекс на сборке и языку уже не подчиняется |
| `guard.no-pixels-in-spec` | дерево кита | скан на `\d+px` | ноль вне хоста: размеры в юнитах, пиксели знает только стекло |
| `guard.no-raw-colour` | всё дерево | скан на hex и `rgb(` | ноль вне `theme.ts`. client2 умер от обратного: 261 сырой цвет против ~20 чтений темы |
| `guard.one-accent` | каждая палитра | посчитаны акценты | ровно один. Оттенки ВЫВОДЯТСЯ, вторым hex не объявляются |
| `guard.no-desk-called-table` | код и бандлы | скан на «table» как мебель | ноль: стол — Desk, а table значит таблицу и ничего больше |
| `guard.every-field-has-a-control` | каждый зарегистрированный атом | сверен с `gkFields` каталога | у каждого поля есть контроль или своя сцена. Именно это правило каталог и нарушил: `Surfaced` объявлял три поля и предлагал одно |
| `guard.spec-holds-no-functions` | `core/atom.ts` | прочитан | проверка есть и в рантайме: значение, собранное на лету, скану не видно |
| `guard.no-ambient-id-source` | the whole src tree | scanned | no module counter in `node.ts`, no `resetIds` anywhere (source-scan) |
| `guard.layering` | every source file | its imports read | they point DOWN the ladder only: core→core, render→core (source-scan) |
| `guard.public-api` | `src/index.ts` | scanned for the names a consumer needs | all present: a standalone imports "game-kit", never a path into src (source-scan) |

## INTERACTION · play functions

`@storybook/test + userEvent, Vitest browser mode` · 28 кейсов, расписано 17

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `play.drag.commit` ⏳ | a Draggable element on a board | userEvent drags it to a slot and releases | it lands in the pointed slot; `dragStarted`/`dropAccepted` fired in order |
| `play.drag.reject-home` ⏳ | a drop the zone rule denies | released over the zone | flies home; ends at origin; `dropRejected` fired |
| `play.flip.by-echo` ⏳ | a face-down card | flip requested | stays old-side until the server echo, then flips (never blinks the face) |
| `play.keyboard.actionable` ⏳ | a Button (Actionable+Focusable) | Tab then Enter/Space | focuses, then fires the command — operable without a pointer |
| `play.toggle-atom.live` ⏳ | the Element scene | Bounded toggled off in Controls | not just the shadow: Surfaced, Draggable and ShadowCaster VANISH with their fields, and the scene is no longer an Element |
| `play.state-plane` ⏳ | the State tab | drag / flying picked | they apply, and they are absent from the spec payload — you cannot author them |
| `play.viewer-plane` ⏳ | viewer switched owner → other on a Private node | the canvas | the node is gone from the picture; the spec is untouched and nothing was sent |
| `e2e.checks-run-only-when-asked` | стори каталога и обе стори раздела Tests | открыты все | у каталожной нет ни одного шага; у Tests/Node и Tests/Bounded каждый шаг виден по имени и без падений. Выключатель — САМ РАЗДЕЛ: открыть страницу и есть просьба, а Storybook играет `play` на каждом рендере, так что вне раздела проверок нет вовсе |
| `play.node.it-is-there` | карта в дереве | пиксель в середине холста | не цвет стола. Единственное измерение, которого не сделает ни один слой выше: jsdom не знает WebGL, и «план велит нарисовать квадрат» — не то же, что «квадрат на стекле» |
| `play.node.it-goes` | то же дерево без карты | скормлено сцене | середина читается как голый стол, детей ноль |
| `play.node.it-comes-back` | дерево снова с картой | скормлено | карта на месте, и холст ТОТ ЖЕ. Новое дерево — новые данные: пересборка витрины потратила бы второй контекст WebGL |
| `play.node.repeats` | двадцать кругов туда-обратно | пиксель сверен с первым | не сдвинулся. Рендерер, который НАКАПЛИВАЕТ — спрайт добавлен вместо замены, слой отрисован дважды — верен на первом кадре и неверен на двадцатом |
| `play.debug-layer` ⏳ | Bounded on, Surfaced off, hit layer enabled | the canvas | an invisible node becomes inspectable — the only way to see a box |
| `play.bounded.the-outline-is-the-only-ink` | Bounded без Surfaced, отладочный контур включён | весь буфер прочитан | чернила есть, а середина коробки читается как стол: у Bounded нет заливки, и закрашенный квадрат означал бы, что отладочный слой врёт про атом |
| `play.bounded.size-is-on-the-glass` | `rect{1,1}` заменён на `rect{2,1}` | габарит чернил сверен | ширина выросла примерно вдвое, высота — нет: коробка, растущая по обеим осям от одноосной правки, это масштаб, а не размер |
| `play.bounded.every-shape-draws-its-own-pattern` | квадрат → круг → звезда → путь на одном холсте | снимки соседей сверены | каждый узор отличается от предыдущего. Слой, боксующий всё подряд, прошёл бы проверку размера и упал ровно здесь: круг и его габаритный квадрат различаются только рисунком штриха |
| `play.bounded.no-box-no-ink` | узел без `Bounded` | чернила посчитаны | ноль, а не «меньше»: обводить нечего, и любой уцелевший пиксель — отметка, которую слой забыл забрать |

## STATE MATRIX · combinatorics

`generated table, vitest` · 24 кейсов, расписано 5

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `matrix.pairs` ⏳ | every declared atom × every other (curated interacting pairs, not the full 2^19) | each pair evaluated | the conflict table below is the oracle; each row is one assertion |
| `matrix.transitions` ⏳ | atom sets swapped in sequence (Bounded→+Surfaced→+Container) | switched | caps change fully; the id is preserved across every transition |
| `matrix.starved` ⏳ | every atom with a requirement, requirement removed | evaluated | absent, with its fields; never inert-but-present |
| `matrix.state-x-spec` ⏳ | each State value × a few atom sets | evaluated | state never changes which atoms exist; the two planes do not leak into each other |
| `matrix.dropped` ⏳ | the combinations NOT enumerated | logged explicitly | the report names what was skipped — no silent 'we covered everything' |

## STATE PLANE · what happens vs what is authored

`vitest` · 12 кейсов, расписано 4

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `state.pose-authorable` ⏳ | rest · lifted · held | assigned from a spec | accepted — these three are a pose |
| `state.happens-not-authorable` ⏳ | drag · flying · settling | assigned from a spec | rejected by the validator: they happen to the node, they are not written |
| `state.idle-not-z` ⏳ | idle breathing on | z and the shadow measured | z unchanged, shadow unchanged in size — breathing is decoration (client2 elevation.ts:21) |
| `state.flags-independent` ⏳ | selected · focused · concealed · frozen | toggled in every order | independent; none of them adds or removes an atom |

## VISUAL REGRESSION

`Chromatic — pixel diff per story` · 40 кейсов, расписано 4

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `visual.states` ⏳ | each meaningful atom combination | snapshotted | diffed against baseline; a pixel change fails the build until approved |
| `visual.themes` ⏳ | light and dark | both captured per state | the accent works on both grounds; contrast stays legible |
| `visual.viewports` ⏳ | 375 / 768 / 1280 px | captured | no horizontal body scroll; wide content scrolls inside its own box |
| `visual.locales` ⏳ | en and ru | captured | the ru caption does not clip the button; layout survives longer strings |

## ACCESSIBILITY

`axe-core via the a11y addon` · 14 кейсов, расписано 4

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `a11y.roles` ⏳ | interactive elements (Button, Toggle, Input) | axe scans the DOM | correct role/name/state; WCAG violations fail the run |
| `a11y.focus-order` ⏳ | a form-like scene | tabbed through | focus order is logical; every focusable has a visible ring |
| `a11y.contrast` ⏳ | text on every surface + both themes | measured | meets AA; the muted grey is not below threshold |
| `a11y.motion` ⏳ | prefers-reduced-motion on | the settle animation | is reduced/instant, not forced |

## NETWORKING · truth vs pretty

`vitest + a fake Colyseus room + a fake clock` · 24 кейсов, расписано 6

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `net.predict.position` ⏳ | a local drop | position applied | optimistic and immediate — reversible, so flying home reads as the answer |
| `net.echo.facing` ⏳ | a flip | side change | waits for the echo — never predicted, so it cannot blink and hide |
| `net.keep.travels` ⏳ | a free-table pose (angle 15°) | state serialized | the kept angle is on the wire; derive-facets (grid/fan) are not |
| `net.late-joiner` ⏳ | player C joins after a move | C's projected scene | matches A and B exactly — truth is state, never a trajectory C never saw |
| `net.revision.stale` ⏳ | an old echo arrives after a newer local rev | the incoming patch | is ignored (revision guard) — the picture does not jitter back |
| `net.contenders` ⏳ | two players grab the same top card | messages processed one at a time | first gets the top, second the next — no extra logic, no double-take |

## LIFECYCLE & PERFORMANCE

`vitest + a headless Pixi fake` · 16 кейсов, расписано 5

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `life.mount-unmount` | mount then destroy | the scene inspected | nothing left behind: no sprites, listeners, or timers leak |
| `life.idle-gate.sleep` ⏳ | no animation running | the render loop | goes to sleep — no draws while nothing moves |
| `life.idle-gate.wake` ⏳ | a spin/settle starts | the loop | wakes; and every continuous animation is registered so it cannot fall asleep under one |
| `perf.compose-budget` ⏳ | composing 500 elements | time measured | under the frame budget; no O(n²) in caps resolution |
| `perf.no-leak-repeat` ⏳ | 1000 mount/unmount cycles | heap watched | flat — no growth across cycles |

## SERIALIZATION / SCHEMA CONTRACT

`vitest` · 11 кейсов, расписано 4

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `schema.no-functions` | an element spec | serialized to JSON and back | round-trips — the spec is data, holds no functions |
| `schema.spec-vs-state` ⏳ | spec vs state | classified | truth (deck order, facing) travels the schema; the spec is static, sent once |
| `schema.set-array-write` ⏳ | writing a full set | done via clear()+push loop | length is exact; setAt-past-length appends — that trap is guarded |
| `schema.permutation` ⏳ | a client-sent reorder | validated | `isPermutationOf` passes only if the card set is unchanged |

## REGRESSION GUARDS · known traps

`vitest — one test per historical bug` · 10 кейсов, расписано 6

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `trap.index-missing-but-build-green` ⏳ | `options.storySort` задан ИМПОРТИРОВАННЫМ именем | `storybook build` | индексатор читает `preview.ts` статически, имя не резолвит: WARN, индекс пропущен, **выход 0**. Каталог собран и пуст. Литерал обязан быть на месте |
| `regress.deck-bloat` ⏳ | the setAt-past-length append bug | a full-deck write | never grows the array to 60 — the exact 'deck bloated' bug stays dead |
| `regress.kind-ignored-caps` ⏳ | the client2 bug where the board read kind, not caps | behavior driven | reads caps only; a source-scan makes a relapse fail |
| `regress.shadow-double` ⏳ | the 'shadow larger than the card' math bug | elevation computed | z (source) and screen-position stay separate; height counted once |
| `regress.frozen-base` ⏳ | the client1 fan-z bug | a base read once at animation start | forbidden: resolve is read at APPLY time, and the fan may collapse mid-flight |
| `regress.viewable-vs-surfaced` ⏳ | the atom whose toggle had no parameters | the model inspected | Surfaced draws, Viewable is the camera atom; no element carries Viewable |

## E2E

`Playwright against the built Storybook` · 42 кейсов, расписано 42

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
| `e2e.a-box-alone-draws-nothing` | сцена `Bounded/Square` | то же сравнение | пиксель в пиксель: коробка настоящая и невидимая |
| `e2e.hud-unit-drives-the-picture` | `Surfaced/Plate` | эталон переключён 34 → 60 в тулбаре сцены | картинка изменилась: эталон это размер, и он виден |
| `e2e.layout-decides-the-picture` | `Container/Free` и `Container/Row` | обе открыты | различаются — деревья одинаковы вплоть до поз детей, различается одно слово `layout` |
| `e2e.theme-reaches-the-canvas` | `Surfaced/Plate` в тёмной и светлой | обе открыты | различаются: у канваса нет каскада, токен палитры резолвит сам рендерер |
| `e2e.bounds-layer-reveals-the-box` | `Bounded/Square` — сцена, где не нарисовано ничего | кнопка отладки нажата | на стекле появился контур там, где модель всё это время утверждала коробку. Выше этого слоя показать это нечем: выше никто не рисует |
| `e2e.the-manager-watches-its-own-bundles` | открыт каталог | прочитан `data-gk-watched`, затем тихий возврат во вкладку | больше нуля, и перезагрузки нет. Менеджер — SPA: свой JS он не перезапрашивает никогда, а телефон усыпляет вкладку и восстанавливает её из памяти — вчерашние панели и вчерашний список стори, и ни одного признака на экране. Список наблюдаемого пуст — проверка соглашается сама с собой навсегда; первая версия искала `script[src]`, а Storybook подключает бандлы через `<link rel="modulepreload">` |
| `e2e.the-code-panel-scrolls` | `Bounded/Bounds`, 28 строк исходника | найден скроллящийся бокс и прокручен | прокручивается, и в сниппете нет `scene(`. Подсветка растёт по содержимому и несёт свой скроллер внутри; обёртка `height:100%; overflow:hidden` её просто обрезала — до пятнадцатой строки было не добраться. Разметку видит только браузер |
| `e2e.controls-follow-the-language` | `Bounded/Square` | переключён язык через канал | описания контролов по-русски, английских не осталось, и адрес несёт `locale:ru`. Storybook нормализует `argTypes` один раз при подготовке стори и держит прочитанное, поэтому описания сами за переключателем не идут — превью перезагружается. Тест сторожит и то, что перезагрузка ОДНА |
| `e2e.a-prose-table-is-readable-and-stays-in-its-box` | страница `Engine/Sizes` на 390px | прочитаны вычисленные стили ячейки и ширина документа | цвет ячейки РАВЕН цвету прозы, полоса не белая, документ не поехал вбок. Таблицу в прозе красит сторибучный лист из своей СВЕТЛОЙ темы: каждая вторая строка выходила белой с тёмным текстом. Правила, что были, красят текст, а полоса — это фон |
| `e2e.engine-keeps-its-scene-on-the-page` | страница `Engine/Baking nodes` в режиме дока | открыта, прочитано дерево сайдбара | канвас на странице есть, отдельной ступени в лестнице нет. `!dev` молчит в обе стороны: либо ступень вернулась, либо страница осталась прозой про то, чего никто не видит |
| `e2e.a-snippet-names-nothing-of-this-website` | `Surfaced/Plate`, панель «Код» | прочитан текст сниппета | ни `shapeArgs`, ни `RECORD_ARGS`, ни `recordOf`, ни `PLATE`; есть `registerSurface("story.plate", { … })` с записью-литералом. Панель существует, чтобы её копировали, значит каждое имя в ней обязано быть у читателя. Отказ тихий и выглядит как код |
| `e2e.controls-are-there-and-live` | стори с контролями | панель открыта, значение изменено | картинка поехала: контроль, который не доезжает, неотличим от контроля, которого нет |
| `e2e.a-rebuild-does-not-leak-a-context` | одна стори, много изменений аргументов | пересчитана | один WebGL-контекст: браузер отдаёт около дюжины, и один протяг ползунка потратил бы их все |
| `e2e.id-is-an-input` | стори с полем идентификатора | введено имя | доехало до дерева — идентификатор задаётся снаружи, а не скрытым счётчиком |
| `e2e.a-dead-link-lands-somewhere` | ссылка на страницу, которой нет | открыта | посадка на что-то осмысленное, а не пустой каталог без объяснений |
| `e2e.bakeable-keeps-its-stroke` | `Engine/Baking nodes` при `scale: 2`, два узла: с `Bakeable` и без | измерена толщина верхней обводки в каждой половине кадра | у живого вдвое толще. Единственное видимое следствие атома, и план тут не свидетель: свёрнутую матрицу он показать может, дошло ли это до стекла — нет |
| `e2e.a-picture-reaches-the-glass` | `Surfaced/Plate`, картинка и `fit` | сняты три кадра: без картинки, `contain`, `cover` | все три различаются. Текстуры приезжают асинхронно, кадр их не ждёт — «план поставил картинку» и «картинка на стекле» разные утверждения |
| `e2e.a-circle-is-painted-round` | `Surfaced/Shapes`, круг | углы описанного прямоугольника прочитаны с холста | пусты. Пока план отдавал `w/h/radius`, рендерер рисовал `roundRect`, и круг выходил квадратом — модель при этом была права. Форма доезжает точками, и доказать это может только стекло |
| `code.a-spread-argument-survives-whole` | стори с `...spread(x, { a: 1 })` в `args` | развёрнут сниппет | спред цел. Первое двоеточие искалось где угодно и резало ВНУТРИ вызова: `const ...spread(x, { a = 1 }` — невалидно, но выглядит как код |
| `code.a-whole-argument-stays-whole` | `render: (a) => … a.w` | развёрнут сниппет | `const a = { … }`, а не россыпь констант: тело продолжает спрашивать `a`, и ничто здесь так не называется |
| `code.a-catalog-helper-becomes-its-value` | стори, чей render зовёт `shapeOf(a)` | развёрнут сниппет с живыми аргументами | вместо вызова стоит сама форма, а скормленные ей аргументы убраны из константы. Панель ведёт рендер, поэтому форму он выписать не может — но читателю нужна именно она, а `shapeOf` он не импортирует. Панель рисует МЕНЕДЖЕР: регистрация только на стороне превью не доезжает никуда, и ровно так это один раз и молчало |
| `code.no-arguments-no-inlining` | тот же сниппет без контекста стори | развёрнут | вызов остаётся: придуманная здесь форма — форма, которой никто не выбирал |
| `code.a-multiline-render-still-reaches-mount` | `render` в несколько строк | развёрнут сниппет | `mount(...)`, без `scene(` и без голого `return`. Переписчик был построчным, а балансировка скобок берёт ПЕРВЫЙ аргумент — второй у `scene` каталожный, и `mount` о нём не знает |
| `controls.identity-changes-nothing` | форма и единичное преобразование | применено | тот же объект: дефолт обязан быть невидимым |
| `controls.offset-moves-the-shape-off-its-origin` | прямоугольник со сдвигом | применён | ушёл от нуля и остался там; видно это перекрестием отладочного слоя |
| `controls.zero-is-typeable` | `shapeArgTypes()` | прочитан порог числовых контролов | ноль. Стоял 0.1 — без причины, которую кто-либо мог назвать, — и законная форма модели была в каталоге ненабираемой: тот же провал, что и непредложенный `poly` |
| `controls.every-control-names-its-field` | `shapeArgTypes()` | у каждого контрола прочитана секция | `bounds` у всех. Плоским списком панель была кучей — `kind, w, h, r, corners…` и ни слова о том, чьи они, а имя поля не встречалось нигде; читатель не мог сказать, что атом вообще держит, и так это и нашлось |
| `e2e.dashes-multiply-and-do-not-stretch` | `Surfaced/Plate` с пунктиром, ширина 1.4 и 3 | посчитаны разрывы вдоль верхней кромки и толщина обводки | штрихов стало больше, толщина та же. Закон, на котором держится вся запись. Каждый замер — в СВОЁМ контексте браузера: после смоук-теста, открывающего все стори, второй WebGL-контекст в одной странице приходил пустым, и ноль штрихов читался как поломка кода |
| `e2e.the-origin-is-the-middle-of-the-block` | `Surfaced/Plate` | центр закрашенных пикселей сверен с центром всего блока сцены | совпадает с точностью до пикселя. Начало координат сцены — центр ВИДА, поэтому любая хрома, забирающая высоту, двигает всю картину: тулбар стоял строкой грида, и квадрат сидел на полстроки ниже середины (15px при 900×640, на телефоне больше). Ни план, ни jsdom этого не видят — плана это не касается вовсе |
| `e2e.toolbar-fits-a-phone` | ширина 390px | правые края контролов сверены с панелью | всё внутри, и панель не прячет переполнение прокруткой. Селект по самой длинной опции выталкивал соседа за экран — это ответ РАСКЛАДКИ, headless его не видит |
| `e2e.sidebar-is-the-ladder` | собранный каталог | боковая панель раскрыта и прочитана | `Basics` раньше `Atoms`, атомы по зависимости. Сортировка живёт в МЕНЕДЖЕРЕ: `index.json` несёт стори в порядке обнаружения и о показе не знает — headless этого не видит вовсе |
| `e2e.code-sits-beside-controls` | стори в режиме сцены | открыта панель `Code` | сниппет там, и в нём `mount`, а не `scene`: в режиме доков на вопрос «как это написать» отвечает блок под канвасом, а в режиме сцены не отвечал никто |
| `e2e.code-is-read-not-decoded` | панель `Code` на 390px | прокручена по обеим осям | подсветка есть (есть токены), кнопка копирования на месте. Обе беды — цена второй реализации блока, который у сторибука уже есть: серая стена текста и кнопка, позиционированная относительно ПРОКРУЧИВАЕМОГО содержимого |
| `e2e.new-data-keeps-the-viewer` | эталон 34 и bounds включены в сцене | изменён аргумент `w` через панель | обе настройки на месте. Через МЕНЕДЖЕР, потому что контрол живёт там и стори перерисовывается на месте — перезагрузка страницы сбрасывает всё и не доказала бы ничего |
| `e2e.the-card-keeps-its-own-type` | карточка под сценой на странице доков | прочитан шрифт вкладки и текста дерева | моноширинный, наши размеры. Страница доков переопределяет всё внутри ПО ТЕГАМ (правило на тег в `:where()`), и это бьёт шрифт, который родитель просто передаёт по наследству: вкладки выходили шрифтом текста доков в 16px, хотя кнопка вокруг них говорила mono 11px. Класс `sb-unstyled` выводит поддерево из-под того листа |
| `e2e.the-manager-wears-the-tokens` | телефон, сайдбар закрыт при загрузке | прочитан `--gk-space-m` в документе менеджера | он есть. Панели рисуются только через `var(--gk-…)`, а стиль ставился из эффекта компонента настроек — на телефоне тот не монтируется вовсе, и каждое значение резолвилось в ничто. Читать НЕ открывая сайдбар: открытие прячет баг |
| `e2e.code-survives-a-late-opening` | телефон, панельная секция закрыта при загрузке | drawer открыт, выбран `Code` | сниппет на месте. Пока он приезжал СОБЫТИЕМ, панель монтировалась после объявления и не слышала ничего — на десктопе не воспроизводится вовсе, там панель смонтирована раньше стори |
| `e2e.a-docs-page-never-scrolls-sideways` | ширина 390px, открыты контролы | измерена ширина документа | страница не едет вбок: один нежмущийся блок расширяет ВЕСЬ документ, и тогда проза с канвасом уезжают за экран из-за таблицы тремя блоками ниже |
| `e2e.docs-has-controls-too` | страница доков | нажата вкладка «controls» | контролы показаны, дерево спрятано — одна карточка, два ВИДА одной стори, а не две фичи рядом |
| `e2e.a-page-fetches-only-its-own-prose` | страница `Bounded` в собранном каталоге | все её скрипты вычитаны обратно и прочитаны | текст `Bounded` приехал, текст `Root` — нет. Юнит-сторожа не видят страницу, которая из услужливости грузит соседей; здесь спор решает то, что реально попросил браузер. Положительная половина проверки — её собственный контроль: без неё поиск «ничего не нашёл» проходил бы и в случае, когда ищут не там |
| `e2e.story-smoke` | все стори каталога | открыты по очереди в настоящем браузере | ни одной ошибки в консоли и ни одного `pageerror` |

