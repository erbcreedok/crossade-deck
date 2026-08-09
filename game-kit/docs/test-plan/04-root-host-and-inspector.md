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
