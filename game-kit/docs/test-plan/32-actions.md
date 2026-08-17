## UNIT · Actions — the verb follows the capability

`vitest` · 8 кейсов, расписано 8

Меню «что с этим можно сделать» НЕ объявляется на узле — оно ВЫТЕКАЕТ из того, что узел уже есть:
есть `Flippable` → можно flip, есть `Tiltable` → можно tap. Действие — запись реестра (`{label,
requires}`), как раскладка или наконечник; `actionsOf` фильтр: все действия, чью способность узел
несёт, в порядке регистрации. Так карта не рекламирует переворот, которого не умеет. `CANONS.md` §3.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `action.flip-offered-for-a-flippable` | карта с `Flippable` | `actionsOf` | глагол за способностью: `[flip]` |
| `action.label-comes-from-the-record` | та же карта | `actionsOf()[0].label` | готовый глагол: `Flip` |
| `action.tap-offered-for-a-tiltable` | токен с `Tiltable` | `actionsOf` | `[tap]` |
| `action.only-capable-actions-and-stable-order` | `Flippable`+`Draggable`, без `Tiltable` | `actionsOf` | `[flip, drag]` — фильтр + порядок регистрации |
| `action.bare-node-offers-nothing` | узел без способностей | `actionsOf` | `[]` — на такой только смотрят |
| `action.unregistered-nothing` | сток не установлен | `actionsOf` | пусто — реестр решает, не узел |
| `action.a-consumer-verb-joins-on-its-capability` | `registerAction(surface→Surfaced)` | `actionsOf` крашеной | свой глагол встаёт по своей способности |
| `action.roll-offered-for-a-rollable` | сток установлен; узел с `Valued`+`Rollable({sides: 20})` | `actionsOf`; `perform("roll")` ×50; `perform` на голом узле | меню — `["roll"]`; каждое исполнение кладёт легальную грань 1..20 (`Math.random` — дверь соло-стола; сид/сервер — через `setFace`); узел без способности возвращается как пришёл |
