## UNIT · flips — the registry and the flip effect

`vitest` · 8 кейсов, расписано 8

Реестр рецептов переворота (зеркало `surfaces`) + одна функция-эффект в списке. `mirror` — чистая
геометрия; `turnOver` — отражение И своп изнаночной поверхности. Отражение по СВОЕЙ чётности `turns`,
подмена контента по СУММАРНОЙ; два отражения по цепи гасятся (кейс A) — проверено через реальный
`transformsOf`. Дизайн — `render/flips.ts`, `docs/FLIPPABLE-HANDOFF.md` §4.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `flip.register-and-lookup` | реестр flips | `flipRecord`/`flipNames` | mirror/turnOver найдены; чужое → undefined |
| `flip.mirror-reflects-and-swaps-nothing` | рецепт mirror | `turn(n)` | reflects:true, тот же узел (геометрия делает всё) |
| `flip.effect-reflects-on-own-odd-parity` | own turns 1 vs 0 | `flipEffect` | `pre` det −1 vs IDENTITY |
| `flip.effect-swaps-content-on-summed-odd` | стопка turns=1, карта turnOver back | `flipEffect` | shown-узел носит изнанку |
| `flip.turnOver-empty-back-shows-the-front` | back "" | `flipEffect` | фронт, переворот не бланчит |
| `flip.dangling-recipe-leaves-the-node-unturned` | flip `nosuch` | `flipEffect` | узел как есть, без отражения, не throw |
| `flip.two-reflections-cancel` | стопка+карта обе turns=1 через `transformsOf` | det детей | один флип det<0, два — det>0 (кейс A) |
| `flip.no-flippable-is-left-alone` | узел без Flippable | `flipEffect` | тот же узел, IDENTITY |
