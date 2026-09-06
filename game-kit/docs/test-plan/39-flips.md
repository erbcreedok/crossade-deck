## UNIT · flips — the registry and the flip effect

`vitest` · 16 кейсов, расписано 16

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
| `flip.a-watched-zone-shows-others-the-back` | зона с `Poser({others:"back", owner:"south"})`, в ней карта лицом вверх; вторая — перевёрнутая хозяином; зона без правила | `flipEffect` с `viewer.marks.me` = north / south / без места | north видит рубашку, south — лицо, без места — правду (лицо); карта, перевёрнутая хозяином, — рубашка и ему, и соседу (правило не делает из рубашки лицо); зона без правила — всем сторону хозяина. Вторая ось facing читается там, где делается картинка, — экран на ПРАВДЕ (две панели над одним столом, хаб) не имеет проекции, чтобы за ней прятаться |
| `flip.turnOver-empty-back-shows-the-front` | back "" | `flipEffect` | фронт, переворот не бланчит |
| `flip.dangling-recipe-leaves-the-node-unturned` | flip `nosuch` | `flipEffect` | узел как есть, без отражения, не throw |
| `flip.two-reflections-cancel` | стопка+карта обе turns=1 через `transformsOf` | det детей | один флип det<0, два — det>0 (кейс A) |
| `flip.no-flippable-is-left-alone` | узел без Flippable | `flipEffect` | тот же узел, IDENTITY |
| `flip.deckReorder-reverses-the-children` | колода из 3 карт, turns=1 | `flipEffect` | клон с обратным порядком детей, det<0, исходник не тронут |
| `flip.deckReorder-cards-turn-through-the-chain` | карта в такой колоде | `flipEffect` карты | рубашка по СУММАРНОЙ чётности своим рецептом — без записи в карту |
| `flip.deckChildren-keeps-the-order` | альт-режим client2, turns=1 | `flipEffect` | порядок цел, карты рубашкой через цепь |
| `flip.directionFlip-reverses-without-a-mirror` | ряд из 3, turns=1 | `flipEffect` | обратный порядок, det=1: глифы читаемы, размен кейса D осознан |
| `flip.contentSwap-substitutes-the-subtree` | `registerFlip(имя, contentSwap(thunk))`, turns=1 | `flipEffect` | целое ДРУГОЕ поддерево, det=1: изнанка живёт в регистрации потребителя |
| `flip.contentSwap-even-parity-shows-the-front` | тот же узел, turns=2 | `flipEffect` | исходный узел: своп — это оборот, а не свойство узла |
| `flip.move-then-flip-mirrors-the-live-state` | ребёнок сдвинут at 2,0.5; флип доски | `transformsOf` | зеркало ложится на ЖИВОЙ стейт (кейс D), ничего не хранится |
