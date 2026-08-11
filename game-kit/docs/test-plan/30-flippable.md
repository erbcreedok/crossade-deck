## UNIT · Flippable — the card turn

`vitest` · 5 кейсов, расписано 5

Какую ПОВЕРХНОСТЬ показать при перевороте — чистая функция данных: лицом вверх это `Surfaced.surface`,
лицом вниз — `back`. Одно поле: прежний четырёхзначный `reverse` был тремя значениями, притворявшимися
разными (отдельный оборот и второе лицо — одна операция, mirror не рисуется, same это пустой оборот).
Сторона (верх/низ) — рантайм, передаётся, не хранится. Дизайн — `CANONS.md` §3.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `flip.face-up-shows-the-front` | карта с фронтом и `Flippable({back})` | `shownSurface(_, true)` | лицом вверх всегда перед: `front` |
| `flip.face-down-shows-the-back` | `back: cardBack` | `shownSurface(_, false)` | названный оборот — изнанка: `cardBack` |
| `flip.empty-back-shows-the-front` | `back: ""` | `shownSurface(_, false)` | одинаково с обеих сторон, переворот не бланчит: `front` |
| `flip.no-flippable-shows-the-front-both-ways` | фронт есть, Flippable нет | `shownSurface(_, false)` | вертеть нечего — перед в обе стороны |
| `flip.no-surface-no-surface` | узел без Surfaced | `shownSurface(_, false)` | лица нет вовсе → `undefined` |
