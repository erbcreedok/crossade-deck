## UNIT · ResolveContext

`vitest + a fake clock` · 12 кейсов, расписано 4

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `ctx.not-stored` | a resolved value | the node's own fields inspected | nothing inherited is stored on it |
| `ctx.not-serialized` | the node serialized | the payload inspected | resolved values are absent from the wire — only own fields travel |
| `ctx.read-at-apply` | an animation started, then the OWNER changed mid-flight | the applied value | the NEW value is used — this is the exact client1 fan-z regression, frozen bases are forbidden |
| `ctx.chain-depth` | a chain 5 deep | resolve run | correct at every level; no O(n²) walk |
