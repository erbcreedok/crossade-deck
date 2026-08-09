## LIFECYCLE & PERFORMANCE

`vitest + a headless Pixi fake` · 16 кейсов, расписано 5

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `life.mount-unmount` | mount then destroy | the scene inspected | nothing left behind: no sprites, listeners, or timers leak |
| `life.idle-gate.sleep` ⏳ | no animation running | the render loop | goes to sleep — no draws while nothing moves |
| `life.idle-gate.wake` ⏳ | a spin/settle starts | the loop | wakes; and every continuous animation is registered so it cannot fall asleep under one |
| `perf.compose-budget` ⏳ | composing 500 elements | time measured | under the frame budget; no O(n²) in caps resolution |
| `perf.no-leak-repeat` ⏳ | 1000 mount/unmount cycles | heap watched | flat — no growth across cycles |
