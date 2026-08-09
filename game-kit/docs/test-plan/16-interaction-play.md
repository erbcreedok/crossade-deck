## INTERACTION · play functions

`@storybook/test + userEvent, Vitest browser mode` · 36 кейсов, расписано 25

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
| `play.surfaced.the-fill-is-the-box` | `rect{1.6,1}` с заливкой без радиуса и обводки | габарит чернил сверен с арифметикой (`unit × dpr`) | ровно объявленная коробка по обеим осям. Сверка с ЧИСЛОМ, а не с записанным эталоном: заливка, вышедшая квадратной, прошла бы проверку «чернила есть» и падает здесь |
| `play.surfaced.nothing-to-paint-with-or-on` | коробка без `Surfaced`; затем `Surfaced` без площади | чернила посчитаны | ноль в обоих случаях. Отладочный слой выключен, поэтому это утверждение о САМОЙ поверхности; голодающий атом — законное состояние, а не ошибка и не падение |
| `play.surfaced.the-colour-is-the-record-s` | два прогона, узел не тронут | запись перерегистрирована другим цветом | середина сменила цвет, габарит чернил не сдвинулся. Поля на узле этого не показали бы: пришлось бы обойти все узлы, и «коробка осталась» ничего бы не доказало |
| `play.surfaced.the-border-is-its-own-ink` | запись без слоёв, одна обводка внутрь | прочитан весь буфер | чернила есть, середина читается как стол, габарит совпадает с заливкой той же коробки; смена цвета обводки меняет картинку и не меняет геометрию |
| `play.surfaced.width-and-dashes-are-absolute` | тот же ободок шириной 0.04 → 0.12 → пунктиром | чернила посчитаны | втрое шире — втрое больше чернил при том же габарите; пунктир того же ободка даёт заметно меньше. Картинка бордера, растянутая по площади, так не ответит |
| `play.surfaced.a-different-record-is-a-different-picture` | `plate` → `bare` → `zone` на одном холсте | снимки соседей сверены | каждая картинка отличается от предыдущей: имя читается, а не игнорируется |
| `play.surfaced.the-paint-need-not-match-the-box` | обводка `alignment: 0`; затем слой-картинка `fit: contain` другой пропорции | габарит чернил сверен с габаритом заливки | наружу — шире коробки на ширину обводки с каждой стороны; картинка — уже коробки по одной оси. Расхождение surface и bounds видно на стекле, а не выводится из плана |
| `play.surfaced.a-desk-takes-its-area-from-what-it-holds` | `Container + Surfaced` без `Bounded`, двое детей с коробками | ребёнок убран | площадь равна раскладке (двое по 0.6 плюс зазор 0.12), то есть ШИРЕ любой коробки в дереве, и сжимается вместе с содержимым: `Surfaced` требует площадь, а не коробку |
