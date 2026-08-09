## UNIT · Fit and align

`vitest (headless, no WebGL)` · 12 кейсов, расписано 12

| id | дано | когда | тогда |
|---|---|---|---|
| `fit.contain-is-the-default` | площадь и картинка разных пропорций | вписано | поля, а не обрезка. `cover` выглядит опрятно и молча съедает края — неверные пропорции доезжают незамеченными; `contain` делает неверный результат видимо неверным |
| `fit.cover-fills-and-overflows` | то же | `cover` | заполняет площадь и вылезает — контур обрежет |
| `fit.matching-proportions-make-contain-and-cover-agree` | арт нарисован под форму | оба режима | совпадают; расхождение здесь значит, что ассет объявил не тот размер |
| `fit.fill-ignores-proportions` | те же | `fill` | ровно площадь: единственный режим, который искажает, и он говорит об этом именем |
| `fit.original-draws-the-declared-size` | ассет объявил размер | `original` | этот размер, в юнитах |
| `fit.repeat-is-original-over-and-over` | то же | `repeat` | тот же размер плюс флаг плитки: общий размер и есть вся разница между режимами |
| `fit.fitX-and-fitY-follow-one-axis-and-keep-the-proportions` | те же | по оси | ось выдержана, пропорции целы |
| `fit.a-picture-with-no-size-is-not-placed` | нулевая сторона | вписано | нулевая коробка, без деления на ноль |
| `align.centre-is-the-origin` | есть запас | `center` | ноль: то же начало координат, что и у всего остального |
| `align.corners-push-the-picture-into-them` | есть запас | `topLeft` | сдвиг ровно на половину разницы |
| `align.opposite-corners-are-opposite` | есть запас | `left`/`right` | симметрично |
| `align.does-nothing-when-there-is-no-slack` | `fill` | любой якорь | ноль, и без отрицательного нуля |
