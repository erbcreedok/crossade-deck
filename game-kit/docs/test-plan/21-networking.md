## NETWORKING · truth vs pretty

`vitest + a fake Colyseus room + a fake clock` · 24 кейсов, расписано 6

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `net.predict.position` ⏳ | a local drop | position applied | optimistic and immediate — reversible, so flying home reads as the answer |
| `net.echo.facing` ⏳ | a flip | side change | waits for the echo — never predicted, so it cannot blink and hide |
| `net.keep.travels` ⏳ | a free-table pose (angle 15°) | state serialized | the kept angle is on the wire; derive-facets (grid/fan) are not |
| `net.late-joiner` ⏳ | player C joins after a move | C's projected scene | matches A and B exactly — truth is state, never a trajectory C never saw |
| `net.revision.stale` ⏳ | an old echo arrives after a newer local rev | the incoming patch | is ignored (revision guard) — the picture does not jitter back |
| `net.contenders` ⏳ | two players grab the same top card | messages processed one at a time | first gets the top, second the next — no extra logic, no double-take |
