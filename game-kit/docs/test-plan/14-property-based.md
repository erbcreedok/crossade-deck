## PROPERTY-BASED

`fast-check` · 14 кейсов, расписано 5

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `prop.compose.closure` ⏳ | a random subset of all 19 atoms, CLOSED over requirements | composed and mounted | never throws; caps equals the closure exactly |
| `prop.compose.starved` ⏳ | a random subset NOT closed | composed | every atom whose requirement is missing is absent — never half-present |
| `prop.caps.reflect` ⏳ | a random closed subset | `caps(el)` compared to it | exactly equal for every generated case |
| `prop.conflict.stable` ⏳ | a random subset | conflict resolution run twice | same verdict both times — resolution is deterministic |
| `prop.resolve.assoc` ⏳ | a random tree of depth ≤6 | resolve run at every node | summed fields equal the path sum; inherited equal the nearest ancestor |
