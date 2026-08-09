## STATE MATRIX · combinatorics

`generated table, vitest` · 24 кейсов, расписано 5

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `matrix.pairs` ⏳ | every declared atom × every other (curated interacting pairs, not the full 2^19) | each pair evaluated | the conflict table below is the oracle; each row is one assertion |
| `matrix.transitions` ⏳ | atom sets swapped in sequence (Bounded→+Surfaced→+Container) | switched | caps change fully; the id is preserved across every transition |
| `matrix.starved` ⏳ | every atom with a requirement, requirement removed | evaluated | absent, with its fields; never inert-but-present |
| `matrix.state-x-spec` ⏳ | each State value × a few atom sets | evaluated | state never changes which atoms exist; the two planes do not leak into each other |
| `matrix.dropped` ⏳ | the combinations NOT enumerated | logged explicitly | the report names what was skipped — no silent 'we covered everything' |
