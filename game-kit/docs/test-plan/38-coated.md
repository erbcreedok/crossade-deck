## UNIT · Coated — the runtime coat over a surface

`vitest` · 22 кейсов, расписано 22

Рантайм-слой поверх статического `Surfaced`: непрерывная величина, охват, бесконечный цвет, приват —
то, что «имя → готовая запись» не держит. Атом несёт ДАННЫЕ (рецепт+level+tint); look — рецепт в
`render/coats.ts` (различаются ФОРМОЙ метки: wash/ring/censor, не значением); охват — КЛАСС наследования
(`self` own, `cast` fromOwner, пустой прозрачен, `clear` глушит — инверсия-прожектор); движок мешает
через список эффектов, слепо. Дизайн — `docs/FLIPPABLE-HANDOFF.md` (доктрина) + `NIGHT-DECISIONS.md`.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `coated.fields-and-classes` | атом Coated | `classOf` | `self`=own, `cast`=fromOwner |
| `coated.defaults-are-empty` | `Coated()` | поля | `self`/`cast` = NO_COAT, recipe "" |
| `coated.no-requirement` | Coated | `requires` | пусто — кастящий контейнер сам может не рисоваться |
| `coated.has-coat` | NO_COAT vs рецепт | `hasCoat` | false / true; пустой recipe = нет coat |
| `coated.tint-carries-a-parametric-colour` | tint `{token,param}` | `Coated({self})` | не throw, спека сериализуема |
| `coat.register-and-lookup` | реестр coats | `coatRecipe` | найден по имени; чужое → undefined |
| `coat.dangling-recipe-is-skipped` | self recipe `nosuch` | `coatEffect` | пропуск, не throw, узел бел |
| `coat.wash-opacity-follows-level` | wash, level 0.3/0.9 | рецепт | opacity = level, монотонно |
| `coat.level-clamps` | level NaN/-5/999/Inf | wash | 0/0/1/0 — безопасно |
| `coat.tint-empty-is-the-recipe-default` | tint ""/accent/{spin} | wash | дефолт stageBg / accent / объект насквозь |
| `coat.ring-weight-grows-with-level` | ring, level 0 vs 1 | штрих | ширина растёт с level |
| `coat.censor-names-a-filter` | censor | рецепт | слой-маска + filter `mosaic` с params |
| `coat.self-coats-own-face` | родитель self=ring | `coatEffect` | кольцо на родителе, у ребёнка нет |
| `coat.cast-cascades-to-children` | поднос cast=wash | ребёнок | наследует wash (0.6) |
| `coat.empty-cast-still-inherits` | ребёнок только self, поднос cast | `coatEffect` | два coat: наследованный wash + свой ring |
| `coat.clear-stops-the-cascade` | комната cast=wash, коридор cast=clear | эффект | плитка dim, коридор чист (прожектор) |
| `coat.no-area-no-coat` | Coated без Surfaced | `coatEffect` | сам не крыт, но cast дошёл до ребёнка |
| `coat.effect-ignores-viewer` | два viewer над одной правдой | `coatEffect` | coat одинаков — не читает onlooker-канал |
| `coat.reaches-the-quad` | coated-узел через `scenePlan` | весь план | wash — лишний слой ПОВЕРХ записи, opacity=level |
| `coat.filter-reaches-the-quad` | censor через `scenePlan` | план | `quad.filter` = blur, сериализуемо (имя+числа) |
| `coat.ring-overrides-the-stroke` | ring через `scenePlan` | план | `quad.stroke` = кольцо (plate без штриха) |
| `coat.fill-covers-a-fraction` | рецепт `fill`, level 0.3 / NaN | рецепт вызван | слой с `part: 0.3`, СПЛОШНОЙ (не полупрозрачный — в этом отличие от wash); NaN заливает 0, не бросает |
