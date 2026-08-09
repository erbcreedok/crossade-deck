## SERIALIZATION / SCHEMA CONTRACT

`vitest` · 11 кейсов, расписано 4

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `schema.no-functions` | an element spec | serialized to JSON and back | round-trips — the spec is data, holds no functions |
| `schema.spec-vs-state` ⏳ | spec vs state | classified | truth (deck order, facing) travels the schema; the spec is static, sent once |
| `schema.set-array-write` ⏳ | writing a full set | done via clear()+push loop | length is exact; setAt-past-length appends — that trap is guarded |
| `schema.permutation` ⏳ | a client-sent reorder | validated | `isPermutationOf` passes only if the card set is unchanged |
