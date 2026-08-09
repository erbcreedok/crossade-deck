## UNIT · the two measures

`vitest` · 8 кейсов, расписано 5

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `unit.the-desk-has-none` | the whole src tree | scanned for screen fractions outside HUD | zero hits — desk sizes are world numbers, the camera fits them |
| `unit.hud-etalon` | the HUD etalon changed 46→60 | HUD and table measured | HUD sizes change, table sizes do NOT — two different mechanisms, no interference |
| `unit.override-local` | a user lowers the etalon | the state inspected | nothing travels: sizes in units are the truth, pixels are per viewer |
| `unit.boxfit-ported` ⏳ | a labelled box | preset vs content fit, min/max clamps | matches client2 `ui/boxFit` exactly — one arithmetic for button, drop zone and badge |
| `viewer.hud-unit-override` | зритель с заданным эталоном HUD | юнит посчитан | берётся заданный, а `auto` СНИМАЕТ переопределение, а не пишет число, похожее на его отсутствие |
