## UNIT · Move — the whole drop as one plan

`vitest` · 24 кейсов, расписано 24

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
| `move.plan-carries-the-rest-pose` | обычный дроп, зона без правил | `planMove` | в плане есть поза: «можно ли» и «как ляжет» — один вопрос одной зоне |
| `move.a-denied-move-has-no-pose` | источник не выпускает (`keeps: []`) | `planMove` | `deny` и позы НЕТ: что не приземлилось, нигде не лежит |
| `move.the-target-stamps-the-pose` | цель с `angle: stamp(0)`, принесено 15° | `planMove` | 0°: зона навязала, принесённое не спросили |
| `move.the-carried-pose-comes-from-the-request` | цель `keep`, в запросе `carried: {angle:15}` | `planMove` | 15°: угол под пальцем на узле не лежит — его держит рантайм и отдаёт на дропе |
| `move.without-a-carried-pose-the-node-answers` | в запросе позы нет, у карты свои 15° и один переворот | `planMove` | `{15°, рубашка}` — раздача, которой ничей палец не касался |
| `move.the-target-turns-the-card-over` | цель с `side: up()`, принесена рубашка | `planMove` | лицо: сторона — грань той же позы, не отдельная сущность |
| `move.apply-moves-the-load` | план построен | `applyMove` | груз сменил владельца — и только теперь: сам план дерево не трогал |
| `move.apply-writes-the-rest-angle` | цель `angle: keep()`, принесено 15° | `applyMove` | 15° легли в собственный `Transformable` карты |
| `move.apply-straightens-what-the-zone-derives` | цель `angle: derive()`, принесено 15° | `applyMove` | 0°: принесённый угол потерян на пороге |
| `move.apply-turns-the-load-over` | цель сама перевёрнута и штампует `up` | `applyMove` | владелец видит лицо: сторона пишется `setFacing` ПОСЛЕ смены владельца, поворот зоны подмешан |
| `move.apply-does-nothing-when-denied` | источник не выпускает | `applyMove` | карта на месте, угол нетронут — что не может случиться, следа не оставляет |
| `move.apply-holds-back-on-ask` | цель отвечает `ask` | `applyMove` | ничего не применено: согласие спрашивают, а не предполагают — иначе вердикту негде висеть |
| `move.apply-reads-each-of-a-run-on-its-own` | `grab: above`, в стопке лицо и рубашка, палец держит один угол | `applyMove` | угол общий у обеих, сторона у каждой своя — сторона это собственный бит карты |
