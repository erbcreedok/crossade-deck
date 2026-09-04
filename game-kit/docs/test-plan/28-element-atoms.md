## UNIT · Element data atoms — Valued · Owned · Labeled · Placeable · Marked

`vitest` · 9 кейсов, расписано 9

Данные элемента: значения, которые читает правило (`Valued`), коробка-источник (`Owned`),
уже написанная подпись (`Labeled`), метка «можно поставить в слот» (`Placeable`) и реестры меток/икон (`Marked`). `Valued`/`Owned`
— второй спрашивающий у `AcceptRule`, ради которого атомы и заведены.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `atom.valued.carries-values` | узел `Valued({rank:7, suit})` | поле прочитано | несёт собственные данные игры плоскими полями |
| `atom.valued.feeds-accept` | зона `eq el.values.rank 7`, элемент с Valued | `canAccept` | правило значения читает Valued с дерева: 7 → allow, 8 → deny |
| `atom.owned.names-the-box` | узел `Owned({box:"deck"})` | поле прочитано | ссылка на коробку-источник |
| `atom.owned.feeds-accept` | зона `eq el.box "deck"` | `canAccept` | `el.box` через Owned: deck → allow, hand → deny, пустая коробка → путь отсутствует → deny |
| `atom.labeled.carries-a-label` | узел `Labeled({label:"Attack"})` | поле прочитано | подпись, уже написанная на языке зрителя |
| `atom.placeable.is-a-marker` | узел с Bounded и Placeable, и без | `placeable` | присутствие = «можно в слот», отсутствие отказывает; коробка есть, метки нет → false |
| `marks.register-and-reset` | `registerMark` и `resetMarks` | вызовы | запись сохраняется, сброс очищает реестр |
| `marks.install-stock-seven` | `installStockMarks` | вызов | 7 стоковых меток зарегистрированы |
| `icons.register-stock-mark-assets` | `installStockMarkIcons` | вызов | 7 икон-ассетов зарегистрированы как 0.36 unit SVG |
