## UNIT · Interaction & visibility atoms — Draggable · Rotatable · Focusable · Private

`vitest` · 9 кейсов, расписано 9

Что можно утащить (`Draggable` + политика отказа), что можно КРУТИТЬ рукой (`Rotatable` + политика
отпускания), что берёт фокус (`Focusable`), и кому
показано приватное поддерево (`Private` вырезает поддерево из проекции). Дизайн — таблица атомов
в `CANONS.md` §3.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `atom.draggable.is-a-capability` | узел с Bounded и Draggable, и без | `draggable` | присутствие = можно поднять; коробка есть, драга нет → false |
| `atom.draggable.reject-policy` | `Draggable({onReject})` home/stay/нет атома | `onRejectOf` | stay/home; дефолт home (не бросать карту), не-драг → undefined |
| `atom.rotatable.is-a-capability` | узел с позой и `Rotatable`, и без | `rotatable` | присутствие = можно крутить рукой; угол есть, а ставить его некому → false |
| `atom.rotatable.release-policy` | `Rotatable({onRelease, snap})` во всех трёх видах, и без атома | `restAngle(узел, куда докрутили, откуда начали)` | `keep` оставляет как есть — и это ОБРАТНОЕ драгу намеренно: отказ от дропа это отказ, а поворот никто не отклоняет, игрок повернул потому что хотел; `home` возвращает начальный угол, `snap` кладёт на ближайшее кратное в обе стороны, шаг ноль сеткой не считается (иначе угол уходит в NaN, а фигура с экрана), без атома политики нет вовсе |
| `atom.rotatable.is-not-a-tilt` | узел с позой под 90° и `Rotatable({home})` | `restAngle` | `Tiltable` — это КАКОЙ из объявленных стопов, а тут непрерывный угол, выбранный рукой; оба пишут одно и то же поле и не спорят |
| `atom.focusable.is-a-marker` | узел с Focusable и без | `focusable` | присутствие = берёт фокус, отсутствие отказывает |
| `atom.private.hides-the-subtree` | публичный стол, приватная рука `access:["me"]`, карта в ней | `visibleTo` | владелец видит руку и карту; чужой — ни руку, ни карту (рез достаёт ребёнка) |
| `atom.private.public-child-is-fine` | публичный стол, приватный ребёнок и открытый сосед | `visibleTo` | приватность режет ВНИЗ: стол и сосед видны всем, режется только приватный |
| `atom.private.default-hides-from-all` | `Private()` с пустым access | `visibleTo` | приватно всем — пустой список никого не впускает |
