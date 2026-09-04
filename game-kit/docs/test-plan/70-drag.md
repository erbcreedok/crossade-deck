## UNIT · wireDrag — проводка переноса в ките

`vitest (headless, no WebGL)` · 3 кейсов, расписано 3

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `drag.bare-scene-wire` | голый { host, motions, el } | `wireDrag` + события pointerdown/move/up | переносит узел в указанную `zoneAt` зону без devtools |
| `drag.willing-option` | опция `willing` | drag | одевает `undoInvites` только на те зоны, что вернула опция, а не на все по умолчанию |
| `drag.unwire-clears-listeners` | проводка на элементе | `unwireDrag` → pointer-события | слушатели сняты, жесты не обрабатываются |
