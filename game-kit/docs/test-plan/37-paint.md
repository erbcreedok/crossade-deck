## UNIT · paint — the colour as data

`vitest` · 6 кейсов, расписано 6

Цвет — данные, что едут по проводу: имя-ТОКЕН (резолвится палитрой на клиенте) ИЛИ параметрический
`{token, param}` — имя-рецепта + число. Бесконечная палитра (N команд, hue-таймер) = одно имя и N
чисел, не N записей и не N hex. Резолв — `theme.paint()`; сырой цвет по-прежнему рождается только в
`theme.ts`. Урок Axis76 для цвета. Дизайн — `src/render/paint.ts`.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `paint.flat-token-resolves` | токен `accent` | `paint(theme, _)` | hex палитры; в dark и light разный |
| `paint.non-token-passes-through` | литерал `hotpink` | `paint(_, _)` | проходит насквозь без изменений |
| `paint.parametric-spins-the-hue` | `{token:spin, param}` | два разных param | два разных hsl-цвета из одного рецепта |
| `paint.parametric-param-wraps` | param 0 и 1, -0.25 и 0.75 | `paint` | колесо замкнуто: равны попарно |
| `paint.dangling-recipe-falls-back` | `{token:nosuch}` | `paint` | акцент, не падение |
| `paint.is-parametric-tells-the-shapes-apart` | строка vs объект | `isParametric` | false / true |
