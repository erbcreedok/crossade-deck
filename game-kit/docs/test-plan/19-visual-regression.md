## VISUAL REGRESSION

`Chromatic — pixel diff per story` · 40 кейсов, расписано 4

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `visual.states` ⏳ | each meaningful atom combination | snapshotted | diffed against baseline; a pixel change fails the build until approved |
| `visual.themes` ⏳ | light and dark | both captured per state | the accent works on both grounds; contrast stays legible |
| `visual.viewports` ⏳ | 375 / 768 / 1280 px | captured | no horizontal body scroll; wide content scrolls inside its own box |
| `visual.locales` ⏳ | en and ru | captured | the ru caption does not clip the button; layout survives longer strings |
