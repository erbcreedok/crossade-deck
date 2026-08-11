## UNIT · Flippable — the card turn

`vitest` · 8 кейсов, расписано 8

Какое ЛИЦО показать при перевороте — чистая функция данных: перед это `Surfaced.surface`, оборот —
одно из четырёх отношений к нему (`back`/`same`/`mirror`/`alt`). Сторона (верх/низ) — рантайм,
передаётся, не хранится. Дизайн — таблица атомов в `CANONS.md` §3.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `flip.face-up-shows-the-front` | карта с фронтом и Flippable | `shownFace(_, true)` | перед всегда наверху: `{front, mirror:false}` |
| `flip.back-shows-the-back-surface` | `reverse:back, back:cardBack` | `shownFace(_, false)` | отдельный оборот — рубашка колоды: `{cardBack}` |
| `flip.same-shows-the-front-either-side` | `reverse:same` | `shownFace(_, false)` | фишка одинакова с обеих сторон: снова перед |
| `flip.mirror-flips-the-front-across-the-axis` | `reverse:mirror, axis:x` | `shownFace(_, false)` | перед, отзеркаленный по оси: `{front, mirror:true, axis:x}` |
| `flip.alt-shows-the-alternate-face` | `reverse:alt, back:altFace` | `shownFace(_, false)` | второе лицо карты: `{altFace}` |
| `flip.empty-back-falls-to-front` | `reverse:back, back:""` | `shownFace(_, false)` | переворот не бланчит: показывает перед |
| `flip.no-flippable-shows-the-front-both-ways` | фронт есть, Flippable нет | `shownFace(_, false)` | вертеть нечего — перед в обе стороны |
| `flip.no-surface-no-face` | узел без Surfaced | `shownFace(_, false)` | лица нет вовсе → `undefined` |
