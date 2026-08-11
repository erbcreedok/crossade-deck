## UNIT · Grippable — whose hands may lift it

`vitest` · 6 кейсов, расписано 6

Права близнец приватности: приватность режет что место ВИДИТ, грип — что место может ДВИГАТЬ. Рука,
захваченная «north», делает каждую карту в ней north-овой на подъём; фигура без грипа — открытый
стол, поднимаемый любым. Факт ДЕРЕВА, режет ПОДДЕРЕВО (как `Private`). `by` — места, что МОГУТ
поднять; пустой список заперт для всех. `grippableBy` зеркалит `visibleTo`. Дизайн — `CANONS.md` §3.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `grip.open-table-lifts-for-anyone` | узел без грипа в цепочке | `grippableBy(_, seat)` | поднимет любой: north и south `true` |
| `grip.a-hand-grips-to-its-owner` | `Grippable({by:[north]})` | `grippableBy` | north `true`, south `false` |
| `grip.empty-by-locks-everyone` | `Grippable({by:[]})` | `grippableBy(_, north)` | заперто: `false` — фикс-элемент доски |
| `grip.grip-cuts-the-subtree` | карта в захваченной north-рукой руке | `grippableBy(card, _)` | наследует грип: north `true`, south `false` |
| `grip.a-child-cannot-reopen-a-gripped-owner` | карта `by:[south]` в руке `by:[north]` | `grippableBy(card, _)` | рез предка выше: и south, и north `false` |
| `grip.multiple-owners-name-a-seat` | `by:[north,south]` | `grippableBy` | оба `true`, east `false` |
