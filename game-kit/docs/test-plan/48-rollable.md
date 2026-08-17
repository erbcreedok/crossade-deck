## UNIT · Rollable — грань как истина, кувырок как вид

`vitest` · 3 кейсов, расписано 3

Кость — способность `Rollable {sides}` (requires `Valued`): атом несёт ОДНО данное — сколько граней.
Какая грань сверху — `Valued.values.face` (правило суммирует как любое значение); откуда результат —
не дело атома (сид кита, число сервера, чит — всё это `commit`, который играет бросок); как грань
выглядит — скин набора (аддон `dice`). `withFace` — чистая истина (клон, для `perform`), `setFace` —
на месте (для `commit` в живом дереве); обе отказывают в грани, которой у кости нет.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `atom.rollable.carries-sides-and-reads-the-face` | кость `Bounded+Valued{face:3}+Rollable{sides:6}`; камень без атома; `Valued{}` без грани | `rollable/sidesOf/faceOf` | кость: true/6/3; камень: false/undefined; грани нет — `undefined` (ещё не бросали) |
| `atom.rollable.requires-a-place-for-the-face` | `Rollable` без `Valued` | `rollable`, `starved`, `withFace` | НЕ способность (starved называет `Rollable`), грани нет, `withFace` возвращает узел как пришёл |
| `atom.rollable.face-is-written-as-truth` | кость d4 с `values {face:1, colour}` | `withFace(4)`; `setFace(2)`; грани 5, 0, 2.5 | клон с гранью 4 и сохранённым `colour`, оригинал не тронут; на месте — 2, идентичность сохранена; чужие грани бросают |
