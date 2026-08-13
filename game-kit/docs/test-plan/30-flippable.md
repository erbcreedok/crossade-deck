## UNIT · Flippable — the card turn

`vitest` · 44 кейсов, расписано 44

Переворот как ДАННЫЕ: имя рецепта (`flip`), счётчик переворотов (`turns`, СУММА по цепи → паритет
стороны), ось отражения (`axis`, параметр), изнаночная поверхность (`back`, ссылка, что читает
своп-рецепт). Что переворот ДЕЛАЕТ — рецепт в `render/flips.ts`; движок мешает через список
эффектов. Отражение ⟺ свой `turns` нечёт, подмена контента ⟺ суммарный нечёт — кейс A выходит сам.
Здесь же — корзина СЛОМАННЫХ и краевых кейсов механизма (сами рецепты и эффект — слой 39;
play-ступени на стекле — слой 16). Дизайн — `docs/FLIPPABLE-HANDOFF.md`, стенограмма —
`docs/FLIPPABLE-DIALOGUE.md`.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `flip.fields-and-classes` | атом Flippable | `classOf` | `turns`=addsUp, `flip`/`axis`/`back`=own |
| `flip.no-requirement` | Flippable | `requires` | пусто — контейнер/стол/стопка переворачиваются без грани |
| `flip.defaults-are-front-up-mirror` | `Flippable()` | поля | `{flip:"", turns:0, axis:90, back:""}` |
| `flip.turns-sum-along-the-chain` | стопка turns=1, карта turns=0 | `sumAlongChain` | 1 — стопка переворачивает ребёнка |
| `flip.re-flip-sums-to-even` | стопка turns=1, карта turns=1 | сумма % 2 | 0 — карта снова лицом (кейс A) |
| `flip.axis-nan-mirrors-about-the-default` | `axis: NaN`, turns=1 | эффект | отражение по 90, матрица КОНЕЧНА — NaN не травит потомков |
| `flip.negative-turns-count-back` | turns −1 / −2 | эффект | нечёт зеркалит, чёт нет: паритет верен для отрицательных |
| `flip.huge-turns-keep-parity` | turns 10⁶ и 10⁶+1 | эффект | длинная партия не дрейфует: чёт/нечёт точны |
| `flip.fractional-turns-are-whole-turns` | turns 1.5 | эффект | trunc → 1, нечёт: полуоборот — анимация рендера, не стейт |
| `flip.reorder-twice-is-home` | реордер-колода | `back(turn(n))` | исходный порядок: обратный путь — не спецслучай |
| `flip.empty-and-single-decks-are-unmoved` | колода из 0 и 1 карты | эффект | не бросает, порядок цел |
| `flip.three-levels-sum-and-mirror` | стол→поднос→карта, все turns=1 | `transformsOf` + эффект | det<0 (три отражения), карта изнанкой (сумма 3) |
| `flip.dangling-recipe-still-counts` | колода с flip `nosuch`, turns=1 | эффект ребёнка | ребёнок изнанкой: СЧЁТ — данные и суммируется, глушится только ДЕЛО колоды |
| `flip.viewer-never-changes-a-flip` | два разных ViewerSettings | эффект | одинаковые node и pre: сторона — общий стейт, не онлукера |
| `flip.fields-cross-the-wire` | поля через JSON | эффект на восстановленном | тот же оборот: провод несёт имя+числа, рецепт остаётся на клиенте |
| `flip.turns-nan` ⏳ | `turns: NaN` | эффект | паритет 0 (лицом), не throw и не NaN-матрица |
| `flip.axis-negative` ⏳ | `axis: -14` | `reflect` | ≡ отражению по 166: ось — прямая, период 180 |
| `flip.axis-over-360` ⏳ | `axis: 450` | `reflect` | ≡ 90: угол нормализуется прямой матрицей |
| `flip.reflect-under-scale` ⏳ | зеркалёный узел с scale 2 | `transformsOf` | композиция без искажения: |det| = 4, знак минус |
| `flip.reflect-under-rotate` ⏳ | angle 30 + turns 1 | `transformsOf` | порядок фикс: поза, потом отражение — ось живёт в раме узла |
| `flip.dangling-back-skips-the-quad` ⏳ | back — незарегистрированное имя | план | квад пропущен как всякая висящая ссылка, сцена жива |
| `flip.back-equals-front` ⏳ | back = имя фронта | план | картинка не меняется — «одинаковый с двух сторон» легален |
| `flip.back-record-swapped-live` ⏳ | back-запись перерегистрирована | план | карта красится новой записью без пересборки узла (play-ступень 16 слоя держит на стекле) |
| `flip.contentSwap-cycle-guard` ⏳ | рецепт вернул предка узла | обход | не зацикливается: детерминизм подмены — контракт рецепта |
| `flip.contentSwap-id-collision` ⏳ | поддерево с занятым id | `transformsOf` | последняя запись побеждает детерминированно; коллизии решает рецепт |
| `flip.contentSwap-thunk-throws` ⏳ | thunk бросил | эффект | узел как есть, сцена не падает |
| `flip.nested-contentSwap` ⏳ | подмена внутри подменённого поддерева | план | рекурсия шва дорисовывает вложенную грань |
| `flip.swap-under-turned-stack` ⏳ | contentSwap-узел в перевёрнутой стопке | эффект | сумма решает: стопка 1 + узел 0 → подмена включена |
| `flip.back-node-removed-at-runtime` ⏳ | изнанка-узел удалён в рантайме | setRoot | ни квада, ни следа: ничего не хранилось по id |
| `flip.deck-reorder-with-keeps` ⏳ | реордер против политики keeps | план | порядок показа — рецепта; политика контейнера — про дроп, не про грань |
| `flip.deck-children-parity-alt` ⏳ | deckChildren под двойным флипом | эффект | сумма чёт — карты лицом, порядок всегда цел |
| `flip.direction-flip-loses-manual-offsets` ⏳ | ряд directionFlip + ручной сдвиг ребёнка | план | сдвиг НЕ зеркалится — осознанный размен кейса D, выбранный узлом |
| `flip.flip-during-drag` ⏳ | транзиент позы во время драга | стейт | turns не тронут: жест — не коммит |
| `flip.hit-test-on-mirrored` ⏳ | клик по зеркалёному узлу | hit-test | попадает по ПОКАЗАННОМУ месту: та же матрица, что красила |
| `flip.zero-area-flip` ⏳ | Flippable без площади | план | переворачивается без квада: эффекту нечего отражать — пропуск |
| `flip.effects-order-flip-then-coat` ⏳ | флип + коат на одном узле | список эффектов | коат ложится на ПОКАЗАННУЮ грань: порядок регистрации — порядок игры |
| `flip.mirrored-z-order` ⏳ | зеркалёный узел с z | план | z не меняется: отражение — геометрия, не высота |
| `flip.chain-skips-non-flippable` ⏳ | промежуточный узел без атома | сумма | прозрачен для паритета: сумма идёт по всей цепи |
| `flip.facing-inspector` | `facing(n)` | инспектор | «какой стороной сейчас» — «up»/«down» с той же суммы, что красит; руками не считаем |
| `flip.flip-action-bumps-turns` | глагол flip | `perform` | turns+1 на узле — и больше ничего; узел без грани возвращается как есть |
| `flip.set-facing-shows-the-asked-side` | карта лицом вверх | `setFacing(card, "down")`, затем `"up"` | показывает запрошенную сторону: паритет `turns` доведён до down, потом до up |
| `flip.set-facing-leaves-the-shown-side` | карта уже нужной стороной (`turns:2`) | `setFacing` в ту же сторону | ничего не меняет: `turns` остаётся 2, идемпотентно |
| `flip.set-facing-climbs-not-resets` | карта рубашкой (`turns:1`) | `setFacing(card, "up")` | добавляет поворот (`turns:2`), не сбрасывает в 0 — вскрытие анимируется вперёд одним поворотом |
| `flip.set-facing-needs-the-atom` | узел без Flippable | `setFacing(node, "down")` | нечего вертеть — узел как есть, атом не появляется, без исключения |
