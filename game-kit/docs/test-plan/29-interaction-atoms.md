## UNIT · Interaction & visibility atoms — Draggable · Focusable · Private

`vitest` · 6 кейсов, расписано 6

Что можно утащить (`Draggable` + политика отказа), что берёт фокус (`Focusable`), и кому
показано приватное поддерево (`Private` вырезает поддерево из проекции). Дизайн — таблица атомов
в `CANONS.md` §3.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `atom.draggable.is-a-capability` | узел с Bounded и Draggable, и без | `draggable` | присутствие = можно поднять; коробка есть, драга нет → false |
| `atom.draggable.reject-policy` | `Draggable({onReject})` home/stay/нет атома | `onRejectOf` | stay/home; дефолт home (не бросать карту), не-драг → undefined |
| `atom.focusable.is-a-marker` | узел с Focusable и без | `focusable` | присутствие = берёт фокус, отсутствие отказывает |
| `atom.private.hides-the-subtree` | публичный стол, приватная рука `access:["me"]`, карта в ней | `visibleTo` | владелец видит руку и карту; чужой — ни руку, ни карту (рез достаёт ребёнка) |
| `atom.private.public-child-is-fine` | публичный стол, приватный ребёнок и открытый сосед | `visibleTo` | приватность режет ВНИЗ: стол и сосед видны всем, режется только приватный |
| `atom.private.default-hides-from-all` | `Private()` с пустым access | `visibleTo` | приватно всем — пустой список никого не впускает |
