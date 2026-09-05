## UNIT · wireDrag — проводка переноса в ките

`vitest (headless, no WebGL)` · 4 кейсов, расписано 4

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `drag.bare-scene-wire` | голый { host, motions, el } | `wireDrag` + события pointerdown/move/up | переносит узел в указанную `zoneAt` зону без devtools |
| `drag.willing-option` | опция `willing` | drag | одевает `undoInvites` только на те зоны, что вернула опция, а не на все по умолчанию |
| `drag.unwire-clears-listeners` | проводка на элементе | `unwireDrag` → pointer-события | слушатели сняты, жесты не обрабатываются |
| `drag.round-trip-off-centre` | без `underFinger`, палец мимо середины карты | увёл и вернул палец в ту же точку | карта легла точно на прежнее место, а не под палец |
