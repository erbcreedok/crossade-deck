// ОБЛИК ХУДА 3D — пиксельные плашки, значки, верхняя полоса, рейка камеры, нижние вкладки и язычок руки. Образец — стенд дизайна
// `design/hud3d` (там же разобраны все состояния); здесь тот же CSS, но краски берутся из палитры стола (`look/src/palette.ts`),
// ни одной своей.
//
// Что где (экран 390×844, чёлка и полоса «домой» — через `--safe-top`, `--safe-bottom`):
//   верх     выход, имя стола, настройки, журнал; под именем — «Твой ход»;
//   справа   рейка камеры: вид, гиро, стойка и зум обзора — только то, что нужно этому виду;
//   низ      пять вкладок: Рука, Порядок, Стул, В стопку, Чат; открытая вкладка ставит над собой лист кнопок;
//   на руке  язычок над самым верхом карт: высота руки = поза (на столе — корешок — веер — в ряд), выше предела — стопкой на стол.

import { PALETTE } from "../../look/src/palette.js";

const P = PALETTE;

export const CHROME_CSS = `
#hud {
  --panel: ${P.panel}; --panelLight: ${P.panelLight}; --well: ${P.well}; --ink: ${P.ink}; --inkDim: ${P.inkDim}; --gold: ${P.gold};
  --goldLight: ${P.goldLight}; --goldDark: ${P.goldDark}; --danger: ${P.danger}; --black: ${P.black}; --wood: ${P.wood}; --mine: #7fd1b9;
}
#hud .cp, #hud .cp * { box-sizing: border-box; }
/* ПИКСЕЛЬНАЯ ПЛАШКА: контур со срезанными углами (тень-ступеньки), дерево внутри, жёсткая тень снизу. */
#hud .cp { position: absolute; background: linear-gradient(var(--panel), var(--well)); color: var(--ink);
  box-shadow: 0 -2px 0 0 var(--black), 0 2px 0 0 var(--black), -2px 0 0 0 var(--black), 2px 0 0 0 var(--black), inset 0 0 0 2px var(--wood), 0 6px 0 0 rgba(11,7,4,.6); }
#hud .cp.flat { background: var(--well); }
#hud .cp.on { background: linear-gradient(var(--goldLight), var(--goldDark)); color: var(--black);
  box-shadow: 0 -2px 0 0 var(--black), 0 2px 0 0 var(--black), -2px 0 0 0 var(--black), 2px 0 0 0 var(--black), inset 0 0 0 2px var(--goldLight), 0 6px 0 0 rgba(11,7,4,.6); }
#hud .cb { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; text-align: center; line-height: 1; border: 0; padding: 0; cursor: pointer; font: inherit; }
#hud .cb .lb { font-size: 11px; letter-spacing: .2px; white-space: nowrap; }
#hud .cb.dis { opacity: .45; }
#hud .cb:active { transform: translateY(2px); }
#hud .led { position: absolute; right: 5px; top: 5px; width: 6px; height: 6px; background: var(--black); box-shadow: 0 0 0 1px var(--wood); }
#hud .on .led { box-shadow: 0 0 0 1px var(--black); }
#hud .led.lit { background: var(--gold); box-shadow: 0 0 0 1px var(--black); }
#hud .ic { display: block; image-rendering: pixelated; }
#hud .p-i { fill: var(--ink); } #hud .p-a { fill: var(--gold); } #hud .p-d { fill: var(--inkDim); fill-opacity: .55; } #hud .p-r { fill: var(--danger); } #hud .p-bg { fill: var(--well); }
#hud .on .p-i { fill: var(--black); } #hud .on .p-a { fill: var(--panel); } #hud .on .p-d { fill: var(--black); fill-opacity: .5; }

#hud .c-grip, #hud .c-sheet, #hud .c-dock, #hud .c-dockbg, #hud .c-view, #hud .c-rail { pointer-events: auto; }
#hud .c-rail { pointer-events: none; } #hud .c-rail .cb { pointer-events: auto; }

/* ВЕРХНЯЯ ПОЛОСА */
#hud .c-t { position: absolute; top: calc(var(--safe-top) + 6px); width: 44px; height: 44px; z-index: 61; }
#hud .c-name { position: absolute; left: 66px; right: 118px; top: calc(var(--safe-top) + 6px); height: 44px; z-index: 55; display: flex; align-items: center; gap: 8px; padding: 0 12px; font-size: 14px; white-space: nowrap; overflow: hidden; pointer-events: none; }
#hud .c-name .who { margin-left: auto; display: flex; align-items: center; gap: 4px; color: var(--inkDim); font-size: 12px; }
#hud .c-turn { position: absolute; left: 66px; top: calc(var(--safe-top) + 59px); height: 26px; z-index: 55; padding: 0 12px 0 8px; display: flex; align-items: center; gap: 6px; font-size: 12px; pointer-events: none; }

/* РЕЙКА КАМЕРЫ (справа) */
#hud .c-rail { position: absolute; right: 14px; top: calc(var(--safe-top) + 103px); width: 52px; z-index: 50; display: flex; flex-direction: column; gap: 12px; align-items: center; }
#hud .c-rail .cb { position: relative; width: 52px; height: 56px; }
#hud .c-view { position: absolute; right: 74px; top: calc(var(--safe-top) + 99px); width: 154px; z-index: 70; padding: 6px; display: flex; flex-direction: column; gap: 6px; }
#hud .c-view .cb { position: relative; flex-direction: row; justify-content: flex-start; gap: 10px; height: 40px; padding: 0 10px; width: 100%; }
#hud .c-view .cb .lb { font-size: 13px; }
#hud [data-zoom-slider] { position: absolute; right: 14px; width: 52px; height: 170px; z-index: 50; touch-action: none; cursor: ns-resize; display: none; pointer-events: auto; }
#hud [data-zoom-slider] .track { position: absolute; left: 20px; top: 26px; bottom: 28px; width: 12px; background: var(--black); box-shadow: 0 0 0 2px var(--wood); }
#hud [data-zoom-slider] .seg { position: absolute; left: 0; right: 0; height: 2px; background: var(--wood); }
#hud [data-zoom-slider] .fill { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(var(--goldLight), var(--goldDark)); }
#hud [data-zoom-slider] .knob2 { position: absolute; left: -9px; width: 30px; height: 12px; background: var(--ink); box-shadow: 0 0 0 2px var(--black), 0 3px 0 2px rgba(11,7,4,.6); }
#hud [data-zoom-slider] .tt { position: absolute; left: 0; right: 0; top: 8px; font-size: 10px; color: var(--inkDim); text-align: center; }
#hud [data-zoom-slider] .val { position: absolute; left: -10px; right: -10px; bottom: -22px; text-align: center; font-size: 12px; color: var(--gold); text-shadow: 0 2px 0 var(--black); }
#hud .c-needle { transition: transform .2s; display: block; }

/* РУКА: язычок, счётчик, лист вкладки, нижняя строка */
#hud .c-grip { position: absolute; z-index: 38; width: 84px; height: 20px; display: flex; align-items: center; justify-content: center; gap: 6px; touch-action: none; cursor: grab; background: linear-gradient(var(--panelLight), var(--panel)); }
#hud .c-grip i { display: block; width: 4px; height: 10px; background: var(--inkDim); box-shadow: 2px 0 0 0 var(--black); }
#hud .c-grip.drag i { background: var(--gold); }
#hud .c-count { position: absolute; z-index: 40; height: 26px; padding: 0 9px; display: flex; align-items: center; gap: 6px; font-size: 13px; pointer-events: none; }
#hud .c-dockbg { position: absolute; left: 0; right: 0; bottom: 0; height: calc(80px + var(--safe-bottom)); z-index: 30; background: linear-gradient(var(--panel), var(--well)); box-shadow: 0 -2px 0 0 var(--black), inset 0 2px 0 0 var(--wood); }
#hud .c-dock { position: absolute; left: 12px; right: 12px; bottom: calc(var(--safe-bottom) + 8px); height: 64px; z-index: 60; display: flex; gap: 6px; }
#hud .c-tab { position: relative; flex: 1; height: 60px; margin-top: 4px; }
#hud .c-tab.open { margin-top: 0; height: 64px; }
#hud .c-badge { position: absolute; right: 6px; top: 4px; min-width: 16px; height: 16px; padding: 0 3px; background: var(--danger); color: var(--ink); font-size: 11px; line-height: 16px; text-align: center; box-shadow: 0 0 0 2px var(--black); }
#hud .c-sheet { position: absolute; left: 12px; right: 12px; bottom: calc(var(--safe-bottom) + 88px); height: 86px; z-index: 58; padding: 22px 8px 8px; display: flex; gap: 6px; }
#hud .c-sheet .cb { position: relative; flex: 1; min-width: 0; height: 54px; }
#hud .c-sheet .sep { width: 2px; background: var(--wood); margin: 4px 2px; }
#hud .c-sheet .cap { position: absolute; left: 12px; top: 5px; font-size: 12px; color: var(--inkDim); }
#hud .c-toast { position: absolute; left: 14px; right: 82px; top: calc(var(--safe-top) + 95px); z-index: 85; padding: 9px 12px; text-align: center; font-size: 13px; line-height: 1.25; pointer-events: none; }
`;

/** Высота подложки нижней строки без отступа «домой», px: вкладки 64 + по 8 сверху и снизу. На ней стоит рука. */
export const DOCK_PX = 80;
/** Высота листа вкладки над подложкой и зазор до него, px. */
export const SHEET_PX = 86;
export const SHEET_GAP = 8;

export const TABS: ReadonlyArray<readonly [string, string, string]> = [
  ["pose", "fan", "Рука"],
  ["order", "rank", "Порядок"],
  ["chair", "chair", "Стул"],
  ["stack", "collect", "В стопку"],
  ["say", "chat", "Чат"],
];
