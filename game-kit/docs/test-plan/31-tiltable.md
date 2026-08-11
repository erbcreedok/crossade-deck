## UNIT · Tiltable — the card tap

`vitest` · 8 кейсов, расписано 8

Наклон — это ДИСКРЕТНЫЕ упоры угла (стоит / повёрнута вбок), а не любой угол: спин это уже просто
`Transformable.angle`. На каком упоре узел СЕЙЧАС — рантайм-индекс, передаётся; атом хранит только
сами упоры и как тап между ними движется. Угловой близнец `Flippable`. Дизайн — `CANONS.md` §3.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `tilt.default-two-stops` | `Tiltable({})` | `tiltStops` | из коробки `[0, 90]` — стоит и «затапана» |
| `tilt.angle-at-a-stop` | `stops:[0,120,240]` | `tiltAngle(_, 1)` | индекс выбирает градус: `120` |
| `tilt.out-of-range-clamps` | `stops:[0,120,240]` | `tiltAngle(_, 9)` / `(_, -3)` | тап не наводит в никуда: `240` / `0` |
| `tilt.tap-advances-to-the-next-stop` | `stops:[0,90]` | `nextTilt(_, 0)` | следующий упор: `1` |
| `tilt.tap-wraps-past-the-last` | `wrap:true`, индекс на последнем | `nextTilt(_, 1)` | тап снова — распрямляет: `0` |
| `tilt.tap-rests-on-last-without-wrap` | `wrap:false, stops:[0,90,180]` | `nextTilt(_, 2)` | без кольца остаётся на последнем: `2` |
| `tilt.single-stop-never-moves` | `stops:[0]` | `nextTilt(_, 0)` | двигаться некуда: `0` |
| `tilt.no-tiltable-no-angle-and-index-frozen` | Transformable без Tiltable | `tiltAngle`/`nextTilt` | угла нет (`undefined`), индекс не трогается |
