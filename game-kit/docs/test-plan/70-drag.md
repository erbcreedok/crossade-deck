## UNIT · wireDrag — проводка переноса в ките

`vitest (headless, no WebGL)` · 2 кейсов, расписано 2

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `drag.bare-scene-wire` | голый { host, motions, el } | `wireDrag` + события pointerdown/move/up | переносит узел в указанную `zoneAt` зону без devtools |
| `drag.willing-option` | опция `willing` | drag | одевает `undoInvites` только на те зоны, что вернула опция, а не на все по умолчанию |
