## UNIT · Move — the whole drop as one plan

`vitest` · 11 кейсов, расписано 11

Хват, грип, keeps, приём и occupied — каждый свой маленький закон; ход — где они встречаются.
`planMove` читает их в порядке настоящего дропа и возвращает что БЫЛО БЫ, дерево не трогая (модель
— истина, вид — локален; план это данные). Порядок не свободен: каждый гейт умеет только ЗАПРЕТИТЬ,
первый отказ побеждает. Цель — «слот» ровно когда несёт `Displacer`; пайл без него просто растёт.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `move.plain-move-allows` | грабящий источник, принимающая куча | `planMove` | `{verdict:allow, load:[card]}` |
| `move.grab-empty-denies` | пустая куча (grab top) | `planMove` | `{deny, load:[], block:empty}` — нечего брать |
| `move.gripped-by-another-seat-denies` | карта в руке `by:[north]`, seat south | `planMove` | `block:gripped`, deny |
| `move.no-seat-skips-grip` | та же рука, seat не задан | `planMove` | грип-гейт не запускается: allow |
| `move.kept-cannot-leave` | источник `Keeper({keeps:[]})` | `planMove` | `{deny, block:kept}` — карта пришпилена |
| `move.kept-allows-what-it-lists` | `Keeper({keeps:[Draggable]})` | `planMove` | Draggable в списке уносится: allow |
| `move.target-rejects` | цель `Acceptor(deny)` | `planMove` | `{deny, block:rejected}` |
| `move.ask-target-requests` | цель `Acceptor(ask)` | `planMove` | `verdict:ask` — цель хочет подтверждения |
| `move.occupied-slot-reject-denies` | заполненный reject-слот (Displacer) | `planMove` | `block:rejected`, `occupied:{reject}` |
| `move.occupied-slot-swap-allows` | заполненный swap-слот | `planMove` | allow, `occupied:{swap}` — сиделец домой |
| `move.pile-without-displacer-never-conflicts` | полный пайл без Displacer | `planMove` | просто растёт: `{allow, load:[card]}` |
