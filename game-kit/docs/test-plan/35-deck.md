## PRESET · Deck — a set expanded into cards

`vitest` · 10 кейсов, расписано 10

Набор называет карты раз — лицо, может рубашку, может значения, и сколько каждой — а `deck(specs)`
выдаёт по одному узлу на физическую карту. Готовое, где ВСТРЕЧАЮТСЯ атомы карты: каждая `Bounded`
(есть размер бить и рисовать), `Surfaced` (показывает лицо), `Flippable` КОГДА названа рубашка,
`Valued` КОГДА набор объявил данные. Не интерактив: личность карты — лицо и данные, не драг. Как
`arrow`, строит узлы. Дизайн — `CANONS.md` §3.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `deck.expands-counts` | `[{face:ace, count:3}]` | `deck` | три карты |
| `deck.default-count-one` | `[{face:joker}]` | `deck` | одна карта — count по умолчанию 1 |
| `deck.multiple-specs-total` | два спека count 2 и 3 | `deck` | 5 — сумма спеков |
| `deck.unique-ids` | `count:3` | `deck().map(id)` | три разных id — каждая копия свой узел |
| `deck.each-card-carries-its-face` | `[{face:queen}]` | `Surfaced.surface` | `queen` |
| `deck.two-sided-card-is-flippable` | `{face:queen, back:tartan}` | `caps`/`Flippable.back` | есть Flippable, back `tartan` |
| `deck.faceless-card-has-no-flippable` | `{face:token}` без рубашки | `caps` | нет Flippable — односторонняя не вертится |
| `deck.values-ride-along` | `values:{rank:7, suit}` | `Valued.values` | `{rank:7, suit:hearts}` |
| `deck.no-values-no-valued` | `{face:plain}` | `caps` | нет Valued — нет данных, нет атома |
| `deck.size-option-cuts-cards` | `{size:{w:2,h:3}}` | `extentOf(bounds)` | каждая карта раскроена в 2×3 |
