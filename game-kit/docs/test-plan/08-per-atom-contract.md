## UNIT · per-atom contract

`vitest` · 103 кейсов, расписано 102

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
| `transform.reflect-turns-the-plane-over` | `reflect(θ)` | применён | det −1, самоинверсно, точка на оси неподвижна — то, чего поза дать не может |
| `atom.transformable.angle-adds-up` | стол на 30° и карта на 15° | прочитана цепочка | 45°: ребёнок не может отвернуть владельца |
| `atom.transformable.scale-multiplies` | рука 0.5 и карта 0.5 | прочитана цепочка | 0.25, а у узла без масштаба — 0.5. Нейтральное значение единица, и сумма прочитала бы отсутствие как «пропал» |
| `shapes.a-rect-is-four-runs` | `rect(2, 1)` | прочитаны габарит и точки | 2×1 вокруг нуля: хелпер строит форму на начале координат, как и все остальные |
| `shapes.a-circle-is-an-ellipse-with-equal-radii` | `circle(1)` и `ellipse(1, 1)` | сравнены | совпадают, и точки лежат на окружности с точностью, которую даёт любой редактор. Круг — не сорт и не масштабированное что-то |
| `shapes.an-ellipse-is-not-a-squashed-circle` | `ellipse(1.2, 0.8)` | прочитан габарит | 2.4×1.6 — это общий случай, а круг его частный |
| `shapes.a-polygon-puts-n-corners-on-a-circle` | `polygon(8, 1)` и `polygon(1, 1)` | распрямлены | восемь точек и три: меньше трёх — не форма, а опечатка |
| `shapes.a-star-alternates-two-radii` | `star(5, 1, 0.4)` | прочитаны радиусы точек | десять точек, максимум 1, минимум 0.4 — поэтому нового сорта звезде не нужно |
| `shapes.a-rounded-rect-stays-inside-its-box` | `roundedRect` с радиусом, с огромным радиусом и с нулём | распрямлены | внутри коробки; огромный кламплится в стадион; ноль — ровно обычный прямоугольник |
| `path.joined-starts-where-the-first-ended` | два пути, сшиты | прочитаны сегменты | шов — одно место, а не разрыв и не сдвоенная точка: сегментов ровно столько, сколько было у обоих, и встречаются они в конце первого |
| `path.joining-moves-the-second-whole` | второй путь с изломом | сшит | каждое его место осталось там же ОТНОСИТЕЛЬНО своего старта: путь переносят, а не перерисовывают. Перерисованный сходится на концах и врёт в середине — и это замечают на пятом звене рельса |
| `path.joining-is-a-chain` | три звена | сшиты подряд | третье продолжается от конца второго, а не от начала координат, вокруг которых было нарисовано |
| `line.a-run-out-and-back-encloses-nothing` | `line` из двух мест, и он же с изгибом | посчитана площадь контура | ноль: путь идёт туда и обратно по себе, заливке нечего покрывать. С изгибом тоже — обратный ход разворачивает кубику точно, а не приблизительно |
| `line.bend-is-a-number-not-a-second-kind-of-path` | `bend` 0 и 0.5 | измерено отклонение от хорды | ноль и 0.5: прямая и кривая — одно поле, а не выбор из двух сортов |
| `line.a-bend-holds-both-ends` | `bend` 0.5 | прочитаны концы и габарит | концы на месте, поперёк ровно 0.5: изгиб выгибает пробег, а не переносит его |
| `line.a-path-is-dragged-through-its-places` | `through` из двух мест | распрямлён | путь проходит ЧЕРЕЗ оба, а не мимо них: сплайн, который бы к ним лишь клонился, — другое обещание |
| `line.a-bend-bows-a-path-that-already-curves` | путь с `through` без изгиба и с ним | измерено отклонение | 0.3 и 0.7: изгиб добавляется к местам, а не заменяет их |
| `line.a-head-is-its-own-node` | `arrow` без наконечников и с одним | прочитаны дети | `path`, и `end` только когда на конце что-то стоит; форма пробега при этом не изменилась. Наконечник, вшитый в контур линии, был бы обречён на её краску и на то, чтобы быть путём |
| `line.each-end-has-its-own-size` | `startSize` 0.15 и `endSize` 0.45 | прочитаны габариты детей | каждый свой: концы не обязаны совпадать, и одним общим размером этого не сказать |
| `line.a-head-faces-the-way-the-path-goes` | прямой, вертикальный и изогнутый пробеги | сверено направление | тело наконечника лежит между кончиком и тем, откуда пришёл путь: повёрнутый не туда или не повёрнутый вовсе даёт отрицательное скалярное произведение |
| `line.each-end-wears-its-own-record` | `surface: ink`, `startSurface: trail`, `endSurface: mark` | прочитаны ссылки атомов | три узла — три записи, и концы не обязаны совпадать друг с другом; без просьбы носят запись линии. Отсюда и заливка на волосяной линии, и картинка на конце |
| `line.two-ends-are-independent` | без наконечников, с одним, с двумя, с двумя РАЗНЫМИ | сравнены контуры | точек становится больше, а два разных стоят столько же, сколько два одинаковых, и картинка при этом другая |
| `line.an-unregistered-head-draws-nothing` | имя, которого нет в реестре | построен | ровно как без наконечника: незарегистрированное имя пропускается, а не бросает |
| `line.a-head-stays-within-its-size` | каждый наконечник при 0.2 и 0.5 | прочитан габарит | не вылезает за свой размер, и больший размер действительно больше — иначе контрол, который картинка игнорирует |
| `line.a-new-head-is-a-registration` | `registerHead("tick")` | построен путь с ним | рисуется: пятый наконечник — строка данных, а не ветка в `line` |
| `pose.a-fan-is-symmetric` | `fan(5)` | прочитаны середина и края | средняя карта без позы вовсе, края зеркальны по углу и по `at` и висят НИЖЕ середины: веер, построенный от одного края, прошёл бы «пять карт, шестьдесят градусов» и повесил бы руку набок |
| `pose.a-fan-spread-is-the-whole-arc` | `fan(4, {spread: 90})` и `fan(1)` | прочитаны углы | последняя минус первая — ровно 90: дуга целиком, а не на карту; одна карта — не веер и приходит без позы, а не повёрнутой к краю дуги |
| `pose.a-stack-climbs-evenly` | `stack(3)` со своим сдвигом | прочитаны `at` | по одному сдвигу на карту от честного нуля: толщина — положение, и первая карта не носит `-0` |
| `pose.a-cascade-steps-evenly` | `cascade(4)` со своим шагом | прочитаны `at` | тот же марш с шагом под чтение: `i × step`, точно |
| `pose.a-dealt-pose-writes-no-z` | все три раздачи | прочитаны ключи каждой позы | ровно `at` и `angle`: ни `z`, ни масштаба. Тип это уже держит, но тип стирается — а пресет, протащивший `z`, поднял бы поднятую руку дважды |
| `pose.nobody-is-dealt-nothing` | ноль, минус два и 2.7 карты |роздано | пусто, пусто и две: пустая рука — не ошибка и не одна карта |
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
| `atom.flippable.back` ⏳ | Flippable{back} | shownSurface(faceUp) | face-up→front, face-down→back, empty back→front (never blank). Full layer: [30](30-flippable.md) |
| `atom.private.exclusion` ⏳ | Private + a viewer ≠ owner | the scene is projected | the node is ABSENT from that viewer's picture, not merely face-down |
| `atom.private.vs-back` ⏳ | a face-down card next to a Private one | both projected to another viewer | back: present, face hidden. Private: not in the payload at all. Two different hidings |
| `atom.private.subtree` ⏳ | a Private CONTAINER with children | projected to another viewer | the whole subtree is cut — children never appear ownerless |
| `atom.owned.recall` ⏳ | two boxes of the SAME set on one table | `{eq:[el.box,target.box]}` evaluated | only one's own are recalled; identical cards from different boxes are different nodes |
| `atom.valued.paths` ⏳ | Valued{rank,suit} | a rule reads `el.values.rank` | legal; `el.values.race` in a set without race → validator error |
| `atom.actionable.press` ⏳ | Actionable | press() | emits the bound command; nothing when the atom is absent |
