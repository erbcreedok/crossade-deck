## REGRESSION GUARDS · known traps

`vitest — one test per historical bug` · 10 кейсов, расписано 6

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `trap.index-missing-but-build-green` ⏳ | `options.storySort` задан ИМПОРТИРОВАННЫМ именем | `storybook build` | индексатор читает `preview.ts` статически, имя не резолвит: WARN, индекс пропущен, **выход 0**. Каталог собран и пуст. Литерал обязан быть на месте |
| `regress.deck-bloat` ⏳ | the setAt-past-length append bug | a full-deck write | never grows the array to 60 — the exact 'deck bloated' bug stays dead |
| `regress.kind-ignored-caps` ⏳ | the client2 bug where the board read kind, not caps | behavior driven | reads caps only; a source-scan makes a relapse fail |
| `regress.shadow-double` ⏳ | the 'shadow larger than the card' math bug | elevation computed | z (source) and screen-position stay separate; height counted once |
| `regress.frozen-base` ⏳ | the client1 fan-z bug | a base read once at animation start | forbidden: resolve is read at APPLY time, and the fan may collapse mid-flight |
| `regress.viewable-vs-surfaced` ⏳ | the atom whose toggle had no parameters | the model inspected | Surfaced draws, Viewable is the camera atom; no element carries Viewable |
