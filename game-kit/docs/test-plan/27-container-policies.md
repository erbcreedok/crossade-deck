## UNIT · Container policies — grab · occupied · keeps

`vitest` · 15 кейсов, расписано 15

Три политики контейнера, каждая — маленький атом над Container. `grab` — что уходит из-под
пальца; `occupied` — судьба жильца слота; `keeps` — какие способности ребёнка действуют внутри.
Дизайн — `docs/design/container.md`.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `grab.one-takes-the-touched-child` | дети a·b·c, тронут b | `grabOne` | `[b]` — слот остаётся, уходит только содержимое |
| `grab.top-takes-the-last-whatever-was-touched` | дети a·b·c, тронут a | `grabTop` | `[c]` — стопка отдаёт верх, не тронутую карту |
| `grab.above-tears-off-the-subpile` | дети a·b·c, тронут b; и тронут не-член | `grabAbove` | `[b,c]`; карта не из стопки отрывает `[]` |
| `grab.empty-pile-grabs-nothing` | пустая стопка | `grabTop`/`grabAbove` | `[]` — груз пуст, драг не начинается |
| `grab.no-grabber-eats-no-gesture` | контейнер без Grabber | `grabFrom` | `[]` — хит-тест уходит вверх, жест не съеден, не бросок |
| `grab.from-the-tree` | Grabber `above`, реальные дети | `grabFrom` | читает политику и настоящих детей: тронут b → `[b,c]` |
| `occupied.reject-moves-nobody` | запись `reject` | `resolve` | `{reject}` — дроп отклонён, жилец на месте |
| `occupied.swap-trades-places` | запись `swap` | `resolve` | `{swap}` — вошедший в слот, жилец назад |
| `occupied.merge-keeps-both` | запись `merge` | `resolve` | `{merge}` — в слоте теперь больше одного |
| `occupied.capture-names-the-destination` | `capture("tray")` | `resolve` | `{capture, to:"tray"}` — исход несёт, КУДА уходит жилец |
| `occupied.default-is-reject` | контейнер без Displacer | `resolveOccupied` | `{reject}` — консервативно: не затирать |
| `occupied.from-the-tree` | Displacer `swap` | `resolveOccupied` | читает политику контейнера → `{swap}` |
| `keeps.no-keeper-allows-all` | контейнер без Keeper | `keepsAllows` | всё разрешено — отсутствие атома есть открытая дверь |
| `keeps.list-narrows` | Keeper `["drag"]` | `keepsAllows` | drag да, flip нет: сброс выносят, но не вертят на месте |
| `keeps.empty-list-allows-nothing` | Keeper `[]` | `keepsAllows` | drag нет — присутствие с пустым списком это закрытый край, не отсутствие |
