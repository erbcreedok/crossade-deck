## UNIT · Flippable — the card turn

`vitest` · 5 кейсов, расписано 5

Переворот как ДАННЫЕ: имя рецепта (`flip`), счётчик переворотов (`turns`, СУММА по цепи → паритет
стороны), ось отражения (`axis`, параметр), изнаночная поверхность (`back`). Что переворот ДЕЛАЕТ —
рецепт в `render/flips.ts`; движок мешает через список эффектов. Отражение ⟺ свой `turns` нечёт,
подмена контента ⟺ суммарный нечёт — кейс A выходит сам. Дизайн — `docs/FLIPPABLE-HANDOFF.md`.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `flip.fields-and-classes` | атом Flippable | `classOf` | `turns`=addsUp, `flip`/`axis`/`back`=own |
| `flip.no-requirement` | Flippable | `requires` | пусто — контейнер/стол/стопка переворачиваются без грани |
| `flip.defaults-are-front-up-mirror` | `Flippable()` | поля | `{flip:"", turns:0, axis:90, back:""}` |
| `flip.turns-sum-along-the-chain` | стопка turns=1, карта turns=0 | `sumAlongChain` | 1 — стопка переворачивает ребёнка |
| `flip.re-flip-sums-to-even` | стопка turns=1, карта turns=1 | сумма % 2 | 0 — карта снова лицом (кейс A) |
