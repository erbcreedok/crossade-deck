## UNIT · landing — картинка приземления

`vitest` · 9 кейсов, расписано 9

Картинка приземления (landing mark) и гистерезис.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `landing.the-shape-of-the-silhoutte-is-the-run-swept-by-the-box` | набор фигур | вычислен `landingBox` | прямоугольник охватывает все посадочные места, расширенные на размеры первой фигуры |
| `landing.the-picture-aimed-at-a-zone-moves-into-it` | якорь и сиденье | спрошен `landingAt` | точка приземления совпадает с координатой зоны, если она есть, иначе — якорь плюс сиденье |
| `landing.hysteresis-stops-the-picture-from-flickering` | функция броска | скорость колеблется | флаг броска удерживается, пока скорость не упадёт ниже половины порога |
| `landing.the-mark-has-a-shape-to-draw` | метка 1×1.4 | взят её `Bounded.bounds` и спрошен `extentOf` | у контура есть `start`, размах ровно 1×1.4 — форма, которую можно обойти, а не та, на которой план умирал на первом кадре |
| `landing.in-a-zone-that-lays-out-the-picture-takes-the-next-seat` | зона-лунка с `pileLayout`, в ней две фишки; пустая лунка; зона без бокса картинки | спрошен `landingAt` с боксом картинки и без | с боксом — место третьей (над второй), в пустой — у борта; без бокса — середина зоны, как раньше |
| `landing.the-mark-takes-the-shape-of-what-lands` | круглая фишка одна и стопкой из трёх | взят `Bounded.bounds` метки | у одиночной — круг (самая дальняя точка равна радиусу), у стопки — коробка с углами за пределами радиуса |
| `landing.the-mark-wears-the-turn-the-drop-will-write` | метка с углом 270° и без угла | взят её `Transformable.angle` | с углом — 270, без — 0: контур стоит под тем же поворотом, что и посадка |
| `landing.a-net-tree-carries-the-picture-with-it` | призрак стоит, из сети пришло новое дерево с тем же узлом | `retree(next)` | `hide` прячет узел из НОВОГО дерева, а не из старого |
| `landing.a-net-tree-without-the-mark-forgets-it` | призрак стоит, из сети пришло дерево без него | `retree(next)` | картинка забыта, `hide` ничего не трогает |
