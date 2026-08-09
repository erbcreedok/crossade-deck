## UNIT · requirement chains

`vitest` · 10 кейсов, расписано 6

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `req.direct` | `Flippable` with `Surfaced` off | composed | Flippable is ABSENT with its fields — not disabled, not inert |
| `req.transitive` | Flippable → Surfaced → Bounded, Bounded removed | caps read | the whole branch is gone in one step; no half-composed atom survives |
| `req.alternative` | `Surfaced` with Bounded off but Container on | composed | present: a requirement names what is LACKING, and an area may come from an own size OR from the content |
| `req.alternative-none` | `Surfaced` with neither Bounded nor Container | composed | absent — there is no area to paint on |
| `req.closure` | any declared atom | its requirement chain walked | terminates, has no cycle, every named requirement exists, and alternatives are followed as OR (source-scan) |
| `req.no-disabled-path` | the removal path | the absent atom's method called | `undefined`; nothing anywhere reports 'disabled' |
