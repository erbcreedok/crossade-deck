## LIFECYCLE & PERFORMANCE

`vitest + a headless Pixi fake` · 24 кейсов, расписано 13

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `life.mount-unmount` | mount then destroy | the scene inspected | nothing left behind: no sprites, listeners, or timers leak |
| `life.idle-gate.sleep` ⏳ | no animation running | the render loop | goes to sleep — no draws while nothing moves |
| `life.idle-gate.wake` ⏳ | a spin/settle starts | the loop | wakes; and every continuous animation is registered so it cannot fall asleep under one |
| `perf.compose-budget` ⏳ | composing 500 elements | time measured | under the frame budget; no O(n²) in caps resolution |
| `perf.no-leak-repeat` ⏳ | 1000 mount/unmount cycles | heap watched | flat — no growth across cycles |
| `warm.every-registered-picture-is-asked-for` | реестр ассетов с двумя картинками | `warmPictures` над записывающим художником | художник спрошен один раз и ровно об ИСТОЧНИКАХ обеих: реестр спрашивают об ассетах, а не о костях и картах, — что зарегистрировано к моменту связки, то и греется |
| `warm.the-binding-is-what-asks` | пустой стол и записывающий художник | дерево связано с художником (`attachPainter`) | картинка запрошена ДО первого кадра и не узлом на столе: художник грузит текстуру, когда план впервые просит её нарисовать, и до её прихода слой не рисует ничего — оттого кость и заикается на первом же броске |
| `warm.a-painter-with-no-cache-is-not-broken-by-being-asked` | художник без `warm` | его просят прогреться | ничего не брошено: своего кэша у него нет, и отсутствие способности И ЕСТЬ отказ — никакого `warm: false` |
| `pixi.a-still-frame-builds-nothing` | сцена нарисована | тот же план подан снова, отдельными объектами | не создано ни одного объекта Pixi |
| `pixi.a-moved-quad-builds-only-its-pose` | карта нарисована | у квада сменилась только матрица | ни Graphics, ни Text; ровно одна матрица |
| `pixi.a-restyled-caption-is-rebuilt` | подпись нарисована | у строки сменился текст | строка выставлена на стоящем объекте, ничего не создано |
| `pixi.a-dropped-quad-is-destroyed` | два квада на сцене | план назвал только один | ушедший уничтожен вместе с детьми |
| `pixi.the-plan-owns-the-order` | три квада на сцене | план переставил их местами | порядок сцены — порядок плана, объектов не создано |
